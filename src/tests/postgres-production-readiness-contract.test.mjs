import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getStorageReadiness } from "../concierge/storageReadiness.mjs";
import { WORKER_LEASES_VERSION } from "../concierge/workerLeases.mjs";
import { POSTGRES_PRODUCTION_READINESS_SMOKE_VERSION } from "../../scripts/postgres-production-readiness-smoke.mjs";

test("Postgres production readiness smoke is versioned and proves the required gates", async () => {
  const source = await readFile(new URL("../../scripts/postgres-production-readiness-smoke.mjs", import.meta.url), "utf8");
  assert.match(POSTGRES_PRODUCTION_READINESS_SMOKE_VERSION, /postgres-production-readiness/);
  assert.match(WORKER_LEASES_VERSION, /worker-leases/);
  assert.match(source, /runPostgresProductionReadinessSmoke/);
  assert.match(source, /seedEndpointParityPath/);
  assert.match(source, /proveWorkerLease/);
  assert.match(source, /restoreSnapshot/);
  assert.match(source, /temporaryDatabases/);
  assert.match(source, /createReadOnlyObservationApproval/);
  assert.doesNotMatch(source, /node:child_process|spawn\(|execFile\(|psql\s|pg_dump/);
});

test("storage readiness reaches 100 only when Postgres runtime and production gates are ready", () => {
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
      databaseSecretProfileReady: true
    },
    env: {
      BRAINSTY_DB_DRIVER: "postgres",
      BRAINSTY_DATABASE_TARGET: "postgres",
      BRAINSTY_DATABASE_URL: "postgresql://brainsty:secret-password@postgres:5432/brainstyworkers?sslmode=disable",
      BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY: "1",
      BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY: "1",
      BRAINSTY_POSTGRES_WORKER_LEASE_READY: "1",
      BRAINSTY_POSTGRES_BACKUP_RESTORE_READY: "1",
      BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY: "1",
      BRAINSTY_DATABASE_SECRET_PROFILE_READY: "1"
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
  assert.equal(readiness.safety.secretProfileReady, true);
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
      databaseSecretProfileReady: true
    },
    env: {
      BRAINSTY_DB_DRIVER: "sqlite",
      BRAINSTY_DATABASE_TARGET: "postgres",
      BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY: "1",
      BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY: "1",
      BRAINSTY_POSTGRES_WORKER_LEASE_READY: "1",
      BRAINSTY_POSTGRES_BACKUP_RESTORE_READY: "1",
      BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY: "1",
      BRAINSTY_DATABASE_SECRET_PROFILE_READY: "1"
    }
  });
  assert.equal(readiness.status, "postgres_production_gates_ready_sqlite_default");
  assert.equal(readiness.score, 95);
  assert.equal(readiness.fullMigrationReady, false);
  assert.equal(readiness.migrationPending, true);
  assert.equal(readiness.appRuntimeMigratedToPostgres, false);
});
