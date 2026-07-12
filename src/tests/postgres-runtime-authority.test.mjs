import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  normalizeDatabaseDriver,
  resolveDatabaseDriver,
  runtimePostgresAuthority
} from "../concierge/databaseFactory.mjs";
import { createGraphCheckpointer, durableCheckpointerMode } from "../concierge/graphCheckpointer.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const RUNTIME_FILES = [
  "src/concierge/database.mjs",
  "src/concierge/databaseFactory.mjs",
  "src/concierge/postgresStore.mjs",
  "src/concierge/graphCheckpointer.mjs",
  "src/server/server.mjs",
  "Dockerfile.node",
  "compose.yaml",
  "compose.postgres.yaml"
];

test("runtime has one PostgreSQL authority and no embedded database selector", async () => {
  const sources = await Promise.all(RUNTIME_FILES.map((file) => readFile(resolve(ROOT, file), "utf8")));
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const file = RUNTIME_FILES[index];
    assert.doesNotMatch(source, /from\s+["']node:sqlite["']/, `${file} must not import an embedded database`);
    assert.doesNotMatch(source, /BRAINSTY_DB_PATH/, `${file} must not expose an embedded database path`);
    assert.doesNotMatch(source, /new\s+SqliteStore\b/, `${file} must not construct an embedded runtime store`);
    assert.doesNotMatch(source, /BRAINSTY_DB_DRIVER[^\n]*:-sqlite/, `${file} must not default to an embedded runtime store`);
  }

  assert.equal(resolveDatabaseDriver({}), "postgres");
  assert.equal(normalizeDatabaseDriver("pg"), "postgres");
  assert.throws(() => normalizeDatabaseDriver("sqlite"), (error) => error.failureClass === "non_postgres_runtime_forbidden");
});

test("authority roles and checkpointer fail closed to the final architecture", () => {
  const env = {
    BRAINSTY_DB_DRIVER: "postgres",
    BRAINSTY_DATABASE_TARGET: "postgres",
    BRAINSTY_DATABASE_URL: "postgresql://proof:proof@127.0.0.1:55432/proof?sslmode=disable"
  };
  const authority = runtimePostgresAuthority(env);
  assert.deepEqual(authority.authoritativeFor, [
    "sessions",
    "agent_state",
    "langgraph_checkpoints",
    "context_packets",
    "source_pointers",
    "approvals",
    "tasks",
    "audit"
  ]);
  assert.equal(authority.redisRole, "rebuildable_cache_and_mirror_only");
  assert.equal(authority.graphitiRole, "long_term_temporal_facts_only");
  assert.equal(authority.openclawRole, "bounded_worker_state_no_independent_memory_authority");
  assert.equal(durableCheckpointerMode("postgres"), "postgres");
  assert.equal(durableCheckpointerMode("memory"), null);
  assert.equal(durableCheckpointerMode("file"), null);
  assert.throws(
    () => createGraphCheckpointer({ ...env, BRAINSTY_GRAPH_CHECKPOINTER: "memory", BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY: "proof" }),
    (error) => error.failureClass === "non_postgres_checkpointer_forbidden"
  );
});
