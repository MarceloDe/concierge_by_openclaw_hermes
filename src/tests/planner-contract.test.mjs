// Phase B proof: the planner output contract is normalized fail-closed and surfaces the
// offer/clarify fields. Pure (no LLM) for the normalize logic.
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLlmOrchestrationDecision } from "../concierge/llmOrchestrationDecision.mjs";

test("Phase B: missing/invalid fields fail closed", () => {
  const d = normalizeLlmOrchestrationDecision(JSON.stringify({ workflow: "eligibility_benefits_navigation", confidence: 0.9 }), {});
  assert.equal(d.capabilityAssessment.canAnswerNow, false, "canAnswerNow defaults false");
  assert.equal(d.userDataSufficiency, "none", "userDataSufficiency defaults none");
  assert.equal(d.clarificationNeeded, false);
  assert.deepEqual(d.offeredProcessIds, []);
  assert.equal(d.answerComposerMode, "capability_meta");
});

test("Phase B: offer+clarify without a question/process raises warnings", () => {
  const d = normalizeLlmOrchestrationDecision(JSON.stringify({
    workflow: "eligibility_benefits_navigation", confidence: 0.6,
    responseStrategy: "offer_process_and_ask", clarificationNeeded: true, userFacingNextQuestion: "", offeredProcessIds: []
  }), {});
  assert.ok(d.warnings.includes("clarification_needed_without_question"));
  assert.ok(d.warnings.includes("capability_question_without_offer"));
});

test("Phase B: a well-formed offer+clarify decision is captured", () => {
  const d = normalizeLlmOrchestrationDecision(JSON.stringify({
    workflow: "eligibility_benefits_navigation", confidence: 0.7,
    capabilityAssessment: { canAnswerNow: false, reason: "no evidence", limitations: ["cannot log in"] },
    userDataSufficiency: "insufficient", clarificationNeeded: true,
    userFacingNextQuestion: "Which insurance plan should I look up?",
    responseStrategy: "offer_process_and_ask",
    offeredProcessIds: ["process:portal_readonly_lookup"],
    recommendedProcessId: "process:portal_readonly_lookup",
    missingPlanDetails: ["which_payer_portal"]
  }), {});
  assert.equal(d.capabilityAssessment.canAnswerNow, false);
  assert.equal(d.userDataSufficiency, "insufficient");
  assert.equal(d.responseStrategy, "offer_process_and_ask");
  assert.deepEqual(d.offeredProcessIds, ["process:portal_readonly_lookup"]);
  assert.equal(d.recommendedProcessId, "process:portal_readonly_lookup");
  assert.deepEqual(d.missingPlanDetails, ["which_payer_portal"]);
  assert.ok(!d.warnings.includes("clarification_needed_without_question"));
  assert.ok(!d.warnings.includes("capability_question_without_offer"));
});
