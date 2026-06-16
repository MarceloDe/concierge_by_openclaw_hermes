import { DATABASE_ADAPTER_VERSION, DEFAULT_DB_PATH } from "./database.mjs";
import { POSTGRES_ADAPTER_VERSION } from "./postgresStore.mjs";

export const STORAGE_READINESS_VERSION = "2026-06-15.storage-readiness.v1";

function redactDatabaseUrl(rawUrl) {
  const value = String(rawUrl ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.password) url.password = "redacted";
    if (url.username) url.username = url.username ? "redacted" : "";
    return url.toString();
  } catch {
    return value.replace(/:\/\/([^:@/]+):([^@/]+)@/, "://redacted:redacted@");
  }
}

export function getStorageReadiness({ deployment = null, env = process.env } = {}) {
  const runtimeDriver = String(env.BRAINSTY_DB_DRIVER ?? "sqlite").toLowerCase();
  const databaseTarget = String(env.BRAINSTY_DATABASE_TARGET ?? "postgres").toLowerCase();
  const databaseUrl = env.BRAINSTY_DATABASE_URL ?? "";
  const postgresComposeReady = Boolean(deployment?.postgresRuntimeReady);
  const postgresLiveReady = Boolean(deployment?.postgresLiveReady);
  const postgresAdapterReady = Boolean(deployment?.postgresAdapterRuntimeReady ?? true);
  const postgresRuntimeSmokeReady = Boolean(deployment?.postgresRuntimeSmokeReady ?? env.BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY === "1");
  const sqliteRuntimeReady = runtimeDriver === "sqlite" && DATABASE_ADAPTER_VERSION.includes("node-sqlite-bound-store");
  const postgresRuntimeSelected = runtimeDriver === "postgres";
  const postgresConfigured = Boolean(databaseUrl) || postgresComposeReady;
  const fullMigrationReady = false;
  const migrationPending = !fullMigrationReady;
  const status = postgresRuntimeSelected
    ? postgresRuntimeSmokeReady
      ? "postgres_runtime_selected_parity_smoked"
      : "postgres_runtime_selected_needs_parity_smoke"
    : postgresRuntimeSmokeReady
      ? "postgres_adapter_parity_ready_sqlite_default"
      : postgresLiveReady
        ? "postgres_live_ready_sqlite_runtime"
        : postgresComposeReady
          ? "postgres_compose_profile_present_sqlite_runtime"
          : "postgres_profile_missing";
  const score = postgresRuntimeSmokeReady ? 90 : postgresLiveReady ? 85 : postgresComposeReady ? 75 : 0;

  return {
    version: STORAGE_READINESS_VERSION,
    ok: (sqliteRuntimeReady || postgresRuntimeSelected) && postgresComposeReady && postgresAdapterReady,
    status,
    score,
    targetScore: 100,
    runtimeDriver,
    runtimeAdapterVersion: DATABASE_ADAPTER_VERSION,
    postgresAdapterVersion: POSTGRES_ADAPTER_VERSION,
    appRuntimeMigratedToPostgres: postgresRuntimeSelected,
    fullMigrationReady,
    migrationPending,
    sqlite: {
      enabled: sqliteRuntimeReady,
      dbPath: env.BRAINSTY_DB_PATH ?? DEFAULT_DB_PATH,
      boundedParameters: true,
      sqliteShellOut: false
    },
    postgres: {
      target: databaseTarget === "postgres",
      configured: postgresConfigured,
      composeReady: postgresComposeReady,
      liveReady: postgresLiveReady,
      adapterReady: postgresAdapterReady,
      runtimeSmokeReady: postgresRuntimeSmokeReady,
      redactedUrl: redactDatabaseUrl(databaseUrl),
      initContract: "project/db/postgres-init/001_storage_readiness.sql",
      smokeCommand: "npm run storage:postgres:smoke",
      runtimeSmokeCommand: "npm run storage:postgres:runtime-smoke"
    },
    safety: {
      secretsRedacted: true,
      phiSeeded: false,
      transactionalTarget: "postgres",
      localRuntimeStillSQLite: !postgresRuntimeSelected,
      boundParameterAdapter: postgresAdapterReady
    },
    nextAction: postgresRuntimeSelected
      ? "Expand endpoint and worker coverage before declaring full Postgres production migration."
      : "Keep SQLite local runtime stable while expanding Postgres adapter parity, leases, and migration tests."
  };
}
