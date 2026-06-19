import { createHash, randomUUID } from "node:crypto";

export const CASE_STATE_SCHEMA_VERSION = "brainstyworkers.case_state.v1";
export const PEMS_SCHEMA_VERSION = "brainstyworkers.pems.v1";
export const CONTINUOUS_INTELLIGENCE_SHADOW_VERSION = "2026-06-18.phase33-continuous-intelligence-shadow.v1";
export const CONTINUOUS_INTELLIGENCE_PERSISTENCE_VERSION = "2026-06-18.phase34-shadow-persistence.v1";

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
          productionDrivingAllowed: false,
          maturity: parseJson(latestMaturity.maturity_json, {})
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
