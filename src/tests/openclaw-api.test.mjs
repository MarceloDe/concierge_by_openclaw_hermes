import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("OpenClaw validate-envelope API returns proposal-only proof", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-openclaw-api-"));
  process.env.BRAINSTY_DB_PATH = join(dir, "test.sqlite");
  const { server } = await import("../server/server.mjs");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/openclaw/skills/insurance_portal_browser/validate-envelope`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Validate the insurance portal browser envelope for read-only eligibility observation.",
        member: {
          name: "Test Member",
          email: "openclaw-api-test@example.com",
          payer: "Aetna",
          portalUrl: "https://www.aetna.com/"
        }
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.executionMode, "proposal_only");
    assert.equal(payload.validation.status, "validated_proposal_not_executed");
    assert.equal(payload.workerPlan.owner, "langgraph");
    assert.equal(payload.workerPlan.dispatchStatus, "not_dispatched");
    assert.equal(payload.workerPlan.workerJobs[0].deterministicControls.workerMayChooseWorkflow, false);
    assert.equal(payload.workerPlan.workerJobs[0].deterministicControls.workerMayCreateSubtasks, true);
    assert.equal(payload.workerPlan.workerJobs[0].progressProtocol.reportEverySeconds, 30);
    assert.equal(payload.proposal.task.task_type, "openclaw_skill_invocation_proposal");
    assert.deepEqual(payload.actionsTaken, []);
    assert.ok(payload.validation.fallbackPath.includes("manual_user_export"));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
