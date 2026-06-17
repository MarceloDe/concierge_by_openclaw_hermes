import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDatabaseStore, normalizeDatabaseDriver, PostgresStore, SqliteStore } from "../concierge/databaseFactory.mjs";
import { POSTGRES_ADAPTER_VERSION, toPostgresSql } from "../concierge/postgresStore.mjs";

test("database factory keeps sqlite default and selects Postgres only by explicit driver", () => {
  assert.equal(normalizeDatabaseDriver(undefined), "sqlite");
  assert.equal(normalizeDatabaseDriver("postgres"), "postgres");
  assert.equal(normalizeDatabaseDriver("anything_else"), "sqlite");
  assert.ok(createDatabaseStore({}) instanceof SqliteStore);
  assert.ok(createDatabaseStore({ BRAINSTY_DB_DRIVER: "postgres", BRAINSTY_DATABASE_URL: "postgresql://user:pass@127.0.0.1:55432/db" }) instanceof PostgresStore);
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
