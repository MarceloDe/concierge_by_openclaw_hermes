import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveDatabaseDriver } from "../concierge/databaseFactory.mjs";
import { buildPhase68ProductionDatabaseProof } from "../concierge/productionDatabaseReadiness.mjs";
import { getStorageReadiness } from "../concierge/storageReadiness.mjs";

const app = await readFile(new URL("../app/app.js", import.meta.url), "utf8");
const server = await readFile(new URL("../server/server.mjs", import.meta.url), "utf8");

test("Phase 68 defaults production Postgres target to Postgres without changing local dev default", () => {
  assert.equal(resolveDatabaseDriver({ NODE_ENV: "production", BRAINSTY_DATABASE_TARGET: "postgres" }), "postgres");
  assert.equal(resolveDatabaseDriver({ BRAINSTY_RUNTIME_ENV: "production-candidate", BRAINSTY_DATABASE_TARGET: "postgres" }), "postgres");
  assert.equal(resolveDatabaseDriver({ NODE_ENV: "development", BRAINSTY_DATABASE_TARGET: "postgres" }), "sqlite");
  assert.equal(resolveDatabaseDriver({}), "sqlite");
});

test("Phase 68 Postgres production proof locks retention, state scope, and backup/restore policy", () => {
  const proof = buildPhase68ProductionDatabaseProof();

  assert.equal(proof.status, "phase68_postgres_production_default_ready");
  assert.equal(proof.ok, true);
  assert.equal(proof.score, 100);
  assert.equal(proof.retention.years, 5);
  assert.equal(proof.backupRestore.localDockerOnlySatisfiesProduction, false);
  assert.ok(proof.runtimeStateScope.includes("sessions"));
  assert.ok(proof.runtimeStateScope.includes("generated_skill_queue_executor_state"));
  assert.equal(proof.readiness.status, "postgres_production_ready");
  assert.equal(proof.readiness.fullMigrationReady, true);
});

test("storage readiness reaches production ready through production default without explicit BRAINSTY_DB_DRIVER", () => {
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
      NODE_ENV: "production",
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
  assert.equal(readiness.runtimeDriver, "postgres");
  assert.equal(readiness.status, "postgres_production_ready");
  assert.equal(readiness.score, 100);
});

test("Phase 68 database proof is registered in API proof and dashboard", () => {
  assert.match(server, /buildPhase68ProductionDatabaseProof/);
  assert.match(server, /phase68_postgres_production_default/);
  assert.match(app, /Phase 68 Postgres Production Default/);
  assert.match(app, /encrypted_cloud_backup_restore_drill/);
});
