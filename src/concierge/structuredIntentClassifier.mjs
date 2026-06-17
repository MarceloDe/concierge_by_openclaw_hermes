const WORKFLOW_KEYS = Object.freeze({
  ELIGIBILITY: "eligibility_benefits_navigation",
  CLAIM_STATUS: "claim_status_navigation",
  PRIOR_AUTH: "prior_authorization_navigation",
  DENIAL_APPEAL: "denial_appeal_preparation",
  PORTAL_READ_ONLY: "payer_portal_read_only_extraction",
  DOCUMENT_REVIEW: "document_or_trace_review",
  HUMAN_APPROVAL: "human_approval_escalation"
});

const WORKFLOW_EVIDENCE = Object.freeze({
  [WORKFLOW_KEYS.ELIGIBILITY]: ["portal_account", "eligibility_snapshot_or_authenticated_portal_page"],
  [WORKFLOW_KEYS.CLAIM_STATUS]: ["claim_record_or_eob", "eligibility_snapshot_or_authenticated_portal_page"],
  [WORKFLOW_KEYS.PRIOR_AUTH]: ["service_or_procedure", "payer_policy_pointer", "authorization_record_or_portal_page"],
  [WORKFLOW_KEYS.DENIAL_APPEAL]: ["denial_reason_or_eob", "claim_record", "payer_policy_pointer"],
  [WORKFLOW_KEYS.PORTAL_READ_ONLY]: ["authenticated_portal_page", "read_only_scope_approval"],
  [WORKFLOW_KEYS.DOCUMENT_REVIEW]: ["document_or_trace_artifact"],
  [WORKFLOW_KEYS.HUMAN_APPROVAL]: ["approval_scope", "allowed_action", "expiration"]
});

const RULES = Object.freeze([
  {
    intent: "prior_authorization_question",
    workflow: WORKFLOW_KEYS.PRIOR_AUTH,
    patterns: [
      /\b(prior auth|prior authorization|precert|precertification|authorization request)\b/i,
      /\b(doctor|provider|specialist|surgeon)\b.{0,80}\b(approval|approved|authorization|permission)\b/i,
      /\b(mri|ct scan|imaging|procedure|surgery|infusion|therapy)\b.{0,80}\b(approval|approved|authorization|pending)\b/i
    ],
    evidence: ["service_or_procedure", "payer_policy_pointer", "authorization_record_or_portal_page"]
  },
  {
    intent: "denial_appeal_question",
    workflow: WORKFLOW_KEYS.DENIAL_APPEAL,
    patterns: [
      /\b(denial|denied|not approved|rejected|adverse determination)\b/i,
      /\b(appeal|fight it|fight this|challenge|reconsideration|dispute)\b/i,
      /\b(they said no|insurance said no|payer said no)\b/i
    ],
    evidence: ["denial_reason_or_eob", "claim_record", "payer_policy_pointer"]
  },
  {
    intent: "claim_status_question",
    workflow: WORKFLOW_KEYS.CLAIM_STATUS,
    patterns: [
      /\b(claim|claims|eob|explanation of benefits|processed|patient responsibility)\b/i,
      /\b(why|how come|didn'?t|did not)\b.{0,80}\b(pay|paid|cover|reimburse)\b/i,
      /\b(last visit|visit bill|medical bill|provider bill|doctor bill)\b/i
    ],
    evidence: ["claim_record_or_eob", "eligibility_snapshot_or_authenticated_portal_page"]
  },
  {
    intent: "eligibility_benefits_question",
    workflow: WORKFLOW_KEYS.ELIGIBILITY,
    patterns: [
      /\b(eligibility|eligible|benefits?|coverage|covered|plan benefit)\b/i,
      /\b(deductible|copay|co-pay|coinsurance|out[- ]of[- ]pocket|oop|max)\b/i,
      /\b(owe|pay|cost)\b.{0,80}\b(before insurance|before my insurance|starts paying|insurance starts)\b/i
    ],
    evidence: ["portal_account", "eligibility_snapshot_or_authenticated_portal_page"]
  },
  {
    intent: "portal_read_only_evidence_request",
    workflow: WORKFLOW_KEYS.PORTAL_READ_ONLY,
    patterns: [
      /\b(portal|browser|chrome|remote debugger|logged in|logged-in)\b/i,
      /\b(read|observe|extract|capture|scan)\b.{0,80}\b(portal|page|site|screen|tab)\b/i
    ],
    evidence: ["authenticated_portal_page", "read_only_scope_approval"]
  },
  {
    intent: "document_trace_review_request",
    workflow: WORKFLOW_KEYS.DOCUMENT_REVIEW,
    patterns: [
      /\b(document|pdf|screenshot|trace|audit|artifact|upload|file)\b/i,
      /\b(review|inspect|parse|extract)\b.{0,80}\b(document|trace|screenshot|artifact|file)\b/i
    ],
    evidence: ["document_or_trace_artifact"]
  }
]);

function compactWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function scoreRule(rule, message) {
  const matches = rule.patterns.filter((pattern) => pattern.test(message));
  return {
    ...rule,
    matchedPatterns: matches.length,
    score: matches.length
  };
}

function missingEvidenceFor(workflow, contextPacket) {
  const required = WORKFLOW_EVIDENCE[workflow] ?? [];
  const pointers = contextPacket?.dbPointers ?? [];
  const hasPortal = Boolean(contextPacket?.portalAccount?.id || contextPacket?.portalAccount?.portalUrl);
  const hasPointer = (tableNames) =>
    pointers.some((pointer) => tableNames.some((name) => pointer.table === name || pointer.table?.startsWith(name)));
  return required.filter((item) => {
    if (item === "portal_account") return !hasPortal;
    if (item === "eligibility_snapshot_or_authenticated_portal_page") {
      return !hasPointer(["eligibility_snapshots", "coverage_balances", "portal_page_snapshots"]);
    }
    if (item === "claim_record_or_eob" || item === "claim_record") return !hasPointer(["claim_items"]);
    if (item === "authorization_record_or_portal_page") return !hasPointer(["prior_authorizations", "portal_page_snapshots"]);
    if (item === "denial_reason_or_eob") return !hasPointer(["claim_items", "extraction_artifacts"]);
    if (item === "document_or_trace_artifact") return !hasPointer(["extraction_artifacts", "audit_events"]);
    if (item === "authenticated_portal_page") return !hasPointer(["portal_page_snapshots", "eligibility_snapshots"]);
    return true;
  });
}

function confidenceFromScore(score) {
  if (score >= 2) return 0.9;
  if (score === 1) return 0.72;
  return 0.42;
}

function refusalOrEscalation(policyResult) {
  if (policyResult.urgentEscalationRequired) {
    return {
      flag: "urgent_emergency_escalation",
      rationale: policyResult.urgentEscalation?.reason ?? "Emergency or safety-critical content requires immediate escalation."
    };
  }
  if (!policyResult.allowed) {
    const failed = policyResult.checks.find((check) => !check.passed);
    return {
      flag: "refusal",
      rationale: failed?.detail ?? "Input failed deterministic safety policy."
    };
  }
  if (policyResult.approvalRequired) {
    return {
      flag: "escalation_required",
      rationale: "Input implies an external or irreversible action and must pause for approval."
    };
  }
  return {
    flag: "none",
    rationale: "No deterministic refusal or escalation flag was raised."
  };
}

export function classifyHealthcareIntent({ message, policyResult, contextPacket = null }) {
  const cleanMessage = compactWhitespace(message);
  const safety = refusalOrEscalation(policyResult);
  if (safety.flag === "urgent_emergency_escalation") {
    return {
      schemaVersion: 1,
      classifier: "curated_healthcare_intent_v1",
      intent: "urgent_emergency_escalation",
      workflow: WORKFLOW_KEYS.HUMAN_APPROVAL,
      confidence: 1,
      requiredEvidence: ["human_handoff_record", "urgent_safe_response", "audit_event"],
      missingEvidence: [],
      refusalOrEscalationFlag: safety.flag,
      rationale: safety.rationale
    };
  }
  if (safety.flag === "refusal") {
    return {
      schemaVersion: 1,
      classifier: "curated_healthcare_intent_v1",
      intent: "safety_refusal",
      workflow: "blocked_by_input_policy",
      confidence: 1,
      requiredEvidence: [],
      missingEvidence: [],
      refusalOrEscalationFlag: safety.flag,
      rationale: safety.rationale
    };
  }
  if (safety.flag === "escalation_required") {
    return {
      schemaVersion: 1,
      classifier: "curated_healthcare_intent_v1",
      intent: "approval_gated_action_request",
      workflow: WORKFLOW_KEYS.HUMAN_APPROVAL,
      confidence: 0.95,
      requiredEvidence: WORKFLOW_EVIDENCE[WORKFLOW_KEYS.HUMAN_APPROVAL],
      missingEvidence: missingEvidenceFor(WORKFLOW_KEYS.HUMAN_APPROVAL, contextPacket),
      refusalOrEscalationFlag: safety.flag,
      rationale: safety.rationale
    };
  }

  const ranked = RULES.map((rule) => scoreRule(rule, cleanMessage)).sort((a, b) => b.score - a.score);
  const winner = ranked[0];
  const selected =
    winner.score > 0
      ? winner
      : {
          intent: "eligibility_benefits_question",
          workflow: WORKFLOW_KEYS.ELIGIBILITY,
          evidence: WORKFLOW_EVIDENCE[WORKFLOW_KEYS.ELIGIBILITY],
          score: 0,
          matchedPatterns: 0
        };
  return {
    schemaVersion: 1,
    classifier: "curated_healthcare_intent_v1",
    intent: selected.intent,
    workflow: selected.workflow,
    confidence: confidenceFromScore(selected.score),
    requiredEvidence: selected.evidence,
    missingEvidence: missingEvidenceFor(selected.workflow, contextPacket),
    refusalOrEscalationFlag: safety.flag,
    rationale:
      selected.score > 0
        ? `Matched ${selected.matchedPatterns} curated healthcare routing signal(s) for ${selected.workflow}.`
        : "No high-specificity workflow signal matched; defaulted to eligibility and benefits as the first MVP journey."
  };
}

export { WORKFLOW_KEYS };
