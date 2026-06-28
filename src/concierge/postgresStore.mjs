import pg from "pg";
import { SCHEMA_SQL, TABLES } from "./schema.mjs";
import { seedRuntimeRegistries } from "./workflowArchitecture.mjs";
import { assertSafeSqlIdentifier, assertSafeTableName, createId, nowIso } from "./database.mjs";

export const DEFAULT_POSTGRES_URL = "postgresql://brainsty:brainsty-dev-only@127.0.0.1:55432/brainstyworkers?sslmode=disable";
export const POSTGRES_ADAPTER_VERSION = "2026-06-16.pg-bound-store-parity.v1";

function normalizeParam(value) {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

function normalizeParams(params = []) {
  return Array.isArray(params) ? params.map(normalizeParam) : [normalizeParam(params)];
}

function whereClause(where = {}, params = [], offset = 0) {
  const entries = Object.entries(where);
  if (entries.length === 0) return "";
  return ` WHERE ${entries
    .map(([key, value], index) => {
      params.push(normalizeParam(value));
      return `${assertSafeSqlIdentifier(key, "column")} = $${offset + index + 1}`;
    })
    .join(" AND ")}`;
}

export function toPostgresSql(sql, parameterOffset = 0) {
  let next = parameterOffset + 1;
  let inSingleQuote = false;
  let out = "";
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const nextChar = sql[i + 1];
    if (char === "'" && inSingleQuote && nextChar === "'") {
      out += "''";
      i += 1;
      continue;
    }
    if (char === "'") {
      inSingleQuote = !inSingleQuote;
      out += char;
      continue;
    }
    if (char === "?" && !inSingleQuote) {
      out += `$${next}`;
      next += 1;
      continue;
    }
    out += char;
  }
  return out
    .replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, "INSERT INTO")
    .replace(/\bSELECT\s+rowid,\s+\*/gi, "SELECT ctid::text AS rowid, *")
    .replace(/\bORDER\s+BY\s+rowid\b/gi, "ORDER BY ctid")
    .replace(/,\s*rowid\s+(ASC|DESC)\b/gi, ", ctid $1");
}

function splitSqlStatements(sql) {
  const statements = [];
  let inSingleQuote = false;
  let current = "";
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const nextChar = sql[i + 1];
    if (char === "'" && inSingleQuote && nextChar === "'") {
      current += "''";
      i += 1;
      continue;
    }
    if (char === "'") {
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }
    if (char === ";" && !inSingleQuote) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      continue;
    }
    current += char;
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

function normalizeStatement(sql) {
  const trimmed = sql.trim();
  if (!trimmed || /^PRAGMA\b/i.test(trimmed)) return null;
  return toPostgresSql(trimmed);
}

// Strip leading SQL line-comments + whitespace so a CREATE preceded by `-- ...` lines
// (as the capability/process tables are) is still recognized for FK-dependency ordering.
function stripLeadingComments(statement) {
  return String(statement).replace(/^(?:\s*--[^\n]*\n)+/g, "").trimStart();
}

function tableNameForCreate(statement) {
  return stripLeadingComments(statement).match(/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([A-Za-z_][A-Za-z0-9_]*)/i)?.[1] ?? null;
}

function referencedTables(statement) {
  return [...statement.matchAll(/\bREFERENCES\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gi)].map((match) => match[1]);
}

function orderCreateTableStatements(statements) {
  const creates = [];
  const others = [];
  for (const statement of statements) {
    const table = tableNameForCreate(statement);
    if (table) creates.push({ table, statement, refs: referencedTables(statement) });
    else others.push(statement);
  }
  const tableNames = new Set(creates.map((item) => item.table));
  const pending = new Map(creates.map((item) => [item.table, item]));
  const ordered = [];
  const emitted = new Set();
  while (pending.size) {
    const ready = [...pending.values()].filter((item) => item.refs.every((ref) => !tableNames.has(ref) || emitted.has(ref)));
    const batch = ready.length ? ready : [pending.values().next().value];
    for (const item of batch) {
      ordered.push(item.statement);
      emitted.add(item.table);
      pending.delete(item.table);
    }
  }
  return [...ordered, ...others];
}

function pgConnectionOptions(connectionString) {
  const raw = String(connectionString ?? DEFAULT_POSTGRES_URL);
  const options = { connectionString: raw };
  if (/sslmode=disable/i.test(raw)) options.ssl = false;
  return options;
}

export class PostgresStore {
  constructor(connectionString = process.env.BRAINSTY_DATABASE_URL || DEFAULT_POSTGRES_URL, options = {}) {
    this.connectionString = connectionString;
    this.adapterVersion = POSTGRES_ADAPTER_VERSION;
    this.driver = "postgres";
    this.dbPath = null;
    this.pool = options.pool ?? null;
    this.client = options.client ?? null;
    this.ownsPool = !options.pool && !options.client;
  }

  async initialize({ seed = true } = {}) {
    await this.open();
    await this.exec(SCHEMA_SQL);
    await this.recordMigration("schema:base", { adapterVersion: this.adapterVersion });
    if (seed) await seedRuntimeRegistries(this, { nowIso, createId });
    return this;
  }

  async open() {
    if (this.client || this.pool) return this.client ?? this.pool;
    this.pool = new pg.Pool(pgConnectionOptions(this.connectionString));
    return this.pool;
  }

  async close() {
    if (this.client) return;
    if (this.pool && this.ownsPool) {
      await this.pool.end();
    }
    this.pool = null;
  }

  async query(sql, params = []) {
    await this.open();
    const target = this.client ?? this.pool;
    return target.query(toPostgresSql(sql), normalizeParams(params));
  }

  async recordMigration(migrationKey, details = {}) {
    const now = nowIso();
    await this.query(
      `INSERT INTO schema_migrations (id, migration_key, details_json, applied_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (migration_key) DO NOTHING;`,
      [createId("migration"), migrationKey, JSON.stringify(details), now]
    );
  }

  async migrateColumns(table, migrations) {
    const safeTable = assertSafeTableName(table);
    const { rows } = await this.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ?;`,
      [safeTable]
    );
    const names = new Set(rows.map((row) => row.column_name));
    for (const [column, sql] of migrations) {
      if (!names.has(column)) {
        await this.exec(sql);
        await this.recordMigration(`column:${safeTable}.${column}`, { table: safeTable, column, sql });
      }
    }
  }

  async exec(sql) {
    await this.open();
    // Strip SQL line-comments before splitting: comment lines with apostrophes (e.g.
    // 'step:adhoc:<boundary>') otherwise poison single-quote tracking and cascade the
    // statement split. Safe here because no string literal in the schema contains '--'.
    const withoutComments = String(sql).replace(/--[^\n]*/g, "");
    for (const statement of orderCreateTableStatements(splitSqlStatements(withoutComments))) {
      const normalized = normalizeStatement(statement);
      if (normalized) await this.query(normalized);
    }
  }

  async all(sql, params = []) {
    const { rows } = await this.query(sql, params);
    return rows;
  }

  async get(sql, params = []) {
    const { rows } = await this.query(sql, params);
    return rows[0] ?? null;
  }

  async insert(table, values) {
    const safeTable = assertSafeTableName(table);
    const keys = Object.keys(values);
    const safeKeys = keys.map((key) => assertSafeSqlIdentifier(key, "column"));
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const sql = `INSERT INTO ${safeTable} (${safeKeys.join(", ")}) VALUES (${placeholders});`;
    await this.query(sql, keys.map((key) => values[key]));
    return values;
  }

  async update(table, values, where) {
    const safeTable = assertSafeTableName(table);
    const entries = Object.entries(values);
    if (!entries.length) throw new Error("Cannot update with no values.");
    const params = [];
    const assignments = entries.map(([key, value], index) => {
      params.push(normalizeParam(value));
      return `${assertSafeSqlIdentifier(key, "column")} = $${index + 1}`;
    });
    const whereSql = whereClause(where, params, params.length);
    await this.query(`UPDATE ${safeTable} SET ${assignments.join(", ")}${whereSql};`, params);
  }

  async findOne(table, where) {
    const params = [];
    return this.get(`SELECT * FROM ${assertSafeTableName(table)}${whereClause(where, params)} LIMIT 1;`, params);
  }

  async list(table, where = {}) {
    const params = [];
    return this.all(`SELECT * FROM ${assertSafeTableName(table)}${whereClause(where, params)} ORDER BY created_at ASC;`, params);
  }

  async counts() {
    const counts = {};
    for (const table of TABLES) {
      const row = await this.get(`SELECT COUNT(*) AS count FROM ${table};`);
      counts[table] = Number(row?.count ?? 0);
    }
    return counts;
  }

  async transaction(callback) {
    await this.open();
    const client = await this.pool.connect();
    const tx = new PostgresStore(this.connectionString, { pool: this.pool, client });
    try {
      await client.query("BEGIN;");
      const result = await callback(tx);
      await client.query("COMMIT;");
      return result;
    } catch (error) {
      await client.query("ROLLBACK;");
      throw error;
    } finally {
      client.release();
    }
  }
}
