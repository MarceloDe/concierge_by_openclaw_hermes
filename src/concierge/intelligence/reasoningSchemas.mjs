export const INTELLIGENCE_CONTRACT_VERSION = "2026-06-15.brainsty-intelligence.v1";

export const JOURNEY_LIST = Object.freeze([
  "benefits_eligibility",
  "claims_eob_payment",
  "prior_authorization",
  "denial_appeal",
  "provider_network",
  "pharmacy_formulary",
  "procedure_admin_checklist",
  "document_review",
  "cost_estimate",
  "urgent_handoff",
  "general_research"
]);

export const SAFE_NEXT_ACTIONS = Object.freeze([
  "answer_from_evidence",
  "request_or_retrieve_evidence",
  "prepare_approval",
  "human_handoff",
  "refuse_or_block",
  "trusted_research"
]);

export const COMPLEXITIES = Object.freeze(["low", "moderate", "high"]);
