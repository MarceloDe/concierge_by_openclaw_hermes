import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { ORCHESTRATOR_FLOW_CASES, runOrchestratorFlowCases } from "../concierge/orchestratorDemo.mjs";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";

test("live orchestrator flow cases use real LangGraph and real OpenAI model calls", async () => {
  await loadLocalEnvOnce();
  assert.ok(process.env.OPENAI_API_KEY, "OPENAI_API_KEY must be set for real orchestrator proof.");
  assert.notEqual(process.env.OPENAI_API_KEY, "local", "OPENAI_API_KEY placeholder must not be used for real orchestrator proof.");
  const dir = await mkdtemp(join(tmpdir(), "brainsty-orchestrator-live-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  const result = await runOrchestratorFlowCases(store, {
    member: {
      name: "Route Test User",
      email: "orchestrator-live@example.invalid",
      payer: "Aetna",
      portalUrl: "https://www.aetna.com/"
    },
    useLiveModel: true,
    requireLiveModel: true
  });

  assert.equal(result.openAI.configured, true);
  assert.equal(result.cases.length, ORCHESTRATOR_FLOW_CASES.length);
  assert.equal(result.aggregate.matched, ORCHESTRATOR_FLOW_CASES.length);
  assert.equal(result.aggregate.notDispatched, true);
  assert.deepEqual(result.aggregate.actionsTaken, []);
  for (const run of result.cases) {
    assert.equal(run.llmOrchestrationDecision.mode, "openai_chatopenai_invoked");
    assert.equal(run.llmOrchestrationDecision.valid, true);
    if (run.expectedWorkflow === "human_approval_escalation") {
      assert.equal(run.llmOrchestrationDecision.usedByRouter, false);
      assert.equal(run.routeReason, "explicit_approval_gate_required");
    } else {
      assert.equal(run.llmOrchestrationDecision.usedByRouter, true);
    }
    assert.equal(run.modelInvocation.mode, "openai_chatopenai_invoked");
    assert.ok(run.modelInvocation.responsePreview);
    assert.equal(run.workerPlan.dispatchStatus, "not_dispatched");
    assert.ok(run.openclawJobs.length >= 1);
    assert.equal(run.openclawJobs[0].mayChooseWorkflow, false);
    assert.equal(run.openclawJobs[0].mayCreateSubtasks, true);
    assert.deepEqual(run.openclawJobs[0].actionsTaken, []);
  }
});
