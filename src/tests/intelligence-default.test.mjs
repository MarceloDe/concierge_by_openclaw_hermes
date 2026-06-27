import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import {
  resetTieredChatModelFactoryForTests,
  setTieredChatModelFactoryForTests
} from "../concierge/modelTierPolicy.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-intelligence-default-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

function structuredIntentPayload() {
  return {
    primary_intent: "document_review",
    candidate_journeys: [
      {
        journey: "document_review",
        confidence: 0.91,
        rationale: "The user asked to review insurance document evidence.",
        required_evidence: ["uploaded_document_or_portal_document", "source_spans_or_document_pointer"],
        missing_evidence: ["uploaded_document_or_portal_document"],
        safe_next_action: "request_or_retrieve_evidence",
        requires_approval: false,
        requires_human_handoff: false
      }
    ],
    complexity: "moderate",
    ambiguities: [],
    policy_flags: [],
    unsafe_action_requested: false
  };
}

function llmDecisionPayload() {
  return {
    workflow: "document_or_trace_review",
    intent: "document_review",
    confidence: 0.82,
    rationale: "Document review is the safest bounded workflow.",
    requiredEvidence: ["uploaded_document_or_portal_document"],
    missingEvidence: ["uploaded_document_or_portal_document"],
    approvalRequired: false,
    approvalScope: "read_only_observation",
    workerGoal: "Ask for or review uploaded document evidence.",
    responseStrategy: "Explain missing evidence without dead-ending the journey.",
    userFacingNextQuestion: "Can you upload the relevant plan or claim document?"
  };
}

test("legacy two-stage path: live structured-intent reasoning runs when LLM_ALWAYS=0", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFlag = process.env.BRAINSTY_ORCHESTRATOR_LLM_ALWAYS;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.BRAINSTY_ORCHESTRATOR_LLM_ALWAYS = "0"; // legacy path keeps the live structured-intent call
  const invokedSteps = [];
  setTieredChatModelFactoryForTests(({ step }) => ({
    invoke: async () => {
      invokedSteps.push(step);
      if (step === "structured_intent") return { content: JSON.stringify(structuredIntentPayload()) };
      if (step === "llm_orchestration_decision") return { content: JSON.stringify(llmDecisionPayload()) };
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
      userInput: "Please help me review this insurance document.",
      rawMessage: { source: "intelligence_default_test", executeEvidenceObservation: false }
    });

    assert.ok(invokedSteps.includes("structured_intent"));
    assert.ok(invokedSteps.includes("llm_orchestration_decision"));
    assert.equal(result.state.structured_intent.reasoning_source, "llm");
    assert.equal(result.state.structured_intent.primary_intent, "document_review");
    assert.equal(result.state.workflow, "document_or_trace_review");
    assert.equal(result.state.route_reason, "llm_orchestration_decision");
  } finally {
    resetTieredChatModelFactoryForTests();
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalFlag === undefined) delete process.env.BRAINSTY_ORCHESTRATOR_LLM_ALWAYS;
    else process.env.BRAINSTY_ORCHESTRATOR_LLM_ALWAYS = originalFlag;
  }
});

test("out-of-pocket status questions reach the LLM planner instead of policy refusal", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  const invokedSteps = [];
  setTieredChatModelFactoryForTests(({ step }) => ({
    invoke: async () => {
      invokedSteps.push(step);
      if (step === "structured_intent") {
        return {
          content: JSON.stringify({
            primary_intent: "benefits_eligibility",
            candidate_journeys: [
              {
                journey: "benefits_eligibility",
                confidence: 0.9,
                rationale: "The user is asking about insurance out-of-pocket status.",
                required_evidence: ["current_plan_benefits_or_member_portal_balance"],
                missing_evidence: ["current_plan_benefits_or_member_portal_balance"],
                safe_next_action: "offer_portal_guidance_or_read_only_observation",
                requires_approval: false,
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

    // Under LLM-primary default the redundant live structured_intent call is
    // skipped; the orchestration planner is the authority that must run.
    assert.ok(invokedSteps.includes("llm_orchestration_decision"));
    assert.equal(result.state.policy_result.allowed, true);
    assert.notEqual(result.state.workflow, "refuse_out_of_scope");
    assert.equal(result.state.workflow, "eligibility_benefits_navigation");
    assert.equal(result.state.route_reason, "llm_orchestration_decision");
  } finally {
    resetTieredChatModelFactoryForTests();
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test("legacy two-stage path: falls back to curated structured intent when the live reasoner fails (LLM_ALWAYS=0)", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFlag = process.env.BRAINSTY_ORCHESTRATOR_LLM_ALWAYS;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.BRAINSTY_ORCHESTRATOR_LLM_ALWAYS = "0"; // legacy path runs the live structured-intent call
  setTieredChatModelFactoryForTests(({ step }) => ({
    invoke: async () => {
      if (step === "structured_intent") throw new Error("simulated model failure");
      if (step === "llm_orchestration_decision") return { content: JSON.stringify(llmDecisionPayload()) };
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
      userInput: "Is this provider in network?",
      rawMessage: { source: "intelligence_fallback_test", executeEvidenceObservation: false }
    });

    assert.equal(result.state.structured_intent.reasoning_source, "curated_fallback");
    assert.equal(result.state.structured_intent.liveReasoner.mode, "openai_structured_intent_failed");
    assert.equal(result.state.structured_intent.primary_intent, "provider_network");
  } finally {
    resetTieredChatModelFactoryForTests();
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalFlag === undefined) delete process.env.BRAINSTY_ORCHESTRATOR_LLM_ALWAYS;
    else process.env.BRAINSTY_ORCHESTRATOR_LLM_ALWAYS = originalFlag;
  }
});
