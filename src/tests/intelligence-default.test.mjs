// Phase 84: LLM-primary routing is UNCONDITIONAL — the legacy two-stage path
// (structured-intent reasoner + BRAINSTY_ORCHESTRATOR_LLM_ALWAYS switch) is deleted
// (plan §10.3/§10.13). What remains under test: the planner is the single authority
// and free-text healthcare questions reach it instead of a policy refusal.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, createId, nowIso } from "./support/sqliteTestStore.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import {
  resetTieredChatModelFactoryForTests,
  setTieredChatModelFactoryForTests
} from "../concierge/modelTierPolicy.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-intelligence-default-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  return store;
}

test("out-of-pocket status questions reach the LLM planner instead of policy refusal", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  const invokedSteps = [];
  setTieredChatModelFactoryForTests(({ step }) => ({
    invoke: async () => {
      invokedSteps.push(step);
      if (step === "llm_orchestration_decision") {
        return {
          content: JSON.stringify({
            workflow: "eligibility_benefits_navigation",
            intent: "out_of_pocket_status_question",
            confidence: 0.86,
            rationale: "The user's request belongs to benefits and cost-sharing navigation.",
            requiredEvidence: ["current_plan_benefits_or_member_portal_balance"],
            missingEvidence: ["current_plan_benefits_or_member_portal_balance"],
            approvalRequired: false,
            approvalScope: "read_only_observation",
            workerGoal: "Help the user locate out-of-pocket maximum/status evidence.",
            responseStrategy: "Support the user and offer portal guidance or read-only observation.",
            userFacingNextQuestion: "Would you like me to open the live Aetna portal so you can sign in?"
          })
        };
      }
      return { content: "advisory model response" };
    }
  }));
  try {
    const store = await createStore();
    const { user, session } = await enrollDefaultMember(store);
    const result = await runLangGraphOrchestration(store, {
      user,
      session,
      channel: session.channel,
      userInput: "Can you help me to discovery my specific out of the pocket status?",
      rawMessage: { source: "out_of_pocket_policy_regression", executeEvidenceObservation: false }
    });

    // The orchestration planner is the single authority and must run; the deleted
    // classify_intent step must never be invoked.
    assert.ok(invokedSteps.includes("llm_orchestration_decision"));
    assert.ok(!invokedSteps.includes("structured_intent"), "deleted classifier step must not be invoked");
    assert.equal(result.state.policy_result.allowed, true);
    assert.notEqual(result.state.workflow, "refuse_out_of_scope");
    assert.equal(result.state.workflow, "eligibility_benefits_navigation");
    assert.equal(result.state.route_reason, "llm_orchestration_decision");
    assert.equal(result.state.llm_orchestration_decision.usedByRouter, true);
  } finally {
    resetTieredChatModelFactoryForTests();
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
