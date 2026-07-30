// Phase 85 (§5.4) permanent dual-engine schema parity gate.
//
// (a) Fresh mkdtemp SQLite: every schema.mjs TABLES entry exists in sqlite_master, and the
//     Phase-85 tables/columns are present.
// (b) SQLite column-name sets per table vs docs/db/postgres-schema.json column-name sets:
//     asserted IDENTICAL. This catches engine drift in every test:local run WITHOUT needing
//     a live Postgres — the JSON is regenerated only from live introspection
//     (scripts/generate-postgres-schema-json.mjs). A table missing from the JSON is a loud
//     skip-with-message (the snapshot predates the table — regenerate it); a table PRESENT
//     in the JSON with differing columns is a hard failure.
// (c) Optional live arm: if BRAINSTY_DATABASE_URL/BRAINSTY_DATABASE_URL_FILE resolves and
//     connects within a short timeout, assert the same parity against live
//     information_schema. Skips loud otherwise (local runs without Postgres).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "./support/sqliteTestStore.mjs";
import { TABLES, SCHEMA_SQL } from "../concierge/schema.mjs";

const POSTGRES_SCHEMA_JSON_PATH = resolve(import.meta.dirname, "../../docs/db/postgres-schema.json");
const LIVE_PG_CONNECT_TIMEOUT_MS = Number(process.env.BRAINSTY_SCHEMA_PARITY_PG_TIMEOUT_MS ?? 3000);

const PHASE_85_TABLES = [
  "credential_session_vault",
  "member_plan_identities",
  "mrf_pricing_sources",
  "mrf_price_observations"
];

const PHASE_85_COLUMNS = [
  ["capabilities", ["registry_status", "runtime_selectable", "blocked_by_json", "planner_exposure_json"]],
  ["audit_events", ["layer"]],
  ["user_consents", ["session_reuse_approved", "mrf_pricing_lookup_approved", "consent_document_hash", "updated_at"]]
];

async function freshSqliteStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-schema-parity-"));
  return new SqliteStore(join(dir, "parity.sqlite")).initialize();
}

async function sqliteColumnNames(store, table) {
  const rows = await store.all(`PRAGMA table_info(${table});`);
  return new Set(rows.map((row) => row.name));
}

function diffSets(a, b) {
  return {
    onlyA: [...a].filter((x) => !b.has(x)).sort(),
    onlyB: [...b].filter((x) => !a.has(x)).sort()
  };
}

test("schema parity (a): fresh SQLite covers every TABLES entry incl. Phase-85 tables + columns", async () => {
  const store = await freshSqliteStore();
  try {
    const rows = await store.all("SELECT name FROM sqlite_master WHERE type = 'table';");
    const names = new Set(rows.map((row) => row.name));
    const missing = TABLES.filter((table) => !names.has(table));
    assert.deepEqual(missing, [], `TABLES entries missing from fresh sqlite_master: ${missing.join(", ")}`);

    for (const table of PHASE_85_TABLES) {
      assert.ok(names.has(table), `Phase-85 table ${table} missing from fresh SQLite`);
      assert.ok(
        SCHEMA_SQL.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
        `Phase-85 table ${table} must be created by SCHEMA_SQL (single DDL source)`
      );
    }
    for (const [table, columns] of PHASE_85_COLUMNS) {
      const have = await sqliteColumnNames(store, table);
      for (const column of columns) {
        assert.ok(have.has(column), `Phase-85 column ${table}.${column} missing from fresh SQLite`);
      }
    }
  } finally {
    store.close();
  }
});

test("schema parity (b): SQLite column sets match docs/db/postgres-schema.json per table", async (t) => {
  const snapshot = JSON.parse(readFileSync(POSTGRES_SCHEMA_JSON_PATH, "utf8"));
  assert.ok(snapshot && typeof snapshot.tables === "object", "postgres-schema.json must have a tables map");

  const store = await freshSqliteStore();
  try {
    const skipped = [];
    for (const table of TABLES) {
      const pgEntry = snapshot.tables[table];
      if (!pgEntry) {
        // Documented loud skip: the committed snapshot predates this table. Fix by running
        // scripts/generate-postgres-schema-json.mjs against live Postgres and committing.
        skipped.push(table);
        continue;
      }
      const pgColumns = new Set(pgEntry.columns.map((column) => column.name));
      const sqliteColumns = await sqliteColumnNames(store, table);
      const { onlyA: onlySqlite, onlyB: onlyPg } = diffSets(sqliteColumns, pgColumns);
      assert.deepEqual(
        { onlySqlite, onlyPg },
        { onlySqlite: [], onlyPg: [] },
        `engine drift on ${table}: columns only in SQLite=[${onlySqlite}], only in postgres-schema.json=[${onlyPg}] ` +
          `(regenerate docs/db/postgres-schema.json via scripts/generate-postgres-schema-json.mjs if the schema legitimately moved)`
      );
    }
    if (skipped.length) {
      t.diagnostic(
        `SKIPPED ${skipped.length} table(s) not yet in docs/db/postgres-schema.json: ${skipped.join(", ")} — ` +
          "regenerate the snapshot from live Postgres (scripts/generate-postgres-schema-json.mjs) and commit it."
      );
    }
  } finally {
    store.close();
  }
});

test("schema parity (c): live Postgres information_schema matches SQLite (optional, skip-loud)", async (t) => {
  const [{ PostgresStore }, { evaluateDatabaseSecretProfile }] = await Promise.all([
    import("../concierge/postgresStore.mjs"),
    import("../concierge/databaseSecretProfile.mjs")
  ]);
  const profile = evaluateDatabaseSecretProfile(process.env);
  const pgStore = new PostgresStore(profile.databaseUrl);

  try {
    await Promise.race([
      pgStore.get("SELECT 1 AS ok;"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`connect timeout after ${LIVE_PG_CONNECT_TIMEOUT_MS}ms`)), LIVE_PG_CONNECT_TIMEOUT_MS)
      )
    ]);
  } catch (error) {
    await pgStore.close().catch(() => {});
    t.skip(
      `live Postgres arm SKIPPED: unreachable at ${profile.host ?? "?"}:${profile.port ?? "?"} (${error.message}). ` +
        "Start it via `docker compose -f compose.yaml up -d postgres` to exercise live parity."
    );
    return;
  }

  const sqliteStore = await freshSqliteStore();
  try {
    await pgStore.initialize({ seed: false });
    const rows = await pgStore.all(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public';"
    );
    const pgByTable = new Map();
    for (const row of rows) {
      if (!pgByTable.has(row.table_name)) pgByTable.set(row.table_name, new Set());
      pgByTable.get(row.table_name).add(row.column_name);
    }
    for (const table of TABLES) {
      assert.ok(pgByTable.has(table), `TABLES entry ${table} missing from live Postgres`);
      const sqliteColumns = await sqliteColumnNames(sqliteStore, table);
      const { onlyA: onlySqlite, onlyB: onlyPg } = diffSets(sqliteColumns, pgByTable.get(table));
      assert.deepEqual(
        { onlySqlite, onlyPg },
        { onlySqlite: [], onlyPg: [] },
        `live engine drift on ${table}: only in SQLite=[${onlySqlite}], only in live Postgres=[${onlyPg}]`
      );
    }
  } finally {
    sqliteStore.close();
    await pgStore.close().catch(() => {});
  }
});
