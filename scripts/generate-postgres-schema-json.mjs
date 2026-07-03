#!/usr/bin/env node
// Regenerates docs/db/postgres-schema.json from LIVE Postgres introspection (Phase 85, plan §5.4).
//
// - Resolves the connection the SAME way the runtime does: evaluateDatabaseSecretProfile
//   (BRAINSTY_DATABASE_URL_FILE > BRAINSTY_DATABASE_URL > DEFAULT_POSTGRES_URL, which targets
//   the compose.postgres.yaml/compose.yaml host mapping 127.0.0.1:55432).
// - Applies migrations via PostgresStore.initialize() (schema only, no registry seeding),
//   then introspects information_schema.columns for every schema.mjs TABLES entry.
// - Fails LOUD (exit 1, resolved host/port named, credentials never printed) if Postgres is
//   unreachable or any TABLES entry is missing. Never writes a partial/fake JSON.
//
// Usage: node scripts/generate-postgres-schema-json.mjs
//   (bring Postgres up first if needed: docker compose -f compose.yaml up -d postgres)

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PostgresStore } from "../src/concierge/postgresStore.mjs";
import { evaluateDatabaseSecretProfile, redactDatabaseUrl } from "../src/concierge/databaseSecretProfile.mjs";
import { TABLES } from "../src/concierge/schema.mjs";

const OUTPUT_PATH = resolve(import.meta.dirname, "../docs/db/postgres-schema.json");
const CONNECT_TIMEOUT_MS = Number(process.env.BRAINSTY_PG_SCHEMA_CONNECT_TIMEOUT_MS ?? 5000);

const profile = evaluateDatabaseSecretProfile(process.env);
const databaseUrl = profile.databaseUrl;
const where = `${profile.host ?? "unknown-host"}:${profile.port ?? "5432"}/${profile.database ?? "unknown-db"}`;

function failLoud(message, error) {
  console.error(`[generate-postgres-schema-json] FAIL: ${message}`);
  console.error(`  resolved target: ${where} (source: ${profile.source}, url: ${redactDatabaseUrl(databaseUrl)})`);
  if (error) console.error(`  cause: ${error.message}`);
  process.exit(1);
}

if (!profile.validPostgresUrl) {
  failLoud("resolved database URL is not a valid postgres:// URL");
}

const store = new PostgresStore(databaseUrl);

// Fast reachability probe before running migrations, so an unreachable server fails in
// seconds with a clear message instead of a slow driver retry stack.
try {
  await Promise.race([
    store.get("SELECT 1 AS ok;"),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`connect timeout after ${CONNECT_TIMEOUT_MS}ms`)), CONNECT_TIMEOUT_MS)
    )
  ]);
} catch (error) {
  await store.close().catch(() => {});
  failLoud(`Postgres is unreachable at ${where}`, error);
}

try {
  // Apply the full migration path (SCHEMA_SQL + COLUMN_MIGRATIONS + backfill + INDEX_MIGRATIONS).
  // seed:false keeps this script schema-only; runtime registry seeding stays an app-boot concern.
  await store.initialize({ seed: false });

  const { rows } = await store.query(
    `SELECT table_name, column_name, data_type, is_nullable, column_default, ordinal_position
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position;`
  );

  const byTable = new Map();
  for (const row of rows) {
    if (!byTable.has(row.table_name)) byTable.set(row.table_name, []);
    byTable.get(row.table_name).push({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === "YES",
      default: row.column_default ?? null,
      position: Number(row.ordinal_position)
    });
  }

  const missing = TABLES.filter((table) => !byTable.has(table));
  if (missing.length) {
    failLoud(`live Postgres is missing ${missing.length} TABLES entr${missing.length === 1 ? "y" : "ies"}: ${missing.join(", ")}`);
  }

  // Constraint/index introspection — the committed JSON shape carries primaryKey,
  // foreignKeys, uniques, and indexes per table (consumers rely on those keys).
  const pkRows = await store.all(
    `SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
     ORDER BY tc.table_name, kcu.ordinal_position;`
  );
  const pkByTable = new Map();
  for (const row of pkRows) {
    if (!pkByTable.has(row.table_name)) pkByTable.set(row.table_name, []);
    pkByTable.get(row.table_name).push(row.column_name);
  }

  const fkRows = await store.all(
    `SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
     ORDER BY tc.table_name, kcu.column_name;`
  );
  const fkByTable = new Map();
  for (const row of fkRows) {
    if (!fkByTable.has(row.table_name)) fkByTable.set(row.table_name, []);
    fkByTable.get(row.table_name).push({
      column: row.column_name,
      references: `${row.foreign_table}.${row.foreign_column}`
    });
  }

  const uniqueRows = await store.all(
    `SELECT tc.table_name, kcu.column_name, tc.constraint_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = 'public'
     ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;`
  );
  const uniqueByTable = new Map();
  for (const row of uniqueRows) {
    if (!uniqueByTable.has(row.table_name)) uniqueByTable.set(row.table_name, []);
    uniqueByTable.get(row.table_name).push({ column: row.column_name, constraint: row.constraint_name });
  }

  const indexRows = await store.all(
    `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
     ORDER BY tablename, indexname;`
  );
  const indexByTable = new Map();
  for (const row of indexRows) {
    if (!indexByTable.has(row.tablename)) indexByTable.set(row.tablename, []);
    indexByTable.get(row.tablename).push({ name: row.indexname, def: row.indexdef });
  }

  const tables = {};
  for (const table of [...TABLES].sort()) {
    tables[table] = {
      columns: byTable.get(table),
      primaryKey: pkByTable.get(table) ?? [],
      foreignKeys: fkByTable.get(table) ?? [],
      uniques: uniqueByTable.get(table) ?? [],
      indexes: indexByTable.get(table) ?? []
    };
  }

  // Shape matches the pre-existing docs/db/postgres-schema.json consumers rely on
  // ({generatedFrom, engine, tableCount, tables.{name}.columns[]}); generatedAt is additive.
  const output = {
    generatedFrom: "live Postgres 16 information_schema (real query)",
    engine: "postgres (SCHEMA_SQL applied via PostgresStore.initialize)",
    generatedAt: new Date().toISOString(),
    tableCount: Object.keys(tables).length,
    tables
  };

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`[generate-postgres-schema-json] OK: wrote ${OUTPUT_PATH}`);
  console.log(`  target: ${where} | tables: ${output.tableCount} | TABLES entries: ${TABLES.length}`);
} catch (error) {
  failLoud("live introspection failed", error);
} finally {
  await store.close().catch(() => {});
}
