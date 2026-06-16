import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getStorageReadiness } from "../concierge/storageReadiness.mjs";
import { evaluateDatabaseSecretProfile } from "../concierge/databaseSecretProfile.mjs";
import { WORKER_LEASES_VERSION } from "../concierge/workerLeases.mjs";
import { POSTGRES_PRODUCTION_READINESS_SMOKE_VERSION } from "../../scripts/postgres-production-readiness-smoke.mjs";
import { POSTGRES_DEFAULT_ROLLOUT_SMOKE_VERSION } from "../../scripts/postgres-default-rollout-smoke.mjs";

test("Postgres production readiness smoke is versioned and proves the required gates", async () => {
  const source = await readFile(new URL("../../scripts/postgres-production-readiness-smoke.mjs", import.meta.url), "utf8");
  assert.match(POSTGRES_PRODUCTION_READINESS_SMOKE_VERSION, /postgres-production-readiness/);
  assert.match(POSTGRES_DEFAULT_ROLLOUT_SMOKE_VERSION, /postgres-default-rollout/);
  assert.match(WORKER_LEASES_VERSION, /worker-leases/);
  assert.match(source, /runPostgresProductionReadinessSmoke/);
  assert.match(source, /seedEndpointParityPath/);
  assert.match(source, /proveWorkerLease/);
  assert.match(source, /restoreSnapshot/);
  assert.match(source, /temporaryDatabases/);
  assert.match(source, /createReadOnlyObservationApproval/);
  assert.doesNotMatch(source, /node:child_process|spawn\(|execFile\(|psql\s|pg_dump/);
});

test("database secret profiles require a secret-backed source and redact database URLs", () => {
  const secretDir = mkdtempSync(join(tmpdir(), "brainsty-secret-test-"));
  const secretFile = join(secretDir, "database-url");
  writeFileSync(secretFile, "postgresql://brainsty:super-secret-value@postgres:5432/brainstyworkers?sslmode=disable\n", {
    mode: 0o600
  });
  const profile = evaluateDatabaseSecretProfile({
    BRAINSTY_DATABASE_URL_FILE: secretFile,
    BRAINSTY_DATABASE_SECRET_SOURCE: "secret_file"
  });
  assert.equal(profile.ready, true);
  assert.equal(profile.secretBacked, true);
  assert.equal(profile.redactedUrl.includes("super-secret-value"), false);
  assert.match(profile.redactedUrl, /redacted:redacted@postgres/);
  assert.equal(profile.databaseUrl.includes("super-secret-value"), true);

  const direct = evaluateDatabaseSecretProfile({
    BRAINSTY_DATABASE_URL: "postgresql://brainsty:super-secret-value@postgres:5432/brainstyworkers?sslmode=disable"
  });
  assert.equal(direct.ready, false);
  assert.equal(direct.issues.includes("database_url_not_secret_backed"), true);
});

test("storage readiness reaches 100 only when Postgres runtime and rollout production gates are ready", () => {
  const readiness = getStorageReadiness({
    deployment: {
      postgresRuntimeReady: true,
      postgresLiveReady: true,
      postgresAdapterRuntimeReady: true,
      postgresRuntimeSmokeReady: true,
      postgresProductionSmokeReady: true,
      postgresWorkerLeaseReady: true,
      postgresBackupRestoreReady: true,
      postgresEndpointParityReady: true,
      databaseSecretProfileReady: true,
      postgresDefaultRolloutReady: true
    },
    env: {
      BRAINSTY_DB_DRIVER: "postgres",
      BRAINSTY_DATABASE_TARGET: "postgres",
      BRAINSTY_DATABASE_URL: "postgresql://brainsty:secret-password@postgres:5432/brainstyworkers?sslmode=disable",
      BRAINSTY_DATABASE_SECRET_SOURCE: "managed_env",
      BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY: "1",
      BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY: "1",
      BRAINSTY_POSTGRES_WORKER_LEASE_READY: "1",
      BRAINSTY_POSTGRES_BACKUP_RESTORE_READY: "1",
      BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY: "1",
      BRAINSTY_DATABASE_SECRET_PROFILE_READY: "1",
      BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY: "1"
    }
  });
  assert.equal(readiness.status, "postgres_production_ready");
  assert.equal(readiness.score, 100);
  assert.equal(readiness.fullMigrationReady, true);
  assert.equal(readiness.migrationPending, false);
  assert.equal(readiness.appRuntimeMigratedToPostgres, true);
  assert.equal(readiness.postgres.productionSmokeReady, true);
  assert.equal(readiness.postgres.workerLeaseReady, true);
  assert.equal(readiness.postgres.backupRestoreReady, true);
  assert.equal(readiness.postgres.endpointParityReady, true);
  assert.equal(readiness.postgres.defaultRolloutReady, true);
  assert.equal(readiness.safety.secretProfileReady, true);
});

test("storage readiness stays below 100 when default rollout is not rehearsed", () => {
  const readiness = getStorageReadiness({
    deployment: {
      postgresRuntimeReady: true,
      postgresLiveReady: true,
      postgresAdapterRuntimeReady: true,
      postgresRuntimeSmokeReady: true,
      postgresProductionSmokeReady: true,
      postgresWorkerLeaseReady: true,
      postgresBackupRestoreReady: true,
      postgresEndpointParityReady: true,
      databaseSecretProfileReady: true,
      postgresDefaultRolloutReady: false
    },
    env: {
      BRAINSTY_DB_DRIVER: "postgres",
      BRAINSTY_DATABASE_TARGET: "postgres",
      BRAINSTY_DATABASE_URL: "postgresql://brainsty:secret-password@postgres:5432/brainstyworkers?sslmode=disable",
      BRAINSTY_DATABASE_SECRET_SOURCE: "managed_env",
      BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY: "1",
      BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY: "1",
      BRAINSTY_POSTGRES_WORKER_LEASE_READY: "1",
      BRAINSTY_POSTGRES_BACKUP_RESTORE_READY: "1",
      BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY: "1",
      BRAINSTY_DATABASE_SECRET_PROFILE_READY: "1",
      BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY: "0"
    }
  });
  assert.equal(readiness.status, "postgres_runtime_selected_secret_profile_ready_default_rollout_pending");
  assert.equal(readiness.score, 98);
  assert.equal(readiness.fullMigrationReady, false);
  assert.equal(readiness.postgres.defaultRolloutReady, false);
});

test("storage readiness does not claim full migration when production gates pass but SQLite remains default", () => {
  const readiness = getStorageReadiness({
    deployment: {
      postgresRuntimeReady: true,
      postgresLiveReady: true,
      postgresAdapterRuntimeReady: true,
      postgresRuntimeSmokeReady: true,
      postgresProductionSmokeReady: true,
      postgresWorkerLeaseReady: true,
      postgresBackupRestoreReady: true,
      postgresEndpointParityReady: true,
      databaseSecretProfileReady: true,
      postgresDefaultRolloutReady: true
    },
    env: {
      BRAINSTY_DB_DRIVER: "sqlite",
      BRAINSTY_DATABASE_TARGET: "postgres",
      BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY: "1",
      BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY: "1",
      BRAINSTY_POSTGRES_WORKER_LEASE_READY: "1",
      BRAINSTY_POSTGRES_BACKUP_RESTORE_READY: "1",
      BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY: "1",
      BRAINSTY_DATABASE_SECRET_PROFILE_READY: "1",
      BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY: "1"
    }
  });
  assert.equal(readiness.status, "postgres_production_gates_ready_sqlite_default");
  assert.equal(readiness.score, 95);
  assert.equal(readiness.fullMigrationReady, false);
  assert.equal(readiness.migrationPending, true);
  assert.equal(readiness.appRuntimeMigratedToPostgres, false);
});
