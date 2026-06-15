import { DATABASE_ADAPTER_VERSION, DEFAULT_DB_PATH } from "./database.mjs";

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
  const sqliteRuntimeReady = runtimeDriver === "sqlite" && DATABASE_ADAPTER_VERSION.includes("node-sqlite-bound-store");
  const postgresRuntimeSelected = runtimeDriver === "postgres";
  const postgresConfigured = Boolean(databaseUrl) || postgresComposeReady;
  const migrationPending = !postgresRuntimeSelected;
  const status = postgresLiveReady
    ? "postgres_live_ready_sqlite_runtime"
    : postgresComposeReady
      ? "postgres_compose_profile_present_sqlite_runtime"
      : "postgres_profile_missing";
  const score = postgresLiveReady ? 85 : postgresComposeReady ? 75 : 0;

  return {
    version: STORAGE_READINESS_VERSION,
    ok: sqliteRuntimeReady && postgresComposeReady,
    status,
    score,
    targetScore: 100,
    runtimeDriver,
    runtimeAdapterVersion: DATABASE_ADAPTER_VERSION,
    appRuntimeMigratedToPostgres: postgresRuntimeSelected,
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
      redactedUrl: redactDatabaseUrl(databaseUrl),
      initContract: "project/db/postgres-init/001_storage_readiness.sql",
      smokeCommand: "npm run storage:postgres:smoke"
    },
    safety: {
      secretsRedacted: true,
      phiSeeded: false,
      transactionalTarget: "postgres",
      localRuntimeStillSQLite: !postgresRuntimeSelected
    },
    nextAction: postgresRuntimeSelected
      ? "Implement and validate the Postgres store adapter before routing healthcare runtime writes there."
      : "Keep SQLite local runtime stable while implementing the Postgres store adapter and migration tests."
  };
}
