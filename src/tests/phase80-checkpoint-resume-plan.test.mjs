import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { buildLlmOrchestrationDecisionMessages } from "../concierge/llmOrchestrationDecision.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import {
  resetTieredChatModelFactoryForTests,
  setTieredChatModelFactoryForTests
} from "../concierge/modelTierPolicy.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-phase80-resume-plan-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

test("Phase 80 builds a checkpoint resume plan from achieved runtime checkpoints", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Please check my Aetna benefits.",
    rawMessage: { source: "phase80_seed", useLiveModel: false, executeEvidenceObservation: false }
  });
  const resumed = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Continue from where we were.",
    rawMessage: {
      source: "phase80_resume",
      useLiveModel: false,
      executeEvidenceObservation: false,
      resumeFromRuntimeContext: true
    }
  });
  const plan = resumed.state.checkpoint_resume_plan;

  assert.equal(plan.requested, true);
  assert.equal(plan.available, true);
  assert.equal(plan.strategy, "resume_from_latest_completed_checkpoint_pointer");
  assert.equal(plan.latestCompletedStep, "langgraph_run_completed");
  assert.ok(plan.resumeCheckpointId);
  assert.ok(plan.priorWorkflow);
  assert.equal(plan.deterministicAuthority, "database_session_checkpoints_remain_authoritative");
  assert.equal(plan.cacheRole, "fast_resume_pointer_manifest_only");
});

test("Phase 80 exposes checkpoint resume plan and prior LLM pointers to the planner", async () => {
  const priorKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "phase80-key";
  setTieredChatModelFactoryForTests(({ step }) => ({
    invoke: async (messages) => {
      const payload = JSON.parse(messages.find((message) => message.role === "user").content);
      if (step === "structured_intent") {
        return {
          content: JSON.stringify({
            primary_intent: /claim/i.test(payload.user_input ?? "") ? "claims_eob_payment" : "pharmacy_formulary",
            candidate_journeys: [
              {
                journey: /claim/i.test(payload.user_input ?? "") ? "claims_eob_payment" : "pharmacy_formulary",
                confidence: 0.84,
                rationale: "Phase 80 structured output.",
                required_evidence: ["source_pointer"],
                missing_evidence: ["source_pointer"],
                safe_next_action: "request_or_retrieve_evidence",
                requires_approval: true,
                requires_human_handoff: false
              }
            ],
            complexity: "moderate",
            ambiguities: [],
            policy_flags: [],
            unsafe_action_requested: false
          })
        };
      }
      return {
        content: JSON.stringify({
          workflow: /claim/i.test(payload.userInput ?? "") ? "claim_status_navigation" : "pharmacy_formulary",
          intent: "phase80_resume_planner",
          confidence: 0.88,
          rationale: "Phase 80 planner output.",
          requiredEvidence: ["source_pointer"],
          missingEvidence: ["source_pointer"],
          approvalRequired: true,
          approvalScope: "read_only_observation",
          workerGoal: "Use resume pointers and selected workflow.",
          responseStrategy: "Continue from checkpoint pointer.",
          userFacingNextQuestion: "Should I continue?",
          priorLlmOutputPointersUsed: (payload.llmOutputIndex?.entries ?? []).map((entry) => entry.pointer)
        })
      };
    }
  }));
  try {
    const store = await createStore();
    const { user, session } = await enrollDefaultMember(store);
    await runLangGraphOrchestration(store, {
      user,
      session,
      channel: session.channel,
      userInput: "What is my medication copay?",
      rawMessage: { source: "phase80_live_seed", useLiveModel: true, executeEvidenceObservation: false }
    });
    const resumed = await runLangGraphOrchestration(store, {
      user,
      session,
      channel: session.channel,
      userInput: "Now continue and check my claim.",
      rawMessage: {
        source: "phase80_live_resume",
        useLiveModel: true,
        executeEvidenceObservation: false,
        resumeFromRuntimeContext: true
      }
    });
    const messages = buildLlmOrchestrationDecisionMessages(resumed.state);
    const payload = JSON.parse(messages.find((message) => message.role === "user").content);

    assert.equal(payload.checkpointResumePlan.requested, true);
    assert.equal(payload.checkpointResumePlan.available, true);
    assert.ok(payload.checkpointResumePlan.resumeCheckpointId);
    assert.ok(payload.checkpointResumePlan.priorLlmOutputPointers.length >= 2);
    assert.ok(resumed.state.llm_orchestration_decision.priorLlmOutputPointersUsed.length >= 2);
  } finally {
    resetTieredChatModelFactoryForTests();
    if (priorKey) process.env.OPENAI_API_KEY = priorKey;
    else delete process.env.OPENAI_API_KEY;
  }
});
