import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import {
  buildLlmOrchestrationDecisionMessages,
  confidenceBand,
  normalizeLlmOrchestrationDecision,
  shouldUseLlmDecision
} from "../concierge/llmOrchestrationDecision.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-llm-decision-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

test("LLM orchestration decision parser accepts strict workflow JSON", () => {
  const decision = normalizeLlmOrchestrationDecision({
    workflow: "document_or_trace_review",
    intent: "review_trace",
    confidence: 0.82,
    rationale: "The user asked to inspect an existing evidence trace.",
    requiredEvidence: ["document_or_trace_artifact"],
    missingEvidence: [],
    approvalRequired: false,
    approvalScope: "read_only_observation",
    workerGoal: "Review stored trace artifacts and return source pointers.",
    responseStrategy: "Explain what evidence is available and what is missing.",
    userFacingNextQuestion: ""
  });

  assert.equal(decision.valid, true);
  assert.equal(decision.workflow, "document_or_trace_review");
  assert.equal(shouldUseLlmDecision(decision), true);
  assert.equal(confidenceBand(decision), "high");
});

test("LLM orchestration decision parser rejects unknown workflows", () => {
  const decision = normalizeLlmOrchestrationDecision({
    workflow: "autonomous_payer_contact",
    confidence: 0.9,
    rationale: "Bad workflow",
    workerGoal: "Call payer."
  });

  assert.equal(decision.valid, false);
  assert.ok(decision.issues.some((issue) => issue.includes("workflow_not_allowed")));
  assert.equal(shouldUseLlmDecision(decision), false);
});

test("LLM orchestration decision confidence bands keep weak decisions from being adopted", () => {
  const low = normalizeLlmOrchestrationDecision({
    workflow: "eligibility_benefits_navigation",
    intent: "ambiguous_benefit_question",
    confidence: 0.49,
    rationale: "The request is too ambiguous to route confidently.",
    workerGoal: "Ask a clarifying question."
  });
  const medium = normalizeLlmOrchestrationDecision({
    workflow: "eligibility_benefits_navigation",
    intent: "benefit_question",
    confidence: 0.62,
    rationale: "The request appears to be about eligibility.",
    workerGoal: "Check eligibility evidence."
  });

  assert.equal(low.valid, true);
  assert.equal(confidenceBand(low), "low");
  assert.equal(shouldUseLlmDecision(low), false);
  assert.equal(confidenceBand(medium), "medium");
  assert.equal(shouldUseLlmDecision(medium), true);
});

test("LLM orchestration decision messages mask direct identifiers", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store, {
    name: "Route Test User",
    email: "route-test@example.invalid"
  });
  const result = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Route Test User needs help with member ID W123456789.",
    rawMessage: { source: "test", useLiveModel: false, executeEvidenceObservation: false }
  });
  const messages = buildLlmOrchestrationDecisionMessages(result.state);
  const serialized = JSON.stringify(messages);

  assert.ok(serialized.includes("[DB_POINTER:users:"));
  assert.ok(!serialized.includes("Route Test User"));
  assert.ok(!serialized.includes("route-test@example.invalid"));
  assert.ok(!serialized.includes("W123456789"));
});

test("LangGraph can route from a replayed live LLM decision instead of curated classifier", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const result = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Why didn't insurance pay my last visit?",
    rawMessage: {
      source: "llm_decision_replay_test",
      useLiveModel: false,
      executeEvidenceObservation: false,
      llmOrchestrationDecisionReplay: {
        workflow: "document_or_trace_review",
        intent: "review_trace_artifacts_first",
        confidence: 0.88,
        rationale: "A prior live GPT decision determined the user needs trace review before claim status.",
        requiredEvidence: ["document_or_trace_artifact"],
        missingEvidence: ["document_or_trace_artifact"],
        approvalRequired: false,
        approvalScope: "read_only_observation",
        workerGoal: "Review existing trace artifacts before claim-status worker dispatch.",
        responseStrategy: "Ask for the trace artifact if none is stored.",
        userFacingNextQuestion: "Do you want to review the latest portal trace first?"
      }
    }
  });

  assert.equal(result.state.structured_intent.workflow, "claim_status_navigation");
  assert.equal(result.state.workflow, "document_or_trace_review");
  assert.equal(result.state.route_reason, "llm_orchestration_decision");
  assert.equal(result.state.llm_orchestration_decision.usedByRouter, true);
});

test("LangGraph labels valid low-confidence LLM decisions as clarify instead of silently adopting them", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const result = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Can you help with this insurance thing?",
    rawMessage: {
      source: "low_confidence_llm_decision_test",
      useLiveModel: false,
      executeEvidenceObservation: false,
      llmOrchestrationDecisionReplay: {
        workflow: "eligibility_benefits_navigation",
        intent: "ambiguous_insurance_request",
        confidence: 0.42,
        rationale: "The user did not provide enough journey-specific context.",
        requiredEvidence: ["member_plan_context"],
        missingEvidence: ["specific_question"],
        approvalRequired: false,
        approvalScope: "read_only_observation",
        workerGoal: "Ask a clarifying question before worker dispatch.",
        responseStrategy: "Clarify which insurance journey the user means.",
        userFacingNextQuestion: "What insurance question should I help with first?"
      }
    }
  });

  assert.equal(result.state.route_reason, "low_confidence_clarify");
  assert.equal(result.state.llm_orchestration_decision.usedByRouter, false);
});
