import { createHash } from "node:crypto";
import { getDatabaseUrlFromEnv } from "./databaseSecretProfile.mjs";
import { DEFAULT_POSTGRES_URL, PostgresStore } from "./postgresStore.mjs";

export const RUNTIME_DATABASE_AUTHORITY_VERSION = "2026-07-12.postgres-single-authority.v1";
let runtimeStore = null;
let runtimeAuthorityId = null;

function authorityId(connectionString) {
  return createHash("sha256").update(String(connectionString)).digest("hex");
}

export function normalizeDatabaseDriver(value) {
  const driver = String(value ?? "postgres").trim().toLowerCase();
  if (["postgres", "postgresql", "pg"].includes(driver)) return "postgres";
  const error = new Error(`Runtime database driver '${driver || "empty"}' is forbidden. PostgreSQL is the only runtime authority.`);
  error.failureClass = "non_postgres_runtime_forbidden";
  throw error;
}

export function isProductionDatabaseProfile(env = process.env) {
  const runtimeEnv = String(env.BRAINSTY_RUNTIME_ENV ?? env.NODE_ENV ?? env.APP_ENV ?? "").trim().toLowerCase();
  return ["production", "prod", "staging", "production-candidate"].includes(runtimeEnv);
}

export function resolveDatabaseDriver(env = process.env) {
  normalizeDatabaseDriver(env.BRAINSTY_DB_DRIVER ?? "postgres");
  normalizeDatabaseDriver(env.BRAINSTY_DATABASE_TARGET ?? "postgres");
  return "postgres";
}

export function createDatabaseStore(env = process.env) {
  resolveDatabaseDriver(env);
  const connectionString = getDatabaseUrlFromEnv(env);
  return new PostgresStore(connectionString, {
    poolOptions: {
      max: Number(env.BRAINSTY_POSTGRES_POOL_MAX ?? 10),
      idleTimeoutMillis: Number(env.BRAINSTY_POSTGRES_IDLE_TIMEOUT_MS ?? 60_000),
      connectionTimeoutMillis: Number(env.BRAINSTY_POSTGRES_CONNECT_TIMEOUT_MS ?? 10_000),
      allowExitOnIdle: env.BRAINSTY_POSTGRES_ALLOW_EXIT_ON_IDLE !== "0",
      application_name: env.BRAINSTY_POSTGRES_APPLICATION_NAME ?? "brainstyworkers-runtime"
    }
  });
}

export function runtimePostgresAuthority(env = process.env) {
  resolveDatabaseDriver(env);
  const connectionString = getDatabaseUrlFromEnv(env);
  return {
    version: RUNTIME_DATABASE_AUTHORITY_VERSION,
    driver: "postgres",
    authorityId: authorityId(connectionString),
    authoritativeFor: [
      "sessions",
      "agent_state",
      "langgraph_checkpoints",
      "context_packets",
      "source_pointers",
      "approvals",
      "tasks",
      "audit"
    ],
    redisRole: "rebuildable_cache_and_mirror_only",
    graphitiRole: "long_term_temporal_facts_only",
    openclawRole: "bounded_worker_state_no_independent_memory_authority"
  };
}

export async function getRuntimeDatabaseStore(env = process.env, { seed = true } = {}) {
  const authority = runtimePostgresAuthority(env);
  if (runtimeStore && runtimeAuthorityId !== authority.authorityId) {
    const error = new Error("Runtime PostgreSQL authority changed after process initialization; refusing a split-brain store.");
    error.failureClass = "postgres_runtime_authority_changed";
    throw error;
  }
  if (!runtimeStore) {
    runtimeStore = createDatabaseStore(env);
    runtimeAuthorityId = authority.authorityId;
  }
  await runtimeStore.initialize({ seed });
  return runtimeStore;
}

export function createRuntimeDatabaseStoreFactory(env = process.env) {
  const capturedAuthority = runtimePostgresAuthority(env);
  return async () => {
    const currentAuthority = runtimePostgresAuthority(env);
    if (currentAuthority.authorityId !== capturedAuthority.authorityId) {
      const error = new Error("PostgreSQL authority changed before lazy checkpointer initialization.");
      error.failureClass = "postgres_runtime_authority_changed";
      throw error;
    }
    return getRuntimeDatabaseStore(env, { seed: false });
  };
}

export async function closeRuntimeDatabaseStore() {
  if (runtimeStore) await runtimeStore.close();
  runtimeStore = null;
  runtimeAuthorityId = null;
}

export { DEFAULT_POSTGRES_URL, PostgresStore };
