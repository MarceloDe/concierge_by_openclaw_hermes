// TEST-ONLY legacy compatibility store.
//
// The application runtime never imports this module. Production, local development,
// CLI ingestion, LangGraph checkpoints, and pointer authority all use PostgreSQL.
// This isolated adapter remains only while older hermetic unit tests are migrated to
// the shared PostgreSQL test harness; it cannot be selected by runtime configuration.
import { DatabaseSync } from "node:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  COLUMN_MIGRATIONS,
  INDEX_MIGRATIONS,
  SCHEMA_SQL,
  TABLES,
  CONVERSATION_SEQUENCE_BACKFILL_KEY,
  CONVERSATION_SEQUENCE_BACKFILL_SQLITE
} from "../../concierge/schema.mjs";
import { seedRuntimeRegistries } from "../../concierge/workflowArchitecture.mjs";
import {
  assertSafeSqlIdentifier,
  assertSafeTableName,
  createId,
  insertConversationMessage,
  nowIso
} from "../../concierge/database.mjs";

export { assertSafeSqlIdentifier, assertSafeTableName, createId, insertConversationMessage, nowIso };

export const DEFAULT_DB_PATH = resolve("data/brainstyworkers.sqlite");
export const SQLITE_TEST_ADAPTER_VERSION = "2026-07-12.sqlite-test-only.v1";
export const DATABASE_ADAPTER_VERSION = SQLITE_TEST_ADAPTER_VERSION;
const SQLITE_BUSY_TIMEOUT_MS = Number(process.env.BRAINSTY_SQLITE_BUSY_TIMEOUT_MS ?? 30000);

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

export class SqliteStore {
  constructor(dbPath = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
    this.adapterVersion = SQLITE_TEST_ADAPTER_VERSION;
    this.driver = "sqlite_test_only";
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
    this.open()
      .prepare(
        `INSERT OR IGNORE INTO schema_migrations (id, migration_key, details_json, applied_at)
         VALUES (?, ?, ?, ?);`
      )
      .run(createId("migration"), migrationKey, JSON.stringify(details), nowIso());
  }

  async migrate() {
    for (const [table, migrations] of COLUMN_MIGRATIONS) await this.migrateColumns(table, migrations);
    const seqDone = await this.get(
      "SELECT 1 AS x FROM schema_migrations WHERE migration_key = ? LIMIT 1;",
      [CONVERSATION_SEQUENCE_BACKFILL_KEY]
    );
    if (!seqDone) {
      await this.exec(CONVERSATION_SEQUENCE_BACKFILL_SQLITE);
      await this.recordMigration(CONVERSATION_SEQUENCE_BACKFILL_KEY, { engine: "sqlite_test_only" });
    }
    for (const [, sql] of INDEX_MIGRATIONS) await this.exec(sql);
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
          if (!String(error.message ?? "").includes(`duplicate column name: ${column}`)) throw error;
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
    this.open()
      .prepare(`INSERT INTO ${safeTable} (${safeKeys.join(", ")}) VALUES (${placeholders});`)
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
    this.open()
      .prepare(`UPDATE ${safeTable} SET ${assignments.join(", ")}${whereClause(where, params)};`)
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
