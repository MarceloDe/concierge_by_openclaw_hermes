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
  const postgresProductionSmokeReady = Boolean(deployment?.postgresProductionSmokeReady ?? env.BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY === "1");
  const postgresWorkerLeaseReady = Boolean(deployment?.postgresWorkerLeaseReady ?? env.BRAINSTY_POSTGRES_WORKER_LEASE_READY === "1");
  const postgresBackupRestoreReady = Boolean(deployment?.postgresBackupRestoreReady ?? env.BRAINSTY_POSTGRES_BACKUP_RESTORE_READY === "1");
  const postgresEndpointParityReady = Boolean(deployment?.postgresEndpointParityReady ?? env.BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY === "1");
  const databaseSecretProfileReady = Boolean(deployment?.databaseSecretProfileReady ?? env.BRAINSTY_DATABASE_SECRET_PROFILE_READY === "1");
  const sqliteRuntimeReady = runtimeDriver === "sqlite" && DATABASE_ADAPTER_VERSION.includes("node-sqlite-bound-store");
  const postgresRuntimeSelected = runtimeDriver === "postgres";
  const postgresConfigured = Boolean(databaseUrl) || postgresComposeReady;
  const operationalGatesReady =
    postgresRuntimeSmokeReady &&
    postgresProductionSmokeReady &&
    postgresWorkerLeaseReady &&
    postgresBackupRestoreReady &&
    postgresEndpointParityReady;
  const productionGatesReady = operationalGatesReady && databaseSecretProfileReady;
  const fullMigrationReady = postgresRuntimeSelected && productionGatesReady;
  const migrationPending = !fullMigrationReady;
  const status = postgresRuntimeSelected
    ? fullMigrationReady
      ? "postgres_production_ready"
      : productionGatesReady
        ? "postgres_runtime_selected_production_gates_ready"
        : operationalGatesReady
          ? "postgres_runtime_selected_operational_gates_ready_secret_profile_pending"
        : postgresRuntimeSmokeReady
          ? "postgres_runtime_selected_parity_smoked"
          : "postgres_runtime_selected_needs_parity_smoke"
    : productionGatesReady
      ? "postgres_production_gates_ready_sqlite_default"
      : operationalGatesReady
        ? "postgres_operational_gates_ready_sqlite_default_secret_profile_pending"
      : postgresRuntimeSmokeReady
        ? "postgres_adapter_parity_ready_sqlite_default"
        : postgresLiveReady
          ? "postgres_live_ready_sqlite_runtime"
          : postgresComposeReady
            ? "postgres_compose_profile_present_sqlite_runtime"
            : "postgres_profile_missing";
  const score = fullMigrationReady
    ? 100
    : operationalGatesReady
      ? 95
      : postgresRuntimeSmokeReady
        ? 90
        : postgresLiveReady
          ? 85
          : postgresComposeReady
            ? 75
            : 0;

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
      productionSmokeReady: postgresProductionSmokeReady,
      workerLeaseReady: postgresWorkerLeaseReady,
      backupRestoreReady: postgresBackupRestoreReady,
      endpointParityReady: postgresEndpointParityReady,
      operationalGatesReady,
      productionGatesReady,
      redactedUrl: redactDatabaseUrl(databaseUrl),
      initContract: "project/db/postgres-init/001_storage_readiness.sql",
      smokeCommand: "npm run storage:postgres:smoke",
      runtimeSmokeCommand: "npm run storage:postgres:runtime-smoke",
      productionSmokeCommand: "npm run storage:postgres:production-smoke"
    },
    safety: {
      secretsRedacted: true,
      secretProfileReady: databaseSecretProfileReady,
      phiSeeded: false,
      transactionalTarget: "postgres",
      localRuntimeStillSQLite: !postgresRuntimeSelected,
      boundParameterAdapter: postgresAdapterReady
    },
    nextAction: fullMigrationReady
      ? "Postgres production gates are ready; keep running endpoint regression and visual proof before broad rollout."
      : productionGatesReady && !postgresRuntimeSelected
        ? "Switch an isolated runtime profile to BRAINSTY_DB_DRIVER=postgres before making Postgres the default."
        : operationalGatesReady && !databaseSecretProfileReady
          ? "Add a real secret-manager or managed-secret profile before declaring database readiness at 100."
        : postgresRuntimeSelected
          ? "Expand endpoint and worker coverage before declaring full Postgres production migration."
          : "Keep SQLite local runtime stable while expanding Postgres adapter parity, leases, and migration tests."
  };
}
