import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { TABLES } from "../concierge/schema.mjs";

test("database initializes every required slice 1 table", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-db-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  const counts = await store.counts();

  for (const table of TABLES) {
    assert.equal(typeof counts[table], "number", `${table} should exist`);
  }
});
