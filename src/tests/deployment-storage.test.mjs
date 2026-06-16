import test from "node:test";
import assert from "node:assert/strict";
import { assertStorageContract } from "../../scripts/storage-contract.mjs";
import { getStorageReadiness } from "../concierge/storageReadiness.mjs";

test("storage contract defines a Postgres deployment target while preserving SQLite runtime", async () => {
  const result = await assertStorageContract({ verifyLivePostgres: false });
  assert.equal(result.ok, true);
  assert.equal(result.runtimeDriverDefault, "sqlite");
  assert.equal(result.productionTarget, "postgres");
  assert.equal(result.postgresAdapterReady, true);
  assert.equal(result.postgresProductionReadinessReady, true);
  assert.equal(result.postgresProductionProfileReady, true);
  assert.equal(result.runtimeSmokeCommand, "npm run storage:postgres:runtime-smoke");
  assert.equal(result.productionSmokeCommand, "npm run storage:postgres:production-smoke");
  assert.equal(result.productionProfileCommand, "npm run storage:postgres:profile-contract");
  assert.equal(result.appRuntimeMigratedToPostgres, false);
  assert.deepEqual(result.services, ["postgres"]);
  assert.equal(result.livePostgres.checked, false);
});

test("storage readiness redacts database URLs and does not overstate runtime migration", () => {
  const readiness = getStorageReadiness({
    deployment: { postgresRuntimeReady: true, postgresLiveReady: false },
    env: {
      BRAINSTY_DB_DRIVER: "sqlite",
      BRAINSTY_DB_PATH: "/tmp/brainsty.sqlite",
      BRAINSTY_DATABASE_TARGET: "postgres",
      BRAINSTY_DATABASE_URL: "postgresql://brainsty:secret-password@postgres:5432/brainstyworkers?sslmode=disable"
    }
  });
  assert.equal(readiness.ok, true);
  assert.equal(readiness.status, "postgres_compose_profile_present_sqlite_runtime");
  assert.equal(readiness.runtimeDriver, "sqlite");
  assert.equal(readiness.appRuntimeMigratedToPostgres, false);
  assert.equal(readiness.migrationPending, true);
  assert.match(readiness.postgres.redactedUrl, /redacted:redacted@postgres/);
  assert.equal(readiness.sqlite.sqliteShellOut, false);
  assert.equal(readiness.safety.phiSeeded, false);
});

test("storage readiness reports adapter parity smoke without declaring full migration", () => {
  const readiness = getStorageReadiness({
    deployment: {
      postgresRuntimeReady: true,
      postgresLiveReady: true,
      postgresAdapterRuntimeReady: true,
      postgresRuntimeSmokeReady: true
    },
    env: {
      BRAINSTY_DB_DRIVER: "sqlite",
      BRAINSTY_DATABASE_TARGET: "postgres",
      BRAINSTY_DATABASE_URL: "postgresql://brainsty:secret-password@postgres:5432/brainstyworkers?sslmode=disable"
    }
  });
  assert.equal(readiness.status, "postgres_adapter_parity_ready_sqlite_default");
  assert.equal(readiness.score, 90);
  assert.equal(readiness.postgres.runtimeSmokeReady, true);
  assert.equal(readiness.postgres.runtimeSmokeCommand, "npm run storage:postgres:runtime-smoke");
  assert.equal(readiness.postgres.productionSmokeReady, false);
  assert.equal(readiness.appRuntimeMigratedToPostgres, false);
  assert.equal(readiness.fullMigrationReady, false);
  assert.equal(readiness.migrationPending, true);
});

test("storage readiness reports production gates without declaring full migration while SQLite is default", () => {
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
      BRAINSTY_DATABASE_URL: "postgresql://brainsty:secret-password@postgres:5432/brainstyworkers?sslmode=disable"
    }
  });
  assert.equal(readiness.status, "postgres_production_gates_ready_sqlite_default");
  assert.equal(readiness.score, 95);
  assert.equal(readiness.postgres.productionSmokeReady, true);
  assert.equal(readiness.postgres.workerLeaseReady, true);
  assert.equal(readiness.postgres.backupRestoreReady, true);
  assert.equal(readiness.postgres.endpointParityReady, true);
  assert.equal(readiness.postgres.defaultRolloutReady, true);
  assert.equal(readiness.postgres.productionProfileReady, false);
  assert.equal(readiness.safety.secretProfileReady, true);
  assert.equal(readiness.appRuntimeMigratedToPostgres, false);
  assert.equal(readiness.fullMigrationReady, false);
  assert.equal(readiness.migrationPending, true);
});
