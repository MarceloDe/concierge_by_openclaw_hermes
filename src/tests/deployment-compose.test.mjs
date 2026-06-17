import test from "node:test";
import assert from "node:assert/strict";
import { assertDeploymentComposeContract } from "../../scripts/compose-contract.mjs";

test("deployment compose contract defines connector services and safety boundaries", async () => {
  const result = await assertDeploymentComposeContract({ verifyDockerConfig: false });
  assert.equal(result.ok, true);
  assert.deepEqual(result.services, ["node-runtime", "fastapi", "mobile-pwa", "falkordb", "postgres"]);
  assert.ok(result.files.includes("compose.yaml"));
  assert.equal(result.storageRuntime.runtimeDriverDefault, "sqlite");
  assert.equal(result.storageRuntime.productionTarget, "postgres");
  assert.equal(result.storageRuntime.runtimeSmokeCommand, "npm run storage:postgres:runtime-smoke");
  assert.equal(result.storageRuntime.productionSmokeCommand, "npm run storage:postgres:production-smoke");
  assert.equal(result.storageRuntime.productionProfileCommand, "npm run storage:postgres:profile-contract");
  assert.equal(result.storageRuntime.endpointRegressionCommand, "npm run storage:postgres:endpoint-regression-smoke");
  assert.equal(result.storageRuntime.productionProfileLiveCommand, "npm run storage:postgres:profile-live-smoke");
  assert.equal(result.storageRuntime.backupRunbookCommand, "npm run storage:postgres:backup-runbook-smoke");
  assert.equal(result.storageRuntime.providerBackupPolicyCommand, "npm run storage:postgres:provider-backup-policy-smoke");
  assert.equal(result.browserSandbox.defaultProvider, "local_cdp");
  assert.equal(result.browserSandbox.providerContractCommand, "npm run sandbox:browser:provider-contract");
  assert.equal(result.browserSandbox.readyEnv, "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY");
  assert.equal(result.postgresProductionProfile.ok, true);
  assert.equal(result.postgresProductionProfile.secretSource, "docker_secret");
  assert.equal(result.postgresProductionProfile.readinessGatesRemainProofControlled, true);
  assert.equal(result.graphitiRuntime.dockerfileReady, true);
  assert.equal(result.graphitiRuntime.backend, "falkordb");
  assert.equal(result.dockerConfig.checked, false);
});
