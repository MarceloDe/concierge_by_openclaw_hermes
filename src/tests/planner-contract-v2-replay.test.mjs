// Phase 83 acceptance: DECISION_CONTRACT_V2's ONE normalizer lifts a recorded v1 flat
// decision LOSSLESSLY field-by-field (plan §3.3), and validates the v2 grouped shape
// with the new hard gates. Pure (no LLM).
import test from "node:test";
import assert from "node:assert/strict";
import {
  DECISION_CONTRACT_V2,
  LLM_ORCHESTRATION_DECISION_VERSION,
  applyDecisionCapabilityGates,
  normalizeLlmOrchestrationDecision
} from "../concierge/llmOrchestrationDecision.mjs";

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
const OPTIONS = { allowedWorkflows: ALLOWED, offerableProcessIds: ["process:portal_readonly_lookup", "process:claim_status_lookup"] };

// A recorded v1 flat decision (pre-pivot shape: no `classification` group).
const V1_FIXTURE = {
  workflow: "claim_status_navigation",
  intent: "claim_denied_lookup",
  confidence: 0.83,
  extractedDemand: "understand why the last claim was denied",
  targetOutcome: "denial reason and remaining patient responsibility",
  informationNeeds: ["payer", "claim_id"],
  collectedUserData: { payer: "Aetna" },
  rationale: "Prior live decision routed denial questions to claim review.",
  requiredEvidence: ["claim_record"],
  missingEvidence: ["claim_record"],
  approvalRequired: true,
  approvalScope: "read_only_observation",
  workerGoal: "Locate the denied claim and extract denial codes.",
  responseStrategy: "offer_process_and_ask",
  userFacingNextQuestion: "Which claim should I look at?",
  capabilityAssessment: { canAnswerNow: false, reason: "no evidence", limitations: ["cannot log in"] },
  userDataSufficiency: "insufficient",
  missingPlanDetails: ["claim_id"],
  clarificationNeeded: true,
  offeredProcessIds: ["process:claim_status_lookup"],
  recommendedProcessId: "process:claim_status_lookup",
  answerComposerMode: "capability_meta",
  selectedCapabilityPortfolioIds: ["process:claim_status_lookup"],
  selectedCapabilityPointers: ["brainsty:capability-catalog:s1#process:claim_status_lookup"],
  priorLlmOutputPointersUsed: []
};

test("v1 flat decisions lift LOSSLESSLY into the grouped v2 contract", () => {
  const d = normalizeLlmOrchestrationDecision(JSON.stringify(V1_FIXTURE), OPTIONS);
  assert.equal(d.contractVersion, LLM_ORCHESTRATION_DECISION_VERSION);
  assert.equal(d.valid, true, `expected valid, issues: ${d.issues}`);
  // Field-by-field lift (plan §3.3 table): every v1 field lands in its v2 group
  // (Phase 85: the flat aliases are removed — grouped reads only).
  assert.equal(d.classification.workflow, V1_FIXTURE.workflow);
  assert.equal(d.classification.intent, V1_FIXTURE.intent);
  assert.equal(d.classification.confidence, V1_FIXTURE.confidence);
  assert.equal(d.classification.extractedDemand, V1_FIXTURE.extractedDemand);
  assert.equal(d.classification.targetOutcome, V1_FIXTURE.targetOutcome);
  assert.equal(d.classification.rationale, V1_FIXTURE.rationale);
  assert.equal(d.classification.taskClass, null, "v1 has no taskClass — lifts to null");
  assert.deepEqual(d.data_layer, [], "v1 has no data_layer — lifts to []");
  assert.deepEqual(d.demand_and_evidence.informationNeeds, V1_FIXTURE.informationNeeds);
  assert.deepEqual(d.demand_and_evidence.collectedUserData, V1_FIXTURE.collectedUserData);
  assert.deepEqual(d.demand_and_evidence.requiredEvidence, V1_FIXTURE.requiredEvidence);
  assert.deepEqual(d.demand_and_evidence.missingEvidence, V1_FIXTURE.missingEvidence);
  assert.equal(d.demand_and_evidence.userDataSufficiency, V1_FIXTURE.userDataSufficiency);
  assert.deepEqual(d.demand_and_evidence.missingPlanDetails, V1_FIXTURE.missingPlanDetails);
  assert.deepEqual(d.demand_and_evidence.assumptions, []);
  assert.deepEqual(d.demand_and_evidence.requiredDataPoints, []);
  assert.equal(d.auth_and_consent.approvalRequired, true);
  assert.equal(d.auth_and_consent.approvalScope, V1_FIXTURE.approvalScope);
  assert.equal(d.auth_and_consent.requiresMemberAuth, false, "v1 lift default");
  assert.equal(d.auth_and_consent.authType, "unknown", "v1 lift default");
  assert.equal(d.auth_and_consent.providerDelegationStatus, "not_required", "v1 lift default");
  // v1 lift risk rule: approvalRequired with read-only scope → medium.
  assert.equal(d.risk_tier, "medium");
  assert.deepEqual(d.selected_tools.capabilityPointers, V1_FIXTURE.selectedCapabilityPointers);
  assert.deepEqual(d.selected_tools.selectedCapabilityPortfolioIds, V1_FIXTURE.selectedCapabilityPortfolioIds);
  assert.deepEqual(d.selected_tools.offeredProcessIds, V1_FIXTURE.offeredProcessIds);
  assert.equal(d.selected_tools.recommendedProcessId, V1_FIXTURE.recommendedProcessId);
  assert.equal(d.selected_tools.workerGoal, V1_FIXTURE.workerGoal);
  assert.equal(d.workflow_graph.processId, V1_FIXTURE.recommendedProcessId, "processId binds recommendedProcessId");
  assert.equal(d.response.responseStrategy, V1_FIXTURE.responseStrategy);
  assert.equal(d.response.clarificationNeeded, true);
  assert.equal(d.response.userFacingNextQuestion, V1_FIXTURE.userFacingNextQuestion);
  assert.equal(d.response.capabilityAssessment.canAnswerNow, false);
  // Invariants force-normalized on lift.
  assert.equal(d.execution_policy.requireHumanInterruptBeforeWrite, true);
  assert.equal(d.execution_policy.storeRawCredentials, false);
  assert.equal(d.execution_policy.redactPhiInLogs, true);
  assert.equal(d.execution_policy.auditEveryToolCall, true);
  assert.equal(d.execution_policy.allowWriteActions, false);
});

test("v2 grouped decisions validate the draft-adopted enums", () => {
  const d = normalizeLlmOrchestrationDecision(JSON.stringify({
    classification: { workflow: "pharmacy_formulary", taskClass: "medication_support", intent: "drug_coverage", confidence: 0.8, extractedDemand: "is Ozempic covered", targetOutcome: "coverage + tier", rationale: "Formulary question." },
    data_layer: ["layer_1_public", "layer_2_member_authorized_api"],
    risk_tier: "medium",
    demand_and_evidence: { informationNeeds: ["payer"], collectedUserData: {}, userDataSufficiency: "insufficient", assumptions: ["commercial plan"], requiredDataPoints: [{ name: "payer", sourcePreference: "user_input", required: true }] },
    auth_and_consent: { requiresMemberAuth: true, authType: "payer_oauth_smart_fhir", requiresUserConsent: true, requiresProviderDelegation: false, providerDelegationStatus: "not_required", approvalRequired: false, approvalScope: null, portalLoginRequired: false },
    selected_tools: { capabilityPointers: [], toolPlan: [], offeredProcessIds: ["process:portal_readonly_lookup"], recommendedProcessId: "process:portal_readonly_lookup", workerGoal: "Check formulary tier." },
    workflow_graph: { processId: "process:portal_readonly_lookup", steps: [], resumeFromCheckpointId: null },
    response: { responseStrategy: "offer_process_and_ask", clarificationNeeded: true, userFacingNextQuestion: "Which payer?", answerComposerMode: "capability_meta", capabilityAssessment: { canAnswerNow: false, reason: "needs payer", limitations: [] } },
    execution_policy: { preferPublicBeforeMemberData: true, preferApiBeforePortalControl: true, allowOpenclawPublicScraping: true, allowOpenclawLoggedPortalControl: false, allowWriteActions: false, requireHumanInterruptBeforeWrite: true, storeRawCredentials: false, redactPhiInLogs: true, auditEveryToolCall: true },
    fallback_strategy: [{ if: "formulary evidence missing", then: "offer process:portal_readonly_lookup" }, { if: "everything fails", then: "invent a magical unicorn tool" }]
  }), OPTIONS);
  assert.equal(d.valid, true, `issues: ${d.issues}`);
  assert.equal(d.classification.taskClass, "medication_support");
  assert.deepEqual(d.data_layer, ["layer_1_public", "layer_2_member_authorized_api"]);
  assert.equal(d.risk_tier, "medium");
  assert.equal(d.auth_and_consent.authType, "payer_oauth_smart_fhir");
  assert.equal(d.fallback_strategy.length, 1, "unresolvable fallback dropped");
  assert.ok(d.warnings.some((w) => w.startsWith("fallback_unresolvable")), "drop recorded");
  assert.equal(d.classification.workflow, "pharmacy_formulary");
});

test("hard gates: empty allowedWorkflows, floor violation, invariant override, PAS delegation, registry gate", () => {
  // allowed_workflows_unavailable — fail loud, never permissive.
  const noCatalog = normalizeLlmOrchestrationDecision(JSON.stringify(V1_FIXTURE), { allowedWorkflows: [] });
  assert.equal(noCatalog.valid, false);
  assert.ok(noCatalog.issues.includes("allowed_workflows_unavailable"));

  // workflow_not_allowed — byte-identical issue string format.
  const badWorkflow = normalizeLlmOrchestrationDecision(JSON.stringify({ ...V1_FIXTURE, workflow: "autonomous_payer_contact" }), OPTIONS);
  assert.equal(badWorkflow.valid, false);
  assert.ok(badWorkflow.issues.includes("workflow_not_allowed:autonomous_payer_contact"));

  // risk_tier_below_floor — the LLM may raise the tier, never lower it below the floor.
  const belowFloor = normalizeLlmOrchestrationDecision(JSON.stringify({
    classification: { workflow: "claim_status_navigation", taskClass: "claims_support", confidence: 0.9, rationale: "r" },
    risk_tier: "low",
    response: { responseStrategy: "answer_from_evidence", capabilityAssessment: { canAnswerNow: true } }
  }), { ...OPTIONS, policyResult: { allowed: true, approvalRequired: true, checks: [] } });
  assert.equal(belowFloor.valid, false);
  assert.ok(belowFloor.issues.includes("risk_tier_below_floor"));
  assert.equal(belowFloor.risk_tier, "medium", "tier raised to the deterministic floor");

  // execution_policy invariants: contrary vote is overwritten + recorded, never obeyed.
  const invariantVote = normalizeLlmOrchestrationDecision(JSON.stringify({
    classification: { workflow: "claim_status_navigation", confidence: 0.9, rationale: "r" },
    execution_policy: { storeRawCredentials: true, redactPhiInLogs: false }
  }), OPTIONS);
  assert.equal(invariantVote.execution_policy.storeRawCredentials, false);
  assert.equal(invariantVote.execution_policy.redactPhiInLogs, true);
  assert.ok(invariantVote.warnings.some((w) => w.startsWith("execution_policy_invariant_overridden")));

  // PAS submission without verified provider delegation (plan §3.3 hard gate).
  const pas = normalizeLlmOrchestrationDecision(JSON.stringify({
    classification: { workflow: "prior_authorization_navigation", confidence: 0.9, rationale: "r" },
    auth_and_consent: { requiresProviderDelegation: true, providerDelegationStatus: "required_unverified" },
    selected_tools: { capabilityPointers: ["tool:prior_auth_submission_pas_api"] }
  }), { ...OPTIONS, selectedCapabilityRows: [{ capabilityKey: "tool:prior_auth_submission_pas_api", toolKey: "prior_auth_submission_pas_api" }] });
  assert.equal(pas.valid, false);
  assert.ok(pas.issues.includes("pas_submission_without_provider_delegation"));

  // Registry gate (plan §7.0): runtime_selectable=0 rows are never selectable.
  const decision = normalizeLlmOrchestrationDecision(JSON.stringify(V1_FIXTURE), OPTIONS);
  const gated = applyDecisionCapabilityGates(decision, [{ capabilityKey: "tool:openclaw_claim_submission_worker", runtime_selectable: 0 }]);
  assert.equal(gated.valid, false);
  assert.ok(gated.issues.some((issue) => issue.startsWith("tool_not_runtime_selectable")));
});

test("the contract object renders once and carries the draft-adopted vocabularies", () => {
  assert.equal(DECISION_CONTRACT_V2.version, LLM_ORCHESTRATION_DECISION_VERSION);
  assert.equal(DECISION_CONTRACT_V2.taskClasses.length, 12);
  assert.deepEqual(DECISION_CONTRACT_V2.dataLayers, ["layer_1_public", "layer_2_member_authorized_api", "layer_3_portal_control"]);
  assert.deepEqual(DECISION_CONTRACT_V2.riskTiers, ["low", "medium", "high", "critical"]);
  assert.equal(DECISION_CONTRACT_V2.executionPolicyInvariants.storeRawCredentials, false);
});

test("v2 normalizer canonicalizes the unambiguous workflow: prefix; unknown workflows still fail loud", () => {
  const options = { allowedWorkflows: ["document_or_trace_review"], offerableProcessIds: [], knownCapabilityKeys: [] };
  // Prefixed form of an ALLOWED workflow → canonicalized (deterministic alias, not a fallback).
  const canonical = normalizeLlmOrchestrationDecision({
    classification: { workflow: "workflow:document_or_trace_review", taskClass: "claims_support", intent: "eob_review", confidence: 0.97, rationale: "prefixed form" },
    data_layer: ["layer_1_public"],
    risk_tier: "medium",
    response: { responseStrategy: "answer", workerGoal: "read-only" }
  }, options);
  assert.equal(canonical.valid, true);
  assert.equal(canonical.classification.workflow, "document_or_trace_review");
  assert.ok(canonical.warnings.includes("workflow_prefix_canonicalized"));
  // Prefixed form of a NOT-allowed workflow → still a loud hard issue.
  const invalid = normalizeLlmOrchestrationDecision({
    classification: { workflow: "workflow:invented_workflow", taskClass: "claims_support", intent: "x", confidence: 0.9, rationale: "invented" },
    data_layer: ["layer_1_public"],
    risk_tier: "low",
    response: { responseStrategy: "answer", workerGoal: "read-only" }
  }, options);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.some((issue) => issue.startsWith("workflow_not_allowed:")));
});
