export const INTELLIGENCE_CONTRACT_VERSION = "2026-06-15.brainsty-intelligence.v1";

export const JOURNEY_KEYS = Object.freeze({
  BENEFITS_ELIGIBILITY: "benefits_eligibility",
  CLAIMS_EOB_PAYMENT: "claims_eob_payment",
  PRIOR_AUTHORIZATION: "prior_authorization",
  DENIAL_APPEAL: "denial_appeal",
  PROVIDER_NETWORK: "provider_network",
  PHARMACY_FORMULARY: "pharmacy_formulary",
  DOCUMENT_REVIEW: "document_review",
  COST_ESTIMATE: "cost_estimate",
  URGENT_HANDOFF: "urgent_handoff",
  GENERAL_RESEARCH: "general_research"
});

export const JOURNEY_LIST = Object.freeze(Object.values(JOURNEY_KEYS));

export const SAFE_NEXT_ACTIONS = Object.freeze([
  "answer_from_evidence",
  "request_or_retrieve_evidence",
  "prepare_approval",
  "human_handoff",
  "refuse_or_block",
  "trusted_research"
]);

export const COMPLEXITIES = Object.freeze(["low", "moderate", "high"]);

export const WORKFLOW_TO_JOURNEY = Object.freeze({
  eligibility_benefits_navigation: JOURNEY_KEYS.BENEFITS_ELIGIBILITY,
  claim_status_navigation: JOURNEY_KEYS.CLAIMS_EOB_PAYMENT,
  prior_authorization_navigation: JOURNEY_KEYS.PRIOR_AUTHORIZATION,
  denial_appeal_preparation: JOURNEY_KEYS.DENIAL_APPEAL,
  payer_portal_read_only_extraction: JOURNEY_KEYS.BENEFITS_ELIGIBILITY,
  document_or_trace_review: JOURNEY_KEYS.DOCUMENT_REVIEW,
  human_approval_escalation: JOURNEY_KEYS.URGENT_HANDOFF,
  blocked_by_input_policy: JOURNEY_KEYS.URGENT_HANDOFF
});

export const JOURNEY_TO_WORKFLOW = Object.freeze({
  [JOURNEY_KEYS.BENEFITS_ELIGIBILITY]: "eligibility_benefits_navigation",
  [JOURNEY_KEYS.CLAIMS_EOB_PAYMENT]: "claim_status_navigation",
  [JOURNEY_KEYS.PRIOR_AUTHORIZATION]: "prior_authorization_navigation",
  [JOURNEY_KEYS.DENIAL_APPEAL]: "denial_appeal_preparation",
  [JOURNEY_KEYS.PROVIDER_NETWORK]: "eligibility_benefits_navigation",
  [JOURNEY_KEYS.PHARMACY_FORMULARY]: "eligibility_benefits_navigation",
  [JOURNEY_KEYS.DOCUMENT_REVIEW]: "document_or_trace_review",
  [JOURNEY_KEYS.COST_ESTIMATE]: "eligibility_benefits_navigation",
  [JOURNEY_KEYS.URGENT_HANDOFF]: "human_approval_escalation",
  [JOURNEY_KEYS.GENERAL_RESEARCH]: "document_or_trace_review"
});

export const JOURNEY_EVIDENCE = Object.freeze({
  [JOURNEY_KEYS.BENEFITS_ELIGIBILITY]: ["plan_terms", "member_benefits", "deductible_or_accumulator_if_available"],
  [JOURNEY_KEYS.CLAIMS_EOB_PAYMENT]: ["claim_record_or_eob", "patient_responsibility", "payment_or_denial_reason_if_available"],
  [JOURNEY_KEYS.PRIOR_AUTHORIZATION]: ["service_or_procedure", "payer_policy_pointer", "authorization_record_or_requirements"],
  [JOURNEY_KEYS.DENIAL_APPEAL]: ["denial_reason_or_eob", "claim_record", "payer_policy_pointer"],
  [JOURNEY_KEYS.PROVIDER_NETWORK]: ["provider_or_facility", "network_directory_or_plan_terms", "member_plan_context"],
  [JOURNEY_KEYS.PHARMACY_FORMULARY]: ["medication_name", "formulary_or_pharmacy_benefit", "member_plan_context"],
  [JOURNEY_KEYS.DOCUMENT_REVIEW]: ["uploaded_document_or_portal_document", "source_spans_or_document_pointer"],
  [JOURNEY_KEYS.COST_ESTIMATE]: ["service_or_item", "benefit_terms", "accumulator_or_claim_history_if_available"],
  [JOURNEY_KEYS.URGENT_HANDOFF]: ["human_handoff_record", "urgent_safe_response", "audit_event"],
  [JOURNEY_KEYS.GENERAL_RESEARCH]: ["trusted_reviewed_source", "citation_pointer", "freshness_context"]
});

export function evidenceForJourney(journey) {
  return JOURNEY_EVIDENCE[journey] ?? [];
}

