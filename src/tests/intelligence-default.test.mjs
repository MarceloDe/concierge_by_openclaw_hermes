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

test("LangGraph defaults to live structured-intent reasoning when a model key exists", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
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
  }
});

test("LangGraph falls back to curated structured intent when the live reasoner fails", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
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
  }
});
