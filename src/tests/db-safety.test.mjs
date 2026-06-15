import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DATABASE_ADAPTER_VERSION,
  assertSafeSqlIdentifier,
  assertSafeTableName,
  SqliteStore
} from "../concierge/database.mjs";

test("database high-level helpers reject unsafe table and column identifiers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-db-safety-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();

  assert.equal(assertSafeTableName("users"), "users");
  assert.throws(() => assertSafeTableName("users; DROP TABLE users;"), /Unsafe SQL table/);
  assert.throws(() => assertSafeTableName("not_a_table"), /not allowlisted/);
  assert.throws(() => assertSafeSqlIdentifier("id; DROP", "column"), /Unsafe SQL column/);

  await assert.rejects(store.findOne("users; DROP TABLE users;", { id: "x" }), /Unsafe SQL table/);
  await assert.rejects(store.findOne("users", { "id OR 1=1": "x" }), /Unsafe SQL column/);
});

test("database store uses native sqlite adapter with migration ledger and no sqlite3 shell", async () => {
  const source = await readFile(new URL("../concierge/database.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /node:child_process|spawn\(|execFile\(|sqlite3/);
  assert.match(source, /node:sqlite/);

  const dir = await mkdtemp(join(tmpdir(), "brainsty-db-native-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  assert.equal(store.adapterVersion, DATABASE_ADAPTER_VERSION);

  const baseMigration = await store.findOne("schema_migrations", { migration_key: "schema:base" });
  assert.ok(baseMigration);
  assert.match(baseMigration.details_json, /node-sqlite-bound-store/);
});

test("database high-level helpers bind values and transactions roll back failed writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-db-bound-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  const maliciousEmail = "bound@example.com'); DROP TABLE users; --";
  await store.insert("users", {
    id: "user_bound",
    name: "Bound User",
    email: maliciousEmail,
    created_at: "2026-06-15T12:00:00.000Z"
  });
  const row = await store.findOne("users", { email: maliciousEmail });
  assert.equal(row.id, "user_bound");
  assert.equal((await store.get("SELECT COUNT(*) AS count FROM users;")).count, 1);

  await assert.rejects(
    store.transaction(async (tx) => {
      await tx.insert("users", {
        id: "user_rollback",
        name: "Rollback User",
        email: "rollback@example.com",
        created_at: "2026-06-15T12:01:00.000Z"
      });
      throw new Error("force rollback");
    }),
    /force rollback/
  );
  const rolledBack = await store.findOne("users", { id: "user_rollback" });
  assert.equal(rolledBack, null);
});

test("database raw get/all methods support bound value parameters", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-db-raw-params-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  const hostileValue = "raw@example.com' OR 1=1 --";
  await store.insert("users", {
    id: "user_raw_params",
    name: "Raw Params User",
    email: hostileValue,
    created_at: "2026-06-15T12:02:00.000Z"
  });
  await store.insert("users", {
    id: "user_other",
    name: "Other User",
    email: "other@example.com",
    created_at: "2026-06-15T12:03:00.000Z"
  });

  const row = await store.get("SELECT * FROM users WHERE email = ?;", [hostileValue]);
  assert.equal(row.id, "user_raw_params");

  const rows = await store.all("SELECT * FROM users WHERE email = ? ORDER BY created_at ASC;", [hostileValue]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "user_raw_params");
});
