import test from "node:test";
import assert from "node:assert/strict";
import { assertPostgresProductionProfileContract } from "../../scripts/postgres-production-profile-contract.mjs";
import { getStorageReadiness } from "../concierge/storageReadiness.mjs";

test("Postgres production profile selects runtime through a Docker-secret URL without changing local defaults", async () => {
  const result = await assertPostgresProductionProfileContract({ verifyDockerConfig: false });
  assert.equal(result.ok, true);
  assert.equal(result.baseRuntimeDriverDefault, "sqlite");
  assert.equal(result.profileRuntimeDriverDefault, "postgres");
  assert.equal(result.secretSource, "docker_secret");
  assert.equal(result.secretMount, "/run/secrets/brainsty_database_url");
  assert.equal(result.readinessGatesRemainProofControlled, true);
  assert.match(result.profileCommand, /compose\.postgres\.yaml/);
  assert.equal(result.dockerConfig.checked, false);
});

test("Postgres production profile proof does not bypass rollout gates", () => {
  const readiness = getStorageReadiness({
    deployment: {
      postgresRuntimeReady: true,
      postgresLiveReady: true,
      postgresAdapterRuntimeReady: true,
      postgresRuntimeSmokeReady: false,
      postgresProductionSmokeReady: false,
      postgresWorkerLeaseReady: false,
      postgresBackupRestoreReady: false,
      postgresEndpointParityReady: false,
      databaseSecretProfileReady: false,
      postgresDefaultRolloutReady: false,
      postgresProductionProfileReady: true
    },
    env: {
      BRAINSTY_DB_DRIVER: "postgres",
      BRAINSTY_DATABASE_TARGET: "postgres",
      BRAINSTY_DATABASE_SECRET_SOURCE: "docker_secret",
      BRAINSTY_DATABASE_URL_FILE: "/run/secrets/brainsty_database_url"
    }
  });
  assert.equal(readiness.postgres.productionProfileReady, true);
  assert.equal(readiness.status, "postgres_runtime_selected_needs_parity_smoke");
  assert.equal(readiness.score, 85);
  assert.equal(readiness.fullMigrationReady, false);
});
