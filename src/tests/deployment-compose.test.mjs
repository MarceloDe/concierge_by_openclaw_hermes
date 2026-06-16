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
  assert.equal(result.graphitiRuntime.dockerfileReady, true);
  assert.equal(result.graphitiRuntime.backend, "falkordb");
  assert.equal(result.dockerConfig.checked, false);
});
