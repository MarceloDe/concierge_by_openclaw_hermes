import { createHash, randomUUID } from "node:crypto";
import { createTieredChatModel } from "./modelTierPolicy.mjs";
import { recordOutboundPayloadObservation } from "./outboundPayloadObservability.mjs";

export const CASE_STATE_SCHEMA_VERSION = "brainstyworkers.case_state.v1";
export const PEMS_SCHEMA_VERSION = "brainstyworkers.pems.v1";
export const CONTINUOUS_INTELLIGENCE_SHADOW_VERSION = "2026-06-18.phase33-continuous-intelligence-shadow.v1";
export const CONTINUOUS_INTELLIGENCE_PERSISTENCE_VERSION = "2026-06-18.phase34-shadow-persistence.v1";
export const PEMS_PROMOTION_GATE_VERSION = "2026-06-18.phase35-pems-supervised-promotion-gate.v1";
export const PEMS_REVIEW_WORKBENCH_VERSION = "2026-06-18.phase36-pems-reviewer-evaluator-workbench.v1";
export const PEMS_REVIEWER_COMPARISON_VERSION = "2026-06-19.phase38-pems-reviewer-comparison-provenance.v1";
export const PEMS_LIVE_EVALUATOR_FILTERING_VERSION = "2026-06-20.phase39-live-evaluator-generation-filtering.v1";
export const PEMS_LIVE_CLAIM_CITATION_CLOSURE_VERSION = "2026-06-20.phase40-live-claim-citation-closure.v1";
export const PEMS_REVIEWER_CLAIM_REVISION_VERSION = "2026-06-20.phase41-reviewer-claim-revision-records.v1";
export const PEMS_REVIEWER_FOLLOW_UP_VERSION = "2026-06-20.phase42-reviewer-follow-up-workflows.v1";
export const PEMS_REVIEWER_HISTORY_EXPORT_VERSION = "2026-06-20.phase43-reviewer-history-audit-exports.v1";
export const PEMS_REVIEWER_HISTORY_REVIEW_VERSION = "2026-06-21.phase44-reviewer-history-review-refinement.v1";
export const PEMS_TRUSTED_ANSWER_DRIVING_VERSION = "2026-06-22.phase58-trusted-answer-driving.v1";

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
const PEMS_TRUSTED_ANSWER_DRIVING_CONTROL_KEY = "trusted_answer_driving_global";

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

function safeList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => safePreview(item, 64))
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeClaimStatus(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["supported", "low_confidence", "unsupported"].includes(normalized)) return normalized;
  return "unsupported";
}

function safeSourcePointerIds(value, allowedIds = []) {
  const allowed = new Set(safeList(allowedIds));
  return safeList(value).filter((id) => !allowed.size || allowed.has(id));
}

function normalizePemsClaimCitationClosure(value, { allowedSourcePointerIds = [] } = {}) {
  const claims = Array.isArray(value) ? value : [];
  return claims
    .map((item, index) => {
      const claimPreview = safePreview(item?.claim ?? item?.text ?? item?.claimPreview ?? item?.claim_preview, 220);
      const status = normalizeClaimStatus(item?.status ?? item?.label);
      const sourcePointerIds = safeSourcePointerIds(item?.sourcePointerIds ?? item?.source_pointer_ids ?? item?.citations ?? [], allowedSourcePointerIds);
      const effectiveStatus = sourcePointerIds.length || status !== "supported" ? status : "low_confidence";
      const suggestedEditPreview = safePreview(item?.suggestedEdit ?? item?.suggested_edit ?? item?.revision ?? "", 220);
      if (!claimPreview) return null;
      return {
        id: stableRef("pems_claim", index, claimPreview),
        claimHash: hashText(claimPreview),
        claimPreview,
        status: effectiveStatus,
        sourcePointerIds,
        sourcePointerCount: sourcePointerIds.length,
        confidence: Math.max(0, Math.min(1, Number(item?.confidence ?? (effectiveStatus === "supported" ? 0.8 : 0.25)) || 0)),
        explanationPreview: safePreview(item?.explanation ?? item?.reason ?? "", 180),
        suggestedEditPreview,
        requiresReviewerEdit: effectiveStatus !== "supported",
        rawClaimStored: false,
        rawSourceStored: false
      };
    })
    .filter(Boolean)
    .slice(0, 12);
}

function pemsClaimCitationClosureSummary(claims = []) {
  const supportedCount = claims.filter((claim) => claim.status === "supported").length;
  const lowConfidenceCount = claims.filter((claim) => claim.status === "low_confidence").length;
  const unsupportedCount = claims.filter((claim) => claim.status === "unsupported").length;
  const claimCount = claims.length;
  const verdict =
    claimCount === 0
      ? "no_claims_detected"
      : unsupportedCount > 0
        ? "unsupported_claims_found"
        : lowConfidenceCount > 0
          ? "low_confidence_claims_found"
          : "all_claims_supported";
  return {
    version: PEMS_LIVE_CLAIM_CITATION_CLOSURE_VERSION,
    status:
      verdict === "all_claims_supported"
        ? "phase40_claim_citation_closure_passed"
        : verdict === "no_claims_detected"
          ? "phase40_claim_citation_closure_no_claims"
          : "phase40_claim_citation_closure_vetoed",
    verdict,
    claimCount,
    supportedCount,
    lowConfidenceCount,
    unsupportedCount,
    reviewerEditRequired: unsupportedCount > 0 || lowConfidenceCount > 0,
    unsupportedClaimHashes: claims.filter((claim) => claim.status !== "supported").map((claim) => claim.claimHash),
    productionDrivingAllowed: false
  };
}

export function buildPemsDraftClaimCitationClosure(draft = {}) {
  const metadata = jsonValue(draft?.metadata ?? draft?.metadata_json, {});
  const allowedSourcePointerIds = safeList(metadata.sourcePointerIds);
  const claims = normalizePemsClaimCitationClosure(metadata.claimCitationClosure ?? metadata.claim_citation_closure ?? [], {
    allowedSourcePointerIds
  });
  const summary = pemsClaimCitationClosureSummary(claims);
  return {
    ...summary,
    claims,
    allowedSourcePointerIds,
    advisoryDraftId: draft?.id ?? null,
    candidateId: draft?.candidateId ?? draft?.candidate_id ?? null,
    sourcePointerBounded: claims.every((claim) => claim.status !== "supported" || claim.sourcePointerIds.length > 0),
    liveEvaluatorDraft:
      metadata.liveEvaluatorGeneration === true &&
      metadata.liveLlmEvaluatorUsed === true &&
      metadata.egressObserved === true &&
      metadata.mockedLlmOutput !== true,
    safety: {
      rawClaimStored: false,
      rawSourceStored: false,
      rawPromptStored: false,
      rawCompletionStored: false,
      reviewerEditRequiredForUnsupported: summary.reviewerEditRequired,
      productionDrivingAllowed: false
    }
  };
}

function formatPemsClaimRevisionRow(row) {
  if (!row) return null;
  const sourcePointerIds = safeList(parseJson(row.source_pointer_ids_json, []));
  const deterministicReclosure = jsonValue(row.deterministic_reclosure_json, {});
  return {
    id: row.id,
    candidateId: row.candidate_id,
    advisoryDraftId: row.advisory_draft_id,
    claimId: row.claim_id,
    actorUserId: row.actor_user_id,
    revisionStatus: row.revision_status,
    originalClaimHash: row.original_claim_hash,
    originalClaimPreview: row.original_claim_preview,
    suggestedEditHash: row.suggested_edit_hash,
    suggestedEditPreview: row.suggested_edit_preview,
    revisedClaimHash: row.revised_claim_hash,
    revisedClaimPreview: row.revised_claim_preview,
    sourcePointerIds,
    deterministicReclosure,
    metadata: jsonValue(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    advisoryOnly: true,
    productionDrivingAllowed: false,
    safety: {
      rawOriginalClaimStored: false,
      rawSuggestedEditStored: false,
      rawRevisedClaimStored: false,
      rawSourceStored: false,
      revisionCreatesEvidence: false,
      productionDrivingAllowed: false
    }
  };
}

function formatPemsPromotionReviewRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    candidateId: row.candidate_id,
    actorUserId: row.actor_user_id,
    reviewType: row.review_type,
    decision: row.decision,
    evidenceRefCount: rowNumber(row.evidence_ref_count),
    validatorPassCount: rowNumber(row.validator_pass_count),
    safetyIncidentCount: rowNumber(row.safety_incident_count),
    rationaleHash: row.rationale_hash,
    rationalePreview: row.rationale_preview,
    metadata: jsonValue(row.metadata_json, {}),
    createdAt: row.created_at,
    advisoryOnly: jsonValue(row.metadata_json, {}).advisoryOnly === true,
    productionDrivingAllowed: false,
    safety: {
      rawRationaleStored: false,
      rawSourceStored: false,
      productionDrivingAllowed: false
    }
  };
}

function formatPemsReviewFollowUpRow(row) {
  if (!row) return null;
  const metadata = jsonValue(row.metadata_json, {});
  return {
    id: row.id,
    candidateId: row.candidate_id,
    advisoryDraftId: row.advisory_draft_id,
    claimRevisionId: row.claim_revision_id,
    promotionReviewId: row.promotion_review_id,
    actorUserId: row.actor_user_id,
    followupType: row.followup_type,
    followupStatus: row.followup_status,
    workflowStatus: row.workflow_status,
    revisionOutcome: row.revision_outcome,
    actionRequired: row.action_required,
    rationaleHash: row.rationale_hash,
    rationalePreview: row.rationale_preview,
    metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    advisoryOnly: true,
    productionDrivingAllowed: false,
    safety: {
      rawRationaleStored: false,
      rawRevisionStored: false,
      rawReviewStored: false,
      followUpCreatesEvidence: false,
      followUpBypassesHumanReview: false,
      productionDrivingAllowed: false
    }
  };
}

function formatPemsReviewerHistoryExportRow(row) {
  if (!row) return null;
  const metadata = jsonValue(row.metadata_json, {});
  const snapshotPreview = jsonValue(row.history_snapshot_preview_json, {});
  return {
    id: row.id,
    candidateId: row.candidate_id,
    advisoryDraftId: row.advisory_draft_id,
    actorUserId: row.actor_user_id,
    exportReasonHash: row.export_reason_hash,
    exportReasonPreview: row.export_reason_preview,
    filters: jsonValue(row.filters_json, {}),
    exportRef: row.export_ref,
    exportHash: row.export_hash,
    historySnapshotHash: row.history_snapshot_hash,
    historySnapshotPreview: snapshotPreview,
    metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    advisoryOnly: true,
    productionDrivingAllowed: false,
    safety: {
      rawHistoryStored: false,
      rawRevisionStored: false,
      rawReviewStored: false,
      rawSourceStored: false,
      rawPromptStored: false,
      rawCompletionStored: false,
      rawOcrStored: false,
      rawFrameStored: false,
      exportCreatesEvidence: false,
      exportBypassesHumanReview: false,
      productionDrivingAllowed: false
    }
  };
}

function buildRevisionDeterministicReclosure({ revisedClaim, sourcePointerIds, allowedSourcePointerIds }) {
  const closure = normalizePemsClaimCitationClosure(
    [
      {
        claim: revisedClaim,
        status: sourcePointerIds.length ? "supported" : "unsupported",
        sourcePointerIds,
        confidence: sourcePointerIds.length ? 0.9 : 0.2,
        explanation: sourcePointerIds.length
          ? "Reviewer revision cites allowed source pointers."
          : "Reviewer revision still lacks allowed source pointers.",
        suggestedEdit: sourcePointerIds.length ? "" : "Attach allowed source pointer IDs before approval."
      }
    ],
    { allowedSourcePointerIds }
  );
  const summary = pemsClaimCitationClosureSummary(closure);
  return {
    version: PEMS_REVIEWER_CLAIM_REVISION_VERSION,
    status: summary.reviewerEditRequired ? "phase41_revision_reclosure_needs_attention" : "phase41_revision_reclosure_passed",
    claimCitationClosure: {
      ...summary,
      claims: closure,
      sourcePointerBounded: closure.every((claim) => claim.status !== "supported" || claim.sourcePointerIds.length > 0)
    },
    reviewerEditRequired: summary.reviewerEditRequired,
    sourcePointerBounded: closure.every((claim) => claim.status !== "supported" || claim.sourcePointerIds.length > 0),
    productionDrivingAllowed: false
  };
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

function normalizeFollowUpType(value) {
  const normalized = String(value ?? "revision_decision_binding").trim().toLowerCase();
  if (["revision_decision_binding", "revision_resolved_review", "revision_needs_review", "citation_followup", "safety_block"].includes(normalized)) {
    return normalized;
  }
  throw new Error(`Unsupported PEMS reviewer follow-up type: ${value}`);
}

function normalizeFollowUpStatus(value) {
  const normalized = String(value ?? "open").trim().toLowerCase();
  if (["open", "resolved", "blocked"].includes(normalized)) return normalized;
  throw new Error(`Unsupported PEMS reviewer follow-up status: ${value}`);
}

function normalizeFollowUpWorkflowStatus(value) {
  const normalized = String(value ?? "follow_up_required").trim().toLowerCase();
  if (["follow_up_required", "review_decision_linked", "advisory_closed", "blocked_by_safety"].includes(normalized)) return normalized;
  throw new Error(`Unsupported PEMS reviewer follow-up workflow status: ${value}`);
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

function normalizeWorkbenchFilter(value, allowedValues) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "all") return null;
  return allowedValues.includes(normalized) ? normalized : null;
}

function filteredDraftWhere(filters = {}) {
  const clauses = [];
  const params = [];
  const status = normalizeWorkbenchFilter(filters.draftStatus, [
    "draft_ready_for_human_review",
    "needs_reviewer_attention",
    "blocked_by_validator"
  ]);
  const evaluatorMode = normalizeWorkbenchFilter(filters.evaluatorMode, [
    "deterministic_validator_advisory",
    "llm_assisted_advisory",
    "nestr_consistency_trace"
  ]);
  const candidateId = String(filters.candidateId ?? "").trim();
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  if (evaluatorMode) {
    clauses.push("evaluator_mode = ?");
    params.push(evaluatorMode);
  }
  if (candidateId) {
    clauses.push("candidate_id = ?");
    params.push(candidateId);
  }
  if (filters.liveOnly === true || filters.liveOnly === "true" || filters.liveOnly === "1") {
    clauses.push("metadata_json LIKE '%\"liveLlmEvaluatorUsed\":true%'");
    clauses.push("metadata_json LIKE '%\"egressObserved\":true%'");
    clauses.push("metadata_json NOT LIKE '%\"mockedLlmOutput\":true%'");
  }
  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
    appliedFilters: {
      draftStatus: status ?? "all",
      evaluatorMode: evaluatorMode ?? "all",
      candidateId: candidateId || null,
      liveOnly: Boolean(filters.liveOnly === true || filters.liveOnly === "true" || filters.liveOnly === "1")
    }
  };
}

function formatPemsDraftRow(row) {
  if (!row) return null;
  const formatted = {
    id: row.id,
    candidateId: row.candidate_id,
    actorUserId: row.actor_user_id,
    draftType: row.draft_type,
    evaluatorMode: row.evaluator_mode,
    status: row.status,
    deterministicValidatorStatus: row.deterministic_validator_status,
    suggestedReviewType: row.suggested_review_type,
    suggestedDecision: row.suggested_decision,
    advisoryNoteHash: row.advisory_note_hash,
    advisoryNotePreview: row.advisory_note_preview,
    consistencyTraceRef: row.consistency_trace_ref,
    consistencyTraceHash: row.consistency_trace_hash,
    consistencyTracePreview: row.consistency_trace_preview,
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  return {
    ...formatted,
    claimCitationClosure: buildPemsDraftClaimCitationClosure(formatted)
  };
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
  const currentProductionDrivingAllowed =
    maturity?.production_driving_allowed === 1 || maturity?.productionDrivingAllowed === true || maturity?.productionDrivingAllowed === "true";
  const killSwitchEnabled =
    maturity?.trusted_answer_driving_kill_switch_enabled === 1 ||
    maturity?.trustedAnswerDrivingKillSwitchEnabled === true ||
    maturity?.kill_switch_enabled === 1 ||
    maturity?.killSwitchEnabled === true;
  const requirements = [
    { key: "maturity_score", ok: latestScore >= PEMS_TRUST_THRESHOLD, actual: latestScore, target: PEMS_TRUST_THRESHOLD },
    { key: "shadow_runs", ok: shadowRunCount >= PEMS_MIN_SHADOW_RUNS, actual: shadowRunCount, target: PEMS_MIN_SHADOW_RUNS },
    { key: "human_reviewer_approvals", ok: humanApprovals >= PEMS_MIN_REVIEWER_APPROVALS, actual: humanApprovals, target: PEMS_MIN_REVIEWER_APPROVALS },
    { key: "validator_evaluation_passes", ok: validatorPasses >= PEMS_MIN_VALIDATOR_EVALUATIONS && validatorFailures === 0, actual: validatorPasses, target: PEMS_MIN_VALIDATOR_EVALUATIONS },
    { key: "citation_evaluation_passes", ok: citationPasses >= PEMS_MIN_CITATION_EVALUATIONS && citationFailures === 0, actual: citationPasses, target: PEMS_MIN_CITATION_EVALUATIONS },
    { key: "citation_evidence_refs", ok: citationEvidenceRefCount > 0 || evidenceRefCount > 0, actual: Math.max(citationEvidenceRefCount, evidenceRefCount), target: 1 },
    { key: "safety_incidents", ok: safetyIncidentCount === 0 && humanRejections === 0, actual: safetyIncidentCount + humanRejections, target: 0 }
  ];
  const supervisedAdvisoryAllowed = requirements.every((requirement) => requirement.ok);
  const trustedAnswerDrivingRequirements = [
    ...requirements,
    { key: "trusted_answer_driving_kill_switch", ok: !killSwitchEnabled, actual: killSwitchEnabled ? 1 : 0, target: 0 }
  ];
  const trustedAnswerDrivingAllowed = supervisedAdvisoryAllowed && !killSwitchEnabled;
  return {
    version: PEMS_TRUSTED_ANSWER_DRIVING_VERSION,
    baseGateVersion: PEMS_PROMOTION_GATE_VERSION,
    status: trustedAnswerDrivingAllowed
      ? "trusted_answer_driving"
      : safetyIncidentCount > 0 || humanRejections > 0
        ? "safety_veto"
        : killSwitchEnabled
          ? "trusted_answer_driving_kill_switch"
          : supervisedAdvisoryAllowed
            ? "supervised_advisory_allowed"
            : "shadow_review_required",
    ok: supervisedAdvisoryAllowed,
    supervisedAdvisoryAllowed,
    trustedAnswerDrivingAllowed,
    productionDrivingAllowed: trustedAnswerDrivingAllowed,
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
    trustedAnswerDrivingRequirements,
    safety: {
      rawRationaleStored: false,
      rawSourceStored: false,
      supervisedAdvisoryOnly: !trustedAnswerDrivingAllowed,
      reviewerApprovalRequired: true,
      citationRailsRequired: true,
      killSwitchEnabled,
      currentProductionDrivingAllowed,
      productionDrivingAllowed: trustedAnswerDrivingAllowed
    }
  };
}

export async function getPemsTrustedAnswerDrivingControl(store) {
  if (!store) {
    return {
      version: PEMS_TRUSTED_ANSWER_DRIVING_VERSION,
      controlKey: PEMS_TRUSTED_ANSWER_DRIVING_CONTROL_KEY,
      killSwitchEnabled: true,
      status: "store_unavailable_fail_closed"
    };
  }
  const row = await store.findOne("pems_trusted_answer_driving_controls", {
    control_key: PEMS_TRUSTED_ANSWER_DRIVING_CONTROL_KEY
  });
  return {
    version: PEMS_TRUSTED_ANSWER_DRIVING_VERSION,
    controlKey: PEMS_TRUSTED_ANSWER_DRIVING_CONTROL_KEY,
    killSwitchEnabled: row ? row.kill_switch_enabled === 1 : false,
    status: row?.kill_switch_enabled === 1 ? "trusted_answer_driving_kill_switch_enabled" : "trusted_answer_driving_kill_switch_clear",
    actorUserId: row?.actor_user_id ?? null,
    reasonPreview: row?.reason_preview ?? "",
    updatedAt: row?.updated_at ?? null,
    rawReasonStored: false
  };
}

export async function setPemsTrustedAnswerDrivingKillSwitch(
  store,
  { enabled = true, actorUserId = "operator", reason = "", metadata = {}, updatedAt = new Date().toISOString() } = {}
) {
  if (!store) throw new Error("A store is required to set the PEMS trusted answer-driving kill switch.");
  return store.transaction(async (tx) => {
    const existing = await tx.findOne("pems_trusted_answer_driving_controls", {
      control_key: PEMS_TRUSTED_ANSWER_DRIVING_CONTROL_KEY
    });
    const record = {
      control_key: PEMS_TRUSTED_ANSWER_DRIVING_CONTROL_KEY,
      kill_switch_enabled: enabled ? 1 : 0,
      actor_user_id: actorUserId ? String(actorUserId) : null,
      reason_hash: hashText(reason),
      reason_preview: safePreview(reason),
      metadata_json: JSON.stringify({
        ...jsonValue(metadata, {}),
        rawReasonStored: false,
        productionDrivingAllowed: false
      }),
      updated_at: updatedAt
    };
    if (existing) {
      await tx.update("pems_trusted_answer_driving_controls", record, {
        control_key: PEMS_TRUSTED_ANSWER_DRIVING_CONTROL_KEY
      });
    } else {
      await tx.insert("pems_trusted_answer_driving_controls", {
        ...record,
        created_at: updatedAt
      });
    }
    let demotedCount = 0;
    if (enabled) {
      const active = await tx.get("SELECT COUNT(*) AS count FROM pems_candidate_maturity WHERE production_driving_allowed = 1;");
      demotedCount = rowNumber(active?.count);
      await tx.update(
        "pems_candidate_maturity",
        {
          production_driving_allowed: 0,
          promotion_status: "trusted_answer_driving_kill_switch_demoted",
          updated_at: updatedAt
        },
        { production_driving_allowed: 1 }
      );
    }
    return {
      version: PEMS_TRUSTED_ANSWER_DRIVING_VERSION,
      status: enabled ? "trusted_answer_driving_kill_switch_enabled" : "trusted_answer_driving_kill_switch_clear",
      killSwitchEnabled: Boolean(enabled),
      demotedCount,
      rawReasonStored: false,
      productionDrivingAllowed: false
    };
  });
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
    const trustedControl = await getPemsTrustedAnswerDrivingControl(tx);
    const gate = evaluatePemsPromotionGate(
      {
        ...existing,
        latest_score: maturity.score,
        reviewer_approval_count: reviewerApprovalCount,
        trustedAnswerDrivingKillSwitchEnabled: trustedControl.killSwitchEnabled
      },
      reviews
    );
    await tx.update(
      "pems_candidate_maturity",
      {
        reviewer_approval_count: reviewerApprovalCount,
        latest_score: maturity.score,
        trusted: maturity.trusted ? 1 : 0,
        supervised_advisory_allowed: gate.supervisedAdvisoryAllowed ? 1 : 0,
        production_driving_allowed: gate.trustedAnswerDrivingAllowed ? 1 : 0,
        promotion_status: gate.status,
        last_reviewed_at: createdAt,
        maturity_json: JSON.stringify({
          version: CONTINUOUS_INTELLIGENCE_PERSISTENCE_VERSION,
          pems: maturity,
          aggregate,
          productionDrivingAllowed: gate.trustedAnswerDrivingAllowed,
          trustedAnswerDrivingStatus: gate.status
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
      trustedControl,
      productionDrivingAllowed: gate.productionDrivingAllowed
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
  const safeMetadata = jsonValue(metadata, {});
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
        ...safeMetadata,
        phase: safeMetadata.phase ?? 36,
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

export async function recordPemsClaimRevision(
  store,
  {
    candidateId,
    advisoryDraftId,
    claimId,
    claimHash,
    actorUserId = "operator",
    revisedClaim = "",
    sourcePointerIds = [],
    metadata = {},
    createdAt = new Date().toISOString()
  } = {}
) {
  if (!store) throw new Error("A store is required to record a PEMS claim revision.");
  const normalizedCandidateId = String(candidateId ?? "").trim();
  const normalizedDraftId = String(advisoryDraftId ?? "").trim();
  if (!normalizedCandidateId) throw new Error("PEMS claim revision requires candidateId.");
  if (!normalizedDraftId) throw new Error("PEMS claim revision requires advisoryDraftId.");

  return store.transaction(async (tx) => {
    const candidate = await tx.findOne("pems_candidate_maturity", { candidate_id: normalizedCandidateId });
    if (!candidate) throw new Error(`PEMS candidate not found: ${normalizedCandidateId}`);
    const draft = await tx.findOne("pems_candidate_evaluator_drafts", { id: normalizedDraftId });
    if (!draft) throw new Error(`PEMS evaluator draft not found: ${normalizedDraftId}`);
    if (draft.candidate_id !== normalizedCandidateId) {
      throw new Error(`PEMS evaluator draft does not belong to candidate: ${normalizedCandidateId}`);
    }

    const draftClosure = buildPemsDraftClaimCitationClosure(draft);
    const targetClaim =
      draftClosure.claims.find((claim) => claim.id === claimId) ??
      draftClosure.claims.find((claim) => claim.claimHash === claimHash) ??
      draftClosure.claims.find((claim) => claim.requiresReviewerEdit) ??
      draftClosure.claims[0];
    if (!targetClaim) throw new Error("PEMS claim revision requires an advisory claim.");

    const normalizedSourcePointerIds = safeSourcePointerIds(
      safeList(sourcePointerIds).length ? sourcePointerIds : draftClosure.allowedSourcePointerIds,
      draftClosure.allowedSourcePointerIds
    );
    const revisedClaimPreview = safePreview(revisedClaim || targetClaim.suggestedEditPreview || targetClaim.claimPreview, 220);
    if (!revisedClaimPreview) throw new Error("PEMS claim revision requires revisedClaim text or a suggested edit.");
    const deterministicReclosure = buildRevisionDeterministicReclosure({
      revisedClaim: revisedClaimPreview,
      sourcePointerIds: normalizedSourcePointerIds,
      allowedSourcePointerIds: draftClosure.allowedSourcePointerIds
    });
    const revisionStatus = deterministicReclosure.reviewerEditRequired ? "revision_needs_reviewer_attention" : "revision_reclosure_passed";
    const safeMetadata = jsonValue(metadata, {});
    const revision = await tx.insert("pems_candidate_claim_revisions", {
      id: createPersistedId("pems_claim_revision"),
      candidate_id: normalizedCandidateId,
      advisory_draft_id: normalizedDraftId,
      claim_id: targetClaim.id,
      actor_user_id: actorUserId ? String(actorUserId) : null,
      revision_status: revisionStatus,
      original_claim_hash: targetClaim.claimHash,
      original_claim_preview: safePreview(targetClaim.claimPreview, 220),
      suggested_edit_hash: hashText(targetClaim.suggestedEditPreview),
      suggested_edit_preview: safePreview(targetClaim.suggestedEditPreview, 220),
      revised_claim_hash: hashText(revisedClaimPreview),
      revised_claim_preview: revisedClaimPreview,
      source_pointer_ids_json: JSON.stringify(normalizedSourcePointerIds),
      deterministic_reclosure_json: JSON.stringify(deterministicReclosure),
      metadata_json: JSON.stringify({
        ...safeMetadata,
        phase: 41,
        advisoryOnly: true,
        sourcePointerBounded: deterministicReclosure.sourcePointerBounded,
        deterministicReclosurePassed: deterministicReclosure.status === "phase41_revision_reclosure_passed",
        originalStatus: targetClaim.status,
        rawOriginalClaimStored: false,
        rawSuggestedEditStored: false,
        rawRevisedClaimStored: false,
        rawSourceStored: false,
        revisionCreatesEvidence: false,
        productionDrivingAllowed: false
      }),
      created_at: createdAt,
      updated_at: createdAt
    });
    return {
      version: PEMS_REVIEWER_CLAIM_REVISION_VERSION,
      status: revisionStatus,
      ok: true,
      revision: formatPemsClaimRevisionRow(revision),
      deterministicReclosure,
      advisoryOnly: true,
      productionDrivingAllowed: false,
      safety: {
        rawOriginalClaimStored: false,
        rawSuggestedEditStored: false,
        rawRevisedClaimStored: false,
        rawSourceStored: false,
        revisionCreatesEvidence: false,
        productionDrivingAllowed: false
      }
    };
  });
}

export async function recordPemsReviewerFollowUp(
  store,
  {
    candidateId,
    advisoryDraftId,
    claimRevisionId,
    promotionReviewId,
    actorUserId = "operator",
    followupType = "revision_decision_binding",
    followupStatus = null,
    workflowStatus = null,
    actionRequired = "",
    rationale = "",
    metadata = {},
    createdAt = new Date().toISOString()
  } = {}
) {
  if (!store) throw new Error("A store is required to record a PEMS reviewer follow-up.");
  const normalizedCandidateId = String(candidateId ?? "").trim();
  const normalizedDraftId = String(advisoryDraftId ?? "").trim();
  const normalizedRevisionId = String(claimRevisionId ?? "").trim();
  const normalizedReviewId = String(promotionReviewId ?? "").trim();
  if (!normalizedCandidateId) throw new Error("PEMS reviewer follow-up requires candidateId.");
  if (!normalizedDraftId) throw new Error("PEMS reviewer follow-up requires advisoryDraftId.");
  if (!normalizedRevisionId) throw new Error("PEMS reviewer follow-up requires claimRevisionId.");
  if (!normalizedReviewId) throw new Error("PEMS reviewer follow-up requires promotionReviewId.");

  return store.transaction(async (tx) => {
    const candidate = await tx.findOne("pems_candidate_maturity", { candidate_id: normalizedCandidateId });
    if (!candidate) throw new Error(`PEMS candidate not found: ${normalizedCandidateId}`);
    const draft = await tx.findOne("pems_candidate_evaluator_drafts", { id: normalizedDraftId });
    if (!draft) throw new Error(`PEMS evaluator draft not found: ${normalizedDraftId}`);
    if (draft.candidate_id !== normalizedCandidateId) {
      throw new Error(`PEMS evaluator draft does not belong to candidate: ${normalizedCandidateId}`);
    }
    const revision = await tx.findOne("pems_candidate_claim_revisions", { id: normalizedRevisionId });
    if (!revision) throw new Error(`PEMS claim revision not found: ${normalizedRevisionId}`);
    if (revision.candidate_id !== normalizedCandidateId || revision.advisory_draft_id !== normalizedDraftId) {
      throw new Error("PEMS claim revision does not match the follow-up candidate and advisory draft.");
    }
    const review = await tx.findOne("pems_candidate_promotion_reviews", { id: normalizedReviewId });
    if (!review) throw new Error(`PEMS promotion review not found: ${normalizedReviewId}`);
    if (review.candidate_id !== normalizedCandidateId) {
      throw new Error(`PEMS promotion review does not belong to candidate: ${normalizedCandidateId}`);
    }
    const reviewMetadata = jsonValue(review.metadata_json, {});
    if (reviewMetadata.advisoryDraftId && reviewMetadata.advisoryDraftId !== normalizedDraftId) {
      throw new Error("PEMS promotion review does not match the follow-up advisory draft.");
    }

    const revisionOutcome =
      revision.revision_status === "revision_reclosure_passed"
        ? "revision_reclosure_passed"
        : "revision_reclosure_needs_attention";
    const decisionCloses = ["approved", "pass"].includes(String(review.decision ?? "").toLowerCase());
    const decisionBlocks = ["blocked", "rejected", "fail"].includes(String(review.decision ?? "").toLowerCase());
    const safetyBlocked = rowNumber(review.safety_incident_count) > 0;
    const derivedStatus = revisionOutcome === "revision_reclosure_passed" && decisionCloses && !safetyBlocked
      ? "resolved"
      : decisionBlocks || safetyBlocked
        ? "blocked"
        : "open";
    const normalizedFollowUpStatus = normalizeFollowUpStatus(followupStatus ?? derivedStatus);
    const derivedWorkflowStatus = normalizedFollowUpStatus === "resolved"
      ? "advisory_closed"
      : normalizedFollowUpStatus === "blocked"
        ? "blocked_by_safety"
        : "review_decision_linked";
    const normalizedWorkflowStatus = normalizeFollowUpWorkflowStatus(workflowStatus ?? derivedWorkflowStatus);
    const normalizedFollowUpType = normalizeFollowUpType(followupType);
    const safeMetadata = jsonValue(metadata, {});
    const followUp = await tx.insert("pems_candidate_review_followups", {
      id: createPersistedId("pems_review_followup"),
      candidate_id: normalizedCandidateId,
      advisory_draft_id: normalizedDraftId,
      claim_revision_id: normalizedRevisionId,
      promotion_review_id: normalizedReviewId,
      actor_user_id: actorUserId ? String(actorUserId) : null,
      followup_type: normalizedFollowUpType,
      followup_status: normalizedFollowUpStatus,
      workflow_status: normalizedWorkflowStatus,
      revision_outcome: revisionOutcome,
      action_required: safePreview(actionRequired || (normalizedFollowUpStatus === "resolved" ? "No advisory follow-up remains open." : "Reviewer follow-up remains required."), 180),
      rationale_hash: hashText(rationale),
      rationale_preview: safePreview(rationale, 180),
      metadata_json: JSON.stringify({
        ...safeMetadata,
        phase: 42,
        advisoryOnly: true,
        claimRevisionId: normalizedRevisionId,
        promotionReviewId: normalizedReviewId,
        reviewDecision: review.decision,
        reviewType: review.review_type,
        revisionOutcome,
        revisionResolvedVeto: normalizedFollowUpStatus === "resolved",
        rawRationaleStored: false,
        rawRevisionStored: false,
        rawReviewStored: false,
        followUpCreatesEvidence: false,
        followUpBypassesHumanReview: false,
        productionDrivingAllowed: false
      }),
      created_at: createdAt,
      updated_at: createdAt
    });
    return {
      version: PEMS_REVIEWER_FOLLOW_UP_VERSION,
      status: normalizedFollowUpStatus === "resolved"
        ? "phase42_reviewer_follow_up_resolved"
        : normalizedFollowUpStatus === "blocked"
          ? "phase42_reviewer_follow_up_blocked"
          : "phase42_reviewer_follow_up_open",
      ok: true,
      followUp: formatPemsReviewFollowUpRow(followUp),
      linkedClaimRevision: formatPemsClaimRevisionRow(revision),
      linkedPromotionReview: formatPemsPromotionReviewRow(review),
      advisoryOnly: true,
      productionDrivingAllowed: false,
      safety: {
        rawRationaleStored: false,
        rawRevisionStored: false,
        rawReviewStored: false,
        followUpCreatesEvidence: false,
        followUpBypassesHumanReview: false,
        productionDrivingAllowed: false
      }
    };
  });
}

function normalizeHistoryExportFilters(filters = {}) {
  return {
    candidateId: String(filters.candidateId ?? "").trim() || null,
    advisoryDraftId: String(filters.advisoryDraftId ?? "").trim() || null,
    followupStatus: normalizeWorkbenchFilter(filters.followupStatus, ["open", "resolved", "blocked"]) ?? "all",
    reviewDecision: normalizeWorkbenchFilter(filters.reviewDecision, ["approved", "rejected", "pass", "fail", "blocked"]) ?? "all",
    includeDrafts: filters.includeDrafts !== false,
    includeRevisions: filters.includeRevisions !== false,
    includeReviews: filters.includeReviews !== false,
    includeFollowUps: filters.includeFollowUps !== false
  };
}

function normalizeHistoryReviewFilters(filters = {}) {
  const sortBy = normalizeWorkbenchFilter(filters.sortBy, ["created_at", "history_row_count", "export_ref", "snapshot_hash"]) ?? "created_at";
  const sortDirection = normalizeWorkbenchFilter(filters.sortDirection, ["asc", "desc"]) ?? "desc";
  const rawLimit = rowNumber(filters.limit ?? 25);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 100)) : 25;
  return {
    candidateId: String(filters.candidateId ?? "").trim() || null,
    advisoryDraftId: String(filters.advisoryDraftId ?? "").trim() || null,
    followupStatus: normalizeWorkbenchFilter(filters.followupStatus, ["open", "resolved", "blocked"]) ?? "all",
    exportRef: String(filters.exportRef ?? "").trim() || null,
    snapshotHash: String(filters.snapshotHash ?? "").trim() || null,
    sortBy,
    sortDirection,
    limit
  };
}

function historyReviewOrderBy(normalized = {}) {
  const direction = normalized.sortDirection === "asc" ? "ASC" : "DESC";
  if (normalized.sortBy === "export_ref") return `export_ref ${direction}, created_at DESC`;
  if (normalized.sortBy === "snapshot_hash") return `history_snapshot_hash ${direction}, created_at DESC`;
  return `created_at ${direction}`;
}

function filteredPemsHistoryWhere(filters = {}) {
  const normalized = normalizeHistoryExportFilters(filters);
  const clauses = [];
  const params = [];
  if (normalized.candidateId) {
    clauses.push("candidate_id = ?");
    params.push(normalized.candidateId);
  }
  if (normalized.advisoryDraftId) {
    clauses.push("advisory_draft_id = ?");
    params.push(normalized.advisoryDraftId);
  }
  return { normalized, whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

function safeHistoryRow(type, row = {}) {
  return {
    type,
    id: row.id ?? null,
    candidateId: row.candidateId ?? row.candidate_id ?? null,
    advisoryDraftId: row.advisoryDraftId ?? row.advisory_draft_id ?? null,
    claimRevisionId: row.claimRevisionId ?? row.claim_revision_id ?? null,
    promotionReviewId: row.promotionReviewId ?? row.promotion_review_id ?? null,
    status: row.status ?? row.revisionStatus ?? row.revision_status ?? row.followupStatus ?? row.followup_status ?? null,
    decision: row.decision ?? null,
    reviewType: row.reviewType ?? row.review_type ?? null,
    followupStatus: row.followupStatus ?? row.followup_status ?? null,
    workflowStatus: row.workflowStatus ?? row.workflow_status ?? null,
    revisionOutcome: row.revisionOutcome ?? row.revision_outcome ?? null,
    createdAt: row.createdAt ?? row.created_at ?? null,
    updatedAt: row.updatedAt ?? row.updated_at ?? null
  };
}

function historyPreviewCounts(row) {
  return row?.historySnapshotPreview?.counts ?? {};
}

function historyPreviewRefs(row) {
  if (Array.isArray(row?.latestRefs)) return row.latestRefs;
  return Array.isArray(row?.historySnapshotPreview?.latestRefs) ? row.historySnapshotPreview.latestRefs : [];
}

function historyReviewRow(row) {
  if (!row) return null;
  const counts = historyPreviewCounts(row);
  const refs = historyPreviewRefs(row);
  return {
    id: row.id,
    candidateId: row.candidateId,
    advisoryDraftId: row.advisoryDraftId,
    exportRef: row.exportRef,
    exportHash: row.exportHash,
    historySnapshotHash: row.historySnapshotHash,
    followupStatuses: [...new Set(refs.map((ref) => ref.followupStatus).filter(Boolean))],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    counts: {
      draftCount: rowNumber(counts.draftCount),
      claimRevisionCount: rowNumber(counts.claimRevisionCount),
      promotionReviewCount: rowNumber(counts.promotionReviewCount),
      reviewerFollowUpCount: rowNumber(counts.reviewerFollowUpCount),
      resolvedFollowUpCount: rowNumber(counts.resolvedFollowUpCount),
      openFollowUpCount: rowNumber(counts.openFollowUpCount),
      blockedFollowUpCount: rowNumber(counts.blockedFollowUpCount),
      historyRowCount: rowNumber(counts.historyRowCount)
    },
    latestRefs: refs.slice(0, 12),
    advisoryOnly: true,
    productionDrivingAllowed: false,
    safety: {
      rawHistoryStored: false,
      rawRevisionStored: false,
      rawReviewStored: false,
      rawSourceStored: false,
      rawPromptStored: false,
      rawCompletionStored: false,
      rawOcrStored: false,
      rawFrameStored: false,
      exportCreatesEvidence: false,
      exportBypassesHumanReview: false,
      productionDrivingAllowed: false
    }
  };
}

function refKey(ref = {}) {
  return `${ref.type ?? "history"}:${ref.id ?? "unknown"}`;
}

export async function buildPemsReviewerHistorySnapshot(store, filters = {}) {
  if (!store) throw new Error("A store is required to build a PEMS reviewer history snapshot.");
  const normalized = normalizeHistoryExportFilters(filters);
  const draftClauses = [];
  const draftParams = [];
  if (normalized.candidateId) {
    draftClauses.push("candidate_id = ?");
    draftParams.push(normalized.candidateId);
  }
  if (normalized.advisoryDraftId) {
    draftClauses.push("id = ?");
    draftParams.push(normalized.advisoryDraftId);
  }
  const revisionFilter = filteredPemsHistoryWhere(normalized);
  const drafts = normalized.includeDrafts
    ? await store.all(
        `SELECT id, candidate_id, actor_user_id, draft_type, evaluator_mode, status,
                deterministic_validator_status, suggested_review_type, suggested_decision,
                advisory_note_hash, advisory_note_preview, consistency_trace_ref,
                consistency_trace_hash, consistency_trace_preview, metadata_json, created_at, updated_at
           FROM pems_candidate_evaluator_drafts
          ${draftClauses.length ? `WHERE ${draftClauses.join(" AND ")}` : ""}
          ORDER BY created_at DESC
          LIMIT 50;`,
        draftParams
      )
    : [];
  const revisions = normalized.includeRevisions
    ? await store.all(
        `SELECT id, candidate_id, advisory_draft_id, claim_id, actor_user_id, revision_status,
                original_claim_hash, original_claim_preview, suggested_edit_hash, suggested_edit_preview,
                revised_claim_hash, revised_claim_preview, source_pointer_ids_json,
                deterministic_reclosure_json, metadata_json, created_at, updated_at
           FROM pems_candidate_claim_revisions
          ${revisionFilter.whereSql}
          ORDER BY created_at DESC
          LIMIT 50;`,
        revisionFilter.params
      )
    : [];
  const followUpClauses = [];
  const followUpParams = [];
  if (normalized.candidateId) {
    followUpClauses.push("candidate_id = ?");
    followUpParams.push(normalized.candidateId);
  }
  if (normalized.advisoryDraftId) {
    followUpClauses.push("advisory_draft_id = ?");
    followUpParams.push(normalized.advisoryDraftId);
  }
  if (normalized.followupStatus !== "all") {
    followUpClauses.push("followup_status = ?");
    followUpParams.push(normalized.followupStatus);
  }
  const followUps = normalized.includeFollowUps
    ? await store.all(
        `SELECT id, candidate_id, advisory_draft_id, claim_revision_id, promotion_review_id,
                actor_user_id, followup_type, followup_status, workflow_status, revision_outcome,
                action_required, rationale_hash, rationale_preview, metadata_json, created_at, updated_at
           FROM pems_candidate_review_followups
          ${followUpClauses.length ? `WHERE ${followUpClauses.join(" AND ")}` : ""}
          ORDER BY created_at DESC
          LIMIT 50;`,
        followUpParams
      )
    : [];
  const reviewClauses = [];
  const reviewParams = [];
  if (normalized.candidateId) {
    reviewClauses.push("candidate_id = ?");
    reviewParams.push(normalized.candidateId);
  }
  if (normalized.reviewDecision !== "all") {
    reviewClauses.push("decision = ?");
    reviewParams.push(normalized.reviewDecision);
  }
  let reviews = normalized.includeReviews
    ? await store.all(
        `SELECT id, candidate_id, actor_user_id, review_type, decision, evidence_ref_count,
                validator_pass_count, safety_incident_count, rationale_hash, rationale_preview,
                metadata_json, created_at
           FROM pems_candidate_promotion_reviews
          ${reviewClauses.length ? `WHERE ${reviewClauses.join(" AND ")}` : ""}
          ORDER BY created_at DESC
          LIMIT 50;`,
        reviewParams
      )
    : [];
  if (normalized.advisoryDraftId) {
    reviews = reviews.filter((row) => jsonValue(row.metadata_json, {}).advisoryDraftId === normalized.advisoryDraftId);
  }
  const formattedDrafts = drafts.map(formatPemsDraftRow).filter(Boolean);
  const formattedRevisions = revisions.map(formatPemsClaimRevisionRow).filter(Boolean);
  const formattedReviews = reviews.map(formatPemsPromotionReviewRow).filter(Boolean);
  const formattedFollowUps = followUps.map(formatPemsReviewFollowUpRow).filter(Boolean);
  const historyRows = [
    ...formattedDrafts.map((row) => safeHistoryRow("advisory_draft", row)),
    ...formattedRevisions.map((row) => safeHistoryRow("claim_revision", row)),
    ...formattedReviews.map((row) => safeHistoryRow("promotion_review", row)),
    ...formattedFollowUps.map((row) => safeHistoryRow("review_followup", row))
  ].sort((a, b) => String(b.createdAt ?? b.updatedAt ?? "").localeCompare(String(a.createdAt ?? a.updatedAt ?? "")));
  const counts = {
    draftCount: formattedDrafts.length,
    claimRevisionCount: formattedRevisions.length,
    promotionReviewCount: formattedReviews.length,
    reviewerFollowUpCount: formattedFollowUps.length,
    resolvedFollowUpCount: formattedFollowUps.filter((row) => row.followupStatus === "resolved").length,
    openFollowUpCount: formattedFollowUps.filter((row) => row.followupStatus === "open").length,
    blockedFollowUpCount: formattedFollowUps.filter((row) => row.followupStatus === "blocked").length,
    historyRowCount: historyRows.length
  };
  const preview = {
    version: PEMS_REVIEWER_HISTORY_EXPORT_VERSION,
    filters: normalized,
    counts,
    latestRefs: historyRows.slice(0, 12),
    safety: {
      rawHistoryStored: false,
      rawRevisionStored: false,
      rawReviewStored: false,
      rawSourceStored: false,
      rawPromptStored: false,
      rawCompletionStored: false,
      rawOcrStored: false,
      rawFrameStored: false,
      exportCreatesEvidence: false,
      exportBypassesHumanReview: false,
      productionDrivingAllowed: false
    }
  };
  const snapshotHash = hashText(JSON.stringify({ filters: normalized, counts, historyRows }));
  return {
    version: PEMS_REVIEWER_HISTORY_EXPORT_VERSION,
    filters: normalized,
    counts,
    historyRows,
    snapshotHash,
    snapshotPreview: preview,
    advisoryOnly: true,
    productionDrivingAllowed: false,
    safety: preview.safety
  };
}

export async function recordPemsReviewerHistoryExport(
  store,
  {
    candidateId = null,
    advisoryDraftId = null,
    actorUserId = "operator",
    filters = {},
    exportReason = "",
    metadata = {},
    createdAt = new Date().toISOString()
  } = {}
) {
  if (!store) throw new Error("A store is required to record a PEMS reviewer history export.");
  const effectiveFilters = normalizeHistoryExportFilters({ ...filters, candidateId: candidateId ?? filters.candidateId, advisoryDraftId: advisoryDraftId ?? filters.advisoryDraftId });
  const snapshot = await buildPemsReviewerHistorySnapshot(store, effectiveFilters);
  const normalizedCandidateId = effectiveFilters.candidateId ?? snapshot.historyRows.find((row) => row.candidateId)?.candidateId ?? null;
  const normalizedDraftId = effectiveFilters.advisoryDraftId ?? snapshot.historyRows.find((row) => row.advisoryDraftId)?.advisoryDraftId ?? null;
  const safeMetadata = jsonValue(metadata, {});
  const exportRef = stableRef("pems_review_history_export", normalizedCandidateId, normalizedDraftId, JSON.stringify(effectiveFilters), snapshot.snapshotHash);
  const exportHash = hashText(JSON.stringify({ exportRef, snapshotHash: snapshot.snapshotHash, filters: effectiveFilters, counts: snapshot.counts }));
  const exportRow = await store.insert("pems_candidate_review_history_exports", {
    id: createPersistedId("pems_history_export"),
    candidate_id: normalizedCandidateId,
    advisory_draft_id: normalizedDraftId,
    actor_user_id: actorUserId ? String(actorUserId) : null,
    export_reason_hash: hashText(exportReason),
    export_reason_preview: safePreview(exportReason || "Reviewer history audit export requested.", 180),
    filters_json: JSON.stringify(effectiveFilters),
    export_ref: exportRef,
    export_hash: exportHash,
    history_snapshot_hash: snapshot.snapshotHash,
    history_snapshot_preview_json: JSON.stringify(snapshot.snapshotPreview),
    metadata_json: JSON.stringify({
      ...safeMetadata,
      phase: 43,
      version: PEMS_REVIEWER_HISTORY_EXPORT_VERSION,
      advisoryOnly: true,
      rawHistoryStored: false,
      rawRevisionStored: false,
      rawReviewStored: false,
      rawSourceStored: false,
      rawPromptStored: false,
      rawCompletionStored: false,
      rawOcrStored: false,
      rawFrameStored: false,
      exportCreatesEvidence: false,
      exportBypassesHumanReview: false,
      productionDrivingAllowed: false
    }),
    created_at: createdAt,
    updated_at: createdAt
  });
  return {
    version: PEMS_REVIEWER_HISTORY_EXPORT_VERSION,
    status: "phase43_reviewer_history_audit_export_recorded",
    ok: true,
    export: formatPemsReviewerHistoryExportRow(exportRow),
    snapshot,
    advisoryOnly: true,
    productionDrivingAllowed: false,
    safety: snapshot.safety
  };
}

export async function listPemsReviewerHistoryExports(store, filters = {}) {
  if (!store) throw new Error("A store is required to list PEMS reviewer history exports.");
  const normalized = normalizeHistoryReviewFilters(filters);
  const clauses = [];
  const params = [];
  if (normalized.candidateId) {
    clauses.push("candidate_id = ?");
    params.push(normalized.candidateId);
  }
  if (normalized.advisoryDraftId) {
    clauses.push("advisory_draft_id = ?");
    params.push(normalized.advisoryDraftId);
  }
  if (normalized.exportRef) {
    clauses.push("export_ref = ?");
    params.push(normalized.exportRef);
  }
  if (normalized.snapshotHash) {
    clauses.push("history_snapshot_hash = ?");
    params.push(normalized.snapshotHash);
  }
  params.push(normalized.limit);
  const rows = await store.all(
    `SELECT id, candidate_id, advisory_draft_id, actor_user_id, export_reason_hash,
            export_reason_preview, filters_json, export_ref, export_hash,
            history_snapshot_hash, history_snapshot_preview_json, metadata_json,
            created_at, updated_at
       FROM pems_candidate_review_history_exports
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY ${historyReviewOrderBy(normalized)}
      LIMIT ?;`,
    params
  );
  let reviewRows = rows.map(formatPemsReviewerHistoryExportRow).map(historyReviewRow).filter(Boolean);
  if (normalized.followupStatus !== "all") {
    reviewRows = reviewRows.filter((row) => row.followupStatuses.includes(normalized.followupStatus));
  }
  if (normalized.sortBy === "history_row_count") {
    reviewRows.sort((a, b) => {
      const delta = rowNumber(a.counts.historyRowCount) - rowNumber(b.counts.historyRowCount);
      return normalized.sortDirection === "asc" ? delta : -delta;
    });
  }
  return {
    version: PEMS_REVIEWER_HISTORY_REVIEW_VERSION,
    status: reviewRows.length ? "phase44_history_review_exports_listed" : "phase44_history_review_waiting_for_exports",
    ok: true,
    appliedFilters: normalized,
    filterOptions: {
      followupStatuses: ["all", "open", "resolved", "blocked"],
      sortBy: ["created_at", "history_row_count", "export_ref", "snapshot_hash"],
      sortDirection: ["desc", "asc"]
    },
    exportCount: reviewRows.length,
    rows: reviewRows,
    advisoryOnly: true,
    productionDrivingAllowed: false,
    safety: {
      rawHistoryStored: false,
      rawRevisionStored: false,
      rawReviewStored: false,
      rawSourceStored: false,
      searchCreatesEvidence: false,
      searchBypassesHumanReview: false,
      productionDrivingAllowed: false
    }
  };
}

async function getPemsReviewerHistoryExportById(store, id) {
  if (!id) return null;
  const row = await store.get(
    `SELECT id, candidate_id, advisory_draft_id, actor_user_id, export_reason_hash,
            export_reason_preview, filters_json, export_ref, export_hash,
            history_snapshot_hash, history_snapshot_preview_json, metadata_json,
            created_at, updated_at
       FROM pems_candidate_review_history_exports
      WHERE id = ?
      LIMIT 1;`,
    [id]
  );
  return formatPemsReviewerHistoryExportRow(row);
}

export async function comparePemsReviewerHistoryExports(store, options = {}) {
  if (!store) throw new Error("A store is required to compare PEMS reviewer history exports.");
  let baseline = await getPemsReviewerHistoryExportById(store, options.baselineExportId);
  let comparison = await getPemsReviewerHistoryExportById(store, options.comparisonExportId);
  if (!baseline || !comparison) {
    const latest = await listPemsReviewerHistoryExports(store, { ...options, sortBy: "created_at", sortDirection: "desc", limit: 2 });
    comparison = comparison ?? latest.rows[0] ?? null;
    baseline = baseline ?? latest.rows[1] ?? null;
  } else {
    baseline = historyReviewRow(baseline);
    comparison = historyReviewRow(comparison);
  }
  const baselineRefs = historyPreviewRefs(baseline);
  const comparisonRefs = historyPreviewRefs(comparison);
  const baselineRefSet = new Set(baselineRefs.map(refKey));
  const comparisonRefSet = new Set(comparisonRefs.map(refKey));
  const addedRefs = comparisonRefs.filter((ref) => !baselineRefSet.has(refKey(ref))).map((ref) => safeHistoryRow(ref.type ?? "history", ref));
  const removedRefs = baselineRefs.filter((ref) => !comparisonRefSet.has(refKey(ref))).map((ref) => safeHistoryRow(ref.type ?? "history", ref));
  const baselineCounts = baseline?.counts ?? {};
  const comparisonCounts = comparison?.counts ?? {};
  return {
    version: PEMS_REVIEWER_HISTORY_REVIEW_VERSION,
    status: baseline && comparison ? "phase44_history_export_snapshot_comparison_ready" : "phase44_history_export_snapshot_comparison_waiting",
    ok: Boolean(baseline && comparison),
    baseline,
    comparison,
    delta: {
      historyRowCount: rowNumber(comparisonCounts.historyRowCount) - rowNumber(baselineCounts.historyRowCount),
      draftCount: rowNumber(comparisonCounts.draftCount) - rowNumber(baselineCounts.draftCount),
      claimRevisionCount: rowNumber(comparisonCounts.claimRevisionCount) - rowNumber(baselineCounts.claimRevisionCount),
      promotionReviewCount: rowNumber(comparisonCounts.promotionReviewCount) - rowNumber(baselineCounts.promotionReviewCount),
      reviewerFollowUpCount: rowNumber(comparisonCounts.reviewerFollowUpCount) - rowNumber(baselineCounts.reviewerFollowUpCount),
      resolvedFollowUpCount: rowNumber(comparisonCounts.resolvedFollowUpCount) - rowNumber(baselineCounts.resolvedFollowUpCount),
      openFollowUpCount: rowNumber(comparisonCounts.openFollowUpCount) - rowNumber(baselineCounts.openFollowUpCount),
      blockedFollowUpCount: rowNumber(comparisonCounts.blockedFollowUpCount) - rowNumber(baselineCounts.blockedFollowUpCount)
    },
    changedRefs: {
      added: addedRefs,
      removed: removedRefs
    },
    advisoryOnly: true,
    productionDrivingAllowed: false,
    safety: {
      rawHistoryStored: false,
      rawRevisionStored: false,
      rawReviewStored: false,
      rawSourceStored: false,
      comparisonCreatesEvidence: false,
      comparisonBypassesHumanReview: false,
      automaticProductionRecommendation: false,
      productionDrivingAllowed: false
    }
  };
}

function liveEvaluatorBlocked(status, reason, details = {}) {
  return {
    version: PEMS_LIVE_EVALUATOR_FILTERING_VERSION,
    status,
    ok: false,
    blocked: true,
    reason,
    ...details,
    advisoryOnly: true,
    liveProofClaimed: false,
    productionDrivingAllowed: false,
    safety: {
      rawPromptStored: false,
      rawCompletionStored: false,
      rawSourceStored: false,
      mockedLlmOutputCountsAsProof: false,
      productionDrivingAllowed: false
    }
  };
}

function parseLiveEvaluatorContent(content, { allowedSourcePointerIds = [] } = {}) {
  const text = String(content ?? "");
  try {
    const parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
    const claimCitationClosure = normalizePemsClaimCitationClosure(
      parsed.claimCitationClosure ?? parsed.claim_citation_closure ?? parsed.claims ?? [],
      { allowedSourcePointerIds }
    );
    return {
      advisoryNote: safePreview(parsed.advisoryNote ?? parsed.advisory_note ?? parsed.summary ?? text, 700),
      suggestedDecision: normalizeReviewDecision(parsed.suggestedDecision ?? parsed.suggested_decision ?? "pass"),
      suggestedReviewType: normalizeReviewType(parsed.suggestedReviewType ?? parsed.suggested_review_type ?? "validator_evaluation"),
      citationClosure: safeList(parsed.citationClosure ?? parsed.citation_closure ?? parsed.sourcePointerIds ?? parsed.source_pointer_ids),
      claimCitationClosure
    };
  } catch {
    return {
      advisoryNote: safePreview(text, 700),
      suggestedDecision: "pass",
      suggestedReviewType: "validator_evaluation",
      citationClosure: [],
      claimCitationClosure: []
    };
  }
}

function buildLiveEvaluatorMessages({ candidate, sourcePointerIds, deterministicValidatorStatus, reviewerQuestion }) {
  return [
    {
      role: "system",
      content:
        "You are a supervised advisory evaluator for Brainstyworkers PEMS. Use only source pointer IDs and structured refs. Do not invent facts, do not include PHI, do not recommend production use, and return compact JSON."
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "create_ref_only_advisory_draft_for_human_reviewer",
        outputSchema: {
          advisoryNote: "short safe reviewer note with no raw source text",
          suggestedReviewType: "validator_evaluation | citation_evaluation | safety_review | human_review",
          suggestedDecision: "pass | fail | blocked | approved | rejected",
          citationClosure: ["source_pointer_id"],
          claimCitationClosure: [
            {
              claim: "short factual advisory claim preview",
              status: "supported | low_confidence | unsupported",
              sourcePointerIds: ["source_pointer_id"],
              confidence: 0.0,
              explanation: "short safe reason",
              suggestedEdit: "short reviewer-side edit when unsupported or low confidence"
            }
          ]
        },
        candidate: {
          candidateId: candidate?.candidate_id ?? candidate?.candidateId ?? null,
          workflow: candidate?.workflow ?? null,
          selectedSkillKey: candidate?.selected_skill_key ?? candidate?.selectedSkillKey ?? null,
          shadowRunCount: rowNumber(candidate?.shadow_run_count ?? candidate?.shadowRunCount),
          latestScore: rowNumber(candidate?.latest_score ?? candidate?.latestScore),
          promotionStatus: candidate?.promotion_status ?? candidate?.promotionStatus ?? null,
          productionDrivingAllowed: false
        },
        deterministicValidatorStatus,
        allowedSourcePointerIds: sourcePointerIds,
        sourcePointers: sourcePointerIds.map((id) => ({ id, kind: "source_pointer_ref" })),
        reviewerQuestion: safePreview(reviewerQuestion, 240),
        safety: {
          claimLevelCitationClosureRequired: true,
          rawPromptStoredInDraft: false,
          rawCompletionStoredInDraft: false,
          rawClaimStoredInDraft: false,
          productionDrivingAllowed: false
        }
      })
    }
  ];
}

export async function createLiveGatedPemsEvaluatorDraft(
  store,
  {
    candidateId,
    actorUserId = "live_evaluator",
    deterministicValidatorStatus = "pass",
    reviewerQuestion = "Generate a ref-only advisory evaluator draft for the human reviewer.",
    sourcePointerIds = [],
    modelConfig = {},
    mockedLlmOutput = false,
    createdAt = new Date().toISOString()
  } = {},
  { llmInvoker = null } = {}
) {
  if (!store) throw new Error("A store is required to create a live-gated PEMS evaluator draft.");
  const normalizedCandidateId = String(candidateId ?? "").trim();
  const candidate = normalizedCandidateId
    ? await store.findOne("pems_candidate_maturity", { candidate_id: normalizedCandidateId })
    : await store.get(
        `SELECT *
           FROM pems_candidate_maturity
          ORDER BY updated_at DESC
          LIMIT 1;`
      );
  if (!candidate) return liveEvaluatorBlocked("phase39_live_evaluator_blocked_missing_candidate", "No PEMS candidate is available for live evaluator generation.");

  const normalizedSourcePointerIds = safeList(sourcePointerIds);
  if (!normalizedSourcePointerIds.length) {
    return liveEvaluatorBlocked("phase39_live_evaluator_blocked_missing_source_pointers", "Live evaluator generation requires source pointer IDs.", {
      candidateId: candidate.candidate_id
    });
  }

  const apiKeyConfigured = Boolean(modelConfig.configured ?? process.env.OPENAI_API_KEY);
  const model = modelConfig.model || process.env.OPENAI_MODEL || "gpt-5-mini";
  const baseURL = modelConfig.baseURL || process.env.BRAINSTY_OPENAI_BASE_URL || "https://api.openai.com/v1";
  if (!apiKeyConfigured && !llmInvoker) {
    return liveEvaluatorBlocked("phase39_live_evaluator_blocked_missing_model_key", "OPENAI_API_KEY is not configured.", {
      candidateId: candidate.candidate_id,
      model
    });
  }

  const messages = buildLiveEvaluatorMessages({
    candidate,
    sourcePointerIds: normalizedSourcePointerIds,
    deterministicValidatorStatus,
    reviewerQuestion
  });
  const payloadObservation = await recordOutboundPayloadObservation(store, {
    sessionId: null,
    payload: { model, baseURL, messages },
    payloadType: "openai_pems_live_evaluator_messages",
    destination: "openai",
    policyMode: "source_pointer_or_safe_control_payload",
    requireSourcePointers: true
  });

  let responseContent;
  try {
    if (llmInvoker) {
      responseContent = await llmInvoker(messages, { model, baseURL, payloadObservation });
    } else {
      const { llm } = createTieredChatModel("pems_live_evaluator", {
        model,
        baseURL,
        timeout: 60000,
        maxRetries: 1
      });
      const response = await llm.invoke(messages);
      responseContent = response.content;
    }
  } catch (error) {
    return liveEvaluatorBlocked("phase39_live_evaluator_failed", safePreview(error.message, 240), {
      candidateId: candidate.candidate_id,
      model,
      egressTraceRef: `outbound_payload:${payloadObservation.payloadHash.slice(0, 16)}`
    });
  }

  const parsed = parseLiveEvaluatorContent(responseContent, { allowedSourcePointerIds: normalizedSourcePointerIds });
  const closureSummary = pemsClaimCitationClosureSummary(parsed.claimCitationClosure);
  const completionHash = hashText(responseContent);
  const result = await createPemsEvaluatorDraft(store, {
    candidateId: candidate.candidate_id,
    actorUserId,
    draftType: "evaluator_draft_note",
    evaluatorMode: "llm_assisted_advisory",
    deterministicValidatorStatus,
    suggestedReviewType: closureSummary.reviewerEditRequired ? "citation_evaluation" : parsed.suggestedReviewType,
    suggestedDecision: closureSummary.reviewerEditRequired ? "blocked" : parsed.suggestedDecision,
    advisoryNote: parsed.advisoryNote,
    consistencyTrace: {
      traceKind: "phase39_live_evaluator_ref_trace",
      candidateId: candidate.candidate_id,
      sourcePointerIds: normalizedSourcePointerIds,
      citationClosure: parsed.citationClosure,
      claimCitationClosure: parsed.claimCitationClosure,
      claimCitationClosureSummary: closureSummary,
      completionHash,
      rawCompletionStored: false
    },
    metadata: {
      phase: 39,
      liveEvaluatorGeneration: true,
      sourcePointerIds: normalizedSourcePointerIds,
      citationClosure: parsed.citationClosure,
      claimCitationClosure: parsed.claimCitationClosure,
      claimCitationClosureSummary: closureSummary,
      claimLevelCitationClosure: true,
      evaluatorModelRef: `openai:${safePreview(model, 48)}`,
      modelProviderRef: "openai",
      egressTraceRef: `outbound_payload:${payloadObservation.payloadHash.slice(0, 16)}`,
      egressObserved: true,
      liveLlmEvaluatorUsed: true,
      mockedLlmOutput: Boolean(mockedLlmOutput || llmInvoker),
      outboundPayloadHash: payloadObservation.payloadHash,
      completionHash,
      rawPromptStored: false,
      rawCompletionStored: false,
      rawClaimStored: false,
      rawSourceStored: false,
      productionDrivingAllowed: false
    },
    createdAt
  });
  return {
    version: PEMS_LIVE_EVALUATOR_FILTERING_VERSION,
    status: result.draft.metadata_json?.includes?.('"mockedLlmOutput":true')
      ? "phase39_live_evaluator_mocked_output_not_proof"
      : "phase39_live_evaluator_draft_created",
    ok: true,
    candidateId: candidate.candidate_id,
    draft: result.draft,
    egressTraceRef: `outbound_payload:${payloadObservation.payloadHash.slice(0, 16)}`,
    modelRef: `openai:${safePreview(model, 48)}`,
    liveProofClaimed: !Boolean(mockedLlmOutput || llmInvoker),
    advisoryOnly: true,
    productionDrivingAllowed: false,
    safety: {
      rawPromptStored: false,
      rawCompletionStored: false,
      rawSourceStored: false,
      mockedLlmOutputCountsAsProof: false,
      productionDrivingAllowed: false
    }
  };
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
  const trustedControl = await getPemsTrustedAnswerDrivingControl(store);
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
  const latestGate = latestCandidate
    ? evaluatePemsPromotionGate(
        {
          ...latestCandidate,
          trustedAnswerDrivingKillSwitchEnabled: trustedControl.killSwitchEnabled
        },
        latestReviews
      )
    : null;
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
    trustedAnswerDrivingCandidateCount: rowNumber(candidateCounts?.productionDrivingCandidateCount),
    trustedAnswerDrivingControl: trustedControl,
    productionDrivingAllowed: rowNumber(candidateCounts?.productionDrivingCandidateCount) > 0 && !trustedControl.killSwitchEnabled,
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
          productionDrivingAllowed: latestCandidate.production_driving_allowed === 1 && !trustedControl.killSwitchEnabled,
          promotion: parseJson(latestCandidate.promotion_json, {})
        }
      : null,
    latestGate,
    safety: {
      rawRationaleStored: false,
      rawSourceStored: false,
      supervisedAdvisoryOnly: rowNumber(candidateCounts?.productionDrivingCandidateCount) === 0,
      killSwitchEnabled: trustedControl.killSwitchEnabled,
      productionDrivingAllowed: rowNumber(candidateCounts?.productionDrivingCandidateCount) > 0 && !trustedControl.killSwitchEnabled
    }
  };
}

export function buildPemsPromotionReadinessProof(status = {}) {
  const trustedActive = (status.trustedAnswerDrivingCandidateCount ?? status.productionDrivingCandidateCount ?? 0) > 0 && status.trustedAnswerDrivingControl?.killSwitchEnabled !== true;
  const active = (status.supervisedAdvisoryCandidateCount ?? 0) > 0;
  const reviewing = (status.reviewCount ?? 0) > 0;
  return {
    version: trustedActive ? PEMS_TRUSTED_ANSWER_DRIVING_VERSION : PEMS_PROMOTION_GATE_VERSION,
    status: trustedActive
      ? "phase58_trusted_answer_driving_active"
      : active
        ? "phase35_supervised_promotion_gate_active"
        : reviewing
          ? "phase35_supervised_promotion_gate_reviewing"
          : "phase35_supervised_promotion_gate_ready_no_reviews",
    ok: status.ok !== false,
    mode: trustedActive ? "trusted_answer_driving_gate" : "supervised_advisory_gate_only",
    score: trustedActive ? 100 : active ? 80 : reviewing ? 78 : 75,
    target: trustedActive ? 100 : 80,
    candidateCount: status.candidateCount ?? 0,
    reviewCount: status.reviewCount ?? 0,
    humanApprovalCount: status.humanApprovalCount ?? 0,
    validatorPassCount: status.validatorPassCount ?? 0,
    citationPassCount: status.citationPassCount ?? 0,
    supervisedAdvisoryCandidateCount: status.supervisedAdvisoryCandidateCount ?? 0,
    trustedAnswerDrivingCandidateCount: status.trustedAnswerDrivingCandidateCount ?? status.productionDrivingCandidateCount ?? 0,
    trustedAnswerDrivingControl: status.trustedAnswerDrivingControl ?? null,
    productionDrivingAllowed: trustedActive,
    latestCandidate: status.latestCandidate ?? null,
    latestGate: status.latestGate ?? null,
    safety: status.safety ?? {
      rawRationaleStored: false,
      rawSourceStored: false,
      supervisedAdvisoryOnly: !trustedActive,
      productionDrivingAllowed: trustedActive
    }
  };
}

export async function getPemsReviewerWorkbenchStatus(store, filters = {}) {
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
  const draftFilter = filteredDraftWhere(filters);
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
  const liveDraftCounts = await store.get(
    `SELECT
       COALESCE(SUM(CASE WHEN metadata_json LIKE '%"liveEvaluatorGeneration":true%' THEN 1 ELSE 0 END), 0) AS liveGeneratedDraftCount,
       COALESCE(SUM(CASE WHEN metadata_json LIKE '%"liveLlmEvaluatorUsed":true%' AND metadata_json LIKE '%"egressObserved":true%' AND metadata_json NOT LIKE '%"mockedLlmOutput":true%' THEN 1 ELSE 0 END), 0) AS liveProofDraftCount,
       COALESCE(SUM(CASE WHEN metadata_json LIKE '%"mockedLlmOutput":true%' THEN 1 ELSE 0 END), 0) AS mockedDraftCount
     FROM pems_candidate_evaluator_drafts;`
  );
  const filteredDraftCounts = await store.get(
    `SELECT COUNT(*) AS filteredDraftCount
       FROM pems_candidate_evaluator_drafts
      ${draftFilter.whereSql};`,
    draftFilter.params
  );
  const reviewCounts = await store.get(
    `SELECT
       COUNT(*) AS reviewCount,
       COALESCE(SUM(CASE WHEN metadata_json LIKE '%"advisoryOnly":true%' THEN 1 ELSE 0 END), 0) AS advisoryLinkedReviewCount
     FROM pems_candidate_promotion_reviews;`
  );
  const revisionCounts = await store.get(
    `SELECT
       COUNT(*) AS claimRevisionCount,
       COALESCE(SUM(CASE WHEN revision_status = 'revision_reclosure_passed' THEN 1 ELSE 0 END), 0) AS claimRevisionReclosedCount,
       COALESCE(SUM(CASE WHEN revision_status = 'revision_needs_reviewer_attention' THEN 1 ELSE 0 END), 0) AS claimRevisionAttentionCount
     FROM pems_candidate_claim_revisions;`
  );
  const followUpCounts = await store.get(
    `SELECT
       COUNT(*) AS reviewerFollowUpCount,
       COALESCE(SUM(CASE WHEN followup_status = 'resolved' THEN 1 ELSE 0 END), 0) AS reviewerFollowUpResolvedCount,
       COALESCE(SUM(CASE WHEN followup_status = 'open' THEN 1 ELSE 0 END), 0) AS reviewerFollowUpOpenCount,
       COALESCE(SUM(CASE WHEN followup_status = 'blocked' THEN 1 ELSE 0 END), 0) AS reviewerFollowUpBlockedCount,
       COALESCE(SUM(CASE WHEN claim_revision_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS revisionBoundFollowUpCount,
       COALESCE(SUM(CASE WHEN promotion_review_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS reviewDecisionBoundFollowUpCount
     FROM pems_candidate_review_followups;`
  );
  const historyExportCounts = await store.get(
    `SELECT
       COUNT(*) AS reviewerHistoryExportCount,
       COALESCE(SUM(CASE WHEN metadata_json LIKE '%"rawHistoryStored":false%' THEN 1 ELSE 0 END), 0) AS safeHistoryExportCount
     FROM pems_candidate_review_history_exports;`
  );
  const latestDraft = await store.get(
    `SELECT id, candidate_id, actor_user_id, draft_type, evaluator_mode, status,
            deterministic_validator_status, suggested_review_type, suggested_decision,
            advisory_note_hash, advisory_note_preview, consistency_trace_ref,
            consistency_trace_hash, consistency_trace_preview, metadata_json, created_at, updated_at
     FROM pems_candidate_evaluator_drafts
      ${draftFilter.whereSql}
      ORDER BY created_at DESC
      LIMIT 1;`
    ,
    draftFilter.params
  );
  const draftQueueRows = await store.all(
    `SELECT id, candidate_id, actor_user_id, draft_type, evaluator_mode, status,
            deterministic_validator_status, suggested_review_type, suggested_decision,
            advisory_note_hash, advisory_note_preview, consistency_trace_ref,
            consistency_trace_hash, consistency_trace_preview, metadata_json, created_at, updated_at
       FROM pems_candidate_evaluator_drafts
      ${draftFilter.whereSql}
      ORDER BY created_at DESC
      LIMIT 8;`,
    draftFilter.params
  );
  const latestRevision = await store.get(
    `SELECT id, candidate_id, advisory_draft_id, claim_id, actor_user_id, revision_status,
            original_claim_hash, original_claim_preview, suggested_edit_hash, suggested_edit_preview,
            revised_claim_hash, revised_claim_preview, source_pointer_ids_json,
            deterministic_reclosure_json, metadata_json, created_at, updated_at
       FROM pems_candidate_claim_revisions
      ORDER BY created_at DESC
      LIMIT 1;`
  );
  const latestFollowUp = await store.get(
    `SELECT id, candidate_id, advisory_draft_id, claim_revision_id, promotion_review_id,
            actor_user_id, followup_type, followup_status, workflow_status, revision_outcome,
            action_required, rationale_hash, rationale_preview, metadata_json, created_at, updated_at
       FROM pems_candidate_review_followups
      ORDER BY created_at DESC
      LIMIT 1;`
  );
  const latestHistoryExport = await store.get(
    `SELECT id, candidate_id, advisory_draft_id, actor_user_id, export_reason_hash,
            export_reason_preview, filters_json, export_ref, export_hash,
            history_snapshot_hash, history_snapshot_preview_json, metadata_json,
            created_at, updated_at
       FROM pems_candidate_review_history_exports
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
  const latestReview = latestReviews.length ? latestReviews[latestReviews.length - 1] : null;
  const latestGate = latestCandidate ? evaluatePemsPromotionGate(latestCandidate, latestReviews) : null;
  const draftCountValue = rowNumber(draftCounts?.draftCount);
  const formattedDraftQueue = draftQueueRows.map(formatPemsDraftRow);
  const formattedLatestDraft = formatPemsDraftRow(latestDraft);
  const latestClaimCitationClosure = buildPemsDraftClaimCitationClosure(formattedLatestDraft);
  const closureReadyDraftCount = formattedDraftQueue.filter((draft) => (draft?.claimCitationClosure?.claimCount ?? 0) > 0).length;
  const closureVetoDraftCount = formattedDraftQueue.filter(
    (draft) => (draft?.claimCitationClosure?.unsupportedCount ?? 0) > 0 || (draft?.claimCitationClosure?.lowConfidenceCount ?? 0) > 0
  ).length;
  const reviewerHistoryExportReview = await listPemsReviewerHistoryExports(store, filters);
  const reviewerHistoryExportComparison = await comparePemsReviewerHistoryExports(store, filters);
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
    filteredDraftCount: rowNumber(filteredDraftCounts?.filteredDraftCount),
    llmAssistedDraftCount: rowNumber(draftCounts?.llmAssistedDraftCount),
    consistencyTraceDraftCount: rowNumber(draftCounts?.consistencyTraceDraftCount),
    readyDraftCount: rowNumber(draftCounts?.readyDraftCount),
    blockedDraftCount: rowNumber(draftCounts?.blockedDraftCount),
    liveGeneratedDraftCount: rowNumber(liveDraftCounts?.liveGeneratedDraftCount),
    liveProofDraftCount: rowNumber(liveDraftCounts?.liveProofDraftCount),
    mockedDraftCount: rowNumber(liveDraftCounts?.mockedDraftCount),
    claimClosureDraftCount: closureReadyDraftCount,
    claimClosureVetoDraftCount: closureVetoDraftCount,
    claimRevisionCount: rowNumber(revisionCounts?.claimRevisionCount),
    claimRevisionReclosedCount: rowNumber(revisionCounts?.claimRevisionReclosedCount),
    claimRevisionAttentionCount: rowNumber(revisionCounts?.claimRevisionAttentionCount),
    reviewerFollowUpCount: rowNumber(followUpCounts?.reviewerFollowUpCount),
    reviewerFollowUpResolvedCount: rowNumber(followUpCounts?.reviewerFollowUpResolvedCount),
    reviewerFollowUpOpenCount: rowNumber(followUpCounts?.reviewerFollowUpOpenCount),
    reviewerFollowUpBlockedCount: rowNumber(followUpCounts?.reviewerFollowUpBlockedCount),
    revisionBoundFollowUpCount: rowNumber(followUpCounts?.revisionBoundFollowUpCount),
    reviewDecisionBoundFollowUpCount: rowNumber(followUpCounts?.reviewDecisionBoundFollowUpCount),
    reviewerHistoryExportCount: rowNumber(historyExportCounts?.reviewerHistoryExportCount),
    safeHistoryExportCount: rowNumber(historyExportCounts?.safeHistoryExportCount),
    reviewerHistoryExportReviewCount: reviewerHistoryExportReview.exportCount,
    reviewCount: rowNumber(reviewCounts?.reviewCount),
    advisoryLinkedReviewCount: rowNumber(reviewCounts?.advisoryLinkedReviewCount),
    productionDrivingAllowed: false,
    appliedFilters: draftFilter.appliedFilters,
    filterOptions: {
      draftStatuses: ["all", "draft_ready_for_human_review", "needs_reviewer_attention", "blocked_by_validator"],
      evaluatorModes: ["all", "deterministic_validator_advisory", "llm_assisted_advisory", "nestr_consistency_trace"],
      liveOnly: [false, true]
    },
    reviewerHistoryExportReview,
    reviewerHistoryExportComparison,
    draftQueue: formattedDraftQueue,
    latestDraft: formattedLatestDraft,
    latestClaimCitationClosure,
    latestClaimRevision: formatPemsClaimRevisionRow(latestRevision),
    latestPromotionReview: formatPemsPromotionReviewRow(latestReview),
    latestReviewerFollowUp: formatPemsReviewFollowUpRow(latestFollowUp),
    latestReviewerHistoryExport: formatPemsReviewerHistoryExportRow(latestHistoryExport),
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
      rawPromptStored: false,
      rawCompletionStored: false,
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
    filteredDraftCount: status.filteredDraftCount ?? status.draftCount ?? 0,
    liveGeneratedDraftCount: status.liveGeneratedDraftCount ?? 0,
    liveProofDraftCount: status.liveProofDraftCount ?? 0,
    mockedDraftCount: status.mockedDraftCount ?? 0,
    reviewCount: status.reviewCount ?? 0,
    advisoryLinkedReviewCount: status.advisoryLinkedReviewCount ?? 0,
    productionDrivingAllowed: false,
    latestDraft: status.latestDraft ?? null,
    draftQueue: status.draftQueue ?? [],
    appliedFilters: status.appliedFilters ?? { draftStatus: "all", evaluatorMode: "all", candidateId: null, liveOnly: false },
    filterOptions: status.filterOptions ?? {
      draftStatuses: ["all", "draft_ready_for_human_review", "needs_reviewer_attention", "blocked_by_validator"],
      evaluatorModes: ["all", "deterministic_validator_advisory", "llm_assisted_advisory", "nestr_consistency_trace"],
      liveOnly: [false, true]
    },
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

export function buildPemsLiveEvaluatorFilteringProof(status = {}, { openAiConfigured = Boolean(process.env.OPENAI_API_KEY) } = {}) {
  const hasLiveProof = (status.liveProofDraftCount ?? 0) > 0;
  const filterReady = Boolean(status.filterOptions && status.appliedFilters && Number.isFinite(Number(status.filteredDraftCount ?? 0)));
  return {
    version: PEMS_LIVE_EVALUATOR_FILTERING_VERSION,
    status: hasLiveProof
      ? "phase39_live_evaluator_filtering_ready"
      : openAiConfigured
        ? "phase39_live_evaluator_filtering_ready_no_live_draft"
        : "phase39_live_evaluator_filtering_blocked_missing_model_key",
    ok: filterReady && (hasLiveProof || openAiConfigured),
    mode: "live_gated_advisory_generation_and_filtering",
    score: hasLiveProof ? 92 : filterReady ? 90 : 88,
    target: 92,
    openAiConfigured,
    draftCount: status.draftCount ?? 0,
    filteredDraftCount: status.filteredDraftCount ?? status.draftCount ?? 0,
    liveGeneratedDraftCount: status.liveGeneratedDraftCount ?? 0,
    liveProofDraftCount: status.liveProofDraftCount ?? 0,
    mockedDraftCount: status.mockedDraftCount ?? 0,
    appliedFilters: status.appliedFilters ?? { draftStatus: "all", evaluatorMode: "all", candidateId: null, liveOnly: false },
    filterOptions: status.filterOptions ?? {},
    liveProofClaimed: hasLiveProof,
    advisoryOnly: true,
    productionDrivingAllowed: false,
    safety: {
      liveRequiresObservedEgress: true,
      mockedLlmOutputCountsAsProof: false,
      rawPromptStored: false,
      rawCompletionStored: false,
      rawSourceStored: false,
      automaticProductionRecommendation: false,
      productionDrivingAllowed: false
    }
  };
}

export function buildPemsLiveClaimCitationClosureProof(status = {}) {
  const closure = status.latestClaimCitationClosure ?? buildPemsDraftClaimCitationClosure(status.latestDraft);
  const hasClosure = (closure.claimCount ?? 0) > 0;
  const hasVeto = (closure.unsupportedCount ?? 0) > 0 || (closure.lowConfidenceCount ?? 0) > 0;
  const hasSupported = (closure.supportedCount ?? 0) > 0;
  const sourcePointerBounded = closure.sourcePointerBounded !== false;
  const liveEvaluatorDraft = closure.liveEvaluatorDraft === true || (status.liveProofDraftCount ?? 0) > 0;
  const ready = hasClosure && sourcePointerBounded && (hasSupported || hasVeto);
  return {
    version: PEMS_LIVE_CLAIM_CITATION_CLOSURE_VERSION,
    status: ready
      ? hasVeto
        ? "phase40_claim_citation_closure_veto_visible"
        : "phase40_claim_citation_closure_supported"
      : hasClosure
        ? "phase40_claim_citation_closure_incomplete"
        : "phase40_claim_citation_closure_waiting_for_claims",
    ok: ready,
    mode: "live_evaluator_claim_citation_closure",
    score: ready ? 94 : hasClosure ? 92 : 90,
    target: 94,
    claimCount: closure.claimCount ?? 0,
    supportedCount: closure.supportedCount ?? 0,
    unsupportedCount: closure.unsupportedCount ?? 0,
    lowConfidenceCount: closure.lowConfidenceCount ?? 0,
    reviewerEditRequired: closure.reviewerEditRequired ?? false,
    sourcePointerBounded,
    liveEvaluatorDraft,
    claimClosureDraftCount: status.claimClosureDraftCount ?? (hasClosure ? 1 : 0),
    claimClosureVetoDraftCount: status.claimClosureVetoDraftCount ?? (hasVeto ? 1 : 0),
    advisoryDraftId: closure.advisoryDraftId ?? null,
    candidateId: closure.candidateId ?? null,
    allowedSourcePointerIds: closure.allowedSourcePointerIds ?? [],
    verdict: closure.verdict,
    claims: closure.claims ?? [],
    advisoryOnly: true,
    productionDrivingAllowed: false,
    safety: {
      rawClaimStored: false,
      rawSourceStored: false,
      rawPromptStored: false,
      rawCompletionStored: false,
      claimLabelsCreateEvidence: false,
      unsupportedClaimsVetoApproval: hasVeto,
      reviewerEditRequiredForUnsupported: hasVeto,
      productionDrivingAllowed: false
    }
  };
}

export function buildPemsReviewerClaimRevisionProof(status = {}) {
  const revision = status.latestClaimRevision ?? null;
  const deterministicReclosure = revision?.deterministicReclosure ?? {};
  const hasRevision = Boolean(revision?.id);
  const reclosed = deterministicReclosure.status === "phase41_revision_reclosure_passed";
  const sourcePointerBounded = deterministicReclosure.sourcePointerBounded !== false;
  const preservesHashes = Boolean(revision?.originalClaimHash && revision?.revisedClaimHash && revision.originalClaimHash !== revision.revisedClaimHash);
  const ready = hasRevision && reclosed && sourcePointerBounded && preservesHashes;
  return {
    version: PEMS_REVIEWER_CLAIM_REVISION_VERSION,
    status: ready
      ? "phase41_reviewer_claim_revision_ready"
      : hasRevision
        ? "phase41_reviewer_claim_revision_needs_attention"
        : "phase41_reviewer_claim_revision_waiting",
    ok: ready,
    mode: "reviewer_claim_revision_records",
    score: ready ? 96 : hasRevision ? 95 : 94,
    target: 96,
    claimRevisionCount: status.claimRevisionCount ?? (hasRevision ? 1 : 0),
    claimRevisionReclosedCount: status.claimRevisionReclosedCount ?? (reclosed ? 1 : 0),
    claimRevisionAttentionCount: status.claimRevisionAttentionCount ?? (hasRevision && !reclosed ? 1 : 0),
    deterministicReclosurePassed: reclosed,
    sourcePointerBounded,
    preservesOriginalAndRevisedHashes: preservesHashes,
    latestClaimRevision: revision,
    advisoryOnly: true,
    productionDrivingAllowed: false,
    safety: {
      rawOriginalClaimStored: false,
      rawSuggestedEditStored: false,
      rawRevisedClaimStored: false,
      rawSourceStored: false,
      revisionCreatesEvidence: false,
      revisionBypassesHumanReview: false,
      productionDrivingAllowed: false
    }
  };
}

export function buildPemsReviewerFollowUpProof(status = {}) {
  const followUp = status.latestReviewerFollowUp ?? null;
  const hasFollowUp = Boolean(followUp?.id);
  const bindsRevision = Boolean(followUp?.claimRevisionId);
  const bindsReviewDecision = Boolean(followUp?.promotionReviewId);
  const resolved = followUp?.followupStatus === "resolved" && followUp?.workflowStatus === "advisory_closed";
  const revisionResolved = followUp?.revisionOutcome === "revision_reclosure_passed";
  const ready = hasFollowUp && bindsRevision && bindsReviewDecision && resolved && revisionResolved;
  return {
    version: PEMS_REVIEWER_FOLLOW_UP_VERSION,
    status: ready
      ? "phase42_reviewer_follow_up_workflow_ready"
      : hasFollowUp
        ? "phase42_reviewer_follow_up_workflow_needs_attention"
        : "phase42_reviewer_follow_up_workflow_waiting",
    ok: ready,
    mode: "reviewer_decision_history_and_follow_up_binding",
    score: ready ? 98 : hasFollowUp ? 97 : 96,
    target: 98,
    reviewerFollowUpCount: status.reviewerFollowUpCount ?? (hasFollowUp ? 1 : 0),
    reviewerFollowUpResolvedCount: status.reviewerFollowUpResolvedCount ?? (resolved ? 1 : 0),
    reviewerFollowUpOpenCount: status.reviewerFollowUpOpenCount ?? (hasFollowUp && !resolved ? 1 : 0),
    reviewerFollowUpBlockedCount: status.reviewerFollowUpBlockedCount ?? 0,
    revisionBoundFollowUpCount: status.revisionBoundFollowUpCount ?? (bindsRevision ? 1 : 0),
    reviewDecisionBoundFollowUpCount: status.reviewDecisionBoundFollowUpCount ?? (bindsReviewDecision ? 1 : 0),
    bindsRevision,
    bindsReviewDecision,
    revisionResolvedVeto: resolved && revisionResolved,
    latestReviewerFollowUp: followUp,
    latestPromotionReview: status.latestPromotionReview ?? null,
    latestClaimRevision: status.latestClaimRevision ?? null,
    advisoryOnly: true,
    productionDrivingAllowed: false,
    safety: {
      rawRationaleStored: false,
      rawRevisionStored: false,
      rawReviewStored: false,
      followUpCreatesEvidence: false,
      followUpBypassesHumanReview: false,
      automaticProductionRecommendation: false,
      productionDrivingAllowed: false
    }
  };
}

export function buildPemsReviewerHistoryExportProof(status = {}) {
  const historyExport = status.latestReviewerHistoryExport ?? null;
  const preview = historyExport?.historySnapshotPreview ?? {};
  const counts = preview.counts ?? {};
  const safety = historyExport?.safety ?? {};
  const hasExport = Boolean(historyExport?.id);
  const hasRefs = Boolean(historyExport?.exportRef && historyExport?.exportHash && historyExport?.historySnapshotHash);
  const hasLongitudinalRows =
    (counts.claimRevisionCount ?? 0) > 0 &&
    (counts.promotionReviewCount ?? 0) > 0 &&
    (counts.reviewerFollowUpCount ?? 0) > 0;
  const safeExport =
    safety.rawHistoryStored === false &&
    safety.rawRevisionStored === false &&
    safety.rawReviewStored === false &&
    safety.rawSourceStored === false &&
    safety.exportCreatesEvidence === false &&
    safety.exportBypassesHumanReview === false &&
    safety.productionDrivingAllowed === false;
  const ready = hasExport && hasRefs && hasLongitudinalRows && safeExport;
  return {
    version: PEMS_REVIEWER_HISTORY_EXPORT_VERSION,
    status: ready
      ? "phase43_reviewer_history_audit_export_ready"
      : hasExport
        ? "phase43_reviewer_history_audit_export_needs_attention"
        : "phase43_reviewer_history_audit_export_waiting",
    ok: ready,
    mode: "reviewer_history_audit_export_refs",
    score: ready ? 99 : hasExport ? 98 : 97,
    target: 99,
    reviewerHistoryExportCount: status.reviewerHistoryExportCount ?? (hasExport ? 1 : 0),
    safeHistoryExportCount: status.safeHistoryExportCount ?? (safeExport ? 1 : 0),
    historyRowCount: counts.historyRowCount ?? 0,
    claimRevisionCount: counts.claimRevisionCount ?? status.claimRevisionCount ?? 0,
    promotionReviewCount: counts.promotionReviewCount ?? status.reviewCount ?? 0,
    reviewerFollowUpCount: counts.reviewerFollowUpCount ?? status.reviewerFollowUpCount ?? 0,
    resolvedFollowUpCount: counts.resolvedFollowUpCount ?? status.reviewerFollowUpResolvedCount ?? 0,
    hasExportRef: Boolean(historyExport?.exportRef),
    hasExportHash: Boolean(historyExport?.exportHash),
    hasSnapshotHash: Boolean(historyExport?.historySnapshotHash),
    latestReviewerHistoryExport: historyExport,
    advisoryOnly: true,
    productionDrivingAllowed: false,
    safety: {
      rawHistoryStored: false,
      rawRevisionStored: false,
      rawReviewStored: false,
      rawSourceStored: false,
      rawPromptStored: false,
      rawCompletionStored: false,
      rawOcrStored: false,
      rawFrameStored: false,
      exportCreatesEvidence: false,
      exportBypassesHumanReview: false,
      automaticProductionRecommendation: false,
      productionDrivingAllowed: false
    }
  };
}

export function buildPemsReviewerHistoryReviewProof(status = {}) {
  const review = status.reviewerHistoryExportReview ?? {};
  const comparison = status.reviewerHistoryExportComparison ?? {};
  const rows = Array.isArray(review.rows) ? review.rows : [];
  const hasSearchableRows = rows.length >= 2;
  const hasFilters =
    Boolean(review.appliedFilters) &&
    Array.isArray(review.filterOptions?.followupStatuses) &&
    Array.isArray(review.filterOptions?.sortBy);
  const comparisonReady = comparison.ok === true && Boolean(comparison.baseline?.historySnapshotHash && comparison.comparison?.historySnapshotHash);
  const safeReview =
    review.safety?.rawHistoryStored === false &&
    review.safety?.rawRevisionStored === false &&
    review.safety?.rawReviewStored === false &&
    review.safety?.rawSourceStored === false &&
    review.safety?.searchCreatesEvidence === false &&
    review.safety?.searchBypassesHumanReview === false &&
    comparison.safety?.comparisonCreatesEvidence === false &&
    comparison.safety?.comparisonBypassesHumanReview === false &&
    comparison.safety?.automaticProductionRecommendation === false &&
    comparison.safety?.productionDrivingAllowed === false;
  const ready = hasSearchableRows && hasFilters && comparisonReady && safeReview;
  return {
    version: PEMS_REVIEWER_HISTORY_REVIEW_VERSION,
    status: ready
      ? "phase44_reviewer_history_review_refinement_ready"
      : rows.length
        ? "phase44_reviewer_history_review_refinement_needs_second_export"
        : "phase44_reviewer_history_review_refinement_waiting",
    ok: ready,
    mode: "operator_history_export_search_sort_and_snapshot_comparison",
    score: ready ? 100 : rows.length ? 99 : 98,
    target: 100,
    reviewerHistoryExportReviewCount: review.exportCount ?? rows.length,
    filteredExportCount: rows.length,
    searchableBy: ["candidateId", "advisoryDraftId", "followupStatus", "exportRef", "snapshotHash"],
    sortableBy: review.filterOptions?.sortBy ?? ["created_at", "history_row_count", "export_ref", "snapshot_hash"],
    appliedFilters: review.appliedFilters ?? {},
    rows,
    comparison,
    advisoryOnly: true,
    productionDrivingAllowed: false,
    safety: {
      rawHistoryStored: false,
      rawRevisionStored: false,
      rawReviewStored: false,
      rawSourceStored: false,
      rawPromptStored: false,
      rawCompletionStored: false,
      rawOcrStored: false,
      rawFrameStored: false,
      searchCreatesEvidence: false,
      searchBypassesHumanReview: false,
      comparisonCreatesEvidence: false,
      comparisonBypassesHumanReview: false,
      automaticProductionRecommendation: false,
      productionDrivingAllowed: false
    }
  };
}

function comparisonAgreement(row) {
  if (row.key === "validator_decision") {
    return row.deterministicValue === "pass" && ["pass", "approved"].includes(row.advisoryValue);
  }
  if (row.key === "production_boundary") return row.deterministicValue === "disabled" && row.advisoryValue === "disabled";
  if (row.key === "citation_refs") return row.deterministicValue >= 1 && row.advisoryValue >= 1;
  if (row.key === "promotion_gate") return row.deterministicValue !== "supervised_advisory_allowed" || row.advisoryValue === "draft_ready_for_human_review";
  return false;
}

export function buildPemsReviewerComparisonProvenance(status = {}) {
  const draft = status.latestDraft ?? null;
  const candidate = status.latestCandidate ?? null;
  const gate = status.latestGate ?? null;
  const metadata = jsonValue(draft?.metadata, {});
  const sourcePointerIds = safeList(metadata.sourcePointerIds);
  const deterministicCitationRequirement = gate?.requirements?.find((item) => item.key === "citation_evidence_refs");
  const deterministicEvidenceRefCount = rowNumber(deterministicCitationRequirement?.actual ?? candidate?.evidenceRefCount ?? 0);
  const comparisonRows = draft
    ? [
        {
          key: "validator_decision",
          label: "Validator decision",
          deterministicLabel: "deterministic validator",
          deterministicValue: draft.deterministicValidatorStatus ?? "pending",
          advisoryLabel: "advisory suggestion",
          advisoryValue: draft.suggestedDecision ?? "blocked",
          agreement: null
        },
        {
          key: "promotion_gate",
          label: "Promotion gate",
          deterministicLabel: "gate status",
          deterministicValue: gate?.status ?? "not_evaluated",
          advisoryLabel: "draft status",
          advisoryValue: draft.status ?? "draft_unavailable",
          agreement: null
        },
        {
          key: "citation_refs",
          label: "Cited evidence refs",
          deterministicLabel: "gate evidence refs",
          deterministicValue: deterministicEvidenceRefCount,
          advisoryLabel: "advisory source refs",
          advisoryValue: sourcePointerIds.length,
          agreement: null
        },
        {
          key: "production_boundary",
          label: "Production boundary",
          deterministicLabel: "deterministic policy",
          deterministicValue: gate?.productionDrivingAllowed ? "enabled" : "disabled",
          advisoryLabel: "advisory policy",
          advisoryValue: metadata.productionDrivingAllowed ? "enabled" : "disabled",
          agreement: null
        }
      ].map((row) => ({ ...row, agreement: comparisonAgreement(row) }))
    : [];
  const liveLlmEvaluation = metadata.liveLlmEvaluatorUsed === true;
  const egressObserved = metadata.egressObserved === true || Boolean(metadata.egressTraceRef);
  const mockedLlmOutput = metadata.mockedLlmOutput === true;
  const liveProofClaimed = liveLlmEvaluation && egressObserved && !mockedLlmOutput;
  const ready = Boolean(draft && candidate && comparisonRows.length > 0);
  return {
    version: PEMS_REVIEWER_COMPARISON_VERSION,
    status: ready ? "phase38_reviewer_comparison_provenance_ready" : "phase38_reviewer_comparison_waiting_for_draft",
    ok: true,
    mode: "deterministic_vs_advisory_ref_only",
    score: ready ? 90 : 88,
    target: 90,
    candidateId: candidate?.candidateId ?? draft?.candidateId ?? null,
    advisoryDraftId: draft?.id ?? null,
    comparisonRows,
    evidenceChips: sourcePointerIds.map((id) => ({
      id,
      kind: "source_pointer_ref",
      rawSourceStored: false
    })),
    evaluatorProvenance: {
      evaluatorMode: draft?.evaluatorMode ?? "not_available",
      evaluatorModelRef: safePreview(metadata.evaluatorModelRef ?? metadata.modelRef ?? "not_provided", 80),
      modelProviderRef: safePreview(metadata.modelProviderRef ?? metadata.modelProvider ?? "not_provided", 80),
      egressTraceRef: safePreview(metadata.egressTraceRef ?? metadata.egressObservationRef ?? "not_provided", 80),
      liveGated: true,
      liveLlmEvaluation,
      egressObserved,
      liveProofClaimed,
      mockedLlmOutputCountsAsProof: false,
      rawPromptStored: false,
      rawCompletionStored: false
    },
    safety: {
      refOnlyComparison: true,
      rawAdvisoryNoteStored: false,
      rawConsistencyTraceStored: false,
      rawPromptStored: false,
      rawCompletionStored: false,
      automaticProductionRecommendation: false,
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
