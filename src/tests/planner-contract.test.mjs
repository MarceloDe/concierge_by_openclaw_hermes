// Phase B + Phase 83 proof: the planner output contract is normalized fail-closed and
// surfaces the offer/clarify fields; v2 adds the DB-derived allowedWorkflows gate, the
// deterministic risk floor, and the offered-process filter. Pure (no LLM).
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLlmOrchestrationDecision } from "../concierge/llmOrchestrationDecision.mjs";

const ALLOWED = [
  "eligibility_benefits_navigation",
  "claim_status_navigation",
  "pharmacy_formulary",
  "prior_authorization_navigation",
  "denial_appeal_preparation",
  "payer_portal_read_only_extraction",
  "document_or_trace_review",
  "human_approval_escalation"
];
const OPTIONS = { allowedWorkflows: ALLOWED, offerableProcessIds: ["process:portal_readonly_lookup"] };

test("Phase B: missing/invalid fields fail closed", () => {
  const d = normalizeLlmOrchestrationDecision(JSON.stringify({ workflow: "eligibility_benefits_navigation", confidence: 0.9 }), OPTIONS);
  assert.equal(d.response.capabilityAssessment.canAnswerNow, false, "canAnswerNow defaults false");
  assert.equal(d.demand_and_evidence.userDataSufficiency, "none", "userDataSufficiency defaults none");
  assert.equal(d.response.clarificationNeeded, false);
  assert.deepEqual(d.selected_tools.offeredProcessIds, []);
  assert.equal(d.response.answerComposerMode, "capability_meta");
});

test("Phase B: offer+clarify without a question/process raises warnings", () => {
  const d = normalizeLlmOrchestrationDecision(JSON.stringify({
    workflow: "eligibility_benefits_navigation", confidence: 0.6,
    responseStrategy: "offer_process_and_ask", clarificationNeeded: true, userFacingNextQuestion: "", offeredProcessIds: []
  }), OPTIONS);
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
  }), OPTIONS);
  assert.equal(d.response.capabilityAssessment.canAnswerNow, false);
  assert.equal(d.demand_and_evidence.userDataSufficiency, "insufficient");
  assert.equal(d.response.responseStrategy, "offer_process_and_ask");
  assert.deepEqual(d.selected_tools.offeredProcessIds, ["process:portal_readonly_lookup"]);
  assert.equal(d.selected_tools.recommendedProcessId, "process:portal_readonly_lookup");
  assert.deepEqual(d.demand_and_evidence.missingPlanDetails, ["which_payer_portal"]);
  assert.ok(!d.warnings.includes("clarification_needed_without_question"));
  assert.ok(!d.warnings.includes("capability_question_without_offer"));
});

test("Phase 83: allowedWorkflows=[] hard-fails (fail loud, never permissive)", () => {
  const d = normalizeLlmOrchestrationDecision(JSON.stringify({ workflow: "eligibility_benefits_navigation", confidence: 0.9, rationale: "r" }), {});
  assert.equal(d.valid, false);
  assert.ok(d.issues.includes("allowed_workflows_unavailable"));
});

test("Phase 83: workflow_not_allowed issue string preserved byte-identically", () => {
  const d = normalizeLlmOrchestrationDecision(JSON.stringify({ workflow: "made_up_workflow", confidence: 0.9 }), OPTIONS);
  assert.equal(d.valid, false);
  assert.ok(d.issues.includes("workflow_not_allowed:made_up_workflow"));
  const empty = normalizeLlmOrchestrationDecision(JSON.stringify({ confidence: 0.9 }), OPTIONS);
  assert.ok(empty.issues.includes("workflow_not_allowed:empty"));
});

test("Phase 83: deterministic risk floor — LLM may raise, never lower", () => {
  const d = normalizeLlmOrchestrationDecision(JSON.stringify({
    classification: { workflow: "payer_portal_read_only_extraction", confidence: 0.9, rationale: "portal lookup" },
    risk_tier: "low",
    response: { responseStrategy: "offer_process_and_ask", clarificationNeeded: false, userFacingNextQuestion: "", capabilityAssessment: { canAnswerNow: false } }
  }), { ...OPTIONS, selectedCapabilityRows: [{ capabilityKey: "process:portal_readonly_lookup", approvalScope: "read_only_observation" }] });
  assert.equal(d.valid, false, "asserting below the capability floor is a hard issue");
  assert.ok(d.issues.includes("risk_tier_below_floor"));
  assert.equal(d.risk_tier, "medium");

  const raised = normalizeLlmOrchestrationDecision(JSON.stringify({
    classification: { workflow: "payer_portal_read_only_extraction", confidence: 0.9, rationale: "portal lookup" },
    risk_tier: "high"
  }), { ...OPTIONS, selectedCapabilityRows: [{ capabilityKey: "process:portal_readonly_lookup", approvalScope: "read_only_observation" }] });
  assert.equal(raised.valid, true, `raising above the floor is allowed: ${raised.issues}`);
  assert.equal(raised.risk_tier, "high");
});

test("Phase 83: offered processes are filtered against the offerable set at normalize time", () => {
  const d = normalizeLlmOrchestrationDecision(JSON.stringify({
    workflow: "eligibility_benefits_navigation", confidence: 0.8,
    responseStrategy: "offer_process_and_ask", clarificationNeeded: true, userFacingNextQuestion: "Which payer?",
    offeredProcessIds: ["process:portal_readonly_lookup", "process:invented_by_model"],
    recommendedProcessId: "process:invented_by_model"
  }), OPTIONS);
  assert.deepEqual(d.selected_tools.offeredProcessIds, ["process:portal_readonly_lookup"], "invented process dropped");
  assert.equal(d.selected_tools.recommendedProcessId, "process:portal_readonly_lookup", "recommendation falls back to a real offer");
  assert.ok(d.warnings.some((w) => w.startsWith("offered_process_not_offerable")));
  assert.equal(d.workflow_graph.processId, "process:portal_readonly_lookup", "workflow_graph binds the filtered recommendation");
});
