import { createHash, randomUUID } from "node:crypto";

export const CASE_STATE_SCHEMA_VERSION = "brainstyworkers.case_state.v1";
export const PEMS_SCHEMA_VERSION = "brainstyworkers.pems.v1";
export const CONTINUOUS_INTELLIGENCE_SHADOW_VERSION = "2026-06-18.phase33-continuous-intelligence-shadow.v1";
export const CONTINUOUS_INTELLIGENCE_PERSISTENCE_VERSION = "2026-06-18.phase34-shadow-persistence.v1";
export const PEMS_PROMOTION_GATE_VERSION = "2026-06-18.phase35-pems-supervised-promotion-gate.v1";
export const PEMS_REVIEW_WORKBENCH_VERSION = "2026-06-18.phase36-pems-reviewer-evaluator-workbench.v1";

export const UNIVERSAL_CASE_GATES = Object.freeze([
  { id: "G0", key: "intake", title: "Intake Bound" },
  { id: "G1", key: "eligibility", title: "User And Policy Eligible" },
  { id: "G2", key: "plan_loaded", title: "Plan Or Evidence Context Loaded" },
  { id: "G3", key: "status", title: "Intent And Workflow Status Known" },
  { id: "G4", key: "rule_match", title: "Rule Or Skill Match Available" },
  { id: "G5", key: "pre_auth", title: "Approval Boundary Checked" },
  { id: "G6", key: "scenario", title: "Procedural Scenario Reconstructed" },
  { id: "G7", key: "validate", title: "Evidence And Safety Validated" },
  { id: "G8", key: "decide_escalate", title: "Decision Or Escalation Ready" }
]);

const PEMS_TRUST_THRESHOLD = 85;
const PEMS_MIN_SHADOW_RUNS = 10;
const PEMS_MIN_REVIEWER_APPROVALS = 2;
const PEMS_MIN_VALIDATOR_EVALUATIONS = 1;
const PEMS_MIN_CITATION_EVALUATIONS = 1;

function hashText(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function stableRef(prefix, ...parts) {
  return `${prefix}_${hashText(parts.filter((part) => part !== null && part !== undefined).join("|")).slice(0, 16)}`;
}

function createPersistedId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function safeHostHash(url) {
  try {
    return hashText(new URL(String(url)).host).slice(0, 16);
  } catch {
    return null;
  }
}

function safePreview(value, limit = 120) {
  return String(value ?? "")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, "[identifier]")
    .replace(/\b\d{8,}\b/g, "[identifier]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function sourcePointerRef(pointer) {
  return {
    table: pointer?.table ?? null,
    id: pointer?.id ?? null,
    sourceHostHash: safeHostHash(pointer?.sourceUrl ?? pointer?.source_url),
    contentHash: pointer?.contentHash ?? pointer?.content_hash ?? null,
    extractionHash: pointer?.extractionHash ?? pointer?.extraction_hash ?? null
  };
}

function compactSelectedSkill(dynamicSkillContext) {
  const selected = dynamicSkillContext?.selected;
  if (!selected) return null;
  return {
    journeySkillKey: selected.journeySkillKey ?? null,
    executionSkillKey: selected.executionSkillKey ?? null,
    insuranceSkillKey: selected.insuranceSkillKey ?? null,
    reason: selected.reason ?? null
  };
}

function compactWorkerProposal(proposal) {
  if (!proposal) return null;
  return {
    status: proposal.status ?? null,
    selectedSkill: proposal.selectedSkill?.skillKey ?? proposal.selectedSkillKey ?? null,
    selectedExecutor: proposal.selectedExecutor?.executorKey ?? null,
    approvalRequired: Boolean(proposal.approvalRequired ?? proposal.approval?.required),
    blockedActions: proposal.blockedActions ?? proposal.policy?.blockedActions ?? [],
    terminalOutcome: proposal.terminalOutcome ?? null
  };
}

export function buildCaseState({
  userId,
  sessionId,
  graphTraceId,
  channel,
  userInput,
  contextPacket,
  policyResult,
  structuredIntent,
  llmDecision,
  workflow,
  routeReason,
  workflowRoute,
  dynamicSkillContext,
  openclawTaskProposal,
  approvalResume,
  evidenceObservation,
  sourcePointers = [],
  productMemoryRecall,
  productMemoryRetain,
  uploadedDocumentContext,
  researchEvidence,
  workflowOutcome,
  finalResponse
} = {}) {
  const inputHash = hashText(userInput);
  const pointerRefs = sourcePointers.map(sourcePointerRef);
  const portalAccount = contextPacket?.portalAccount;
  const uploadedDocuments = uploadedDocumentContext?.documents ?? uploadedDocumentContext?.uploadedDocuments ?? [];
  return {
    schemaVersion: CASE_STATE_SCHEMA_VERSION,
    mode: "shadow_only",
    productionDrivingAllowed: false,
    caseRef: stableRef("case", userId, sessionId, graphTraceId, inputHash),
    identifiers: {
      userId: userId ?? contextPacket?.user?.id ?? null,
      sessionId: sessionId ?? null,
      graphTraceId: graphTraceId ?? null
    },
    intake: {
      channel: channel ?? "local_web_chat",
      inputHash,
      inputLength: String(userInput ?? "").length,
      rawInputStored: false
    },
    context: {
      localMemoryItemCount: contextPacket?.memoryItems?.length ?? 0,
      productMemoryAdapter: productMemoryRecall?.adapter ?? productMemoryRetain?.adapter ?? "disabled",
      productMemoryFactCount: productMemoryRecall?.facts?.length ?? 0,
      cortexProductMemory: false,
      portalAccountRef: portalAccount
        ? {
            id: portalAccount.id ?? null,
            payer: portalAccount.payer ?? null,
            status: portalAccount.status ?? null,
            portalHostHash: safeHostHash(portalAccount.portalUrl)
          }
        : null,
      routeCandidateCount: contextPacket?.workflowArchitecture?.routeCandidates?.length ?? 0
    },
    decision: {
      policyAllowed: policyResult?.allowed ?? null,
      urgentEscalationRequired: Boolean(policyResult?.urgentEscalationRequired),
      intent: structuredIntent?.intent ?? structuredIntent?.primary_intent ?? null,
      workflow: workflow ?? structuredIntent?.workflow ?? null,
      routeReason: routeReason ?? null,
      routeExecutableNow: workflowRoute?.executableNow ?? null,
      classifierConfidence: structuredIntent?.confidence ?? null,
      llmMode: llmDecision?.mode ?? null,
      llmUsedByRouter: Boolean(llmDecision?.usedByRouter)
    },
    skill: {
      selected: compactSelectedSkill(dynamicSkillContext),
      successEstimate: dynamicSkillContext?.successEstimate ?? null,
      requiredOpenClawTasks: dynamicSkillContext?.requiredOpenClawTasks ?? [],
      proposal: compactWorkerProposal(openclawTaskProposal)
    },
    approval: {
      status: approvalResume?.status ?? null,
      approvalTokenConsumed: Boolean(approvalResume?.consumed),
      requiredScopes: [
        ...(openclawTaskProposal?.approvalRequirement?.scopes ?? []),
        ...(openclawTaskProposal?.approval?.scopes ?? []),
        ...(openclawTaskProposal?.approvalsRequired ?? [])
      ].filter(Boolean),
      humanOnlyInteractiveTakeover: true
    },
    evidence: {
      status: evidenceObservation?.status ?? null,
      terminalOutcome: evidenceObservation?.terminalOutcome ?? null,
      actionsTaken: evidenceObservation?.actionsTaken ?? [],
      sourcePointerCount: pointerRefs.length,
      sourcePointerRefs: pointerRefs,
      uploadedDocumentCount: uploadedDocuments.length,
      researchEvidenceStatus: researchEvidence?.status ?? null
    },
    outcome: {
      workflowOutcome: workflowOutcome ?? null,
      finalResponsePrepared: Boolean(finalResponse),
      canDriveRecommendation: false
    }
  };
}

function gate(id, title, status, checks, details = {}) {
  return {
    id,
    title,
    status,
    passed: status === "pass",
    checks,
    ...details
  };
}

export function evaluateUniversalCaseGates(caseState) {
  const hasInput = Boolean(caseState?.intake?.inputHash && caseState.intake.inputLength > 0);
  const hasSession = Boolean(caseState?.identifiers?.sessionId && caseState?.identifiers?.userId);
  const policyAllowed = caseState?.decision?.policyAllowed !== false;
  const hasEvidenceContext =
    Boolean(caseState?.context?.portalAccountRef) ||
    caseState?.evidence?.uploadedDocumentCount > 0 ||
    caseState?.evidence?.sourcePointerCount > 0 ||
    caseState?.context?.routeCandidateCount > 0;
  const hasWorkflow = Boolean(caseState?.decision?.workflow);
  const hasSkillOrRoute = Boolean(caseState?.skill?.selected || caseState?.decision?.routeReason);
  const requiresApproval =
    caseState?.skill?.requiredOpenClawTasks?.length > 0 ||
    caseState?.skill?.proposal?.approvalRequired ||
    caseState?.approval?.requiredScopes?.length > 0;
  const approvalChecked = !requiresApproval || Boolean(caseState?.approval?.status || caseState?.approval?.humanOnlyInteractiveTakeover);
  const hasSourceOrSafeBlocker =
    caseState?.evidence?.sourcePointerCount > 0 ||
    ["blocked", "blocked_no_authenticated_evidence", "blocked_missing_context", "not_requested", "captured_trusted_research_evidence"].some((status) =>
      String(caseState?.evidence?.status ?? "").startsWith(status)
    );
  const hasOutcome = Boolean(caseState?.outcome?.workflowOutcome || caseState?.outcome?.finalResponsePrepared);

  return [
    gate("G0", "Intake Bound", hasInput && hasSession ? "pass" : "block", {
      inputHashPresent: hasInput,
      userAndSessionBound: hasSession,
      rawInputStored: caseState?.intake?.rawInputStored === true
    }),
    gate("G1", "User And Policy Eligible", policyAllowed ? "pass" : "block", {
      policyAllowed,
      urgentEscalationRequired: Boolean(caseState?.decision?.urgentEscalationRequired)
    }),
    gate("G2", "Plan Or Evidence Context Loaded", hasEvidenceContext ? "pass" : "pending", {
      portalAccountRefPresent: Boolean(caseState?.context?.portalAccountRef),
      uploadedDocumentCount: caseState?.evidence?.uploadedDocumentCount ?? 0,
      sourcePointerCount: caseState?.evidence?.sourcePointerCount ?? 0,
      routeCandidateCount: caseState?.context?.routeCandidateCount ?? 0
    }),
    gate("G3", "Intent And Workflow Status Known", hasWorkflow ? "pass" : "pending", {
      workflow: caseState?.decision?.workflow ?? null,
      intent: caseState?.decision?.intent ?? null,
      classifierConfidence: caseState?.decision?.classifierConfidence ?? null,
      llmUsedByRouter: Boolean(caseState?.decision?.llmUsedByRouter)
    }),
    gate("G4", "Rule Or Skill Match Available", hasSkillOrRoute ? "pass" : "pending", {
      selectedSkill: caseState?.skill?.selected ?? null,
      routeReason: caseState?.decision?.routeReason ?? null,
      successEstimate: caseState?.skill?.successEstimate ?? null
    }),
    gate("G5", "Approval Boundary Checked", approvalChecked ? "pass" : "pending", {
      requiresApproval,
      approvalStatus: caseState?.approval?.status ?? null,
      approvalTokenConsumed: Boolean(caseState?.approval?.approvalTokenConsumed),
      humanOnlyInteractiveTakeover: Boolean(caseState?.approval?.humanOnlyInteractiveTakeover)
    }),
    gate("G6", "Procedural Scenario Reconstructed", "pending", {
      reconstructionMode: "shadow_only",
      productionDrivingAllowed: false
    }),
    gate("G7", "Evidence And Safety Validated", hasSourceOrSafeBlocker ? "pass" : "pending", {
      evidenceStatus: caseState?.evidence?.status ?? null,
      sourcePointerCount: caseState?.evidence?.sourcePointerCount ?? 0,
      rawSourceReturned: false
    }),
    gate("G8", "Decision Or Escalation Ready", hasOutcome ? "pass" : "pending", {
      workflowOutcome: caseState?.outcome?.workflowOutcome ?? null,
      finalResponsePrepared: Boolean(caseState?.outcome?.finalResponsePrepared),
      canDriveRecommendation: false
    })
  ];
}

export function scorePemsMaturity({
  candidateId,
  shadowRuns = 0,
  evidenceRefCount = 0,
  successfulOutcomeCount = 0,
  reviewerApprovals = 0,
  authorityCitationCount = 0,
  validatorPassCount = 0,
  safetyIncidentCount = 0,
  freshnessDays = 0
} = {}) {
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        Math.min(shadowRuns, 12) * 4 +
          Math.min(evidenceRefCount, 8) * 4 +
          Math.min(successfulOutcomeCount, 8) * 4 +
          Math.min(reviewerApprovals, 4) * 6 +
          Math.min(authorityCitationCount, 8) * 2 +
          Math.min(validatorPassCount, 8) * 2 +
          (freshnessDays <= 30 ? 8 : freshnessDays <= 90 ? 4 : 0) -
          safetyIncidentCount * 35
      )
    )
  );
  const trusted =
    score >= PEMS_TRUST_THRESHOLD &&
    shadowRuns >= PEMS_MIN_SHADOW_RUNS &&
    reviewerApprovals >= PEMS_MIN_REVIEWER_APPROVALS &&
    safetyIncidentCount === 0;
  return {
    schemaVersion: PEMS_SCHEMA_VERSION,
    candidateId: candidateId ?? "procedural_skill_candidate",
    score,
    target: PEMS_TRUST_THRESHOLD,
    trusted,
    minimums: {
      shadowRuns: PEMS_MIN_SHADOW_RUNS,
      reviewerApprovals: PEMS_MIN_REVIEWER_APPROVALS,
      safetyIncidentCount: 0
    },
    inputs: {
      shadowRuns,
      evidenceRefCount,
      successfulOutcomeCount,
      reviewerApprovals,
      authorityCitationCount,
      validatorPassCount,
      safetyIncidentCount,
      freshnessDays
    },
    status: trusted ? "trusted_procedural_skill_candidate" : "shadow_or_review_required"
  };
}

export function reconstructProceduralScenarioShadow(caseState, gates) {
  const gateTags = gates.map((item) => `${item.id}:${item.status}`);
  const candidateId = stableRef("pems", caseState?.decision?.workflow ?? "unknown", caseState?.skill?.selected?.executionSkillKey ?? "none");
  const pems = scorePemsMaturity({
    candidateId,
    shadowRuns: 1,
    evidenceRefCount: caseState?.evidence?.sourcePointerCount ?? 0,
    successfulOutcomeCount: caseState?.outcome?.workflowOutcome ? 1 : 0,
    reviewerApprovals: 0,
    authorityCitationCount: caseState?.evidence?.sourcePointerCount ?? 0,
    validatorPassCount: gates.filter((item) => item.passed).length,
    safetyIncidentCount: caseState?.decision?.policyAllowed === false ? 1 : 0,
    freshnessDays: 0
  });
  return {
    mode: "shadow_only",
    reconstructionPattern: "cue_tag_content_reconstruct_not_retrieve",
    candidateId,
    cue: {
      workflow: caseState?.decision?.workflow ?? null,
      routeReason: caseState?.decision?.routeReason ?? null,
      selectedSkill: caseState?.skill?.selected?.executionSkillKey ?? null
    },
    tags: gateTags,
    contentRefs: [
      ...(caseState?.evidence?.sourcePointerRefs ?? []).map((pointer) => `${pointer.table}:${pointer.id}`),
      caseState?.context?.portalAccountRef?.id ? `portal_accounts:${caseState.context.portalAccountRef.id}` : null
    ].filter(Boolean),
    pems,
    productionDrivingAllowed: false
  };
}

function selectedSkillKey(caseState) {
  return (
    caseState?.skill?.selected?.executionSkillKey ??
    caseState?.skill?.selected?.journeySkillKey ??
    caseState?.skill?.selected?.insuranceSkillKey ??
    null
  );
}

function isSuccessfulOutcome(caseState) {
  const outcome = String(caseState?.outcome?.workflowOutcome ?? "").toLowerCase();
  if (!outcome) return caseState?.outcome?.finalResponsePrepared === true;
  return !/\b(blocked|failed|refused|unavailable|urgent|handoff)\b/.test(outcome);
}

function safetyIncidentCountForCase(caseState) {
  if (caseState?.decision?.policyAllowed === false) return 1;
  if (caseState?.decision?.urgentEscalationRequired) return 1;
  if (caseState?.intake?.rawInputStored === true) return 1;
  if (caseState?.outcome?.canDriveRecommendation === true) return 1;
  return 0;
}

function rowNumber(value) {
  return Number(value ?? 0);
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(String(value ?? ""));
  } catch {
    return fallback;
  }
}

function jsonValue(value, fallback = {}) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return parseJson(value, fallback);
  return value;
}

function pemsInputsFromAggregate(aggregate) {
  return {
    candidateId: aggregate.candidateId,
    shadowRuns: aggregate.shadowRunCount,
    evidenceRefCount: aggregate.evidenceRefCount,
    successfulOutcomeCount: aggregate.successfulOutcomeCount,
    reviewerApprovals: aggregate.reviewerApprovalCount,
    authorityCitationCount: aggregate.authorityCitationCount,
    validatorPassCount: aggregate.validatorPassCount,
    safetyIncidentCount: aggregate.safetyIncidentCount,
    freshnessDays: 0
  };
}

function normalizeReviewType(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["human_review", "validator_evaluation", "citation_evaluation", "safety_review"].includes(normalized)) return normalized;
  throw new Error(`Unsupported PEMS promotion review type: ${value}`);
}

function normalizeReviewDecision(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["approved", "rejected", "pass", "fail", "blocked"].includes(normalized)) return normalized;
  throw new Error(`Unsupported PEMS promotion review decision: ${value}`);
}

function normalizeEvaluatorDraftType(value) {
  const normalized = String(value ?? "evaluator_draft_note").trim().toLowerCase();
  if (["evaluator_draft_note", "nestr_consistency_trace", "reviewer_diff"].includes(normalized)) return normalized;
  throw new Error(`Unsupported PEMS evaluator draft type: ${value}`);
}

function normalizeEvaluatorMode(value) {
  const normalized = String(value ?? "deterministic_validator_advisory").trim().toLowerCase();
  if (["deterministic_validator_advisory", "llm_assisted_advisory", "nestr_consistency_trace"].includes(normalized)) return normalized;
  throw new Error(`Unsupported PEMS evaluator mode: ${value}`);
}

function normalizeValidatorStatus(value) {
  const normalized = String(value ?? "pending").trim().toLowerCase();
  if (["pass", "fail", "blocked", "pending"].includes(normalized)) return normalized;
  throw new Error(`Unsupported PEMS deterministic validator status: ${value}`);
}

function advisoryDraftStatus({ deterministicValidatorStatus, suggestedDecision }) {
  if (["fail", "blocked"].includes(deterministicValidatorStatus)) return "blocked_by_validator";
  if (["rejected", "fail", "blocked"].includes(suggestedDecision)) return "needs_reviewer_attention";
  return "draft_ready_for_human_review";
}

function reviewCount(reviews, predicate) {
  return reviews.filter(predicate).length;
}

function maturityValue(maturity, snakeKey, camelKey, fallback = 0) {
  return rowNumber(maturity?.[snakeKey] ?? maturity?.[camelKey] ?? fallback);
}

export function evaluatePemsPromotionGate(maturity = {}, reviews = []) {
  const normalizedReviews = reviews.map((review) => ({
    reviewType: String(review.review_type ?? review.reviewType ?? "").toLowerCase(),
    decision: String(review.decision ?? "").toLowerCase(),
    evidenceRefCount: rowNumber(review.evidence_ref_count ?? review.evidenceRefCount),
    validatorPassCount: rowNumber(review.validator_pass_count ?? review.validatorPassCount),
    safetyIncidentCount: rowNumber(review.safety_incident_count ?? review.safetyIncidentCount)
  }));
  const humanApprovals = reviewCount(normalizedReviews, (review) => review.reviewType === "human_review" && review.decision === "approved");
  const humanRejections = reviewCount(normalizedReviews, (review) => review.reviewType === "human_review" && ["rejected", "blocked"].includes(review.decision));
  const validatorPasses = reviewCount(normalizedReviews, (review) => review.reviewType === "validator_evaluation" && review.decision === "pass");
  const validatorFailures = reviewCount(normalizedReviews, (review) => review.reviewType === "validator_evaluation" && ["fail", "blocked"].includes(review.decision));
  const citationPasses = reviewCount(normalizedReviews, (review) => review.reviewType === "citation_evaluation" && review.decision === "pass");
  const citationFailures = reviewCount(normalizedReviews, (review) => review.reviewType === "citation_evaluation" && ["fail", "blocked"].includes(review.decision));
  const citationEvidenceRefCount = normalizedReviews
    .filter((review) => review.reviewType === "citation_evaluation" && review.decision === "pass")
    .reduce((sum, review) => sum + review.evidenceRefCount, 0);
  const reviewSafetyIncidentCount =
    normalizedReviews.reduce((sum, review) => sum + review.safetyIncidentCount, 0) +
    reviewCount(normalizedReviews, (review) => review.reviewType === "safety_review" && ["fail", "blocked", "rejected"].includes(review.decision));
  const safetyIncidentCount = maturityValue(maturity, "safety_incident_count", "safetyIncidentCount") + reviewSafetyIncidentCount;
  const latestScore = maturityValue(maturity, "latest_score", "latestScore");
  const shadowRunCount = maturityValue(maturity, "shadow_run_count", "shadowRunCount");
  const evidenceRefCount = maturityValue(maturity, "evidence_ref_count", "evidenceRefCount");
  const productionDrivingAllowed =
    maturity?.production_driving_allowed === 1 || maturity?.productionDrivingAllowed === true || maturity?.productionDrivingAllowed === "true";
  const requirements = [
    { key: "maturity_score", ok: latestScore >= PEMS_TRUST_THRESHOLD, actual: latestScore, target: PEMS_TRUST_THRESHOLD },
    { key: "shadow_runs", ok: shadowRunCount >= PEMS_MIN_SHADOW_RUNS, actual: shadowRunCount, target: PEMS_MIN_SHADOW_RUNS },
    { key: "human_reviewer_approvals", ok: humanApprovals >= PEMS_MIN_REVIEWER_APPROVALS, actual: humanApprovals, target: PEMS_MIN_REVIEWER_APPROVALS },
    { key: "validator_evaluation_passes", ok: validatorPasses >= PEMS_MIN_VALIDATOR_EVALUATIONS && validatorFailures === 0, actual: validatorPasses, target: PEMS_MIN_VALIDATOR_EVALUATIONS },
    { key: "citation_evaluation_passes", ok: citationPasses >= PEMS_MIN_CITATION_EVALUATIONS && citationFailures === 0, actual: citationPasses, target: PEMS_MIN_CITATION_EVALUATIONS },
    { key: "citation_evidence_refs", ok: citationEvidenceRefCount > 0 || evidenceRefCount > 0, actual: Math.max(citationEvidenceRefCount, evidenceRefCount), target: 1 },
    { key: "safety_incidents", ok: safetyIncidentCount === 0 && humanRejections === 0, actual: safetyIncidentCount + humanRejections, target: 0 },
    { key: "production_driving_disabled", ok: !productionDrivingAllowed, actual: productionDrivingAllowed ? 1 : 0, target: 0 }
  ];
  const supervisedAdvisoryAllowed = requirements.every((requirement) => requirement.ok);
  return {
    version: PEMS_PROMOTION_GATE_VERSION,
    status: supervisedAdvisoryAllowed ? "supervised_advisory_allowed" : safetyIncidentCount > 0 ? "safety_veto" : "shadow_review_required",
    ok: supervisedAdvisoryAllowed,
    supervisedAdvisoryAllowed,
    productionDrivingAllowed: false,
    candidateId: maturity?.candidate_id ?? maturity?.candidateId ?? null,
    counts: {
      humanApprovals,
      humanRejections,
      validatorPasses,
      validatorFailures,
      citationPasses,
      citationFailures,
      citationEvidenceRefCount,
      safetyIncidentCount,
      reviewCount: normalizedReviews.length
    },
    requirements,
    safety: {
      rawRationaleStored: false,
      rawSourceStored: false,
      supervisedAdvisoryOnly: true,
      productionDrivingAllowed: false
    }
  };
}

async function listPemsPromotionReviewsForCandidate(store, candidateId) {
  return store.all(
    `SELECT id, candidate_id, actor_user_id, review_type, decision, evidence_ref_count,
            validator_pass_count, safety_incident_count, rationale_hash, rationale_preview,
            metadata_json, created_at
       FROM pems_candidate_promotion_reviews
      WHERE candidate_id = ?
      ORDER BY created_at ASC;`,
    [candidateId]
  );
}

export async function recordPemsPromotionReview(
  store,
  {
    candidateId,
    actorUserId = "operator",
    reviewType,
    decision,
    evidenceRefCount = 0,
    validatorPassCount = 0,
    safetyIncidentCount = 0,
    rationale = "",
    advisoryDraftId = null,
    metadata = {},
    createdAt = new Date().toISOString()
  } = {}
) {
  if (!store) throw new Error("A store is required to record a PEMS promotion review.");
  const normalizedCandidateId = String(candidateId ?? "").trim();
  if (!normalizedCandidateId) throw new Error("PEMS promotion review requires candidateId.");
  const normalizedReviewType = normalizeReviewType(reviewType);
  const normalizedDecision = normalizeReviewDecision(decision);
  return store.transaction(async (tx) => {
    const existing = await tx.findOne("pems_candidate_maturity", { candidate_id: normalizedCandidateId });
    if (!existing) throw new Error(`PEMS candidate not found: ${normalizedCandidateId}`);
    let advisoryDraft = null;
    if (advisoryDraftId) {
      advisoryDraft = await tx.findOne("pems_candidate_evaluator_drafts", { id: String(advisoryDraftId) });
      if (!advisoryDraft) throw new Error(`PEMS evaluator draft not found: ${advisoryDraftId}`);
      if (advisoryDraft.candidate_id !== normalizedCandidateId) {
        throw new Error(`PEMS evaluator draft does not belong to candidate: ${normalizedCandidateId}`);
      }
    }
    const review = await tx.insert("pems_candidate_promotion_reviews", {
      id: createPersistedId("pems_review"),
      candidate_id: normalizedCandidateId,
      actor_user_id: actorUserId ? String(actorUserId) : null,
      review_type: normalizedReviewType,
      decision: normalizedDecision,
      evidence_ref_count: Math.max(0, rowNumber(evidenceRefCount)),
      validator_pass_count: Math.max(0, rowNumber(validatorPassCount)),
      safety_incident_count: Math.max(0, rowNumber(safetyIncidentCount)),
      rationale_hash: hashText(rationale),
      rationale_preview: safePreview(rationale),
      metadata_json: JSON.stringify({
        ...jsonValue(metadata, {}),
        advisoryDraftId: advisoryDraft?.id ?? null,
        advisoryMaterialRef: advisoryDraft ? stableRef("pems_advisory_material", advisoryDraft.id, advisoryDraft.consistency_trace_hash) : null,
        advisoryOnly: Boolean(advisoryDraft),
        rawRationaleStored: false,
        productionDrivingAllowed: false
      }),
      created_at: createdAt
    });
    const reviews = await listPemsPromotionReviewsForCandidate(tx, normalizedCandidateId);
    const reviewerApprovalCount = reviewCount(
      reviews.map((item) => ({ review_type: item.review_type, decision: item.decision })),
      (item) => item.review_type === "human_review" && item.decision === "approved"
    );
    const aggregate = {
      candidateId: existing.candidate_id,
      shadowRunCount: rowNumber(existing.shadow_run_count),
      evidenceRefCount: rowNumber(existing.evidence_ref_count),
      successfulOutcomeCount: rowNumber(existing.successful_outcome_count),
      reviewerApprovalCount,
      authorityCitationCount: rowNumber(existing.authority_citation_count),
      validatorPassCount: rowNumber(existing.validator_pass_count),
      safetyIncidentCount: rowNumber(existing.safety_incident_count)
    };
    const maturity = scorePemsMaturity(pemsInputsFromAggregate(aggregate));
    const gate = evaluatePemsPromotionGate({ ...existing, latest_score: maturity.score, reviewer_approval_count: reviewerApprovalCount }, reviews);
    await tx.update(
      "pems_candidate_maturity",
      {
        reviewer_approval_count: reviewerApprovalCount,
        latest_score: maturity.score,
        trusted: maturity.trusted ? 1 : 0,
        supervised_advisory_allowed: gate.supervisedAdvisoryAllowed ? 1 : 0,
        promotion_status: gate.status,
        last_reviewed_at: createdAt,
        production_driving_allowed: 0,
        maturity_json: JSON.stringify({
          version: CONTINUOUS_INTELLIGENCE_PERSISTENCE_VERSION,
          pems: maturity,
          aggregate,
          productionDrivingAllowed: false
        }),
        promotion_json: JSON.stringify(gate),
        updated_at: createdAt
      },
      { candidate_id: normalizedCandidateId }
    );
    return {
      version: PEMS_PROMOTION_GATE_VERSION,
      review: {
        ...review,
        rationale: undefined,
        rawRationaleStored: false
      },
      gate,
      maturity,
      productionDrivingAllowed: false
    };
  });
}

export async function createPemsEvaluatorDraft(
  store,
  {
    candidateId,
    actorUserId = "evaluator",
    draftType = "evaluator_draft_note",
    evaluatorMode = "deterministic_validator_advisory",
    deterministicValidatorStatus = "pending",
    suggestedReviewType = "validator_evaluation",
    suggestedDecision = "blocked",
    advisoryNote = "",
    consistencyTrace = {},
    metadata = {},
    createdAt = new Date().toISOString()
  } = {}
) {
  if (!store) throw new Error("A store is required to create a PEMS evaluator draft.");
  const normalizedCandidateId = String(candidateId ?? "").trim();
  if (!normalizedCandidateId) throw new Error("PEMS evaluator draft requires candidateId.");
  const normalizedDraftType = normalizeEvaluatorDraftType(draftType);
  const normalizedEvaluatorMode = normalizeEvaluatorMode(evaluatorMode);
  const normalizedValidatorStatus = normalizeValidatorStatus(deterministicValidatorStatus);
  const normalizedSuggestedReviewType = normalizeReviewType(suggestedReviewType);
  const normalizedSuggestedDecision = normalizeReviewDecision(suggestedDecision);
  const traceText = typeof consistencyTrace === "string" ? consistencyTrace : JSON.stringify(consistencyTrace ?? {});
  const traceHash = hashText(traceText);
  const status = advisoryDraftStatus({
    deterministicValidatorStatus: normalizedValidatorStatus,
    suggestedDecision: normalizedSuggestedDecision
  });

  return store.transaction(async (tx) => {
    const existing = await tx.findOne("pems_candidate_maturity", { candidate_id: normalizedCandidateId });
    if (!existing) throw new Error(`PEMS candidate not found: ${normalizedCandidateId}`);
    const draft = await tx.insert("pems_candidate_evaluator_drafts", {
      id: createPersistedId("pems_eval_draft"),
      candidate_id: normalizedCandidateId,
      actor_user_id: actorUserId ? String(actorUserId) : null,
      draft_type: normalizedDraftType,
      evaluator_mode: normalizedEvaluatorMode,
      status,
      deterministic_validator_status: normalizedValidatorStatus,
      suggested_review_type: normalizedSuggestedReviewType,
      suggested_decision: normalizedSuggestedDecision,
      advisory_note_hash: hashText(advisoryNote),
      advisory_note_preview: safePreview(advisoryNote, 160),
      consistency_trace_ref: stableRef("pems_consistency_trace", normalizedCandidateId, traceHash),
      consistency_trace_hash: traceHash,
      consistency_trace_preview: safePreview(traceText, 160),
      metadata_json: JSON.stringify({
        ...jsonValue(metadata, {}),
        phase: 36,
        advisoryOnly: true,
        rawAdvisoryNoteStored: false,
        rawConsistencyTraceStored: false,
        deterministicValidatorAuthority: true,
        humanReviewerAuthority: true,
        productionDrivingAllowed: false
      }),
      created_at: createdAt,
      updated_at: createdAt
    });
    return {
      version: PEMS_REVIEW_WORKBENCH_VERSION,
      draft: {
        ...draft,
        advisoryNote: undefined,
        consistencyTrace: undefined,
        rawAdvisoryNoteStored: false,
        rawConsistencyTraceStored: false
      },
      candidate: {
        candidateId: existing.candidate_id,
        promotionStatus: existing.promotion_status ?? "shadow_review_required",
        supervisedAdvisoryAllowed: existing.supervised_advisory_allowed === 1,
        productionDrivingAllowed: false
      },
      advisoryOnly: true,
      productionDrivingAllowed: false
    };
  });
}

export function summarizeContinuousIntelligenceShadowForPersistence(shadow) {
  return {
    version: shadow?.version ?? CONTINUOUS_INTELLIGENCE_SHADOW_VERSION,
    mode: shadow?.mode ?? "shadow_only",
    productionDrivingAllowed: false,
    caseState: shadow?.caseState ?? null,
    gateSummary: shadow?.gateSummary ?? null,
    gates: (shadow?.gates ?? []).map((item) => ({
      id: item.id,
      status: item.status,
      passed: Boolean(item.passed),
      checks: item.checks ?? {}
    })),
    proceduralReconstruction: {
      mode: shadow?.proceduralReconstruction?.mode ?? "shadow_only",
      reconstructionPattern: shadow?.proceduralReconstruction?.reconstructionPattern ?? null,
      candidateId: shadow?.proceduralReconstruction?.candidateId ?? shadow?.pems?.candidateId ?? null,
      cue: shadow?.proceduralReconstruction?.cue ?? null,
      tags: shadow?.proceduralReconstruction?.tags ?? [],
      contentRefs: shadow?.proceduralReconstruction?.contentRefs ?? [],
      productionDrivingAllowed: false
    },
    pems: shadow?.pems ?? null,
    safety: {
      ...(shadow?.safety ?? {}),
      rawInputReturned: false,
      rawSourceReturned: false,
      shadowOnly: true,
      finalAnswerDecisioningChanged: false
    }
  };
}

export function buildContinuousIntelligenceShadow(input = {}) {
  const caseState = input.caseState ?? buildCaseState(input);
  const gates = evaluateUniversalCaseGates(caseState);
  const reconstruction = reconstructProceduralScenarioShadow(caseState, gates);
  const passed = gates.filter((item) => item.passed).length;
  return {
    version: CONTINUOUS_INTELLIGENCE_SHADOW_VERSION,
    mode: "shadow_only",
    productionDrivingAllowed: false,
    caseState,
    gates,
    gateSummary: {
      passed,
      total: gates.length,
      score: Math.round((passed / gates.length) * 100),
      pending: gates.filter((item) => item.status === "pending").map((item) => item.id),
      blocked: gates.filter((item) => item.status === "block").map((item) => item.id)
    },
    proceduralReconstruction: reconstruction,
    pems: reconstruction.pems,
    safety: {
      cortexProductMemory: false,
      rawInputReturned: false,
      rawSourceReturned: false,
      shadowOnly: true,
      finalAnswerDecisioningChanged: false
    }
  };
}

export async function persistContinuousIntelligenceShadowRun(store, { user, session, graphTraceId, shadow, createdAt = new Date().toISOString() } = {}) {
  if (!store) throw new Error("A store is required to persist continuous-intelligence shadow runs.");
  const safeShadow = summarizeContinuousIntelligenceShadowForPersistence(shadow);
  const caseState = safeShadow.caseState;
  if (!caseState?.caseRef) throw new Error("Cannot persist continuous-intelligence shadow without a caseRef.");
  const candidateId = safeShadow.pems?.candidateId ?? safeShadow.proceduralReconstruction?.candidateId;
  if (!candidateId) throw new Error("Cannot persist continuous-intelligence shadow without a PEMS candidate id.");

  return store.transaction(async (tx) => {
    const existing = await tx.findOne("pems_candidate_maturity", { candidate_id: candidateId });
    const aggregate = {
      candidateId,
      workflow: caseState.decision?.workflow ?? null,
      selectedSkillKey: selectedSkillKey(caseState),
      shadowRunCount: rowNumber(existing?.shadow_run_count) + 1,
      evidenceRefCount: rowNumber(existing?.evidence_ref_count) + (caseState.evidence?.sourcePointerCount ?? 0),
      successfulOutcomeCount: rowNumber(existing?.successful_outcome_count) + (isSuccessfulOutcome(caseState) ? 1 : 0),
      reviewerApprovalCount: rowNumber(existing?.reviewer_approval_count),
      authorityCitationCount: rowNumber(existing?.authority_citation_count) + (caseState.evidence?.sourcePointerCount ?? 0),
      validatorPassCount: rowNumber(existing?.validator_pass_count) + (safeShadow.gateSummary?.passed ?? 0),
      safetyIncidentCount: rowNumber(existing?.safety_incident_count) + safetyIncidentCountForCase(caseState)
    };
    const maturity = scorePemsMaturity(pemsInputsFromAggregate(aggregate));
    const maturityJson = JSON.stringify({
      version: CONTINUOUS_INTELLIGENCE_PERSISTENCE_VERSION,
      pems: maturity,
      aggregate,
      productionDrivingAllowed: false
    });

    if (existing) {
      await tx.update(
        "pems_candidate_maturity",
        {
          workflow: aggregate.workflow,
          selected_skill_key: aggregate.selectedSkillKey,
          shadow_run_count: aggregate.shadowRunCount,
          evidence_ref_count: aggregate.evidenceRefCount,
          successful_outcome_count: aggregate.successfulOutcomeCount,
          reviewer_approval_count: aggregate.reviewerApprovalCount,
          authority_citation_count: aggregate.authorityCitationCount,
          validator_pass_count: aggregate.validatorPassCount,
          safety_incident_count: aggregate.safetyIncidentCount,
          latest_score: maturity.score,
          trusted: maturity.trusted ? 1 : 0,
          production_driving_allowed: 0,
          maturity_json: maturityJson,
          updated_at: createdAt
        },
        { candidate_id: candidateId }
      );
    } else {
      await tx.insert("pems_candidate_maturity", {
        candidate_id: candidateId,
        workflow: aggregate.workflow,
        selected_skill_key: aggregate.selectedSkillKey,
        shadow_run_count: aggregate.shadowRunCount,
        evidence_ref_count: aggregate.evidenceRefCount,
        successful_outcome_count: aggregate.successfulOutcomeCount,
        reviewer_approval_count: aggregate.reviewerApprovalCount,
        authority_citation_count: aggregate.authorityCitationCount,
        validator_pass_count: aggregate.validatorPassCount,
        safety_incident_count: aggregate.safetyIncidentCount,
        latest_score: maturity.score,
        trusted: maturity.trusted ? 1 : 0,
        production_driving_allowed: 0,
        maturity_json: maturityJson,
        created_at: createdAt,
        updated_at: createdAt
      });
    }

    const row = await tx.insert("continuous_intelligence_shadow_runs", {
      id: createPersistedId("ci_shadow"),
      user_id: user?.id ?? caseState.identifiers?.userId ?? "unknown_user",
      session_id: session?.id ?? caseState.identifiers?.sessionId,
      graph_trace_id: graphTraceId ?? caseState.identifiers?.graphTraceId ?? null,
      case_ref: caseState.caseRef,
      workflow: caseState.decision?.workflow ?? null,
      mode: safeShadow.mode,
      gate_score: safeShadow.gateSummary?.score ?? 0,
      gate_passed: safeShadow.gateSummary?.passed ?? 0,
      gate_total: safeShadow.gateSummary?.total ?? 0,
      pems_candidate_id: candidateId,
      pems_score: maturity.score,
      pems_trusted: maturity.trusted ? 1 : 0,
      production_driving_allowed: 0,
      source_pointer_count: caseState.evidence?.sourcePointerCount ?? 0,
      workflow_outcome: caseState.outcome?.workflowOutcome ?? null,
      final_response_prepared: caseState.outcome?.finalResponsePrepared ? 1 : 0,
      shadow_json: JSON.stringify({
        ...safeShadow,
        persistedMaturity: maturity
      }),
      safety_json: JSON.stringify(safeShadow.safety),
      created_at: createdAt
    });

    return {
      version: CONTINUOUS_INTELLIGENCE_PERSISTENCE_VERSION,
      shadowRun: row,
      maturity,
      aggregate,
      productionDrivingAllowed: false,
      pemsTrusted: maturity.trusted
    };
  });
}

export async function persistFinalContinuousIntelligenceShadow(store, { user, session, graphTraceId, channel, userInput, contextPacket, productMemoryRecall, productMemoryRetain, state } = {}) {
  const caseState = buildCaseState({
    userId: user?.id ?? state?.user_id,
    sessionId: session?.id ?? state?.session_id,
    graphTraceId: graphTraceId ?? state?.graph_trace_id,
    channel: channel ?? state?.channel,
    userInput: userInput ?? state?.user_input,
    contextPacket: contextPacket ?? state?.context_packet,
    policyResult: state?.policy_result,
    structuredIntent: state?.structured_intent,
    llmDecision: state?.llm_orchestration_decision,
    workflow: state?.workflow,
    routeReason: state?.route_reason,
    workflowRoute: state?.workflow_route,
    dynamicSkillContext: state?.dynamic_skill_context,
    openclawTaskProposal: state?.openclaw_task_proposal,
    approvalResume: state?.approval_resume,
    evidenceObservation: state?.evidence_observation,
    sourcePointers: state?.source_pointers,
    productMemoryRecall,
    productMemoryRetain,
    uploadedDocumentContext: state?.uploaded_document_context,
    researchEvidence: state?.research_evidence,
    workflowOutcome: state?.workflow_outcome,
    finalResponse: state?.final_response
  });
  const shadow = buildContinuousIntelligenceShadow({ caseState });
  const persistence = await persistContinuousIntelligenceShadowRun(store, {
    user,
    session,
    graphTraceId: graphTraceId ?? state?.graph_trace_id,
    shadow
  });
  return {
    ...persistence,
    shadow
  };
}

export async function getContinuousIntelligencePersistenceStatus(store) {
  if (!store) {
    return {
      version: CONTINUOUS_INTELLIGENCE_PERSISTENCE_VERSION,
      status: "store_unavailable",
      ok: false,
      shadowRunCount: 0,
      candidateCount: 0,
      trustedCandidateCount: 0,
      productionDrivingAllowed: false
    };
  }
  const counts = await store.get(
    `SELECT
       COUNT(*) AS shadowRunCount,
       COALESCE(SUM(source_pointer_count), 0) AS sourcePointerCount,
       COALESCE(MAX(created_at), NULL) AS latestShadowRunAt
     FROM continuous_intelligence_shadow_runs;`
  );
  const candidates = await store.get(
    `SELECT
       COUNT(*) AS candidateCount,
       COALESCE(SUM(CASE WHEN trusted = 1 THEN 1 ELSE 0 END), 0) AS trustedCandidateCount,
       COALESCE(MAX(latest_score), 0) AS maxScore
     FROM pems_candidate_maturity;`
  );
  const latest = await store.get(
    `SELECT id, workflow, gate_score, gate_passed, gate_total, pems_candidate_id, pems_score,
            pems_trusted, production_driving_allowed, source_pointer_count, workflow_outcome,
            final_response_prepared, created_at
       FROM continuous_intelligence_shadow_runs
      ORDER BY created_at DESC
      LIMIT 1;`
  );
  const latestMaturity = latest?.pems_candidate_id
    ? await store.findOne("pems_candidate_maturity", { candidate_id: latest.pems_candidate_id })
    : null;
  const status = rowNumber(counts?.shadowRunCount) > 0 ? "phase34_shadow_persistence_active" : "phase34_shadow_persistence_ready_no_runs";
  return {
    version: CONTINUOUS_INTELLIGENCE_PERSISTENCE_VERSION,
    status,
    ok: true,
    shadowRunCount: rowNumber(counts?.shadowRunCount),
    sourcePointerCount: rowNumber(counts?.sourcePointerCount),
    candidateCount: rowNumber(candidates?.candidateCount),
    trustedCandidateCount: rowNumber(candidates?.trustedCandidateCount),
    maxScore: rowNumber(candidates?.maxScore),
    pemsTrusted: rowNumber(candidates?.trustedCandidateCount) > 0,
    productionDrivingAllowed: false,
    latestRun: latest
      ? {
          id: latest.id,
          workflow: latest.workflow,
          gateScore: rowNumber(latest.gate_score),
          gatePassed: rowNumber(latest.gate_passed),
          gateTotal: rowNumber(latest.gate_total),
          candidateId: latest.pems_candidate_id,
          pemsScore: rowNumber(latest.pems_score),
          pemsTrusted: latest.pems_trusted === 1,
          productionDrivingAllowed: false,
          sourcePointerCount: rowNumber(latest.source_pointer_count),
          workflowOutcome: latest.workflow_outcome,
          finalResponsePrepared: latest.final_response_prepared === 1,
          createdAt: latest.created_at
        }
      : null,
    latestMaturity: latestMaturity
      ? {
          candidateId: latestMaturity.candidate_id,
          workflow: latestMaturity.workflow,
          selectedSkillKey: latestMaturity.selected_skill_key,
          shadowRunCount: rowNumber(latestMaturity.shadow_run_count),
          evidenceRefCount: rowNumber(latestMaturity.evidence_ref_count),
          successfulOutcomeCount: rowNumber(latestMaturity.successful_outcome_count),
          reviewerApprovalCount: rowNumber(latestMaturity.reviewer_approval_count),
          authorityCitationCount: rowNumber(latestMaturity.authority_citation_count),
          validatorPassCount: rowNumber(latestMaturity.validator_pass_count),
          safetyIncidentCount: rowNumber(latestMaturity.safety_incident_count),
          latestScore: rowNumber(latestMaturity.latest_score),
          trusted: latestMaturity.trusted === 1,
          supervisedAdvisoryAllowed: latestMaturity.supervised_advisory_allowed === 1,
          promotionStatus: latestMaturity.promotion_status ?? "shadow_review_required",
          productionDrivingAllowed: false,
          maturity: parseJson(latestMaturity.maturity_json, {}),
          promotion: parseJson(latestMaturity.promotion_json, {})
        }
      : null,
    safety: {
      appendOnlyShadowRuns: true,
      rawInputReturned: false,
      rawSourceReturned: false,
      productionDrivingAllowed: false,
      cortexProductMemory: false
    }
  };
}

export async function getPemsPromotionGateStatus(store) {
  if (!store) {
    return {
      version: PEMS_PROMOTION_GATE_VERSION,
      status: "store_unavailable",
      ok: false,
      candidateCount: 0,
      reviewCount: 0,
      supervisedAdvisoryCandidateCount: 0,
      productionDrivingAllowed: false
    };
  }
  const candidateCounts = await store.get(
    `SELECT
       COUNT(*) AS candidateCount,
       COALESCE(SUM(CASE WHEN supervised_advisory_allowed = 1 THEN 1 ELSE 0 END), 0) AS supervisedAdvisoryCandidateCount,
       COALESCE(SUM(CASE WHEN production_driving_allowed = 1 THEN 1 ELSE 0 END), 0) AS productionDrivingCandidateCount
     FROM pems_candidate_maturity;`
  );
  const reviewCounts = await store.get(
    `SELECT
       COUNT(*) AS reviewCount,
       COALESCE(SUM(CASE WHEN review_type = 'human_review' AND decision = 'approved' THEN 1 ELSE 0 END), 0) AS humanApprovalCount,
       COALESCE(SUM(CASE WHEN review_type = 'validator_evaluation' AND decision = 'pass' THEN 1 ELSE 0 END), 0) AS validatorPassCount,
       COALESCE(SUM(CASE WHEN review_type = 'citation_evaluation' AND decision = 'pass' THEN 1 ELSE 0 END), 0) AS citationPassCount,
       COALESCE(SUM(safety_incident_count), 0) AS reviewSafetyIncidentCount
     FROM pems_candidate_promotion_reviews;`
  );
  const latestCandidate = await store.get(
    `SELECT candidate_id, workflow, selected_skill_key, shadow_run_count, evidence_ref_count,
            successful_outcome_count, reviewer_approval_count, authority_citation_count,
            validator_pass_count, safety_incident_count, latest_score, trusted,
            supervised_advisory_allowed, promotion_status, last_reviewed_at,
            production_driving_allowed, promotion_json, updated_at
       FROM pems_candidate_maturity
      ORDER BY COALESCE(last_reviewed_at, updated_at) DESC
      LIMIT 1;`
  );
  const latestReviews = latestCandidate?.candidate_id ? await listPemsPromotionReviewsForCandidate(store, latestCandidate.candidate_id) : [];
  const latestGate = latestCandidate ? evaluatePemsPromotionGate(latestCandidate, latestReviews) : null;
  const reviewCountValue = rowNumber(reviewCounts?.reviewCount);
  const status =
    rowNumber(candidateCounts?.supervisedAdvisoryCandidateCount) > 0
      ? "phase35_supervised_promotion_gate_active"
      : reviewCountValue > 0
        ? "phase35_supervised_promotion_gate_reviewing"
        : "phase35_supervised_promotion_gate_ready_no_reviews";
  return {
    version: PEMS_PROMOTION_GATE_VERSION,
    status,
    ok: true,
    candidateCount: rowNumber(candidateCounts?.candidateCount),
    reviewCount: reviewCountValue,
    humanApprovalCount: rowNumber(reviewCounts?.humanApprovalCount),
    validatorPassCount: rowNumber(reviewCounts?.validatorPassCount),
    citationPassCount: rowNumber(reviewCounts?.citationPassCount),
    reviewSafetyIncidentCount: rowNumber(reviewCounts?.reviewSafetyIncidentCount),
    supervisedAdvisoryCandidateCount: rowNumber(candidateCounts?.supervisedAdvisoryCandidateCount),
    productionDrivingCandidateCount: rowNumber(candidateCounts?.productionDrivingCandidateCount),
    productionDrivingAllowed: false,
    latestCandidate: latestCandidate
      ? {
          candidateId: latestCandidate.candidate_id,
          workflow: latestCandidate.workflow,
          selectedSkillKey: latestCandidate.selected_skill_key,
          shadowRunCount: rowNumber(latestCandidate.shadow_run_count),
          evidenceRefCount: rowNumber(latestCandidate.evidence_ref_count),
          successfulOutcomeCount: rowNumber(latestCandidate.successful_outcome_count),
          reviewerApprovalCount: rowNumber(latestCandidate.reviewer_approval_count),
          authorityCitationCount: rowNumber(latestCandidate.authority_citation_count),
          validatorPassCount: rowNumber(latestCandidate.validator_pass_count),
          safetyIncidentCount: rowNumber(latestCandidate.safety_incident_count),
          latestScore: rowNumber(latestCandidate.latest_score),
          trusted: latestCandidate.trusted === 1,
          supervisedAdvisoryAllowed: latestCandidate.supervised_advisory_allowed === 1,
          promotionStatus: latestCandidate.promotion_status,
          lastReviewedAt: latestCandidate.last_reviewed_at,
          productionDrivingAllowed: false,
          promotion: parseJson(latestCandidate.promotion_json, {})
        }
      : null,
    latestGate,
    safety: {
      rawRationaleStored: false,
      rawSourceStored: false,
      supervisedAdvisoryOnly: true,
      productionDrivingAllowed: false
    }
  };
}

export function buildPemsPromotionReadinessProof(status = {}) {
  const active = (status.supervisedAdvisoryCandidateCount ?? 0) > 0;
  const reviewing = (status.reviewCount ?? 0) > 0;
  return {
    version: PEMS_PROMOTION_GATE_VERSION,
    status: active
      ? "phase35_supervised_promotion_gate_active"
      : reviewing
        ? "phase35_supervised_promotion_gate_reviewing"
        : "phase35_supervised_promotion_gate_ready_no_reviews",
    ok: status.ok !== false,
    mode: "supervised_advisory_gate_only",
    score: active ? 80 : reviewing ? 78 : 75,
    target: 80,
    candidateCount: status.candidateCount ?? 0,
    reviewCount: status.reviewCount ?? 0,
    humanApprovalCount: status.humanApprovalCount ?? 0,
    validatorPassCount: status.validatorPassCount ?? 0,
    citationPassCount: status.citationPassCount ?? 0,
    supervisedAdvisoryCandidateCount: status.supervisedAdvisoryCandidateCount ?? 0,
    productionDrivingAllowed: false,
    latestCandidate: status.latestCandidate ?? null,
    latestGate: status.latestGate ?? null,
    safety: status.safety ?? {
      rawRationaleStored: false,
      rawSourceStored: false,
      supervisedAdvisoryOnly: true,
      productionDrivingAllowed: false
    }
  };
}

export async function getPemsReviewerWorkbenchStatus(store) {
  if (!store) {
    return {
      version: PEMS_REVIEW_WORKBENCH_VERSION,
      status: "store_unavailable",
      ok: false,
      candidateCount: 0,
      draftCount: 0,
      reviewCount: 0,
      advisoryLinkedReviewCount: 0,
      productionDrivingAllowed: false
    };
  }
  const candidateCounts = await store.get(
    `SELECT
       COUNT(*) AS candidateCount,
       COALESCE(SUM(CASE WHEN supervised_advisory_allowed = 1 THEN 1 ELSE 0 END), 0) AS supervisedAdvisoryCandidateCount
     FROM pems_candidate_maturity;`
  );
  const draftCounts = await store.get(
    `SELECT
       COUNT(*) AS draftCount,
       COALESCE(SUM(CASE WHEN evaluator_mode = 'llm_assisted_advisory' THEN 1 ELSE 0 END), 0) AS llmAssistedDraftCount,
       COALESCE(SUM(CASE WHEN draft_type = 'nestr_consistency_trace' OR evaluator_mode = 'nestr_consistency_trace' THEN 1 ELSE 0 END), 0) AS consistencyTraceDraftCount,
       COALESCE(SUM(CASE WHEN status = 'draft_ready_for_human_review' THEN 1 ELSE 0 END), 0) AS readyDraftCount,
       COALESCE(SUM(CASE WHEN status = 'blocked_by_validator' THEN 1 ELSE 0 END), 0) AS blockedDraftCount
     FROM pems_candidate_evaluator_drafts;`
  );
  const reviewCounts = await store.get(
    `SELECT
       COUNT(*) AS reviewCount,
       COALESCE(SUM(CASE WHEN metadata_json LIKE '%"advisoryOnly":true%' THEN 1 ELSE 0 END), 0) AS advisoryLinkedReviewCount
     FROM pems_candidate_promotion_reviews;`
  );
  const latestDraft = await store.get(
    `SELECT id, candidate_id, actor_user_id, draft_type, evaluator_mode, status,
            deterministic_validator_status, suggested_review_type, suggested_decision,
            advisory_note_hash, advisory_note_preview, consistency_trace_ref,
            consistency_trace_hash, consistency_trace_preview, metadata_json, created_at, updated_at
       FROM pems_candidate_evaluator_drafts
      ORDER BY created_at DESC
      LIMIT 1;`
  );
  const latestCandidate = latestDraft?.candidate_id
    ? await store.findOne("pems_candidate_maturity", { candidate_id: latestDraft.candidate_id })
    : await store.get(
        `SELECT candidate_id, workflow, selected_skill_key, shadow_run_count, latest_score,
                supervised_advisory_allowed, promotion_status, production_driving_allowed, updated_at
           FROM pems_candidate_maturity
          ORDER BY updated_at DESC
          LIMIT 1;`
      );
  const latestReviews = latestCandidate?.candidate_id ? await listPemsPromotionReviewsForCandidate(store, latestCandidate.candidate_id) : [];
  const latestGate = latestCandidate ? evaluatePemsPromotionGate(latestCandidate, latestReviews) : null;
  const draftCountValue = rowNumber(draftCounts?.draftCount);
  const status =
    draftCountValue > 0
      ? "phase36_reviewer_evaluator_workbench_active"
      : rowNumber(candidateCounts?.candidateCount) > 0
        ? "phase36_reviewer_evaluator_workbench_ready_no_drafts"
        : "phase36_reviewer_evaluator_workbench_waiting_for_candidates";
  return {
    version: PEMS_REVIEW_WORKBENCH_VERSION,
    status,
    ok: true,
    candidateCount: rowNumber(candidateCounts?.candidateCount),
    supervisedAdvisoryCandidateCount: rowNumber(candidateCounts?.supervisedAdvisoryCandidateCount),
    draftCount: draftCountValue,
    llmAssistedDraftCount: rowNumber(draftCounts?.llmAssistedDraftCount),
    consistencyTraceDraftCount: rowNumber(draftCounts?.consistencyTraceDraftCount),
    readyDraftCount: rowNumber(draftCounts?.readyDraftCount),
    blockedDraftCount: rowNumber(draftCounts?.blockedDraftCount),
    reviewCount: rowNumber(reviewCounts?.reviewCount),
    advisoryLinkedReviewCount: rowNumber(reviewCounts?.advisoryLinkedReviewCount),
    productionDrivingAllowed: false,
    latestDraft: latestDraft
      ? {
          id: latestDraft.id,
          candidateId: latestDraft.candidate_id,
          actorUserId: latestDraft.actor_user_id,
          draftType: latestDraft.draft_type,
          evaluatorMode: latestDraft.evaluator_mode,
          status: latestDraft.status,
          deterministicValidatorStatus: latestDraft.deterministic_validator_status,
          suggestedReviewType: latestDraft.suggested_review_type,
          suggestedDecision: latestDraft.suggested_decision,
          advisoryNoteHash: latestDraft.advisory_note_hash,
          advisoryNotePreview: latestDraft.advisory_note_preview,
          consistencyTraceRef: latestDraft.consistency_trace_ref,
          consistencyTraceHash: latestDraft.consistency_trace_hash,
          consistencyTracePreview: latestDraft.consistency_trace_preview,
          metadata: parseJson(latestDraft.metadata_json, {}),
          createdAt: latestDraft.created_at,
          updatedAt: latestDraft.updated_at
        }
      : null,
    latestCandidate: latestCandidate
      ? {
          candidateId: latestCandidate.candidate_id,
          workflow: latestCandidate.workflow,
          selectedSkillKey: latestCandidate.selected_skill_key,
          shadowRunCount: rowNumber(latestCandidate.shadow_run_count),
          latestScore: rowNumber(latestCandidate.latest_score),
          supervisedAdvisoryAllowed: latestCandidate.supervised_advisory_allowed === 1,
          promotionStatus: latestCandidate.promotion_status ?? "shadow_review_required",
          productionDrivingAllowed: false,
          updatedAt: latestCandidate.updated_at
        }
      : null,
    latestGate,
    safety: {
      advisoryDraftsOnly: true,
      deterministicValidatorAuthority: true,
      humanReviewerAuthority: true,
      rawAdvisoryNoteStored: false,
      rawConsistencyTraceStored: false,
      rawSourceStored: false,
      productionDrivingAllowed: false
    }
  };
}

export function buildPemsReviewerWorkbenchReadinessProof(status = {}) {
  const active = (status.draftCount ?? 0) > 0;
  const linked = (status.advisoryLinkedReviewCount ?? 0) > 0;
  const ready = (status.candidateCount ?? 0) > 0;
  return {
    version: PEMS_REVIEW_WORKBENCH_VERSION,
    status: active
      ? "phase36_reviewer_evaluator_workbench_active"
      : ready
        ? "phase36_reviewer_evaluator_workbench_ready_no_drafts"
        : "phase36_reviewer_evaluator_workbench_waiting_for_candidates",
    ok: status.ok !== false,
    mode: "supervised_advisory_workbench_only",
    score: active && linked ? 85 : active ? 83 : ready ? 80 : 70,
    target: 85,
    candidateCount: status.candidateCount ?? 0,
    supervisedAdvisoryCandidateCount: status.supervisedAdvisoryCandidateCount ?? 0,
    draftCount: status.draftCount ?? 0,
    llmAssistedDraftCount: status.llmAssistedDraftCount ?? 0,
    consistencyTraceDraftCount: status.consistencyTraceDraftCount ?? 0,
    readyDraftCount: status.readyDraftCount ?? 0,
    blockedDraftCount: status.blockedDraftCount ?? 0,
    reviewCount: status.reviewCount ?? 0,
    advisoryLinkedReviewCount: status.advisoryLinkedReviewCount ?? 0,
    productionDrivingAllowed: false,
    latestDraft: status.latestDraft ?? null,
    latestCandidate: status.latestCandidate ?? null,
    latestGate: status.latestGate ?? null,
    safety: status.safety ?? {
      advisoryDraftsOnly: true,
      deterministicValidatorAuthority: true,
      humanReviewerAuthority: true,
      rawAdvisoryNoteStored: false,
      rawConsistencyTraceStored: false,
      productionDrivingAllowed: false
    }
  };
}

export function buildContinuousIntelligencePersistenceReadinessProof(status = {}) {
  const active = (status.shadowRunCount ?? 0) > 0;
  return {
    version: CONTINUOUS_INTELLIGENCE_PERSISTENCE_VERSION,
    status: active ? "phase34_shadow_persistence_active" : "phase34_shadow_persistence_ready_no_runs",
    ok: status.ok !== false,
    mode: "shadow_only",
    score: active ? 70 : 65,
    target: 70,
    shadowRunCount: status.shadowRunCount ?? 0,
    candidateCount: status.candidateCount ?? 0,
    latestRun: status.latestRun ?? null,
    latestMaturity: status.latestMaturity ?? null,
    pemsTrusted: status.pemsTrusted ?? false,
    productionDrivingAllowed: false,
    safety: status.safety ?? {
      appendOnlyShadowRuns: true,
      rawInputReturned: false,
      rawSourceReturned: false,
      productionDrivingAllowed: false,
      cortexProductMemory: false
    }
  };
}

export function buildContinuousIntelligenceReadinessProof() {
  const shadow = buildContinuousIntelligenceShadow({
    userId: "proof-user",
    sessionId: "proof-session",
    graphTraceId: "proof-trace",
    channel: "operator_dashboard",
    userInput: "Can you help me understand my benefits?",
    contextPacket: {
      user: { id: "proof-user" },
      portalAccount: { id: "portal-proof", payer: "example-payer", status: "ready", portalUrl: "https://example.com/member" },
      memoryItems: [{ id: "memory-proof" }],
      workflowArchitecture: { routeCandidates: [{ workflowKey: "eligibility_check" }] }
    },
    policyResult: { allowed: true, urgentEscalationRequired: false },
    structuredIntent: { intent: "check_benefits", workflow: "eligibility_check", confidence: 0.91 },
    workflow: "eligibility_check",
    routeReason: "proof_fixture_no_phi",
    workflowRoute: { executableNow: true },
    dynamicSkillContext: {
      selected: { executionSkillKey: "insurance_portal_browser", journeySkillKey: "benefits_journey" },
      successEstimate: { chance: 0.72 },
      requiredOpenClawTasks: ["read_only_observation"]
    },
    openclawTaskProposal: {
      status: "proposal_ready",
      approvalRequired: true,
      blockedActions: ["credential_entry", "form_submission", "payer_contact"]
    },
    approvalResume: { status: "approval_required", consumed: false },
    evidenceObservation: { status: "not_requested", actionsTaken: [], sourcePointers: [] },
    sourcePointers: [],
    productMemoryRecall: { adapter: "graphiti", facts: [{ uuid: "fact-proof", fact: "safe proof fact" }] },
    workflowOutcome: "shadow_proof_ready",
    finalResponse: "proof only"
  });
  return {
    status: "phase33_shadow_scaffold_ready",
    ok: true,
    mode: shadow.mode,
    score: 60,
    target: 60,
    schemas: [CASE_STATE_SCHEMA_VERSION, PEMS_SCHEMA_VERSION],
    gateIds: shadow.gates.map((item) => item.id),
    gateCount: shadow.gates.length,
    universalGateCoverage: shadow.gates.length === UNIVERSAL_CASE_GATES.length,
    pemsTrusted: shadow.pems.trusted,
    productionDrivingAllowed: false,
    shadow
  };
}
