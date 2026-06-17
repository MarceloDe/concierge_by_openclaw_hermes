import { DATABASE_ADAPTER_VERSION, DEFAULT_DB_PATH } from "./database.mjs";
import { evaluateDatabaseSecretProfile, publicDatabaseSecretProfile, redactDatabaseUrl } from "./databaseSecretProfile.mjs";
import { POSTGRES_ADAPTER_VERSION } from "./postgresStore.mjs";

export const STORAGE_READINESS_VERSION = "2026-06-15.storage-readiness.v1";

export function getStorageReadiness({ deployment = null, env = process.env } = {}) {
  const runtimeDriver = String(env.BRAINSTY_DB_DRIVER ?? "sqlite").toLowerCase();
  const databaseTarget = String(env.BRAINSTY_DATABASE_TARGET ?? "postgres").toLowerCase();
  const databaseUrl = env.BRAINSTY_DATABASE_URL ?? "";
  const databaseSecretProfile = evaluateDatabaseSecretProfile(env);
  const postgresComposeReady = Boolean(deployment?.postgresRuntimeReady);
  const postgresLiveReady = Boolean(deployment?.postgresLiveReady);
  const postgresAdapterReady = Boolean(deployment?.postgresAdapterRuntimeReady ?? true);
  const postgresRuntimeSmokeReady = Boolean(deployment?.postgresRuntimeSmokeReady ?? env.BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY === "1");
  const postgresProductionSmokeReady = Boolean(deployment?.postgresProductionSmokeReady ?? env.BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY === "1");
  const postgresWorkerLeaseReady = Boolean(deployment?.postgresWorkerLeaseReady ?? env.BRAINSTY_POSTGRES_WORKER_LEASE_READY === "1");
  const postgresBackupRestoreReady = Boolean(deployment?.postgresBackupRestoreReady ?? env.BRAINSTY_POSTGRES_BACKUP_RESTORE_READY === "1");
  const postgresBackupRunbookReady = Boolean(deployment?.postgresBackupRunbookReady ?? env.BRAINSTY_POSTGRES_BACKUP_RUNBOOK_READY === "1");
  const postgresEndpointParityReady = Boolean(deployment?.postgresEndpointParityReady ?? env.BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY === "1");
  const databaseSecretProfileReady = Boolean(deployment?.databaseSecretProfileReady ?? databaseSecretProfile.ready);
  const postgresDefaultRolloutReady = Boolean(deployment?.postgresDefaultRolloutReady ?? env.BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY === "1");
  const postgresProductionProfileReady = Boolean(deployment?.postgresProductionProfileReady);
  const sqliteRuntimeReady = runtimeDriver === "sqlite" && DATABASE_ADAPTER_VERSION.includes("node-sqlite-bound-store");
  const postgresRuntimeSelected = runtimeDriver === "postgres";
  const postgresConfigured = Boolean(databaseUrl) || databaseSecretProfile.urlPresent || postgresComposeReady;
  const operationalGatesReady =
    postgresRuntimeSmokeReady &&
    postgresProductionSmokeReady &&
    postgresWorkerLeaseReady &&
    postgresBackupRestoreReady &&
    postgresEndpointParityReady;
  const productionGatesReady = operationalGatesReady && databaseSecretProfileReady && postgresDefaultRolloutReady;
  const fullMigrationReady = postgresRuntimeSelected && productionGatesReady;
  const migrationPending = !fullMigrationReady;
  const status = postgresRuntimeSelected
    ? fullMigrationReady
      ? "postgres_production_ready"
      : operationalGatesReady && databaseSecretProfileReady && !postgresDefaultRolloutReady
        ? "postgres_runtime_selected_secret_profile_ready_default_rollout_pending"
        : productionGatesReady
          ? "postgres_runtime_selected_production_gates_ready"
        : operationalGatesReady
          ? "postgres_runtime_selected_operational_gates_ready_secret_profile_pending"
        : postgresRuntimeSmokeReady
          ? "postgres_runtime_selected_parity_smoked"
          : "postgres_runtime_selected_needs_parity_smoke"
    : productionGatesReady
      ? "postgres_production_gates_ready_sqlite_default"
      : operationalGatesReady && databaseSecretProfileReady && !postgresDefaultRolloutReady
        ? "postgres_secret_profile_ready_sqlite_default_rollout_pending"
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
    : postgresRuntimeSelected && operationalGatesReady && databaseSecretProfileReady
      ? 98
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
      backupRunbookReady: postgresBackupRunbookReady,
      endpointParityReady: postgresEndpointParityReady,
      operationalGatesReady,
      productionGatesReady,
      productionProfileReady: postgresProductionProfileReady,
      defaultRolloutReady: postgresDefaultRolloutReady,
      redactedUrl: databaseSecretProfile.redactedUrl ?? redactDatabaseUrl(databaseUrl),
      secretProfile: publicDatabaseSecretProfile(databaseSecretProfile),
      initContract: "project/db/postgres-init/001_storage_readiness.sql",
      smokeCommand: "npm run storage:postgres:smoke",
      runtimeSmokeCommand: "npm run storage:postgres:runtime-smoke",
      productionSmokeCommand: "npm run storage:postgres:production-smoke",
      backupRunbookCommand: "npm run storage:postgres:backup-runbook-smoke",
      defaultRolloutCommand: "npm run storage:postgres:default-rollout-smoke",
      productionProfileCommand: "npm run storage:postgres:profile-contract"
    },
    safety: {
      secretsRedacted: true,
      secretProfileReady: databaseSecretProfileReady,
      databaseSecretProfile: publicDatabaseSecretProfile(databaseSecretProfile),
      phiSeeded: false,
      transactionalTarget: "postgres",
      localRuntimeStillSQLite: !postgresRuntimeSelected,
      boundParameterAdapter: postgresAdapterReady
    },
    nextAction: fullMigrationReady
      ? "Postgres production gates are ready; keep running endpoint regression and visual proof before broad rollout."
      : postgresRuntimeSelected && operationalGatesReady && databaseSecretProfileReady && !postgresDefaultRolloutReady
        ? "Run the default Postgres rollout smoke before declaring database readiness at 100."
        : productionGatesReady && !postgresRuntimeSelected
        ? "Switch an isolated runtime profile to BRAINSTY_DB_DRIVER=postgres before making Postgres the default."
      : operationalGatesReady && !databaseSecretProfileReady
        ? "Add a real secret-manager or managed-secret profile before declaring database readiness at 100."
        : operationalGatesReady && databaseSecretProfileReady && !postgresDefaultRolloutReady
          ? "Run an isolated BRAINSTY_DB_DRIVER=postgres default-rollout rehearsal before broad rollout."
        : postgresRuntimeSelected
          ? "Expand endpoint and worker coverage before declaring full Postgres production migration."
          : "Keep SQLite local runtime stable while expanding Postgres adapter parity, leases, and migration tests."
  };
}
