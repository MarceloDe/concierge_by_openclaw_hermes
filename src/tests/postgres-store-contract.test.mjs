import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDatabaseStore, normalizeDatabaseDriver, resolveDatabaseDriver, PostgresStore, runtimePostgresAuthority } from "../concierge/databaseFactory.mjs";
import { POSTGRES_ADAPTER_VERSION, toPostgresSql } from "../concierge/postgresStore.mjs";

test("database factory uses PostgreSQL in every runtime profile and rejects SQLite", () => {
  assert.equal(normalizeDatabaseDriver(undefined), "postgres");
  assert.equal(normalizeDatabaseDriver("postgres"), "postgres");
  assert.throws(() => normalizeDatabaseDriver("sqlite"), (error) => error.failureClass === "non_postgres_runtime_forbidden");
  assert.throws(() => normalizeDatabaseDriver("anything_else"), (error) => error.failureClass === "non_postgres_runtime_forbidden");
  assert.ok(createDatabaseStore({}) instanceof PostgresStore);
  assert.ok(createDatabaseStore({ BRAINSTY_DB_DRIVER: "postgres", BRAINSTY_DATABASE_URL: "postgresql://user:pass@127.0.0.1:55432/db" }) instanceof PostgresStore);
});

test("database factory keeps one PostgreSQL authority across production and development", () => {
  assert.equal(resolveDatabaseDriver({ NODE_ENV: "production", BRAINSTY_DATABASE_TARGET: "postgres" }), "postgres");
  assert.equal(resolveDatabaseDriver({ BRAINSTY_RUNTIME_ENV: "production-candidate", BRAINSTY_DATABASE_TARGET: "postgres" }), "postgres");
  assert.throws(() => resolveDatabaseDriver({ NODE_ENV: "production", BRAINSTY_DATABASE_TARGET: "sqlite" }), /only runtime authority/);
  assert.equal(resolveDatabaseDriver({ NODE_ENV: "development", BRAINSTY_DATABASE_TARGET: "postgres" }), "postgres");
  assert.equal(runtimePostgresAuthority({ BRAINSTY_DATABASE_URL: "postgresql://user:pass@127.0.0.1:55432/db" }).driver, "postgres");
  assert.ok(
    createDatabaseStore({
      NODE_ENV: "production",
      BRAINSTY_DATABASE_TARGET: "postgres",
      BRAINSTY_DATABASE_URL: "postgresql://user:pass@127.0.0.1:55432/db"
    }) instanceof PostgresStore
  );
});

test("Postgres adapter translates bound placeholders without touching quoted question marks", () => {
  const sql = "SELECT * FROM users WHERE email = ? AND name = '?' AND id = ? ORDER BY rowid DESC LIMIT ?;";
  assert.equal(
    toPostgresSql(sql),
    "SELECT * FROM users WHERE email = $1 AND name = '?' AND id = $2 ORDER BY ctid DESC LIMIT $3;"
  );
});

test("Postgres adapter is a pg-bound runtime path, not a shell-out shortcut", async () => {
  const source = await readFile(new URL("../concierge/postgresStore.mjs", import.meta.url), "utf8");
  assert.match(source, /from "pg"/);
  assert.match(source, new RegExp(POSTGRES_ADAPTER_VERSION));
  assert.doesNotMatch(source, /node:child_process|spawn\(|execFile\(|psql\s/);
  assert.match(source, /BEGIN;/);
  assert.match(source, /ROLLBACK;/);
});
