import { DatabaseSync } from "node:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  COLUMN_MIGRATIONS, INDEX_MIGRATIONS, SCHEMA_SQL, TABLES,
  CONVERSATION_SEQUENCE_BACKFILL_KEY, CONVERSATION_SEQUENCE_BACKFILL_SQLITE
} from "./schema.mjs";
import { seedRuntimeRegistries } from "./workflowArchitecture.mjs";

export const DEFAULT_DB_PATH = resolve("data/brainstyworkers.sqlite");
const SQLITE_BUSY_TIMEOUT_MS = Number(process.env.BRAINSTY_SQLITE_BUSY_TIMEOUT_MS ?? 30000);
export const DATABASE_ADAPTER_VERSION = "2026-06-15.node-sqlite-bound-store.v1";
const TABLE_ALLOWLIST = new Set(TABLES);
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function quote(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function normalizeParam(value) {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

function normalizeParams(params = []) {
  return Array.isArray(params) ? params.map(normalizeParam) : [normalizeParam(params)];
}

function whereClause(where = {}, params = null) {
  const entries = Object.entries(where);
  if (entries.length === 0) return "";
  return ` WHERE ${entries
    .map(([key, value]) => {
      const column = assertSafeSqlIdentifier(key, "column");
      if (params) {
        params.push(normalizeParam(value));
        return `${column} = ?`;
      }
      return `${column} = ${quote(value)}`;
    })
    .join(" AND ")}`;
}

export function assertSafeSqlIdentifier(identifier, kind = "identifier") {
  const value = String(identifier ?? "");
  if (!IDENTIFIER_RE.test(value)) throw new Error(`Unsafe SQL ${kind}: ${value || "empty"}`);
  return value;
}

export function assertSafeTableName(table) {
  const value = assertSafeSqlIdentifier(table, "table");
  if (!TABLE_ALLOWLIST.has(value)) throw new Error(`SQL table is not allowlisted: ${value}`);
  return value;
}

export class SqliteStore {
  constructor(dbPath = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
    this.adapterVersion = DATABASE_ADAPTER_VERSION;
    this.db = null;
  }

  async initialize() {
    await mkdir(dirname(this.dbPath), { recursive: true });
    this.open();
    await this.exec(SCHEMA_SQL);
    await this.recordMigration("schema:base", { adapterVersion: this.adapterVersion });
    await this.migrate();
    await seedRuntimeRegistries(this, { nowIso, createId });
    return this;
  }

  open() {
    if (this.db) return this.db;
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = ${Math.max(1, Math.trunc(SQLITE_BUSY_TIMEOUT_MS))};
      PRAGMA journal_mode = WAL;
    `);
    return this.db;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async recordMigration(migrationKey, details = {}) {
    const now = nowIso();
    this.open()
      .prepare(
        `INSERT OR IGNORE INTO schema_migrations (id, migration_key, details_json, applied_at)
         VALUES (?, ?, ?, ?);`
      )
      .run(createId("migration"), migrationKey, JSON.stringify(details), now);
  }

  async migrate() {
    // Single source of truth: apply incremental ADD COLUMN migrations (schema.mjs).
    for (const [table, migrations] of COLUMN_MIGRATIONS) {
      await this.migrateColumns(table, migrations);
    }
    // Backfill legacy conversation ordinals BEFORE creating the ordering index (so any future
    // unique constraint would not trip on the DEFAULT 0 rows). Idempotent: only touches seq=0.
    const seqDone = await this.get(
      "SELECT 1 AS x FROM schema_migrations WHERE migration_key = ? LIMIT 1;",
      [CONVERSATION_SEQUENCE_BACKFILL_KEY]
    );
    if (!seqDone) {
      await this.exec(CONVERSATION_SEQUENCE_BACKFILL_SQLITE);
      await this.recordMigration(CONVERSATION_SEQUENCE_BACKFILL_KEY, { engine: "sqlite" });
    }
    // Index migrations (after columns + backfill; column-name-keyed migrateColumns cannot host them).
    for (const [, sql] of INDEX_MIGRATIONS) {
      await this.exec(sql);
    }
    // All CREATE TABLE DDL lives in SCHEMA_SQL (schema.mjs), applied by initialize()
    // before migrate(). No table creation happens here (Phase 85 consolidation).
  }

  async migrateColumns(table, migrations) {
    const columns = await this.all(`PRAGMA table_info(${table});`);
    const names = new Set(columns.map((column) => column.name));
    for (const [column, sql] of migrations) {
      if (!names.has(column)) {
        try {
          await this.exec(sql);
          await this.recordMigration(`column:${table}.${column}`, { table, column, sql });
        } catch (error) {
          if (!String(error.message ?? "").includes(`duplicate column name: ${column}`)) {
            throw error;
          }
        }
      }
    }
  }

  async exec(sql) {
    this.open().exec(sql);
  }

  async all(sql, params = []) {
    return this.open().prepare(sql).all(...normalizeParams(params));
  }

  async get(sql, params = []) {
    return this.open().prepare(sql).get(...normalizeParams(params)) ?? null;
  }

  async insert(table, values) {
    const safeTable = assertSafeTableName(table);
    const keys = Object.keys(values);
    const safeKeys = keys.map((key) => assertSafeSqlIdentifier(key, "column"));
    const placeholders = keys.map(() => "?").join(", ");
    const sql = `INSERT INTO ${safeTable} (${safeKeys.join(", ")}) VALUES (${placeholders});`;
    this.open()
      .prepare(sql)
      .run(...keys.map((key) => normalizeParam(values[key])));
    return values;
  }

  async update(table, values, where) {
    const safeTable = assertSafeTableName(table);
    const entries = Object.entries(values);
    if (!entries.length) throw new Error("Cannot update with no values.");
    const params = [];
    const assignments = entries.map(([key, value]) => {
      params.push(normalizeParam(value));
      return `${assertSafeSqlIdentifier(key, "column")} = ?`;
    });
    const whereSql = whereClause(where, params);
    this.open()
      .prepare(`UPDATE ${safeTable} SET ${assignments.join(", ")}${whereSql};`)
      .run(...params);
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
      counts[table] = row?.count ?? 0;
    }
    return counts;
  }

  async transaction(callback) {
    const db = this.open();
    db.exec("BEGIN IMMEDIATE;");
    try {
      const result = await callback(this);
      db.exec("COMMIT;");
      return result;
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  }
}

// Authoritative, ordered conversation insert. Computes the next per-session ordinal inside a
// transaction (SQLite BEGIN IMMEDIATE serializes writers; Postgres uses a dedicated client) so
// the timeline is monotonic even under rapid turns. Works for both stores (transaction(callback)
// passes a store-like object exposing get/insert). Returns the inserted row.
export async function insertConversationMessage(store, { sessionId, role, content }) {
  return store.transaction(async (tx) => {
    const row = await tx.get(
      "SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next FROM conversation_messages WHERE session_id = ?;",
      [sessionId]
    );
    const seq = Number(row?.next ?? 1);
    const values = {
      id: createId("msg"),
      session_id: sessionId,
      role,
      content,
      created_at: nowIso(),
      sequence_number: seq
    };
    await tx.insert("conversation_messages", values);
    return values;
  });
}
