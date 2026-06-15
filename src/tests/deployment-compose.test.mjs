import test from "node:test";
import assert from "node:assert/strict";
import { assertDeploymentComposeContract } from "../../scripts/compose-contract.mjs";

test("deployment compose contract defines connector services and safety boundaries", async () => {
  const result = await assertDeploymentComposeContract({ verifyDockerConfig: false });
  assert.equal(result.ok, true);
  assert.deepEqual(result.services, ["node-runtime", "fastapi", "mobile-pwa", "falkordb"]);
  assert.ok(result.files.includes("compose.yaml"));
  assert.equal(result.dockerConfig.checked, false);
});
