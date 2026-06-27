import { Annotation, Command, END, START, StateGraph, interrupt } from "@langchain/langgraph";
import { audit } from "./audit.mjs";
import { buildAi2UiBlocksFromState } from "./ai2uiBlocks.mjs";
import { buildCheckpointResumePlan } from "./checkpointResumePlan.mjs";
import {
  buildCaseState,
  buildContinuousIntelligenceShadow,
  persistFinalContinuousIntelligenceShadow
} from "./continuousIntelligence.mjs";
import { consumeReadOnlyObservationApproval } from "./approvalResume.mjs";
import { persistClaimedChromeSnapshot, runPortalExtraction } from "./browserAutomation.mjs";
import { classifyIntent } from "./classifier.mjs";
import { createId, nowIso } from "./database.mjs";
import {
  READ_ONLY_DOCUMENT_ALLOWED_ACTION,
  READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
  approvalMetadataForDocumentCandidateTask
} from "./documentCandidateApproval.mjs";
import { buildContextPacket, retainMemoryFromSession } from "./memoryHarness.mjs";
import { indexLlmOutput } from "./llmOutputIndex.mjs";
import { selectMemorySkillTree } from "./memorySkillTree.mjs";
import { composeResponse } from "./outputPolicy.mjs";
import { recordOutboundPayloadObservation } from "./outboundPayloadObservability.mjs";
import { evaluateInputPolicy } from "./policy.mjs";
import { persistEligibilitySnapshot } from "./portalExtraction.mjs";
import {
  recordBlockedPortalEvidence,
  recordVerifiedPortalSourcePointer,
  verifyAuthenticatedPortalEvidence
} from "./portalEvidenceVerifier.mjs";
import { persistPortalPageScan } from "./portalScan.mjs";
import { buildRuntimeCompatibilityBundle, toOpenClawChannelEnvelope } from "./runtimeAdapters.mjs";
import { checkpointSession, getManagedSessionState } from "./sessionManager.mjs";
import {
  buildRuntimeContextManifest,
  createRuntimeContextCache,
  runtimeContextKey,
  storeRuntimeContextManifest
} from "./runtimeContextCache.mjs";
import { classifyHealthcareIntent } from "./structuredIntentClassifier.mjs";
import { WORKFLOWS } from "./types.mjs";
import { composeUrgentEscalationResponse, createHumanHandoffItem } from "./humanHandoffs.mjs";
import { loadOpenClawSkillArtifact } from "./openclawSkillArtifacts.mjs";
import { recordOpenClawSkillInvocationProposal, validateOpenClawEnvelopeAgainstSkill } from "./openclawSkillInvocation.mjs";
import { runOfficialOpenClawReadOnlyObservation } from "./openclawOfficialRuntime.mjs";
import { buildLangGraphOpenClawWorkerPlan } from "./openclawWorkerContract.mjs";
import { loadOpenClawSkillRegistry } from "./openclaw/skillRegistry.mjs";
import { buildOpenClawBoundedTaskProposal } from "./openclaw/workerPolicy.mjs";
import { recallProductMemoryForRequest, retainProductMemoryFromGraphRun } from "./productMemory.mjs";
import { searchResearchEvidence } from "./researchOps.mjs";
import { resolveDynamicSkillContext } from "./dynamicSkillServer.mjs";
import {
  buildLlmOrchestrationDecisionMessages,
  confidenceBand,
  normalizeLlmOrchestrationDecision,
  shouldUseLlmDecision
} from "./llmOrchestrationDecision.mjs";
import {
  buildDeterministicStructuredReasoning,
  invokeLiveStructuredIntentReasoner
} from "./intelligence/structuredIntentReasoner.mjs";
import { createTieredChatModel, selectModelForStep } from "./modelTierPolicy.mjs";
import { planJourneyFromIntent } from "./intelligence/journeyPlanner.mjs";
import { composeSourcedAnswerWithOpenAI } from "./intelligence/sourcedAnswerComposer.mjs";
import { publishRuntimeEvent } from "./runtimeEvents.mjs";
import { JOURNEY_TO_WORKFLOW } from "./intelligence/reasoningSchemas.mjs";
import { composeBestEffortAnswer, proposeBasicClarification } from "./gracefulDegradation.mjs";
import { createGraphCheckpointer } from "./graphCheckpointer.mjs";
import { observedLangGraphNode, runWithTraceContext, start_checkpoint, summarizeNodeOutput } from "../observability/checkpoints.mjs";
import { classifyFailureClass, FAILURE_CLASSES } from "../observability/failures.mjs";
import {
  consumeWorkerContinuationForApprovedDispatch,
  finalizeWorkerContinuationDispatch,
  validateWorkerContinuationForDispatch
} from "./workerContinuations.mjs";

export const LANGGRAPH_RUNNER_VERSION = "2026-06-01.langgraph-runner.phase10s-ai2ui-modes.v1";

const { checkpointer, readiness: graphCheckpointerReadiness } = createGraphCheckpointer();
const activeStores = new Map();

function field(defaultValue = null) {
  return Annotation({
    reducer: (_, value) => value,
    default: () => defaultValue
  });
}

function appendArrayField() {
  return Annotation({
    reducer: (left, value) => {
      const current = Array.isArray(left) ? left : [];
      const next = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
      if (Array.isArray(value) && value.length === 0) return [];
      return [...current, ...next];
    },
    default: () => []
  });
}

function mergeObjectField(defaultValue = {}) {
  return Annotation({
    reducer: (left, value) => ({ ...(left ?? {}), ...(value ?? {}) }),
    default: () => ({ ...defaultValue })
  });
}

const BrainstyState = Annotation.Root({
  schema_version: field(LANGGRAPH_RUNNER_VERSION),
  user_id: field(null),
  session_id: field(null),
  graph_trace_id: field(null),
  channel: field("local_web_chat"),
  user_input: field(""),
  raw_message: field({}),
  context_packet: field(null),
  checkpoint_resume_plan: field(null),
  runtime_bundle: field(null),
  memory_context: field(""),
  product_memory_recall: field(null),
  product_memory_retain: field(null),
  continuous_intelligence_persistence: field(null),
  policy_result: field(null),
  intent: field(null),
  structured_intent: field(null),
  llm_orchestration_decision: field(null),
  dynamic_skill_context: field(null),
  memory_skill_tree: field(null),
  workflow: field(null),
  workflow_route: field(null),
  route_reason: field(null),
  openclaw_envelope: field(null),
  openclaw_skill_validation: field(null),
  openclaw_worker_plan: field(null),
  openclaw_task_proposal: field(null),
  openclaw_skill_proposal: field(null),
  worker_continuation: field(null),
  human_handoff: field(null),
  approval_resume: field(null),
  approval_interrupt: field(null),
  evidence_observation: field(null),
  journey_plan: field(null),
  case_state: field(null),
  continuous_intelligence: field(null),
  sourced_answer: field(null),
  degraded_answer: field(null),
  research_evidence: field(null),
  uploaded_document_context: field(null),
  browser_result: field(null),
  eligibility_result: field(null),
  portal_scan: field(null),
  source_pointers: appendArrayField(),
  tool_calls: appendArrayField(),
  tool_results: appendArrayField(),
  model_invocation: field(null),
  final_response: field(null),
  ai2ui_blocks: appendArrayField(),
  journey_decisions: appendArrayField(),
  answer_claims: appendArrayField(),
  should_remember: field(false),
  memory_summary: field(null),
  memory_type: field(null),
  workflow_outcome: field(null),
  safety: mergeObjectField({}),
  proof: appendArrayField()
});

function appendProof(state, step, details = {}) {
  return [{ step, at: nowIso(), ...details }];
}

function mergeProof(state, step, details = {}) {
  return [...(state.proof ?? []), ...appendProof(state, step, details)];
}

function refusalForIntent(intent) {
  return {
    [WORKFLOWS.REFUSE_CREDENTIAL_ENTRY]:
      "I cannot enter or request passwords, SSNs, passkeys, or 2FA. Please handle authentication directly in Chrome.",
    [WORKFLOWS.REFUSE_MEDICAL_ADVICE]:
      "I cannot provide medical advice. I can help navigate insurance benefits and coverage information.",
    [WORKFLOWS.REFUSE_PROMPT_INJECTION]:
      "I cannot ignore, reveal, or override the governing instructions. I can continue with approved healthcare insurance navigation tasks.",
    [WORKFLOWS.REFUSE_OUT_OF_SCOPE]:
      "I am scoped to healthcare insurance concierge work. I can help with benefits, eligibility, claims, prior authorization, appeals, and approved payer portal navigation."
  }[intent];
}

function summarizeRoute(route) {
  if (!route) return "No workflow route candidate was available.";
  const missing = [
    ...(route.missingUserFields ?? []).map((item) => `missing user field ${item}`),
    ...(route.missingDataPointers ?? []).map((item) => `missing data pointer ${item}`),
    ...(route.disabledTools ?? []).map((item) => `tool not enabled ${item}`)
  ];
  return `${route.workflowKey} for journey ${route.journeyStage}; executable=${route.executableNow}; score=${route.routeScore}; ${missing.length ? missing.join("; ") : "no preflight blockers"}.`;
}

function userFromContext(packet) {
  return packet?.user
    ? {
        id: packet.user.id,
        name: packet.user.name,
        email: packet.user.email
      }
    : null;
}

function portalFromContext(packet) {
  return packet?.portalAccount
    ? {
        id: packet.portalAccount.id,
        payer: packet.portalAccount.payer,
        portal_url: packet.portalAccount.portalUrl,
        status: packet.portalAccount.status
      }
    : null;
}

function sessionFromState(state) {
  return {
    id: state.session_id,
    channel: state.channel,
    langgraph_thread_id: state.graph_trace_id
  };
}

function pointerFromEligibility(eligibility) {
  if (!eligibility?.snapshot) return null;
  return {
    table: "eligibility_snapshots",
    id: eligibility.snapshot.id,
    sourceUrl: eligibility.snapshot.source_url,
    summary: eligibility.snapshot.summary,
    createdAt: eligibility.snapshot.created_at
  };
}

function money(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "unknown";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));
}

function coverageBalancePointersFromEligibility(eligibility) {
  return (eligibility?.structured?.coverageBalances ?? []).map((balance) => ({
    table: "coverage_balances",
    id: balance.id,
    sourceUrl: balance.source,
    summary: `${balance.label}: total ${money(balance.total_amount)}, spent ${money(balance.spent_amount)}, remaining ${money(balance.remaining_amount)}`,
    createdAt: balance.created_at,
    balanceType: balance.balance_type,
    totalAmount: balance.total_amount,
    spentAmount: balance.spent_amount,
    remainingAmount: balance.remaining_amount
  }));
}

function claimPointersFromEligibility(eligibility) {
  return (eligibility?.structured?.claims ?? []).map((claim) => ({
    table: "claim_items",
    id: claim.id,
    sourceUrl: claim.source,
    summary: `${claim.description ?? "Claim"}: service ${claim.service_date ?? "unknown date"}, share ${money(claim.share_amount)}`,
    createdAt: claim.created_at,
    serviceDate: claim.service_date,
    shareAmount: claim.share_amount
  }));
}

function priorAuthorizationPointersFromEligibility(eligibility) {
  return (eligibility?.structured?.priorAuthorizations ?? []).map((priorAuth) => ({
    table: "prior_authorizations",
    id: priorAuth.id,
    sourceUrl: priorAuth.source,
    summary: `${priorAuth.provider_or_facility ?? "Prior authorization"}: ${priorAuth.status ?? "visible_in_portal"} on ${priorAuth.service_date ?? "unknown date"}`,
    createdAt: priorAuth.created_at,
    serviceDate: priorAuth.service_date,
    status: priorAuth.status
  }));
}

function sourcePointersFromObservation({ browserResult = null, eligibility = null, portalScan = null }) {
  const pointers = [];
  const eligibilityPointer = pointerFromEligibility(eligibility);
  if (eligibilityPointer) pointers.push(eligibilityPointer);
  pointers.push(...coverageBalancePointersFromEligibility(eligibility));
  pointers.push(...claimPointersFromEligibility(eligibility));
  pointers.push(...priorAuthorizationPointersFromEligibility(eligibility));
  for (const page of portalScan?.pageRows ?? []) {
    pointers.push({
      table: "portal_page_snapshots",
      id: page.id,
      sourceUrl: page.url,
      summary: `${page.page_kind} page: ${page.title}`,
      createdAt: page.created_at
    });
  }
  for (const result of portalScan?.eligibilityResults ?? []) {
    const pointer = pointerFromEligibility(result);
    if (pointer) pointers.push(pointer);
    pointers.push(...coverageBalancePointersFromEligibility(result));
    pointers.push(...claimPointersFromEligibility(result));
    pointers.push(...priorAuthorizationPointersFromEligibility(result));
  }
  if (browserResult?.browserRunId && browserResult?.page?.url && pointers.length === 0) {
    pointers.push({
      table: "browser_runs",
      id: browserResult.browserRunId,
      sourceUrl: browserResult.page.url,
      summary: `Visible portal page: ${browserResult.page.title ?? "untitled"}`,
      createdAt: nowIso()
    });
  }
  return pointers;
}

function uploadedDocumentsFromRawMessage(raw = {}) {
  return (Array.isArray(raw.uploadedDocuments) ? raw.uploadedDocuments : [])
    .filter((document) => document?.uploadId && document?.extraction)
    .slice(0, 5)
    .map((document) => ({
      uploadId: String(document.uploadId),
      filename: String(document.filename ?? "uploaded document"),
      contentType: String(document.contentType ?? "application/octet-stream"),
      byteSize: Number(document.byteSize ?? 0),
      sha256: document.sha256 ?? null,
      extraction: {
        status: document.extraction.status ?? "unknown",
        method: document.extraction.method ?? "unknown",
        extractedAt: document.extraction.extractedAt ?? null,
        textHash: document.extraction.textHash ?? null,
        safeTextPreview: document.extraction.safeTextPreview ?? "",
        fields: Array.isArray(document.extraction.fields) ? document.extraction.fields : [],
        sourceSpans: Array.isArray(document.extraction.sourceSpans) ? document.extraction.sourceSpans : [],
        blockers: Array.isArray(document.extraction.blockers) ? document.extraction.blockers : [],
        pageCount: document.extraction.pageCount ?? null,
        confidence: document.extraction.confidence ?? "none"
      }
    }));
}

function uploadedDocumentFieldValue(field) {
  if (!field || typeof field !== "object") return "";
  return String(field.value ?? field.text ?? field.label ?? "").slice(0, 240);
}

function uploadedDocumentFieldsSummary(fields = []) {
  const pairs = fields
    .slice(0, 8)
    .map((field) => `${field.label ?? "field"}=${uploadedDocumentFieldValue(field)}`)
    .filter(Boolean);
  return pairs.length ? pairs.join("; ") : "no structured fields";
}

function sourcePointersFromUploadedDocuments(documents = []) {
  return documents
    .filter((document) => document.extraction.status !== "blocked")
    .map((document) => ({
      kind: "uploaded_document_extraction",
      table: "uploaded_document_extractions",
      id: document.uploadId,
      displayLabel: document.filename,
      sourceUrl: `upload://${document.uploadId}`,
      summary: `${document.filename}: extraction ${document.extraction.status}; ${uploadedDocumentFieldsSummary(document.extraction.fields)}`,
      createdAt: document.extraction.extractedAt ?? nowIso(),
      contentType: document.contentType,
      byteSize: document.byteSize,
      sha256: document.sha256,
      extractionMethod: document.extraction.method,
      extractionHash: document.extraction.textHash,
      pageCount: document.extraction.pageCount,
      evidenceFields: document.extraction.fields.map((field) => ({
        label: field.label ?? "field",
        value: uploadedDocumentFieldValue(field),
        confidence: field.confidence ?? document.extraction.confidence ?? "unknown"
      })),
      citation: {
        sourceKind: "uploaded_document_extraction",
        uploadId: document.uploadId,
        filename: document.filename,
        extractionStatus: document.extraction.status,
        extractionMethod: document.extraction.method,
        confidence: document.extraction.confidence,
        sourceSpans: document.extraction.sourceSpans.slice(0, 5).map((span) => ({
          spanId: span.span_id ?? span.spanId ?? null,
          snippet: span.snippet ?? "",
          confidence: span.confidence ?? document.extraction.confidence ?? "unknown"
        }))
      }
    }));
}

function uploadedDocumentContextFromDocuments(documents = []) {
  const sourcePointers = sourcePointersFromUploadedDocuments(documents);
  return {
    documentCount: documents.length,
    sourcePointerCount: sourcePointers.length,
    documents: documents.map((document) => ({
      uploadId: document.uploadId,
      filename: document.filename,
      contentType: document.contentType,
      byteSize: document.byteSize,
      sha256: document.sha256,
      extractionStatus: document.extraction.status,
      extractionMethod: document.extraction.method,
      confidence: document.extraction.confidence,
      blockers: document.extraction.blockers,
      fields: document.extraction.fields,
      sourceSpans: document.extraction.sourceSpans,
      safeTextPreview: document.extraction.safeTextPreview,
      textHash: document.extraction.textHash,
      pageCount: document.extraction.pageCount
    })),
    sourcePointers
  };
}

function sourcePointersFromTrustedResearchEvidence(results = []) {
  return results
    .filter((result) => result?.citationStatus === "trusted_retrieval_approved")
    .map((result) => ({
      kind: "trusted_research_artifact",
      table: "research_artifacts",
      id: result.artifactId,
      displayLabel: result.title ?? "Reviewed research evidence",
      sourceUrl: result.sourceUrl,
      summary: `Reviewed research evidence (${result.confidence ?? "unknown"} confidence, score ${result.score ?? 0}): ${String(result.snippet ?? "").slice(0, 280)}`,
      createdAt: result.createdAt ?? nowIso(),
      contentHash: result.contentHash,
      extractionHash: result.extractionHash,
      citationStatus: result.citationStatus,
      evidenceFields: [
        {
          label: "Reviewed evidence snippet",
          value: String(result.snippet ?? "").slice(0, 360),
          confidence: result.confidence ?? "unknown"
        }
      ],
      citation: {
        sourceKind: "trusted_research_artifact",
        runId: result.runId,
        sourceId: result.sourceId,
        artifactId: result.artifactId,
        citationStatus: result.citationStatus,
        score: result.score,
        confidence: result.confidence ?? "unknown"
      }
    }));
}

function evidenceChannelsFromBrowserResult(browserResult = null) {
  if (!browserResult?.extraction) return [];
  const channels = [];
  if ((browserResult.pages?.length ?? browserResult.extraction.pageCount ?? 0) > 1) {
    channels.push({
      channel: "multi_page_navigation",
      status: "captured",
      textLength: browserResult.extraction.fullText?.length ?? 0,
      confidence: null,
      pageCount: browserResult.pages?.length ?? browserResult.extraction.pageCount
    });
  }
  if (browserResult.extraction.ariaTextPreview) {
    channels.push({
      channel: "accessibility_tree",
      status: "captured",
      textLength: browserResult.extraction.ariaTextPreview.length,
      confidence: null
    });
  }
  if (browserResult.extraction.visualOcrTextPreview) {
    channels.push({
      channel: "visual_ocr",
      status: "captured",
      textLength: browserResult.extraction.visualOcrTextPreview.length,
      confidence: browserResult.extraction.visualOcrConfidence ?? null,
      wordCount: browserResult.extraction.visualOcrWordCount ?? null
    });
  }
  if (!channels.length && (browserResult.extraction.fullText || browserResult.extraction.textPreview)) {
    channels.push({
      channel: "visible_dom_text",
      status: "captured",
      textLength: (browserResult.extraction.fullText ?? browserResult.extraction.textPreview ?? "").length,
      confidence: null
    });
  }
  return channels;
}

function structuredBenefitRowsFromEligibility(eligibility) {
  return (eligibility?.structured?.coverageBalances ?? []).map((balance) => ({
    table: "coverage_balances",
    id: balance.id,
    label: balance.label,
    balanceType: balance.balance_type,
    totalAmount: balance.total_amount,
    spentAmount: balance.spent_amount,
    remainingAmount: balance.remaining_amount,
    currency: balance.currency,
    sourceUrl: balance.source,
    createdAt: balance.created_at
  }));
}

function structuredClaimRowsFromEligibility(eligibility) {
  return (eligibility?.structured?.claims ?? []).map((claim) => ({
    table: "claim_items",
    id: claim.id,
    description: claim.description,
    serviceDate: claim.service_date,
    shareAmount: claim.share_amount,
    sourceUrl: claim.source,
    createdAt: claim.created_at
  }));
}

function structuredPriorAuthorizationRowsFromEligibility(eligibility) {
  return (eligibility?.structured?.priorAuthorizations ?? []).map((priorAuth) => ({
    table: "prior_authorizations",
    id: priorAuth.id,
    providerOrFacility: priorAuth.provider_or_facility,
    serviceDate: priorAuth.service_date,
    status: priorAuth.status,
    sourceUrl: priorAuth.source,
    createdAt: priorAuth.created_at
  }));
}

function shouldObserveEvidence(state) {
  const raw = state.raw_message ?? {};
  return Boolean(
      raw.executeEvidenceObservation === true ||
      raw.useOfficialOpenClawWorker === true ||
      raw.workerContinuationId ||
      raw.documentCandidateId ||
      raw.approvedDocumentCandidateId ||
      raw.browserSnapshot ||
      raw.remoteDebuggerUrl ||
      raw.portalPageSnapshots?.length
      || raw.uploadedDocuments?.length
  );
}

function shouldSearchTrustedResearchEvidence(state) {
  if (state.final_response) return false;
  if (state.raw_message?.trustedResearchEvidence === false || state.raw_message?.enableTrustedResearchEvidence === false) return false;
  if (!state.policy_result?.allowed) return false;
  if (!state.workflow || String(state.workflow).startsWith("refuse_") || state.workflow === "human_approval_escalation") return false;
  return true;
}

async function retrieveTrustedResearchEvidence(store, state, { session, user }) {
  if (!store || !shouldSearchTrustedResearchEvidence(state)) return null;
  const evidence = await searchResearchEvidence(store, {
    query: state.user_input,
    includePending: false,
    limit: Number(state.raw_message?.trustedResearchEvidenceLimit ?? 3)
  });
  const sourcePointers = sourcePointersFromTrustedResearchEvidence(evidence.results ?? []);
  const status = sourcePointers.length
    ? "captured_trusted_research_evidence"
    : evidence.status === "pending_review_only"
      ? "blocked_pending_research_evidence_review"
      : "blocked_no_trusted_research_evidence";
  const reason =
    status === "captured_trusted_research_evidence"
      ? "Reviewed research evidence is available for trusted citation."
      : status === "blocked_pending_research_evidence_review"
        ? "Matching research artifacts exist, but they are still pending operator citation review."
        : "No reviewed trusted research evidence matched this insurance question.";
  await publishGraphRuntimeEvent(store, state, {
    eventType: "evidence.status",
    session,
    user,
    payload: {
      status,
      terminalOutcome: sourcePointers.length ? "completed_with_sourced_result" : "not_possible_missing_reviewed_evidence",
      workflow: state.workflow,
      runtime: "trusted_research_evidence_search",
      sourcePointerCount: sourcePointers.length,
      trustedResultCount: evidence.trustedResultCount,
      pendingReviewCount: evidence.pendingReviewCount,
      actionsTaken: ["trusted_research_evidence_search"]
    }
  });
  await audit(store, session.id, sourcePointers.length ? "trusted_research_evidence_retrieved" : "trusted_research_evidence_unavailable", {
    status,
    workflow: state.workflow,
    queryLength: String(state.user_input ?? "").length,
    trustedResultCount: evidence.trustedResultCount,
    pendingReviewCount: evidence.pendingReviewCount,
    artifactIds: sourcePointers.map((pointer) => pointer.id),
    contentHashes: sourcePointers.map((pointer) => pointer.contentHash).filter(Boolean),
    extractionHashes: sourcePointers.map((pointer) => pointer.extractionHash).filter(Boolean),
    actionsTaken: ["trusted_research_evidence_search"]
  });
  return {
    status,
    reason,
    query: state.user_input,
    searchStatus: evidence.status,
    message: evidence.message,
    trustedResultCount: evidence.trustedResultCount,
    pendingReviewCount: evidence.pendingReviewCount,
    lowConfidence: evidence.lowConfidence,
    results: evidence.results ?? [],
    sourcePointers,
    actionsTaken: ["trusted_research_evidence_search"]
  };
}

async function documentCandidateFromApprovalTask(store, taskId) {
  if (!store || !taskId) return null;
  const task = await store.findOne("agent_tasks", { id: taskId });
  if (!task) return null;
  return approvalMetadataForDocumentCandidateTask(task).candidate ?? null;
}

function requireLivePortalProof(state) {
  return Boolean(state.raw_message?.requireLivePortalProof || process.env.BRAINSTY_PORTAL_LIVE === "1");
}

async function publishGraphRuntimeEvent(store, state, { eventType, payload, session = null, user = null }) {
  if (!store || !eventType) return null;
  try {
    const resolvedSession = session ?? sessionFromState(state);
    const resolvedUser = user ?? userFromContext(state.context_packet) ?? { id: state.user_id };
    return await publishRuntimeEvent(store, {
      userId: resolvedUser?.id ?? state.user_id ?? null,
      sessionId: resolvedSession?.id ?? state.session_id ?? null,
      correlationId: state.graph_trace_id,
      source: "langgraph",
      eventType,
      payload
    });
  } catch {
    return null;
  }
}

async function inputPolicyNode(state) {
  const policyResult = evaluateInputPolicy(state.user_input);
  const intent = classifyIntent(state.user_input, policyResult);
  return {
    policy_result: policyResult,
    intent,
    safety: {
      policyAllowed: policyResult.allowed,
      approvalRequired: policyResult.approvalRequired,
      urgentEscalationRequired: policyResult.urgentEscalationRequired,
      urgentEscalation: policyResult.urgentEscalation,
      checks: policyResult.checks
    },
    proof: appendProof(state, "input_policy", {
      intent,
      allowed: policyResult.allowed,
      urgentEscalationRequired: policyResult.urgentEscalationRequired
    })
  };
}

async function recallContextNode(state) {
  const packet = state.context_packet;
  const bundle = buildRuntimeCompatibilityBundle(packet, {
    source: "langgraph_runner",
    requestedAt: nowIso()
  });
  const store = activeStores.get(state.session_id);
  const skillHints = await resolveDynamicSkillContext(store, state);
  const memorySkillTree = selectMemorySkillTree({
    state,
    dynamicSkillContext: skillHints,
    productMemoryRecall: state.product_memory_recall,
    user: state.context_packet?.user ?? userFromContext(state.context_packet)
  });
  return {
    runtime_bundle: bundle,
    dynamic_skill_context: skillHints,
    memory_skill_tree: memorySkillTree,
    memory_context: [
      bundle.langgraph.state.memory_context,
      ...(state.product_memory_recall?.facts ?? []).map((item) => `Graphiti memory fact: ${item.fact ?? item.name ?? item.uuid}`),
      memorySkillTree.selectedProcedureMemory?.nonStandardDemand
        ? `Memory skill tree: non-standard demand; use ${memorySkillTree.selectedProcedureMemory.selectedSkillKey ?? "memory-assisted skill route"} with reviewer-gated consolidation.`
        : ""
    ]
      .filter(Boolean)
      .join("\n"),
    proof: appendProof(state, "memory_recall_context", {
      contextPacketVersion: packet?.schemaVersion,
      memoryItemCount: packet?.memoryItems?.length ?? 0,
      routeCandidateCount: packet?.workflowArchitecture?.routeCandidates?.length ?? 0,
      productMemoryAdapter: state.product_memory_recall?.adapter ?? "disabled",
      productMemoryFactCount: state.product_memory_recall?.facts?.length ?? 0,
      dynamicSkillMatches:
        skillHints.matches?.map((item) => ({
          skillKey: item.skillKey,
          kind: item.skillKind,
          score: item.fit?.score ?? 0
        })) ?? [],
      memorySkillTreeStatus: memorySkillTree.status,
      memorySkillTreeNonStandardDemand: memorySkillTree.selectedProcedureMemory.nonStandardDemand
    })
  };
}

async function structuredIntentNode(state) {
  const curatedIntent = classifyHealthcareIntent({
    message: state.user_input,
    policyResult: state.policy_result,
    contextPacket: state.context_packet
  });
  const deterministicReasoning = buildDeterministicStructuredReasoning({
    message: state.user_input,
    policyResult: state.policy_result,
    curatedIntent,
    contextPacket: state.context_packet
  });
  const store = activeStores.get(state.session_id);
  const user = userFromContext(state.context_packet);
  let liveReasoner = null;
  let reasoning = deterministicReasoning;
  if (state.raw_message?.useLiveModel !== false && !state.policy_result?.urgentEscalationRequired && state.policy_result?.allowed !== false) {
    try {
      liveReasoner = await invokeLiveStructuredIntentReasoner({
        state: {
          ...state,
          structured_intent: {
            ...curatedIntent,
            reasoning: deterministicReasoning,
            primary_intent: deterministicReasoning.primary_intent,
            candidate_journeys: deterministicReasoning.candidate_journeys
          }
        },
        store,
        sessionId: state.session_id,
        user
      });
      if (liveReasoner.valid && liveReasoner.reasoning) {
        reasoning = liveReasoner.reasoning;
      }
    } catch (error) {
      liveReasoner = {
        mode: "openai_structured_intent_failed",
        valid: false,
        issues: [error.message]
      };
    }
  } else {
    liveReasoner = {
      mode: state.raw_message?.useLiveModel === false ? "explicitly_disabled_by_request" : "skipped_by_deterministic_safety_gate",
      valid: false,
      issues: []
    };
  }
  const journeyPlan = planJourneyFromIntent(reasoning);
  const workflowFromReasoning = JOURNEY_TO_WORKFLOW[reasoning.primary_intent] ?? curatedIntent.workflow;
  const structuredIntent = {
    ...curatedIntent,
    workflow: workflowFromReasoning,
    reasoning,
    primary_intent: reasoning.primary_intent,
    candidate_journeys: reasoning.candidate_journeys,
    reasoning_source: reasoning.reasoning_source ?? "curated_fallback",
    liveReasoner
  };
  return {
    structured_intent: structuredIntent,
    journey_decisions: [journeyPlan],
    proof: appendProof(state, "structured_intent_classifier", {
      classifier: structuredIntent.classifier,
      intent: structuredIntent.intent,
      workflow: structuredIntent.workflow,
      journey: reasoning.primary_intent,
      reasoningSource: structuredIntent.reasoning_source,
      liveReasonerMode: liveReasoner?.mode ?? null,
      confidence: structuredIntent.confidence,
      refusalOrEscalationFlag: structuredIntent.refusalOrEscalationFlag,
      missingEvidence: structuredIntent.missingEvidence
    })
  };
}

async function llmOrchestrationDecisionNode(state) {
  if (state.policy_result?.urgentEscalationRequired) {
    return {
      llm_orchestration_decision: {
        mode: "skipped_urgent_emergency_escalation",
        provider: "openai",
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        valid: false,
        usedByRouter: false,
        workflow: "human_approval_escalation",
        confidence: 0,
        rationale: "Urgent or emergency content bypasses external LLM decisioning and routes directly to safe handoff.",
        issues: ["urgent_emergency_escalation"],
        warnings: []
      },
      proof: appendProof(state, "llm_orchestration_decision", { mode: "skipped_urgent_emergency_escalation" })
    };
  }

  if (!state.policy_result?.allowed) {
    return {
      llm_orchestration_decision: {
        mode: "skipped_policy_refusal",
        provider: "openai",
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        valid: false,
        usedByRouter: false,
        workflow: state.structured_intent?.workflow ?? null,
        confidence: 0,
        rationale: "Deterministic safety policy blocked the request before any external LLM decision.",
        issues: ["deterministic_policy_refusal"],
        warnings: []
      },
      proof: appendProof(state, "llm_orchestration_decision", { mode: "skipped_policy_refusal" })
    };
  }

  if (state.raw_message?.llmOrchestrationDecisionReplay) {
    const decision = normalizeLlmOrchestrationDecision(state.raw_message.llmOrchestrationDecisionReplay, {
      mode: "replayed_live_decision",
      model: state.raw_message.llmOrchestrationDecisionReplay.model ?? "replay",
      fallbackWorkflow: state.structured_intent?.workflow
    });
    return {
      llm_orchestration_decision: decision,
      proof: appendProof(state, "llm_orchestration_decision", {
        mode: decision.mode,
        valid: decision.valid,
        workflow: decision.workflow,
        confidence: decision.confidence,
        confidenceBand: confidenceBand(decision),
        issues: decision.issues
      })
    };
  }

  const useLiveModel = state.raw_message?.useLiveModel !== false;
  const selection = selectModelForStep("llm_orchestration_decision");
  const { model, baseURL } = selection;
  if (!useLiveModel) {
    return {
      llm_orchestration_decision: {
        mode: "not_requested",
        provider: "openai",
        model,
        baseURL,
        modelTier: selection,
        valid: false,
        usedByRouter: false,
        workflow: state.structured_intent?.workflow ?? null,
        confidence: 0,
        rationale: "Live GPT orchestration decision was not requested.",
        issues: [],
        warnings: []
      },
      proof: appendProof(state, "llm_orchestration_decision", { mode: "not_requested" })
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    // Under LLM-always, a missing key is a LOUD degraded-intelligence state, not a
    // silent success: routing must not pretend the curated classifier is the
    // planner. The router surfaces intelligence_status=degraded and a clarify path.
    const llmAlways = process.env.BRAINSTY_ORCHESTRATOR_LLM_ALWAYS === "1";
    return {
      llm_orchestration_decision: {
        mode: "skipped_missing_openai_api_key",
        provider: "openai",
        model,
        baseURL,
        modelTier: selection,
        valid: false,
        usedByRouter: false,
        degraded: llmAlways,
        degradedReason: llmAlways ? "missing_openai_api_key" : null,
        workflow: state.structured_intent?.workflow ?? null,
        confidence: 0,
        rationale: llmAlways
          ? "OPENAI_API_KEY is not configured: orchestration intelligence is DEGRADED. The curated classifier is a safety hint only, not the planner."
          : "OPENAI_API_KEY is not configured, so LangGraph fell back to the curated classifier.",
        issues: ["missing_openai_api_key"],
        warnings: llmAlways ? ["intelligence_degraded_missing_key"] : []
      },
      proof: appendProof(state, "llm_orchestration_decision", { mode: "skipped_missing_openai_api_key", degraded: llmAlways })
    };
  }

  const messages = buildLlmOrchestrationDecisionMessages(state);
  const store = activeStores.get(state.session_id);
  const payloadObservation = store
    ? await recordOutboundPayloadObservation(store, {
        sessionId: state.session_id,
        payload: { model, baseURL, messages },
        payloadType: "openai_orchestration_decision_messages",
        destination: "openai",
        policyMode: state.raw_message?.payloadMode ?? "phi_allowed_identifier_masked_reasoning",
        user: userFromContext(state.context_packet),
        requireSourcePointers: true
      })
    : null;
  try {
    const { llm } = createTieredChatModel("llm_orchestration_decision", { timeout: 60000, maxRetries: 1 });
    const response = await llm.invoke(messages);
    const decision = normalizeLlmOrchestrationDecision(response.content, {
      mode: "openai_chatopenai_invoked",
      provider: "openai",
      model,
      fallbackWorkflow: state.structured_intent?.workflow
    });
    const llmOutputIndex = await indexLlmOutput({
      sessionId: state.session_id,
      graphTraceId: state.graph_trace_id,
      step: "llm_orchestration_decision",
      model,
      modelTier: selection,
      mode: "openai_chatopenai_invoked",
      content: response.content,
      parsed: decision
    });
    return {
      llm_orchestration_decision: {
        ...decision,
        baseURL,
        modelTier: selection,
        llmOutputIndex,
        confidenceBand: confidenceBand(decision),
        response: response.content,
        outboundPayloadObservation: payloadObservation
          ? {
              eventType: "outbound_payload_observed",
              payloadHash: payloadObservation.payloadHash,
              containsPortalText: payloadObservation.containsPortalText,
              containsDirectIdentifier: payloadObservation.containsDirectIdentifier,
              containsSourcePointers: payloadObservation.containsSourcePointers,
              enforcementMode: payloadObservation.enforcementMode
            }
          : null
      },
      proof: appendProof(state, "llm_orchestration_decision", {
        mode: "openai_chatopenai_invoked",
        valid: decision.valid,
        workflow: decision.workflow,
        confidence: decision.confidence,
        confidenceBand: confidenceBand(decision),
        issues: decision.issues
      })
    };
  } catch (error) {
    return {
      llm_orchestration_decision: {
        mode: "openai_chatopenai_failed",
        provider: "openai",
        model,
        baseURL,
        modelTier: selection,
        valid: false,
        usedByRouter: false,
        workflow: state.structured_intent?.workflow ?? null,
        confidence: 0,
        rationale: error.message,
        issues: [error.message],
        warnings: ["falling_back_to_curated_classifier"],
        outboundPayloadObservation: payloadObservation
          ? {
              eventType: "outbound_payload_observed",
              payloadHash: payloadObservation.payloadHash,
              containsPortalText: payloadObservation.containsPortalText,
              containsDirectIdentifier: payloadObservation.containsDirectIdentifier,
              containsSourcePointers: payloadObservation.containsSourcePointers,
              enforcementMode: payloadObservation.enforcementMode
            }
          : null
      },
      proof: appendProof(state, "llm_orchestration_decision", {
        mode: "openai_chatopenai_failed",
        error: error.message
      })
    };
  }
}

async function workflowRouterNode(state) {
  if (state.policy_result?.urgentEscalationRequired || state.intent === WORKFLOWS.URGENT_HUMAN_HANDOFF) {
    const structuredIntent =
      state.structured_intent ??
      classifyHealthcareIntent({
        message: state.user_input,
        policyResult: state.policy_result,
        contextPacket: state.context_packet
      });
    const store = activeStores.get(state.session_id);
    const user = userFromContext(state.context_packet) ?? { id: state.user_id };
    const session = sessionFromState(state);
    const route =
      state.context_packet?.workflowArchitecture?.readiness?.find((item) => item.workflowKey === "human_approval_escalation") ??
      state.context_packet?.workflowArchitecture?.routeCandidates?.find((item) => item.workflowKey === "human_approval_escalation") ??
      null;
    const handoff = store
      ? await createHumanHandoffItem(store, {
          user,
          session,
          graphTraceId: state.graph_trace_id,
          policyResult: state.policy_result,
          userInput: state.user_input,
          workflow: "human_approval_escalation"
        })
      : null;
    if (store && handoff?.handoff) {
      await publishGraphRuntimeEvent(store, state, {
        eventType: "handoff.created",
        session,
        user,
        payload: {
          status: handoff.handoff.status,
          handoffId: handoff.handoff.id,
          taskId: handoff.handoff.taskId,
          priority: handoff.handoff.priority,
          handoffType: handoff.handoff.handoffType,
          workflow: "human_approval_escalation",
          urgentEscalationCategory: state.policy_result?.urgentEscalation?.category ?? null,
          actionsTaken: []
        }
      });
    }
    return {
      workflow: "human_approval_escalation",
      structured_intent: structuredIntent,
      workflow_route: route,
      route_reason: "urgent_emergency_handoff_required",
      human_handoff: handoff,
      evidence_observation: {
        status: "skipped",
        reason: "urgent_emergency_handoff_required",
        actionsTaken: []
      },
      llm_orchestration_decision: state.llm_orchestration_decision ?? {
        mode: "skipped_urgent_emergency_escalation",
        provider: "openai",
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        valid: false,
        usedByRouter: false,
        workflow: "human_approval_escalation",
        confidence: 0,
        rationale: "Urgent or emergency content routes directly to safe handoff before external LLM decisioning.",
        issues: ["urgent_emergency_escalation"],
        warnings: []
      },
      final_response: composeUrgentEscalationResponse(handoff?.handoff),
      should_remember: false,
      memory_summary: `Urgent/emergency human handoff ${handoff?.handoff?.id ?? "not_persisted"} created for session ${state.session_id}.`,
      memory_type: "urgent_handoff_event",
      workflow_outcome: "urgent_handoff_created",
      proof: appendProof(state, "workflow_router", {
        route: "human_approval_escalation",
        reason: "urgent_emergency_handoff_required",
        handoffId: handoff?.handoff?.id ?? null,
        taskId: handoff?.handoff?.taskId ?? null,
        openclawBypassed: true,
        executableNow: Boolean(route?.executableNow)
      })
    };
  }

  const refusal = refusalForIntent(state.intent);
  if (refusal) {
    const structuredIntent =
      state.structured_intent ??
      classifyHealthcareIntent({
        message: state.user_input,
        policyResult: state.policy_result,
        contextPacket: state.context_packet
      });
    return {
      workflow: state.intent,
      structured_intent: structuredIntent,
      workflow_route: null,
      route_reason: "blocked_by_input_policy",
      llm_orchestration_decision: state.llm_orchestration_decision ?? {
        mode: "skipped_policy_refusal",
        provider: "openai",
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        valid: false,
        usedByRouter: false,
        workflow: state.structured_intent?.workflow ?? null,
        confidence: 0,
        rationale: "Deterministic safety policy blocked the request before external LLM decisioning.",
        issues: ["deterministic_policy_refusal"],
        warnings: []
      },
      final_response: refusal,
      workflow_outcome: "blocked",
      proof: appendProof(state, "workflow_router", { route: state.intent, reason: "blocked_by_input_policy" })
    };
  }
  if (state.intent === WORKFLOWS.ESCALATE_APPROVAL || state.structured_intent?.refusalOrEscalationFlag === "escalation_required") {
    const route =
      state.context_packet?.workflowArchitecture?.readiness?.find((item) => item.workflowKey === "human_approval_escalation") ??
      state.context_packet?.workflowArchitecture?.routeCandidates?.find((item) => item.workflowKey === "human_approval_escalation") ??
      null;
    return {
      workflow: "human_approval_escalation",
      workflow_route: route,
      route_reason: "explicit_approval_gate_required",
      proof: appendProof(state, "workflow_router", {
        route: "human_approval_escalation",
        reason: "explicit_approval_gate_required",
        executableNow: Boolean(route?.executableNow)
      })
    };
  }
  const llmDecisionUsed = shouldUseLlmDecision(state.llm_orchestration_decision);
  const lowConfidenceLlmDecision =
    state.llm_orchestration_decision?.valid &&
    state.llm_orchestration_decision?.workflow &&
    confidenceBand(state.llm_orchestration_decision) === "low";
  const classifierWorkflow = state.structured_intent?.workflow;
  const selectedWorkflow = llmDecisionUsed ? state.llm_orchestration_decision.workflow : classifierWorkflow;
  const route =
    state.context_packet?.workflowArchitecture?.readiness?.find((item) => item.workflowKey === selectedWorkflow) ??
    state.context_packet?.workflowArchitecture?.routeCandidates?.find((item) => item.workflowKey === selectedWorkflow) ??
    state.context_packet?.workflowArchitecture?.routeCandidates?.[0] ??
    null;
  return {
    workflow: route?.workflowKey ?? "human_approval_escalation",
    workflow_route: route,
    route_reason: llmDecisionUsed
      ? "llm_orchestration_decision"
      : lowConfidenceLlmDecision
        ? "low_confidence_clarify"
        : classifierWorkflow
        ? "structured_intent_classifier"
        : route?.routeScore > 0
          ? "matched_user_input_memory_or_pointers"
          : "default_preflight_route",
    llm_orchestration_decision: state.llm_orchestration_decision
      ? {
          ...state.llm_orchestration_decision,
          usedByRouter: llmDecisionUsed
        }
      : null,
    proof: appendProof(state, "workflow_router", {
      route: route?.workflowKey ?? "human_approval_escalation",
      classifierWorkflow,
      llmWorkflow: state.llm_orchestration_decision?.workflow ?? null,
      llmDecisionUsed,
      llmConfidenceBand: state.llm_orchestration_decision ? confidenceBand(state.llm_orchestration_decision) : null,
      classifierConfidence: state.structured_intent?.confidence ?? null,
      llmConfidence: state.llm_orchestration_decision?.confidence ?? null,
      executableNow: Boolean(route?.executableNow)
    })
  };
}

async function maybeComposeLiveSourcedAnswer(state, deterministicAnswer) {
  if (!(state.source_pointers?.length > 0)) {
    return {
      finalResponse: deterministicAnswer,
      sourcedAnswer: {
        mode: "skipped_no_source_pointers",
        valid: false
      },
      answerClaims: []
    };
  }
  if (state.raw_message?.useLiveModel === false) {
    return {
      finalResponse: deterministicAnswer,
      sourcedAnswer: {
        mode: "explicitly_disabled_by_request",
        valid: false
      },
      answerClaims: []
    };
  }
  const store = activeStores.get(state.session_id);
  const user = userFromContext(state.context_packet);
  try {
    const composed = await composeSourcedAnswerWithOpenAI({
      state,
      deterministicAnswer,
      store,
      sessionId: state.session_id,
      user
    });
    if (!composed.valid) {
      return {
        finalResponse: deterministicAnswer,
        sourcedAnswer: composed,
        answerClaims: []
      };
    }
    return {
      finalResponse: composed.finalResponse,
      sourcedAnswer: composed,
      answerClaims: composed.answer.claims.map((claim) => ({
        ...claim,
        composerMode: composed.mode,
        workflow: state.workflow
      }))
    };
  } catch (error) {
    return {
      finalResponse: deterministicAnswer,
      sourcedAnswer: {
        mode: "openai_sourced_answer_failed",
        valid: false,
        issues: [error.message]
      },
      answerClaims: []
    };
  }
}

async function planJourneyNode(state) {
  const existingPlan = state.journey_decisions?.at?.(-1) ?? planJourneyFromIntent(state.structured_intent?.reasoning ?? {});
  const neededEvidence = [
    ...(state.structured_intent?.reasoning?.missingEvidence ?? []),
    ...(state.workflow_route?.missingDataPointers ?? [])
  ]
    .filter(Boolean)
    .map((item) => String(item));
  const hasUserEvidence =
    state.raw_message?.browserSnapshot ||
    state.raw_message?.portalPageSnapshots?.length ||
    state.raw_message?.uploadedDocuments?.length ||
    state.raw_message?.approvalToken;
  const journeyPlan = {
    version: "2026-06-21.phase55-native-hitl-journey-plan.v1",
    workflow: state.workflow,
    routeReason: state.route_reason,
    primaryIntent: state.structured_intent?.primary_intent ?? null,
    steps: [
      "resolve_openclaw_skill",
      "prepare_bounded_worker_contract",
      "observe_evidence_or_interrupt_for_approval",
      "compose_sourced_or_best_effort_answer"
    ],
    neededEvidence,
    evidenceAvailableNow: Boolean(hasUserEvidence || state.source_pointers?.length),
    degradeIfMissing: true,
    boundedClarificationLoop: {
      enabled: true,
      maxPrompts: 1,
      reason: "Only evidence insufficiency may degrade; safety refusals remain deterministic hard stops."
    },
    hitl: {
      nativeLangGraphInterrupt: true,
      approvalTokenAuthorizationOfRecord: true,
      approvalScope: "read_only_observation"
    },
    priorPlan: existingPlan
  };
  return {
    journey_plan: journeyPlan,
    journey_decisions: [journeyPlan],
    proof: appendProof(state, "plan_journey", {
      workflow: journeyPlan.workflow,
      stepCount: journeyPlan.steps.length,
      neededEvidenceCount: journeyPlan.neededEvidence.length,
      degradeIfMissing: journeyPlan.degradeIfMissing,
      nativeLangGraphInterrupt: journeyPlan.hitl.nativeLangGraphInterrupt
    })
  };
}

async function skillResolverNode(state) {
  if (state.final_response) {
    return {
      proof: appendProof(state, "skill_resolver", { skipped: true, reason: "policy_response_already_composed" })
    };
  }
  const store = activeStores.get(state.session_id);
  const dynamicSkillContext = await resolveDynamicSkillContext(store, state);
  const memorySkillTree = selectMemorySkillTree({
    state,
    dynamicSkillContext,
    productMemoryRecall: state.product_memory_recall,
    user: state.context_packet?.user ?? userFromContext(state.context_packet)
  });
  return {
    dynamic_skill_context: dynamicSkillContext,
    memory_skill_tree: memorySkillTree,
    proof: appendProof(state, "skill_resolver", {
      selected: dynamicSkillContext.selected,
      matchCount: dynamicSkillContext.matches.length,
      requiredOpenClawTasks: dynamicSkillContext.requiredOpenClawTasks,
      requiredSearch: dynamicSkillContext.requiredSearch,
      requiredApis: dynamicSkillContext.requiredApis,
      successEstimate: dynamicSkillContext.successEstimate,
      memorySkillTree: {
        status: memorySkillTree.status,
        nonStandardDemand: memorySkillTree.selectedProcedureMemory.nonStandardDemand,
        candidateStatus: memorySkillTree.consolidationCandidate.status,
        productionDrivingAllowed: memorySkillTree.safety.productionDrivingAllowed
      }
    })
  };
}

async function workflowExecutorNode(state) {
  if (state.final_response) {
    return {
      tool_calls: [],
      tool_results: [],
      proof: appendProof(state, "workflow_executor", { skipped: true, reason: "policy_response_already_composed" })
    };
  }
  const envelope = toOpenClawChannelEnvelope(state.context_packet, state.raw_message);
  const registry = await loadOpenClawSkillRegistry();
  const executionSkillKey = state.dynamic_skill_context?.selected?.executionSkillKey ?? "insurance_portal_browser";
  const skillArtifact = await loadOpenClawSkillArtifact(executionSkillKey);
  const validation = validateOpenClawEnvelopeAgainstSkill(envelope, skillArtifact, {
    workflowKey: state.workflow
  });
  const workerPlan = buildLangGraphOpenClawWorkerPlan(envelope, validation);
  const boundedTaskProposal = buildOpenClawBoundedTaskProposal({
    registry,
    dynamicSkillContext: state.dynamic_skill_context,
    workflow: state.workflow,
    task: {
      action: state.dynamic_skill_context?.requiredOpenClawTasks?.[0] ?? "read_only_observation",
      goal: state.user_input,
      description: summarizeRoute(state.workflow_route)
    }
  });
  const toolCall = {
    tool: "openclaw_channel_envelope",
    status: "prepared_not_executed",
    workflow: state.workflow,
    approvalPolicy: envelope.approval_policy,
    skillKey: validation.skillKey,
    routedOpenClawSkills: boundedTaskProposal.routedSkills,
    selectedExecutor: boundedTaskProposal.selectedExecutor,
    executionMode: validation.executionMode,
    dynamicSkillContext: state.dynamic_skill_context
      ? {
          selected: state.dynamic_skill_context.selected,
          successEstimate: state.dynamic_skill_context.successEstimate,
          requiredOpenClawTasks: state.dynamic_skill_context.requiredOpenClawTasks
        }
      : null,
    memorySkillTree: state.memory_skill_tree
      ? {
          status: state.memory_skill_tree.status,
          nonStandardDemand: state.memory_skill_tree.selectedProcedureMemory?.nonStandardDemand,
          procedureLoopStyle: state.memory_skill_tree.skillTree?.loop?.loopStyle,
          productionDrivingAllowed: state.memory_skill_tree.safety?.productionDrivingAllowed
        }
      : null,
    workerPlanId: workerPlan.planId,
    workerJobIds: workerPlan.workerJobs.map((job) => job.jobId)
  };
  return {
    openclaw_envelope: envelope,
    openclaw_skill_validation: validation,
    openclaw_worker_plan: workerPlan,
    openclaw_task_proposal: boundedTaskProposal,
    tool_calls: [toolCall],
    tool_results: [
      {
        tool: "openclaw_skill_envelope_validator",
        status: validation.status,
        valid: validation.valid,
        issues: validation.issues,
        warnings: validation.warnings,
        fallbackPath: validation.fallbackPath,
        actionsTaken: [],
        approvalsRequired: validation.approvalsRequired,
        boundedTaskProposal,
        workerPlan: {
          planId: workerPlan.planId,
          status: workerPlan.status,
          dispatchStatus: workerPlan.dispatchStatus,
          workerJobIds: workerPlan.workerJobs.map((job) => job.jobId),
          fanOutMode: workerPlan.fanOut.mode,
          fanInOwner: workerPlan.fanIn.owner
        }
      }
    ],
    proof: appendProof(state, "workflow_executor", {
      workflow: state.workflow,
      dynamicSkillSelected: state.dynamic_skill_context?.selected ?? null,
      openclawRoutedSkillCount: boundedTaskProposal.routedSkills.length,
      openclawSelectedExecutor: boundedTaskProposal.selectedExecutor?.executorKey ?? null,
      openclawTaskProposalStatus: boundedTaskProposal.status,
      openclawEnvelopePrepared: true,
      openclawSkillValidated: true,
      openclawSkillValid: validation.valid,
      openclawWorkerPlanPrepared: true,
      openclawWorkerJobCount: workerPlan.workerJobs.length
    })
  };
}

async function evidenceObservationNode(state) {
  if (state.final_response) {
    return {
      evidence_observation: {
        status: "skipped",
        reason: "policy_response_already_composed",
        actionsTaken: []
      },
      proof: appendProof(state, "evidence_observation", {
        skipped: true,
        reason: "policy_response_already_composed"
      })
    };
  }
  const user = userFromContext(state.context_packet);
  const portal = portalFromContext(state.context_packet);
  const session = sessionFromState(state);
  const store = activeStores.get(state.session_id);
  if (!shouldObserveEvidence(state)) {
    const researchEvidence = await retrieveTrustedResearchEvidence(store, state, { session, user });
    if (researchEvidence) {
      return {
        research_evidence: researchEvidence,
        evidence_observation: {
          status: researchEvidence.status,
          reason: researchEvidence.reason,
          terminalOutcome: researchEvidence.sourcePointers.length
            ? "completed_with_sourced_result"
            : "not_possible_missing_reviewed_evidence",
          actionsTaken: researchEvidence.actionsTaken,
          sourcePointers: researchEvidence.sourcePointers,
          trustedResultCount: researchEvidence.trustedResultCount,
          pendingReviewCount: researchEvidence.pendingReviewCount,
          lowConfidence: researchEvidence.lowConfidence,
          runtime: "trusted_research_evidence_search"
        },
        source_pointers: researchEvidence.sourcePointers,
        proof: appendProof(state, "evidence_observation", {
          status: researchEvidence.status,
          runtime: "trusted_research_evidence_search",
          sourcePointerCount: researchEvidence.sourcePointers.length,
          trustedResultCount: researchEvidence.trustedResultCount,
          pendingReviewCount: researchEvidence.pendingReviewCount
        })
      };
    }
    return {
      evidence_observation: {
        status: "not_requested",
        actionsTaken: [],
        sourcePointers: []
      },
      source_pointers: [],
      proof: appendProof(state, "evidence_observation", { status: "not_requested" })
    };
  }
  if (!user || !portal) {
    return {
      evidence_observation: {
        status: "blocked_missing_context",
        reason: "A user and portal account are required before read-only evidence observation.",
        actionsTaken: [],
        sourcePointers: []
      },
      source_pointers: [],
      proof: appendProof(state, "evidence_observation", { status: "blocked_missing_context" })
    };
  }

  if (!store) {
    return {
      evidence_observation: {
        status: "blocked_missing_store",
        reason: "The LangGraph evidence node requires the runtime store to persist source pointers.",
        actionsTaken: [],
        sourcePointers: []
      },
      source_pointers: [],
      proof: appendProof(state, "evidence_observation", { status: "blocked_missing_store" })
    };
  }

  const uploadedDocuments = uploadedDocumentsFromRawMessage(state.raw_message);
  if (uploadedDocuments.length) {
    const uploadedDocumentContext = uploadedDocumentContextFromDocuments(uploadedDocuments);
    const sourcePointers = uploadedDocumentContext.sourcePointers;
    const status = sourcePointers.length ? "captured_uploaded_document_extraction" : "blocked_uploaded_document_extraction";
    const blockers = uploadedDocuments.flatMap((document) => document.extraction.blockers ?? []);
    const actionsTaken = sourcePointers.length ? ["read_uploaded_document_extraction"] : [];
    await publishGraphRuntimeEvent(store, state, {
      eventType: "evidence.status",
      session,
      user,
      payload: {
        status,
        terminalOutcome: sourcePointers.length ? "completed_with_sourced_result" : "not_possible_missing_user_data",
        workflow: state.workflow,
        runtime: "fastapi_uploaded_document_extraction",
        documentCount: uploadedDocuments.length,
        sourcePointerCount: sourcePointers.length,
        actionsTaken
      }
    });
    await audit(store, session.id, "uploaded_document_extraction_observed", {
      status,
      documentCount: uploadedDocuments.length,
      uploadIds: uploadedDocuments.map((document) => document.uploadId),
      sourcePointerCount: sourcePointers.length,
      extractionMethods: uploadedDocuments.map((document) => document.extraction.method),
      blockers,
      actionsTaken
    });
    return {
      uploaded_document_context: uploadedDocumentContext,
      evidence_observation: {
        status,
        terminalOutcome: sourcePointers.length ? "completed_with_sourced_result" : "not_possible_missing_user_data",
        actionsTaken,
        sourcePointers,
        uploadedDocuments: uploadedDocumentContext.documents,
        blockers,
        documentCount: uploadedDocuments.length
      },
      browser_result: {
        connected: true,
        status: "uploaded_document_extraction",
        page: {
          title: uploadedDocuments.map((document) => document.filename).join(", "),
          url: sourcePointers[0]?.sourceUrl ?? null
        }
      },
      source_pointers: sourcePointers,
      proof: appendProof(state, "evidence_observation", {
        status,
        runtime: "fastapi_uploaded_document_extraction",
        documentCount: uploadedDocuments.length,
        sourcePointerCount: sourcePointers.length,
        actionsTaken
      })
    };
  }

  const approvalTaskId = state.raw_message?.approvalTaskId ?? state.raw_message?.taskId;
  const requestedDocumentCandidateId = state.raw_message?.approvedDocumentCandidateId ?? state.raw_message?.documentCandidateId ?? null;
  const approvedDocumentCandidate = requestedDocumentCandidateId ? await documentCandidateFromApprovalTask(store, approvalTaskId) : null;
  const documentObservationRequested = Boolean(requestedDocumentCandidateId || approvedDocumentCandidate);
  const approvalScope = documentObservationRequested ? READ_ONLY_DOCUMENT_APPROVAL_SCOPE : "read_only_observation";
  const allowedAction = documentObservationRequested ? READ_ONLY_DOCUMENT_ALLOWED_ACTION : "read_only_observation";
  if (requestedDocumentCandidateId && approvedDocumentCandidate?.candidateId !== requestedDocumentCandidateId) {
    const reason = "Approved document candidate does not match the approval task binding.";
    await audit(store, session.id, "document_candidate_observation_blocked", {
      status: "document_candidate_binding_mismatch",
      reason,
      taskId: approvalTaskId,
      requestedDocumentCandidateId,
      boundDocumentCandidateId: approvedDocumentCandidate?.candidateId ?? null,
      actionsTaken: []
    });
    return {
      evidence_observation: {
        status: "document_candidate_binding_mismatch",
        reason,
        actionsTaken: [],
        sourcePointers: []
      },
      source_pointers: [],
      proof: appendProof(state, "evidence_observation", {
        status: "document_candidate_binding_mismatch",
        actionsTaken: []
      })
    };
  }
  if (documentObservationRequested && state.raw_message?.useOfficialOpenClawWorker !== true) {
    const reason = "Approved document candidate observation requires the dedicated official OpenClaw worker.";
    await audit(store, session.id, "document_candidate_observation_blocked", {
      status: "document_candidate_requires_official_openclaw",
      reason,
      taskId: approvalTaskId,
      requestedDocumentCandidateId,
      actionsTaken: []
    });
    return {
      evidence_observation: {
        status: "document_candidate_requires_official_openclaw",
        reason,
        actionsTaken: [],
        sourcePointers: []
      },
      source_pointers: [],
      proof: appendProof(state, "evidence_observation", {
        status: "document_candidate_requires_official_openclaw",
        actionsTaken: []
      })
    };
  }

  let workerContinuationValidation = null;
  if (state.raw_message?.workerContinuationId) {
    const taskId = approvalTaskId;
    if (state.raw_message?.useOfficialOpenClawWorker !== true) {
      const reason = "Worker continuation dispatch requires the dedicated official OpenClaw read-only worker.";
      await publishGraphRuntimeEvent(store, state, {
        eventType: "worker.status.updated",
        session,
        user,
        payload: {
          status: "blocked_worker_continuation_requires_official_openclaw",
          terminalOutcome: "not_possible_policy_or_approval_block",
          reason,
          workflow: state.workflow,
          taskId,
          continuationId: state.raw_message.workerContinuationId,
          actionsTaken: []
        }
      });
      await audit(store, session.id, "worker_continuation_dispatch_blocked", {
        status: "blocked_worker_continuation_requires_official_openclaw",
        reason,
        taskId,
        continuationId: state.raw_message.workerContinuationId,
        workflow: state.workflow,
        actionsTaken: []
      });
      return {
        evidence_observation: {
          status: "blocked_worker_continuation_requires_official_openclaw",
          reason,
          actionsTaken: [],
          sourcePointers: []
        },
        source_pointers: [],
        proof: appendProof(state, "evidence_observation", {
          status: "blocked_worker_continuation_requires_official_openclaw",
          actionsTaken: []
        })
      };
    }
    workerContinuationValidation = await validateWorkerContinuationForDispatch(store, {
      continuationId: state.raw_message.workerContinuationId,
      sessionId: state.session_id,
      userId: state.user_id,
      taskId,
      workflow: state.workflow
    });
    if (!workerContinuationValidation.ok) {
      const reason = workerContinuationValidation.error ?? "Worker continuation is not ready for approved dispatch.";
      await publishGraphRuntimeEvent(store, state, {
        eventType: "worker.status.updated",
        session,
        user,
        payload: {
          status: `blocked_worker_continuation_${workerContinuationValidation.status}`,
          terminalOutcome: "not_possible_policy_or_approval_block",
          reason,
          workflow: state.workflow,
          taskId,
          continuationId: state.raw_message.workerContinuationId,
          actionsTaken: []
        }
      });
      await audit(store, session.id, "worker_continuation_dispatch_blocked", {
        status: workerContinuationValidation.status,
        reason,
        taskId,
        continuationId: state.raw_message.workerContinuationId,
        workflow: state.workflow,
        actionsTaken: []
      });
      return {
        worker_continuation: workerContinuationValidation,
        evidence_observation: {
          status: `blocked_worker_continuation_${workerContinuationValidation.status}`,
          reason,
          actionsTaken: [],
          sourcePointers: [],
          workerContinuation: workerContinuationValidation.continuation ?? null
        },
        source_pointers: [],
        proof: appendProof(state, "evidence_observation", {
          status: `blocked_worker_continuation_${workerContinuationValidation.status}`,
          actionsTaken: []
        })
      };
    }
  }

  const approvalResume = await consumeReadOnlyObservationApproval(store, {
    approvalToken: state.raw_message?.approvalToken,
    taskId: approvalTaskId,
    sessionId: state.session_id,
    userId: state.user_id,
    workflow: state.workflow,
    approvalScope,
    allowedAction,
    candidateId: approvedDocumentCandidate?.candidateId ?? null,
    candidateUrl: approvedDocumentCandidate?.url ?? null
  });
  if (!approvalResume.ok) {
    await publishGraphRuntimeEvent(store, state, {
      eventType: "worker.status.updated",
      session,
      user,
      payload: {
        status: "waiting_for_read_only_approval",
        terminalOutcome: "not_possible_policy_or_approval_block",
        reason: approvalResume.reason,
        workflow: state.workflow,
        taskId: state.raw_message?.approvalTaskId ?? state.raw_message?.taskId ?? null,
        actionsTaken: []
      }
    });
    await audit(store, session.id, "evidence_observation_waiting_for_approval", {
      status: approvalResume.status,
      reason: approvalResume.reason,
      taskId: state.raw_message?.approvalTaskId ?? state.raw_message?.taskId ?? null,
      workflow: state.workflow,
      actionsTaken: []
    });
    return {
      approval_resume: approvalResume,
      evidence_observation: {
        status: approvalResume.status,
        reason: approvalResume.reason,
        taskId: approvalTaskId ?? null,
        workflow: state.workflow,
        approvalScope,
        allowedAction,
        candidateId: approvedDocumentCandidate?.candidateId ?? null,
        candidateUrl: approvedDocumentCandidate?.url ?? null,
        nativeLangGraphInterrupt: Boolean(approvalTaskId),
        actionsTaken: [],
        sourcePointers: []
      },
      source_pointers: [],
      proof: appendProof(state, "evidence_observation", {
        status: approvalResume.status,
        requiresApproval: true,
        actionsTaken: []
      })
    };
  }
  await publishGraphRuntimeEvent(store, state, {
    eventType: "approval.consumed",
    session,
    user,
    payload: {
      status: approvalResume.status,
      workflow: state.workflow,
      taskId: approvalTaskId ?? null,
      approvalGateId: approvalResume.approvalGateId ?? null,
      approvalScope,
      allowedAction,
      candidateId: approvedDocumentCandidate?.candidateId ?? null,
      candidateUrl: approvedDocumentCandidate?.url ?? null,
      actionsTaken: approvalResume.actionsTaken ?? []
    }
  });

  let workerContinuationDispatch = workerContinuationValidation;
  if (state.raw_message?.workerContinuationId) {
    workerContinuationDispatch = await consumeWorkerContinuationForApprovedDispatch(store, {
      continuationId: state.raw_message.workerContinuationId,
      sessionId: state.session_id,
      userId: state.user_id,
      taskId: state.raw_message?.approvalTaskId ?? state.raw_message?.taskId,
      workflow: state.workflow,
      approvalGateId: approvalResume.approvalGateId ?? null
    });
    if (!workerContinuationDispatch.ok) {
      const reason = workerContinuationDispatch.error ?? "Worker continuation could not be consumed for approved dispatch.";
      await publishGraphRuntimeEvent(store, state, {
        eventType: "worker.status.updated",
        session,
        user,
        payload: {
          status: `blocked_worker_continuation_${workerContinuationDispatch.status}`,
          terminalOutcome: "not_possible_policy_or_approval_block",
          reason,
          workflow: state.workflow,
          taskId: state.raw_message?.approvalTaskId ?? state.raw_message?.taskId ?? null,
          continuationId: state.raw_message.workerContinuationId,
          actionsTaken: []
        }
      });
      await audit(store, session.id, "worker_continuation_dispatch_blocked_after_approval", {
        status: workerContinuationDispatch.status,
        reason,
        taskId: state.raw_message?.approvalTaskId ?? state.raw_message?.taskId ?? null,
        continuationId: state.raw_message.workerContinuationId,
        workflow: state.workflow,
        actionsTaken: []
      });
      return {
        approval_resume: approvalResume,
        worker_continuation: workerContinuationDispatch,
        evidence_observation: {
          status: `blocked_worker_continuation_${workerContinuationDispatch.status}`,
          reason,
          approval: approvalResume,
          actionsTaken: [],
          sourcePointers: [],
          workerContinuation: workerContinuationDispatch.continuation ?? null
        },
        source_pointers: [],
        proof: appendProof(state, "evidence_observation", {
          status: `blocked_worker_continuation_${workerContinuationDispatch.status}`,
          actionsTaken: []
        })
      };
    }
  }

  if (state.raw_message?.useOfficialOpenClawWorker === true) {
    await publishGraphRuntimeEvent(store, state, {
      eventType: "worker.status.updated",
      session,
      user,
      payload: {
        status: "dispatching_official_openclaw_read_only_worker",
        terminalOutcome: null,
        workflow: state.workflow,
        taskId: state.raw_message?.approvalTaskId ?? state.raw_message?.taskId ?? null,
        runtime: "official_openclaw",
        progressEverySeconds: 30,
        actionsTaken: []
      }
    });
    const browserResult = await runOfficialOpenClawReadOnlyObservation({
      store,
      session,
      portal,
      targetUrl: approvedDocumentCandidate?.url ?? state.raw_message?.officialOpenClawTargetUrl ?? state.raw_message?.portalUrl ?? portal.portal_url,
      approval: approvalResume,
      approvedDocumentCandidate,
      useCurrentTab: documentObservationRequested
        ? false
        : Boolean(state.raw_message?.officialOpenClawUseCurrentTab || process.env.BRAINSTY_OPENCLAW_USE_CURRENT_TAB === "1"),
      multiPage: documentObservationRequested
        ? false
        : Boolean(state.raw_message?.officialOpenClawMultiPage || process.env.BRAINSTY_OPENCLAW_MULTI_PAGE === "1"),
      maxPages: documentObservationRequested ? 1 : Number(state.raw_message?.officialOpenClawMaxPages ?? process.env.BRAINSTY_OPENCLAW_MAX_PAGES ?? 4)
    });
    const actionsTaken = browserResult.actionsTaken ?? [];
    const discoveryReport = browserResult.officialOpenClaw?.discoveryReport ?? null;
    const finalizeContinuation = (details) =>
      state.raw_message?.workerContinuationId
        ? finalizeWorkerContinuationDispatch(store, {
            continuationId: state.raw_message.workerContinuationId,
            sessionId: state.session_id,
            userId: state.user_id,
            ...details
          })
        : null;

    if (!browserResult.connected || !browserResult.page) {
      const finalizedContinuation = await finalizeContinuation({
        resultStatus: "blocked_no_authenticated_evidence",
        terminalOutcome: "not_possible_insurance_or_portal_block",
        reason: browserResult.message ?? "Official OpenClaw read-only observation did not return portal evidence.",
        browserRunId: browserResult.browserRunId ?? null,
        actionsTaken
      });
      await publishGraphRuntimeEvent(store, state, {
        eventType: "worker.status.updated",
        session,
        user,
        payload: {
          status: "blocked_no_authenticated_evidence",
          terminalOutcome: "not_possible_insurance_or_portal_block",
          reason: browserResult.message ?? "Official OpenClaw read-only observation did not return portal evidence.",
          workflow: state.workflow,
          runtime: "official_openclaw",
          browserRunId: browserResult.browserRunId ?? null,
          discoveryReport,
          portalSearchStatus: discoveryReport?.portalSearch?.status ?? null,
          documentCandidateCount: discoveryReport?.documentDiscovery?.candidateCount ?? 0,
          sbcPdfCandidateCount: discoveryReport?.documentDiscovery?.sbcPdfCandidateCount ?? 0,
          actionsTaken
        }
      });
      await audit(store, session.id, "evidence_observation_blocked", {
        browserRunId: browserResult.browserRunId,
        status: browserResult.status,
        message: browserResult.message,
        runtime: "official_openclaw",
        actionsTaken
      });
      return {
        worker_continuation: finalizedContinuation ?? workerContinuationDispatch,
        evidence_observation: {
          status: "blocked_no_authenticated_evidence",
          reason: browserResult.message ?? "Official OpenClaw read-only observation did not return portal evidence.",
          approval: approvalResume,
          actionsTaken,
          sourcePointers: [],
          workerContinuation: finalizedContinuation?.continuation ?? workerContinuationDispatch?.continuation ?? null
        },
        approval_resume: approvalResume,
        browser_result: browserResult,
        eligibility_result: null,
        source_pointers: [],
        proof: appendProof(state, "evidence_observation", {
          status: "blocked_no_authenticated_evidence",
          runtime: "official_openclaw",
          browserStatus: browserResult.status,
          actionsTaken
        })
      };
    }

    if (process.env.BRAINSTY_PORTAL_LIVE !== "1") {
      const verification = {
        valid: false,
        status: "blocked_live_portal_flag_missing",
        issues: ["BRAINSTY_PORTAL_LIVE=1 is required before official OpenClaw live portal proof can create healthcare evidence."],
        warnings: [],
        sourcePointer: null
      };
      const blocked = await recordBlockedPortalEvidence(store, {
        session,
        portal,
        browserRunId: browserResult.browserRunId,
        page: browserResult.page,
        verification,
        source: "official_openclaw_read_only_worker",
        actionsTaken
      });
      const finalizedContinuation = await finalizeContinuation({
        resultStatus: blocked.status,
        terminalOutcome: "not_possible_policy_or_approval_block",
        reason: blocked.message,
        browserRunId: browserResult.browserRunId ?? null,
        actionsTaken
      });
      await publishGraphRuntimeEvent(store, state, {
        eventType: "worker.status.updated",
        session,
        user,
        payload: {
          status: blocked.status,
          terminalOutcome: "not_possible_policy_or_approval_block",
          reason: blocked.message,
          workflow: state.workflow,
          runtime: "official_openclaw",
          browserRunId: browserResult.browserRunId ?? null,
          actionsTaken
        }
      });
      return {
        approval_resume: approvalResume,
        worker_continuation: finalizedContinuation ?? workerContinuationDispatch,
        evidence_observation: {
          status: blocked.status,
          reason: blocked.message,
          approval: approvalResume,
          actionsTaken,
          sourcePointers: [],
          verification,
          discoveryReport,
          officialOpenClaw: browserResult.officialOpenClaw,
          workerContinuation: finalizedContinuation?.continuation ?? workerContinuationDispatch?.continuation ?? null
        },
        browser_result: blocked,
        eligibility_result: null,
        source_pointers: [],
        proof: appendProof(state, "evidence_observation", {
          status: blocked.status,
          runtime: "official_openclaw",
          livePortalProofRequired: true,
          actionsTaken
        })
      };
    }

    const observedPages = browserResult.pages?.length ? browserResult.pages : [browserResult.page];
    const pageVerifications = observedPages.map((page) => ({
      page,
      verification: verifyAuthenticatedPortalEvidence({ page, portal })
    }));
    const validPageVerifications = pageVerifications.filter((item) => item.verification.valid);
    const blockedPageVerifications = pageVerifications.filter((item) => !item.verification.valid);
    if (!validPageVerifications.length) {
      const failed = blockedPageVerifications[0] ?? pageVerifications[0];
      const blocked = await recordBlockedPortalEvidence(store, {
        session,
        portal,
        browserRunId: browserResult.browserRunId,
        page: failed.page,
        verification: failed.verification,
        source: "official_openclaw_read_only_worker",
        actionsTaken: [...actionsTaken, "verify_authenticated_member_portal"]
      });
      const finalizedContinuation = await finalizeContinuation({
        resultStatus: blocked.status,
        terminalOutcome: "not_possible_insurance_or_portal_block",
        reason: blocked.message,
        browserRunId: browserResult.browserRunId ?? null,
        actionsTaken: blocked.actionsTaken
      });
      await publishGraphRuntimeEvent(store, state, {
        eventType: "worker.status.updated",
        session,
        user,
        payload: {
          status: blocked.status,
          terminalOutcome: "not_possible_insurance_or_portal_block",
          reason: blocked.message,
          workflow: state.workflow,
          runtime: "official_openclaw",
          browserRunId: browserResult.browserRunId ?? null,
          discoveryReport,
          portalSearchStatus: discoveryReport?.portalSearch?.status ?? null,
          documentCandidateCount: discoveryReport?.documentDiscovery?.candidateCount ?? 0,
          sbcPdfCandidateCount: discoveryReport?.documentDiscovery?.sbcPdfCandidateCount ?? 0,
          actionsTaken: blocked.actionsTaken
        }
      });
      return {
        approval_resume: approvalResume,
        worker_continuation: finalizedContinuation ?? workerContinuationDispatch,
        evidence_observation: {
          status: blocked.status,
          reason: blocked.message,
          approval: approvalResume,
          actionsTaken: blocked.actionsTaken,
          sourcePointers: [],
          verification: failed.verification,
          pageVerifications,
          discoveryReport,
          officialOpenClaw: browserResult.officialOpenClaw,
          workerContinuation: finalizedContinuation?.continuation ?? workerContinuationDispatch?.continuation ?? null
        },
        browser_result: blocked,
        eligibility_result: null,
        source_pointers: [],
        proof: appendProof(state, "evidence_observation", {
          status: blocked.status,
          runtime: "official_openclaw",
          livePortalProofRequired: true,
          actionsTaken: blocked.actionsTaken
        })
      };
    }

    const verifiedArtifacts = [];
    for (const item of validPageVerifications) {
      verifiedArtifacts.push({
        page: item.page,
        verification: item.verification,
        artifact: await recordVerifiedPortalSourcePointer(store, {
          session,
          browserRunId: browserResult.browserRunId,
          verification: item.verification
        })
      });
    }
    const eligibility = documentObservationRequested ? null : await persistEligibilitySnapshot(store, { user, session, portal, browserResult });
    const sourcePointers = sourcePointersFromObservation({ browserResult, eligibility });
    const structuredBenefits = structuredBenefitRowsFromEligibility(eligibility);
    const structuredClaims = structuredClaimRowsFromEligibility(eligibility);
    const structuredPriorAuthorizations = structuredPriorAuthorizationRowsFromEligibility(eligibility);
    const evidenceChannels = evidenceChannelsFromBrowserResult(browserResult);
    for (const item of verifiedArtifacts) {
      sourcePointers.push({
        table: "extraction_artifacts",
        id: item.artifact.id,
        sourceUrl: item.verification.sourcePointer.url,
        summary: `${item.verification.sourcePointer.pageKind} verified official OpenClaw live portal source pointer: ${item.page.title ?? "untitled"}`,
        createdAt: item.artifact.created_at,
        domHash: item.verification.sourcePointer.domHash,
        extractionHash: item.verification.sourcePointer.extractionHash,
        evidenceFields: item.verification.sourcePointer.evidenceFields,
        pageKind: item.verification.sourcePointer.pageKind
      });
    }
    const completedActions = [
      ...actionsTaken,
      "verify_authenticated_member_portal",
      documentObservationRequested ? "record_verified_document_source_pointer" : "record_verified_source_pointer",
      ...(documentObservationRequested ? [] : ["persist_eligibility_snapshot"]),
      ...(browserResult.pages?.length > 1 ? ["verify_multi_page_read_only_navigation"] : [])
    ];
    const terminalOutcome = blockedPageVerifications.length ? "partial_result_with_blockers" : "completed_with_sourced_result";
    const observationStatus = documentObservationRequested
      ? "captured_official_openclaw_document_read_only_observation"
      : browserResult.pages?.length > 1
        ? "captured_official_openclaw_multi_page_read_only_observation"
        : "captured_official_openclaw_read_only_observation";
    const finalizedContinuation = await finalizeContinuation({
      resultStatus: observationStatus,
      terminalOutcome,
      browserRunId: browserResult.browserRunId ?? null,
      sourcePointerCount: sourcePointers.length,
      structuredBenefitCount: structuredBenefits.length,
      structuredClaimCount: structuredClaims.length,
      structuredPriorAuthorizationCount: structuredPriorAuthorizations.length,
      discoveryReport,
      portalSearchStatus: discoveryReport?.portalSearch?.status ?? null,
      documentCandidateCount: discoveryReport?.documentDiscovery?.candidateCount ?? 0,
      sbcPdfCandidateCount: discoveryReport?.documentDiscovery?.sbcPdfCandidateCount ?? 0,
      actionsTaken: completedActions
    });
    await publishGraphRuntimeEvent(store, state, {
      eventType: "worker.status.updated",
      session,
      user,
      payload: {
        status: terminalOutcome,
        terminalOutcome,
        workflow: state.workflow,
        runtime: "official_openclaw",
        browserRunId: browserResult.browserRunId ?? null,
        pageCount: observedPages.length,
        verifiedPageCount: validPageVerifications.length,
        blockedPageCount: blockedPageVerifications.length,
        sourcePointerCount: sourcePointers.length,
        structuredBenefitCount: structuredBenefits.length,
        structuredClaimCount: structuredClaims.length,
        structuredPriorAuthorizationCount: structuredPriorAuthorizations.length,
        evidenceChannels,
        navigationPlan: browserResult.officialOpenClaw?.navigationPlan ?? null,
        discoveryReport,
        portalSearchStatus: discoveryReport?.portalSearch?.status ?? null,
        documentCandidateCount: discoveryReport?.documentDiscovery?.candidateCount ?? 0,
        sbcPdfCandidateCount: discoveryReport?.documentDiscovery?.sbcPdfCandidateCount ?? 0,
        approvedDocumentCandidate,
        portalSectionsTried: discoveryReport?.portalSections?.tried ?? [],
        actionsTaken: completedActions
      }
    });
    return {
      worker_continuation: finalizedContinuation ?? workerContinuationDispatch,
      evidence_observation: {
        status: observationStatus,
        terminalOutcome,
        actionsTaken: completedActions,
        approval: approvalResume,
        livePortalProof: "verified",
        sourcePointers,
        structuredBenefits,
        structuredClaims,
        structuredPriorAuthorizations,
        evidenceChannels,
        verification: validPageVerifications[0]?.verification ?? null,
        pageVerifications,
        pageCount: observedPages.length,
        verifiedPageCount: validPageVerifications.length,
        blockedPageCount: blockedPageVerifications.length,
        navigationPlan: browserResult.officialOpenClaw?.navigationPlan ?? null,
        discoveryReport,
        approvedDocumentCandidate,
        pageBlockers: [
          ...(browserResult.officialOpenClaw?.pageBlockers ?? []),
          ...blockedPageVerifications.map((item) => ({
            status: item.verification.status,
            url: item.page.url,
            title: item.page.title,
            issues: item.verification.issues
          }))
        ],
        officialOpenClaw: browserResult.officialOpenClaw,
        workerContinuation: finalizedContinuation?.continuation ?? workerContinuationDispatch?.continuation ?? null
      },
      approval_resume: approvalResume,
      browser_result: browserResult,
      eligibility_result: eligibility,
      source_pointers: sourcePointers,
      proof: appendProof(state, "evidence_observation", {
        status: observationStatus,
        runtime: "official_openclaw",
        pageCount: observedPages.length,
        verifiedPageCount: validPageVerifications.length,
        sourcePointerCount: sourcePointers.length,
        structuredBenefitCount: structuredBenefits.length,
        structuredClaimCount: structuredClaims.length,
        structuredPriorAuthorizationCount: structuredPriorAuthorizations.length,
        portalSearchStatus: discoveryReport?.portalSearch?.status ?? null,
        documentCandidateCount: discoveryReport?.documentDiscovery?.candidateCount ?? 0,
        sbcPdfCandidateCount: discoveryReport?.documentDiscovery?.sbcPdfCandidateCount ?? 0,
        approvedDocumentCandidate,
        actionsTaken: completedActions
      })
    };
  }

  if (state.raw_message?.portalPageSnapshots?.length) {
    if (requireLivePortalProof(state) && process.env.BRAINSTY_PORTAL_LIVE !== "1") {
      const verification = {
        valid: false,
        status: "blocked_live_portal_flag_missing",
        issues: ["BRAINSTY_PORTAL_LIVE=1 is required before live portal proof can create healthcare evidence."],
        warnings: [],
        sourcePointer: null
      };
      const blocked = await recordBlockedPortalEvidence(store, {
        session,
        portal,
        page: state.raw_message.portalPageSnapshots.at(-1) ?? null,
        verification,
        source: "portal_page_snapshots_live_proof"
      });
      return {
        approval_resume: approvalResume,
        evidence_observation: {
          status: blocked.status,
          reason: blocked.message,
          actionsTaken: [],
          sourcePointers: [],
          verification
        },
        browser_result: blocked,
        source_pointers: [],
        proof: appendProof(state, "evidence_observation", {
          status: blocked.status,
          livePortalProofRequired: true,
          actionsTaken: []
        })
      };
    }
    if (requireLivePortalProof(state)) {
      const failed = state.raw_message.portalPageSnapshots
        .map((page) => ({ page, verification: verifyAuthenticatedPortalEvidence({ page, portal }) }))
        .find((item) => !item.verification.valid);
      if (failed) {
        const blocked = await recordBlockedPortalEvidence(store, {
          session,
          portal,
          page: failed.page,
          verification: failed.verification,
          source: "portal_page_snapshots_live_proof"
        });
        return {
          approval_resume: approvalResume,
          evidence_observation: {
            status: blocked.status,
            reason: blocked.message,
            actionsTaken: [],
            sourcePointers: [],
            verification: failed.verification
          },
          browser_result: blocked,
          source_pointers: [],
          proof: appendProof(state, "evidence_observation", {
            status: blocked.status,
            livePortalProofRequired: true,
            actionsTaken: []
          })
        };
      }
    }
    const portalScan = await persistPortalPageScan(store, {
      user,
      session,
      portal,
      pages: state.raw_message.portalPageSnapshots
    });
    const latestEligibility = portalScan.eligibilityResults.at(-1) ?? null;
    const sourcePointers = sourcePointersFromObservation({ portalScan, eligibility: latestEligibility });
    const verifiedArtifacts = [];
    if (requireLivePortalProof(state)) {
      for (const page of state.raw_message.portalPageSnapshots) {
        const verification = verifyAuthenticatedPortalEvidence({ page, portal });
        verifiedArtifacts.push(
          await recordVerifiedPortalSourcePointer(store, {
            session,
            browserRunId: portalScan.browserRun.id,
            verification
          })
        );
        sourcePointers.push({
          table: "extraction_artifacts",
          id: verifiedArtifacts.at(-1).id,
          sourceUrl: verification.sourcePointer.url,
          summary: `${verification.sourcePointer.pageKind} verified live portal source pointer`,
          createdAt: verifiedArtifacts.at(-1).created_at,
          domHash: verification.sourcePointer.domHash,
          extractionHash: verification.sourcePointer.extractionHash,
          evidenceFields: verification.sourcePointer.evidenceFields
        });
      }
    }
    const structuredBenefits = portalScan.eligibilityResults.flatMap((result) => structuredBenefitRowsFromEligibility(result));
    const structuredClaims = portalScan.eligibilityResults.flatMap((result) => structuredClaimRowsFromEligibility(result));
    const structuredPriorAuthorizations = portalScan.eligibilityResults.flatMap((result) => structuredPriorAuthorizationRowsFromEligibility(result));
    await publishGraphRuntimeEvent(store, state, {
      eventType: "worker.status.updated",
      session,
      user,
      payload: {
        status: "completed_with_sourced_result",
        terminalOutcome: "completed_with_sourced_result",
        workflow: state.workflow,
        runtime: "portal_page_snapshots",
        browserRunId: portalScan.browserRun.id,
        sourcePointerCount: sourcePointers.length,
        structuredBenefitCount: structuredBenefits.length,
        structuredClaimCount: structuredClaims.length,
        structuredPriorAuthorizationCount: structuredPriorAuthorizations.length,
        actionsTaken: ["read_only_portal_page_snapshot_persisted"]
      }
    });
    return {
      evidence_observation: {
        status: "captured_multi_page_scan",
        actionsTaken: ["read_only_portal_page_snapshot_persisted"],
        approval: approvalResume,
        livePortalProof: requireLivePortalProof(state) ? "verified" : "not_required",
        sourcePointers,
        structuredBenefits,
        structuredClaims,
        structuredPriorAuthorizations
      },
      approval_resume: approvalResume,
      browser_result: {
        connected: true,
        status: "multi_page_scan",
        browserRunId: portalScan.browserRun.id
      },
      eligibility_result: latestEligibility,
      portal_scan: portalScan,
      source_pointers: sourcePointers,
      proof: appendProof(state, "evidence_observation", {
        status: "captured_multi_page_scan",
        sourcePointerCount: sourcePointers.length
      })
    };
  }

  const browserResult = state.raw_message?.browserSnapshot
    ? await persistClaimedChromeSnapshot({
        store,
        session,
        portal,
        snapshot: state.raw_message.browserSnapshot
      })
    : await runPortalExtraction({
        store,
        session,
        portal,
        remoteDebuggerUrl: state.raw_message?.remoteDebuggerUrl
      });
  await publishGraphRuntimeEvent(store, state, {
    eventType: "worker.status.updated",
    session,
    user,
    payload: {
      status: "read_only_observation_attempted",
      terminalOutcome: browserResult.connected || browserResult.extraction ? null : "not_possible_insurance_or_portal_block",
      workflow: state.workflow,
      runtime: state.raw_message?.browserSnapshot ? "claimed_browser_snapshot" : "chrome_remote_debugger",
      browserRunId: browserResult.browserRunId ?? null,
      actionsTaken: browserResult.connected || browserResult.extraction ? ["read_only_visible_text_extracted"] : []
    }
  });

  if (requireLivePortalProof(state) && process.env.BRAINSTY_PORTAL_LIVE !== "1") {
    const verification = {
      valid: false,
      status: "blocked_live_portal_flag_missing",
      issues: ["BRAINSTY_PORTAL_LIVE=1 is required before live portal proof can create healthcare evidence."],
      warnings: [],
      sourcePointer: null
    };
    const blocked = await recordBlockedPortalEvidence(store, {
      session,
      portal,
      browserRunId: browserResult.browserRunId,
      page: browserResult.page ?? state.raw_message?.browserSnapshot ?? null,
      verification,
      source: state.raw_message?.browserSnapshot ? "claimed_chrome_snapshot_live_proof" : "remote_debugger_live_proof"
    });
    await publishGraphRuntimeEvent(store, state, {
      eventType: "worker.status.updated",
      session,
      user,
      payload: {
        status: blocked.status,
        terminalOutcome: "not_possible_policy_or_approval_block",
        reason: blocked.message,
        workflow: state.workflow,
        runtime: state.raw_message?.browserSnapshot ? "claimed_browser_snapshot" : "chrome_remote_debugger",
        browserRunId: browserResult.browserRunId ?? null,
        actionsTaken: []
      }
    });
    return {
      approval_resume: approvalResume,
      evidence_observation: {
        status: blocked.status,
        reason: blocked.message,
        approval: approvalResume,
        actionsTaken: [],
        sourcePointers: [],
        verification
      },
      browser_result: blocked,
      eligibility_result: null,
      source_pointers: [],
      proof: appendProof(state, "evidence_observation", {
        status: blocked.status,
        livePortalProofRequired: true,
        actionsTaken: []
      })
    };
  }

  if (!browserResult.connected || !browserResult.extraction) {
    await publishGraphRuntimeEvent(store, state, {
      eventType: "worker.status.updated",
      session,
      user,
      payload: {
        status: "blocked_no_authenticated_evidence",
        terminalOutcome: "not_possible_insurance_or_portal_block",
        reason: browserResult.message ?? "Read-only portal evidence was not available.",
        workflow: state.workflow,
        runtime: state.raw_message?.browserSnapshot ? "claimed_browser_snapshot" : "chrome_remote_debugger",
        browserRunId: browserResult.browserRunId ?? null,
        actionsTaken: []
      }
    });
    await audit(store, session.id, "evidence_observation_blocked", {
      browserRunId: browserResult.browserRunId,
      status: browserResult.status,
      message: browserResult.message
    });
    return {
      evidence_observation: {
        status: "blocked_no_authenticated_evidence",
        reason: browserResult.message ?? "Read-only portal evidence was not available.",
        approval: approvalResume,
        actionsTaken: [],
        sourcePointers: []
      },
      approval_resume: approvalResume,
      browser_result: browserResult,
      eligibility_result: null,
      source_pointers: [],
      proof: appendProof(state, "evidence_observation", {
        status: "blocked_no_authenticated_evidence",
        browserStatus: browserResult.status
      })
    };
  }

  let verifiedSourcePointer = null;
  if (requireLivePortalProof(state)) {
    const verification = verifyAuthenticatedPortalEvidence({ page: browserResult.page, portal });
    if (!verification.valid) {
      const blocked = await recordBlockedPortalEvidence(store, {
        session,
        portal,
        browserRunId: browserResult.browserRunId,
        page: browserResult.page,
        verification,
        source: state.raw_message?.browserSnapshot ? "claimed_chrome_snapshot_live_proof" : "remote_debugger_live_proof"
      });
      await publishGraphRuntimeEvent(store, state, {
        eventType: "worker.status.updated",
        session,
        user,
        payload: {
          status: blocked.status,
          terminalOutcome: "not_possible_insurance_or_portal_block",
          reason: blocked.message,
          workflow: state.workflow,
          runtime: state.raw_message?.browserSnapshot ? "claimed_browser_snapshot" : "chrome_remote_debugger",
          browserRunId: browserResult.browserRunId ?? null,
          actionsTaken: []
        }
      });
      return {
        approval_resume: approvalResume,
        evidence_observation: {
          status: blocked.status,
          reason: blocked.message,
          approval: approvalResume,
          actionsTaken: [],
          sourcePointers: [],
          verification
        },
        browser_result: blocked,
        eligibility_result: null,
        source_pointers: [],
        proof: appendProof(state, "evidence_observation", {
          status: blocked.status,
          livePortalProofRequired: true,
          actionsTaken: []
        })
      };
    }
    const artifact = await recordVerifiedPortalSourcePointer(store, {
      session,
      browserRunId: browserResult.browserRunId,
      verification
    });
    verifiedSourcePointer = {
      table: "extraction_artifacts",
      id: artifact.id,
      sourceUrl: verification.sourcePointer.url,
      summary: `${verification.sourcePointer.pageKind} verified live portal source pointer`,
      createdAt: artifact.created_at,
      domHash: verification.sourcePointer.domHash,
      extractionHash: verification.sourcePointer.extractionHash,
      evidenceFields: verification.sourcePointer.evidenceFields
    };
  }

  const eligibility = await persistEligibilitySnapshot(store, { user, session, portal, browserResult });
  const sourcePointers = sourcePointersFromObservation({ browserResult, eligibility });
  const structuredBenefits = structuredBenefitRowsFromEligibility(eligibility);
  const structuredClaims = structuredClaimRowsFromEligibility(eligibility);
  const structuredPriorAuthorizations = structuredPriorAuthorizationRowsFromEligibility(eligibility);
  const evidenceChannels = evidenceChannelsFromBrowserResult(browserResult);
  if (verifiedSourcePointer) sourcePointers.push(verifiedSourcePointer);
  await publishGraphRuntimeEvent(store, state, {
    eventType: "worker.status.updated",
    session,
    user,
    payload: {
      status: "completed_with_sourced_result",
      terminalOutcome: "completed_with_sourced_result",
      workflow: state.workflow,
      runtime: state.raw_message?.browserSnapshot ? "claimed_browser_snapshot" : "chrome_remote_debugger",
      browserRunId: browserResult.browserRunId ?? null,
      sourcePointerCount: sourcePointers.length,
      structuredBenefitCount: structuredBenefits.length,
      structuredClaimCount: structuredClaims.length,
      structuredPriorAuthorizationCount: structuredPriorAuthorizations.length,
      evidenceChannels,
      actionsTaken: ["read_only_visible_text_extracted"]
    }
  });
  return {
    evidence_observation: {
      status: "captured_visible_page",
      actionsTaken: ["read_only_visible_text_extracted"],
      approval: approvalResume,
      livePortalProof: requireLivePortalProof(state) ? "verified" : "not_required",
      sourcePointers,
      structuredBenefits,
      structuredClaims,
      structuredPriorAuthorizations,
      evidenceChannels
    },
    approval_resume: approvalResume,
    browser_result: browserResult,
    eligibility_result: eligibility,
    source_pointers: sourcePointers,
    proof: appendProof(state, "evidence_observation", {
      status: "captured_visible_page",
      sourcePointerCount: sourcePointers.length,
      structuredBenefitCount: structuredBenefits.length,
      structuredClaimCount: structuredClaims.length,
      structuredPriorAuthorizationCount: structuredPriorAuthorizations.length
    })
  };
}

async function approvalInterruptNode(state) {
  const evidence = state.evidence_observation ?? {};
  const payload = {
    type: "read_only_observation_approval",
    version: "2026-06-21.phase55-native-langgraph-interrupt.v1",
    sessionId: state.session_id,
    userId: state.user_id,
    workflow: state.workflow,
    taskId: evidence.taskId ?? state.raw_message?.approvalTaskId ?? state.raw_message?.taskId ?? null,
    approvalScope: evidence.approvalScope ?? "read_only_observation",
    allowedAction: evidence.allowedAction ?? "read_only_observation",
    candidateId: evidence.candidateId ?? null,
    candidateUrl: evidence.candidateUrl ?? null,
    reason: evidence.reason ?? state.approval_resume?.reason ?? "Read-only worker observation requires explicit human approval.",
    terminalOutcome: "not_possible_policy_or_approval_block",
    blockedActions: [
      "credential_entry",
      "captcha_or_2fa_bypass",
      "form_submit",
      "external_write_action",
      "payer_contact"
    ],
    approvalTokenAuthorizationOfRecord: true,
    resumeCommand: {
      kind: "Command.resume",
      expectedValue: "approvalToken"
    }
  };
  const resumed = interrupt(payload);
  const approvalToken =
    typeof resumed === "string"
      ? resumed
      : typeof resumed?.approvalToken === "string"
        ? resumed.approvalToken
        : null;
  return {
    raw_message: {
      ...(state.raw_message ?? {}),
      approvalTaskId: payload.taskId,
      approvalToken
    },
    approval_interrupt: {
      status: "resumed",
      payload,
      resumedAt: nowIso(),
      approvalTokenReceived: Boolean(approvalToken)
    },
    proof: appendProof(state, "approval_interrupt", {
      status: "resumed",
      taskId: payload.taskId,
      approvalTokenReceived: Boolean(approvalToken)
    })
  };
}

async function caseStateShadowNode(state) {
  const caseState = buildCaseState({
    userId: state.user_id,
    sessionId: state.session_id,
    graphTraceId: state.graph_trace_id,
    channel: state.channel,
    userInput: state.user_input,
    contextPacket: state.context_packet,
    policyResult: state.policy_result,
    structuredIntent: state.structured_intent,
    llmDecision: state.llm_orchestration_decision,
    workflow: state.workflow,
    routeReason: state.route_reason,
    workflowRoute: state.workflow_route,
    dynamicSkillContext: state.dynamic_skill_context,
    openclawTaskProposal: state.openclaw_task_proposal,
    approvalResume: state.approval_resume,
    evidenceObservation: state.evidence_observation,
    sourcePointers: state.source_pointers,
    productMemoryRecall: state.product_memory_recall,
    productMemoryRetain: state.product_memory_retain,
    uploadedDocumentContext: state.uploaded_document_context,
    researchEvidence: state.research_evidence,
    workflowOutcome: state.workflow_outcome,
    finalResponse: state.final_response
  });
  const shadow = buildContinuousIntelligenceShadow({ caseState });
  return {
    case_state: caseState,
    continuous_intelligence: shadow,
    proof: appendProof(state, "continuous_intelligence_shadow", {
      version: shadow.version,
      mode: shadow.mode,
      gateScore: shadow.gateSummary.score,
      gatePassed: shadow.gateSummary.passed,
      gateTotal: shadow.gateSummary.total,
      pemsScore: shadow.pems.score,
      pemsTrusted: shadow.pems.trusted,
      productionDrivingAllowed: false
    })
  };
}

export const SOURCE_POINTER_RESPONSE_STATUSES = new Set([
  "captured_visible_page",
  "captured_official_openclaw_read_only_observation",
  "captured_official_openclaw_multi_page_read_only_observation",
  "captured_official_openclaw_document_read_only_observation"
]);

function composeBlockedEvidenceResponse(state, routeSummary) {
  const reason = state.evidence_observation?.reason ?? "The approved read-only worker could not access authenticated portal evidence.";
  const actionsTaken = state.evidence_observation?.actionsTaken ?? [];
  const actionLine = actionsTaken.length
    ? `Worker actions attempted inside the approved read-only scope: ${actionsTaken.join(", ")}.`
    : "Worker actions attempted inside the approved read-only scope: none.";
  const approvalLine = state.approval_resume?.status
    ? `Approval state: ${state.approval_resume.status}.`
    : "Approval state: no approval was consumed.";
  return [
    `LangGraph routed this request to ${state.workflow}, but the live insurance portal evidence step is blocked right now.`,
    `Routing evidence: ${routeSummary}`,
    `Blocker: ${reason}`,
    approvalLine,
    actionLine,
    "No source pointers, eligibility snapshots, document candidates, payer contact, external messages, credential entry, medical advice, form submissions, or account changes were created.",
    "Next step: when the insurer portal is available again, sign in manually in the dedicated OpenClaw browser profile and rerun the same read-only approval."
  ].join("\n\n");
}

function composeUploadedDocumentResponse(state, routeSummary) {
  const context = state.uploaded_document_context ?? state.evidence_observation ?? {};
  const documents = context.documents ?? state.evidence_observation?.uploadedDocuments ?? [];
  const fieldLines = documents
    .flatMap((document) =>
      (document.fields ?? []).slice(0, 10).map((field) => {
        const confidence = field.confidence ?? document.confidence ?? "unknown";
        return `- ${document.filename}: ${field.label ?? "field"} = ${uploadedDocumentFieldValue(field)} (confidence ${confidence})`;
      })
    )
    .slice(0, 16);
  const blockerLines = documents
    .flatMap((document) => (document.blockers ?? []).map((blocker) => `- ${document.filename}: ${blocker}`))
    .slice(0, 8);
  const pointerLine = state.source_pointers?.length
    ? `Source pointers: ${state.source_pointers.map((pointer) => `${pointer.table}/${pointer.id}`).join(", ")}.`
    : "Source pointers: none stored because the uploaded extraction did not produce readable evidence.";
  return [
    `LangGraph routed this request to ${state.workflow} and answered from the uploaded document extraction attached to this session.`,
    `Routing evidence: ${routeSummary}`,
    documents.length
      ? `Uploaded document(s): ${documents.map((document) => `${document.filename} (${document.extractionStatus}, ${document.extractionMethod})`).join("; ")}.`
      : "Uploaded document(s): none available.",
    fieldLines.length ? `Structured extracted fields:\n${fieldLines.join("\n")}` : "Structured extracted fields: none recognized yet.",
    blockerLines.length ? `Extraction blockers:\n${blockerLines.join("\n")}` : "Extraction blockers: none reported.",
    pointerLine,
    "This answer uses only the stored extraction fields, redacted preview metadata, hashes, and source snippets from the upload harness. It does not use raw document dumps.",
    "No OpenClaw worker action, payer contact, external message, credential entry, medical advice, form submission, or account change was performed."
  ].join("\n\n");
}

function composeTrustedResearchEvidenceResponse(state, routeSummary) {
  const evidence = state.research_evidence ?? {};
  const sourcePointers = state.source_pointers ?? [];
  const results = evidence.results ?? [];
  const resultLines = results
    .slice(0, 3)
    .map((result, index) => {
      const label = result.title ?? result.sourceUrl ?? `reviewed source ${index + 1}`;
      const snippet = String(result.snippet ?? "").slice(0, 360);
      return `- ${label}: ${snippet || "reviewed safe preview available"} (confidence ${result.confidence ?? "unknown"}, score ${result.score ?? 0})`;
    });
  const pointerLine = sourcePointers.length
    ? `Source pointers: ${sourcePointers.map((pointer) => `${pointer.table}/${pointer.id}`).join(", ")}.`
    : "Source pointers: none.";
  return [
    `LangGraph routed this request to ${state.workflow} and answered from operator-reviewed research evidence.`,
    `Routing evidence: ${routeSummary}`,
    resultLines.length ? `Reviewed evidence used:\n${resultLines.join("\n")}` : "Reviewed evidence used: none.",
    pointerLine,
    "This answer is limited to reviewed, citation-approved research artifacts. It does not use pending review artifacts, MockWorker output, raw document dumps, payer contact, form submission, credential entry, medical advice, or account changes."
  ].join("\n\n");
}

function composeMissingTrustedResearchEvidenceResponse(state, routeSummary) {
  const evidence = state.research_evidence ?? {};
  const pendingLine =
    evidence.pendingReviewCount > 0
      ? `${evidence.pendingReviewCount} matching artifact(s) exist, but they are still pending operator citation review.`
      : "No reviewed trusted artifact matched this question.";
  return [
    `LangGraph routed this request to ${state.workflow}, but I cannot answer the insurance question from trusted citations yet.`,
    `Routing evidence: ${routeSummary}`,
    `Retrieval status: ${evidence.searchStatus ?? state.evidence_observation?.status ?? "not_available"}. ${pendingLine}`,
    "To answer safely, add or approve relevant research evidence, upload a document, or approve a read-only portal observation. I will not invent plan or coverage facts without a stored trusted source pointer.",
    "No source pointers, payer contact, external messages, credential entry, medical advice, form submissions, or account changes were created."
  ].join("\n\n");
}

async function composeResponseNode(state) {
  if (state.final_response) {
    return {
      proof: appendProof(state, "response_policy", { reusedPolicyResponse: true })
    };
  }
  const user = userFromContext(state.context_packet);
  const portal = portalFromContext(state.context_packet);
  const routeSummary = summarizeRoute(state.workflow_route);
  if (state.evidence_observation?.status === "blocked_no_authenticated_evidence") {
    const degraded = await composeBestEffortAnswer(state, {
      reason: state.evidence_observation.reason ?? "authenticated_portal_evidence_unavailable",
      missingEvidence: ["authenticated portal evidence", "current source pointers"],
      store: activeStores.get(state.session_id),
      sessionId: state.session_id,
      user
    });
    return {
      final_response: degraded.finalResponse,
      degraded_answer: {
        ...degraded,
        clarification: proposeBasicClarification(state)
      },
      answer_claims: degraded.answer?.claims?.map((claim) => ({
        ...claim,
        composerMode: degraded.mode,
        workflow: state.workflow
      })) ?? [],
      should_remember: false,
      memory_summary: `LangGraph degraded ${state.workflow} for session ${state.session_id}: ${state.evidence_observation.reason}`,
      memory_type: "best_effort_degraded_event",
      workflow_outcome: "best_effort_degraded",
      proof: appendProof(state, "response_policy", {
        finalResponsePrepared: true,
        degraded: true,
        degradedMode: degraded.mode,
        evidenceObservationStatus: state.evidence_observation.status,
        sourcePointerCount: 0,
        unverifiedCount: degraded.unverified?.length ?? 0
      })
    };
  }
  if (
    ["captured_uploaded_document_extraction", "blocked_uploaded_document_extraction"].includes(state.evidence_observation?.status)
  ) {
    const deterministicResponse = composeUploadedDocumentResponse(state, routeSummary);
    const composed = await maybeComposeLiveSourcedAnswer(state, deterministicResponse);
    return {
      final_response: composed.finalResponse,
      sourced_answer: composed.sourcedAnswer,
      answer_claims: composed.answerClaims,
      should_remember: state.source_pointers?.length > 0,
      memory_summary: state.source_pointers?.length
        ? `LangGraph answered from uploaded document extraction for ${state.workflow}; source pointers: ${state.source_pointers.map((item) => `${item.table}/${item.id}`).join(", ")}.`
        : `LangGraph could not answer from uploaded document extraction for ${state.workflow}; extraction blockers were reported.`,
      memory_type: state.source_pointers?.length ? "uploaded_document_evidence_event" : "workflow_blocker_event",
      workflow_outcome: state.source_pointers?.length ? "uploaded_document_explained" : "uploaded_document_extraction_blocked",
      proof: appendProof(state, "response_policy", {
        finalResponsePrepared: true,
        evidenceObservationStatus: state.evidence_observation.status,
        sourcePointerCount: state.source_pointers?.length ?? 0
      })
    };
  }
  if (state.evidence_observation?.status === "captured_trusted_research_evidence") {
    const deterministicResponse = composeTrustedResearchEvidenceResponse(state, routeSummary);
    const composed = await maybeComposeLiveSourcedAnswer(state, deterministicResponse);
    return {
      final_response: composed.finalResponse,
      sourced_answer: composed.sourcedAnswer,
      answer_claims: composed.answerClaims,
      should_remember: state.source_pointers?.length > 0,
      memory_summary: `LangGraph answered from reviewed research evidence for ${state.workflow}; source pointers: ${state.source_pointers.map((item) => `${item.table}/${item.id}`).join(", ")}.`,
      memory_type: "trusted_research_evidence_event",
      workflow_outcome: "trusted_research_answered",
      proof: appendProof(state, "response_policy", {
        finalResponsePrepared: true,
        evidenceObservationStatus: state.evidence_observation.status,
        sourcePointerCount: state.source_pointers?.length ?? 0
      })
    };
  }
  if (
    ["blocked_pending_research_evidence_review", "blocked_no_trusted_research_evidence"].includes(state.evidence_observation?.status)
  ) {
    const degraded = await composeBestEffortAnswer(state, {
      reason: state.evidence_observation.reason ?? state.evidence_observation.status,
      missingEvidence: [
        state.evidence_observation.status === "blocked_pending_research_evidence_review"
          ? "operator-reviewed citation approval"
          : "trusted reviewed research evidence",
        "source pointers"
      ],
      store: activeStores.get(state.session_id),
      sessionId: state.session_id,
      user
    });
    return {
      final_response: degraded.finalResponse,
      degraded_answer: {
        ...degraded,
        clarification: proposeBasicClarification(state)
      },
      answer_claims: degraded.answer?.claims?.map((claim) => ({
        ...claim,
        composerMode: degraded.mode,
        workflow: state.workflow
      })) ?? [],
      should_remember: false,
      memory_summary: `LangGraph degraded ${state.workflow} from missing trusted research evidence; ${state.evidence_observation.reason}`,
      memory_type: "best_effort_degraded_event",
      workflow_outcome: "best_effort_degraded",
      proof: appendProof(state, "response_policy", {
        finalResponsePrepared: true,
        degraded: true,
        degradedMode: degraded.mode,
        evidenceObservationStatus: state.evidence_observation.status,
        sourcePointerCount: 0,
        pendingReviewCount: state.evidence_observation.pendingReviewCount ?? 0,
        unverifiedCount: degraded.unverified?.length ?? 0
      })
    };
  }
  if (
    SOURCE_POINTER_RESPONSE_STATUSES.has(state.evidence_observation?.status) &&
    user &&
    portal &&
    state.browser_result
  ) {
    const deterministicResponse = composeResponse({
      user,
      portal,
      policyResult: state.policy_result,
      intent: state.intent,
      browserResult: state.browser_result,
      eligibility: state.eligibility_result,
      sourcePointers: state.source_pointers,
      evidenceObservation: state.evidence_observation
    });
    const composed = await maybeComposeLiveSourcedAnswer(state, deterministicResponse);
    return {
      final_response: composed.finalResponse,
      sourced_answer: composed.sourcedAnswer,
      answer_claims: composed.answerClaims,
      should_remember: true,
      memory_summary: `LangGraph captured read-only evidence for ${state.workflow}; source pointers: ${state.source_pointers.map((item) => `${item.table}/${item.id}`).join(", ")}.`,
      memory_type: "evidence_capture_event",
      workflow_outcome: "evidence_captured",
      proof: appendProof(state, "response_policy", {
        finalResponsePrepared: true,
        sourcePointerCount: state.source_pointers.length
      })
    };
  }
  if (state.evidence_observation?.status === "captured_multi_page_scan") {
    const deterministicResponse = [
      `LangGraph routed this request to ${state.workflow} and captured ${state.portal_scan?.pageRows?.length ?? 0} read-only portal page snapshot(s).`,
      `Source pointers: ${state.source_pointers.map((item) => `${item.table}/${item.id}`).join(", ")}.`,
      `The OpenClaw task envelope was prepared, validated as ${state.openclaw_skill_validation?.status ?? "not_validated"}, and not executed in this slice.`,
      "No payer API, external message, credential entry, medical advice, or irreversible portal action was performed.",
      "This answer was composed inside the LangGraph product runtime."
    ].join("\n\n");
    const composed = await maybeComposeLiveSourcedAnswer(state, deterministicResponse);
    return {
      final_response: composed.finalResponse,
      sourced_answer: composed.sourcedAnswer,
      answer_claims: composed.answerClaims,
      should_remember: true,
      memory_summary: `LangGraph captured a read-only portal scan for ${state.workflow}; source pointers: ${state.source_pointers.map((item) => `${item.table}/${item.id}`).join(", ")}.`,
      memory_type: "evidence_capture_event",
      workflow_outcome: "evidence_captured",
      proof: appendProof(state, "response_policy", {
        finalResponsePrepared: true,
        sourcePointerCount: state.source_pointers.length
      })
    };
  }
  const evidenceLine =
    state.evidence_observation?.status === "blocked_no_authenticated_evidence"
      ? `Evidence observation stayed inside LangGraph but did not create healthcare evidence: ${state.evidence_observation.reason}`
      : `Evidence observation status: ${state.evidence_observation?.status ?? "not_requested"}.`;
  const finalResponse = [
    `LangGraph routed this request to ${state.workflow}.`,
    `Routing evidence: ${routeSummary}`,
    evidenceLine,
    `The OpenClaw task envelope was prepared, validated as ${state.openclaw_skill_validation?.status ?? "not_validated"}, and not executed in this slice.`,
    `LangGraph also prepared ${state.openclaw_worker_plan?.workerJobs?.length ?? 0} deterministic OpenClaw worker job contract(s); dispatch status is ${state.openclaw_worker_plan?.dispatchStatus ?? "not_prepared"}.`,
    `Approval gates: ${(state.openclaw_skill_validation?.approvalsRequired ?? ["real_openclaw_worker_execution"]).join(", ")}.`,
    "No payer API, external message, credential entry, medical advice, or irreversible portal action was performed."
  ].join("\n\n");
  return {
    final_response: finalResponse,
    should_remember: true,
    memory_summary: `LangGraph routed ${state.workflow} for session ${state.session_id}.`,
    memory_type: "workflow_route_event",
    workflow_outcome: "openclaw_skill_proposal_prepared",
    proof: appendProof(state, "response_policy", { finalResponsePrepared: true })
  };
}

async function publishLangGraphLifecycleEvents(store, { user, session, state, productMemoryRetain }) {
  const common = {
    userId: user.id,
    sessionId: session.id,
    correlationId: state.graph_trace_id,
    source: "langgraph"
  };
  const events = [
    {
      eventType: "workflow.classified",
      payload: {
        curatedIntent: state.structured_intent,
        llmDecision: state.llm_orchestration_decision
          ? {
              mode: state.llm_orchestration_decision.mode,
              valid: state.llm_orchestration_decision.valid,
              usedByRouter: state.llm_orchestration_decision.usedByRouter,
              workflow: state.llm_orchestration_decision.workflow,
              confidence: state.llm_orchestration_decision.confidence,
              rationale: state.llm_orchestration_decision.rationale,
              issues: state.llm_orchestration_decision.issues ?? []
            }
          : null
      }
    },
    {
      eventType: "workflow.routed",
      payload: {
        workflow: state.workflow,
        routeReason: state.route_reason,
        journeyStage: state.workflow_route?.journeyStage ?? null,
        executableNow: state.workflow_route?.executableNow ?? null
      }
    },
    {
      eventType: "worker.plan.prepared",
      payload: {
        planId: state.openclaw_worker_plan?.planId ?? null,
        dispatchStatus: state.openclaw_worker_plan?.dispatchStatus ?? null,
        taskProposalStatus: state.openclaw_task_proposal?.status ?? null,
        selectedSkill: state.openclaw_task_proposal?.selectedSkill?.skillKey ?? null,
        selectedExecutor: state.openclaw_task_proposal?.selectedExecutor?.executorKey ?? null,
        routedSkills: state.openclaw_task_proposal?.routedSkills?.map((skill) => skill.skillKey) ?? [],
        workerJobIds: (state.openclaw_worker_plan?.workerJobs ?? []).map((job) => job.jobId),
        mayCreateSubtasks: state.openclaw_worker_plan?.workerJobs?.[0]?.deterministicControls?.workerMayCreateSubtasks ?? null,
        progressEverySeconds: state.openclaw_worker_plan?.workerJobs?.[0]?.progressProtocol?.reportEverySeconds ?? null
      }
    },
    state.openclaw_skill_proposal?.task
      ? {
          eventType: "approval.requested",
          payload: {
            taskId: state.openclaw_skill_proposal.task.id,
            status: state.openclaw_skill_proposal.task.status,
            executionMode: state.openclaw_skill_proposal.executionMode,
            approvalsRequired: state.openclaw_skill_validation?.approvalsRequired ?? []
          }
        }
      : null,
    {
      eventType: "evidence.status",
      payload: {
        status: state.evidence_observation?.status ?? "not_requested",
        actionsTaken: state.evidence_observation?.actionsTaken ?? [],
        sourcePointerCount: state.source_pointers?.length ?? 0
      }
    },
    {
      eventType: "final.answer.created",
      payload: {
        workflow: state.workflow,
        outcome: state.workflow_outcome,
        sourcePointerCount: state.source_pointers?.length ?? 0,
        responsePreview: String(state.final_response ?? "").slice(0, 500)
      }
    },
    {
      eventType: "memory.retained",
      payload: {
        localRetained: Boolean(state.should_remember),
        productMemoryAdapter: productMemoryRetain?.adapter ?? "disabled",
        productMemoryEnabled: Boolean(productMemoryRetain?.enabled),
        productMemoryRetained: Boolean(productMemoryRetain?.retained),
        episodeUuid: productMemoryRetain?.episodeUuid ?? null,
        retainAttempts: productMemoryRetain?.retainAttempts ?? 0,
        repairStatus: productMemoryRetain?.repairPlan?.status ?? null,
        repairAttempted: Boolean(productMemoryRetain?.repairPlan?.attemptedRetry),
        repairRepaired: Boolean(productMemoryRetain?.repairPlan?.repaired),
        error: productMemoryRetain?.error ?? null,
        nextAction: productMemoryRetain?.repairPlan?.nextAction ?? null
      }
    }
  ].filter(Boolean);

  for (const event of events) {
    await publishRuntimeEvent(store, {
      ...common,
      eventType: event.eventType,
      payload: event.payload
    });
  }
}

export function createBrainstyLangGraph() {
  return new StateGraph(BrainstyState)
    .addNode("input_policy", observedLangGraphNode("input_policy", "guardrail.check", inputPolicyNode))
    .addNode("recall_context", observedLangGraphNode("recall_context", "memory.read", recallContextNode))
    .addNode("classify_intent", observedLangGraphNode("classify_intent", "router.intent_classified", structuredIntentNode))
    .addNode("llm_decision", observedLangGraphNode("llm_decision", "planner.output", llmOrchestrationDecisionNode))
    .addNode("workflow_router", observedLangGraphNode("workflow_router", "router.route_selected", workflowRouterNode))
    .addNode("plan_journey", observedLangGraphNode("plan_journey", "launcher.agent_selected", planJourneyNode))
    .addNode("skill_resolver", observedLangGraphNode("skill_resolver", "profile.loaded", skillResolverNode))
    .addNode("workflow_executor", observedLangGraphNode("workflow_executor", "openclaw.dispatch", workflowExecutorNode))
    .addNode("observe_evidence", observedLangGraphNode("observe_evidence", "worker.dispatch", evidenceObservationNode))
    .addNode("approval_pause", observedLangGraphNode("approval_pause", "openclaw.approval_requested", approvalInterruptNode))
    .addNode("case_state_shadow", observedLangGraphNode("case_state_shadow", "profile.updated", caseStateShadowNode))
    .addNode("compose_response", observedLangGraphNode("compose_response", "final.response", composeResponseNode))
    .addEdge(START, "input_policy")
    .addConditionalEdges("input_policy", routeAfterInputPolicy, {
      workflow_router: "workflow_router",
      recall_context: "recall_context"
    })
    .addEdge("recall_context", "classify_intent")
    .addEdge("classify_intent", "llm_decision")
    .addEdge("llm_decision", "workflow_router")
    .addConditionalEdges("workflow_router", routeAfterWorkflowRouter, {
      compose_response: "compose_response",
      plan_journey: "plan_journey"
    })
    .addEdge("plan_journey", "skill_resolver")
    .addEdge("skill_resolver", "workflow_executor")
    .addEdge("workflow_executor", "observe_evidence")
    .addConditionalEdges("observe_evidence", routeAfterEvidenceObservation, {
      approval_pause: "approval_pause",
      case_state_shadow: "case_state_shadow"
    })
    .addEdge("approval_pause", "observe_evidence")
    .addEdge("case_state_shadow", "compose_response")
    .addEdge("compose_response", END)
    .compile({ checkpointer });
}

export function routeAfterInputPolicy(state) {
  if (state.policy_result?.urgentEscalationRequired || state.policy_result?.allowed === false) return "workflow_router";
  return "recall_context";
}

export function routeAfterWorkflowRouter(state) {
  if (state.policy_result?.urgentEscalationRequired || state.policy_result?.allowed === false) return "compose_response";
  if (refusalForIntent(state.intent)) return "compose_response";
  if (["urgent_handoff_created", "blocked"].includes(state.workflow_outcome)) return "compose_response";
  return state.final_response ? "compose_response" : "plan_journey";
}

export function routeAfterEvidenceObservation(state) {
  if (state.evidence_observation?.nativeLangGraphInterrupt && !state.approval_resume?.ok) return "approval_pause";
  return "case_state_shadow";
}

export function describeBrainstyLangGraphTopology() {
  return {
    version: LANGGRAPH_RUNNER_VERSION,
    checkpointer: graphCheckpointerReadiness,
    conditionalEdges: [
      {
        from: "input_policy",
        cases: ["workflow_router", "recall_context"],
        proves: ["refusal", "urgent_handoff", "safe_continue"]
      },
      {
        from: "workflow_router",
        cases: ["compose_response", "plan_journey"],
        proves: ["policy_response", "approval_pending", "journey_execution"]
      },
      {
        from: "observe_evidence",
        cases: ["approval_pause", "case_state_shadow"],
        proves: ["native_hitl_interrupt", "evidence_blocked", "evidence_found", "case_state_shadow"]
      }
    ],
    linearEdges: [
      ["recall_context", "classify_intent"],
      ["classify_intent", "llm_decision"],
      ["llm_decision", "workflow_router"],
      ["plan_journey", "skill_resolver"],
      ["skill_resolver", "workflow_executor"],
      ["workflow_executor", "observe_evidence"],
      ["approval_pause", "observe_evidence"],
      ["case_state_shadow", "compose_response"],
      ["compose_response", "__end__"]
    ],
    finalResponseBranchingMechanism: "reasoning_orchestrator_with_native_hitl_interrupts_and_terminal_compose_response"
  };
}

const graph = createBrainstyLangGraph();

function hasPendingApprovalInterrupt(snapshot) {
  if (!snapshot) return false;
  if (Array.isArray(snapshot.next) && snapshot.next.includes("approval_pause")) return true;
  return Boolean(snapshot.tasks?.some((task) => task?.name === "approval_pause" || task?.interrupts?.length));
}

function interruptedStatePatch(state) {
  const interrupts = Array.isArray(state.__interrupt__) ? state.__interrupt__ : state.__interrupt__ ? [state.__interrupt__] : [];
  if (!interrupts.length) return state;
  const payload = interrupts[0]?.value ?? interrupts[0] ?? {};
  return {
    ...state,
    approval_interrupt: {
      status: "interrupted",
      payload,
      interruptedAt: nowIso(),
      approvalTokenAuthorizationOfRecord: true
    },
    workflow_outcome: "approval_pending_interrupt",
    final_response:
      state.final_response ??
      "Read-only worker observation is paused for explicit human approval. Approve the bounded task to resume, or continue with a best-effort answer from available evidence.",
    proof: mergeProof(state, "approval_interrupt", {
      status: "interrupted",
      taskId: payload.taskId ?? null,
      approvalTokenAuthorizationOfRecord: true
    })
  };
}

export async function getBrainstyLangGraphCheckpointState({ threadId, checkpointNs = "" }) {
  return graph.getState({
    configurable: {
      thread_id: threadId,
      checkpoint_ns: checkpointNs
    }
  });
}

export async function runLangGraphOrchestration(store, { user, session, channel = "local_web_chat", userInput, rawMessage = {} }) {
  const graphTraceId = session.langgraph_thread_id ?? createId("lgtrace");
  const persistConversation = rawMessage.persistConversation !== false;
  if (persistConversation && userInput) {
    await store.insert("conversation_messages", {
      id: createId("msg"),
      session_id: session.id,
      role: "user",
      content: userInput,
      created_at: nowIso()
    });
  }
  const context = await buildContextPacket(store, {
    user,
    session,
    channel,
    userInput
  });
  const productMemoryRecall = await recallProductMemoryForRequest({
    store,
    user,
    session,
    userInput,
    contextPacket: context.packet
  });
  context.packet.productMemory = {
    adapter: productMemoryRecall.adapter,
    enabled: productMemoryRecall.enabled,
    provider: productMemoryRecall.provider ?? "zep_graphiti",
    status: productMemoryRecall.ok === false ? "recall_failed" : productMemoryRecall.status ?? "available",
    contractVersion: productMemoryRecall.contractVersion,
    recalledFacts: productMemoryRecall.facts ?? [],
    factCount: productMemoryRecall.facts?.length ?? 0,
    error: productMemoryRecall.error ?? null,
    cortexProductMemory: false
  };
  const checkpointResumePlan = buildCheckpointResumePlan({ contextPacket: context.packet, rawMessage });
  const initialState = {
    schema_version: LANGGRAPH_RUNNER_VERSION,
    user_id: user.id,
    session_id: session.id,
    graph_trace_id: graphTraceId,
    channel,
    user_input: userInput,
    raw_message: rawMessage,
    context_packet: context.packet,
    checkpoint_resume_plan: checkpointResumePlan,
    runtime_bundle: null,
    memory_context: "",
  product_memory_recall: productMemoryRecall,
    product_memory_retain: null,
    continuous_intelligence_persistence: null,
    policy_result: null,
    intent: null,
    structured_intent: null,
    llm_orchestration_decision: null,
    workflow: null,
    workflow_route: null,
    route_reason: null,
    openclaw_envelope: null,
    openclaw_skill_validation: null,
    openclaw_worker_plan: null,
    openclaw_task_proposal: null,
    openclaw_skill_proposal: null,
    worker_continuation: null,
    human_handoff: null,
    approval_resume: null,
    approval_interrupt: null,
    evidence_observation: null,
    journey_plan: null,
    case_state: null,
    continuous_intelligence: null,
    sourced_answer: null,
    degraded_answer: null,
    research_evidence: null,
    uploaded_document_context: null,
    browser_result: null,
    eligibility_result: null,
    portal_scan: null,
    source_pointers: [],
    tool_calls: [],
    tool_results: [],
    model_invocation: null,
    final_response: null,
    ai2ui_blocks: [],
    journey_decisions: [],
    answer_claims: [],
    should_remember: false,
    memory_summary: null,
    memory_type: null,
    workflow_outcome: null,
    safety: {},
    proof: []
  };
  const config = {
    configurable: {
      thread_id: session.langgraph_thread_id,
      checkpoint_ns: "",
      user_id: user.id,
      session_id: session.id
    },
    context: {
      userId: user.id,
      sessionId: session.id
    },
    metadata: {
      app_name: "brainstyworkers-ai-concierge",
      environment: process.env.LANGFUSE_ENVIRONMENT || process.env.NODE_ENV || "local",
      release: process.env.LANGFUSE_RELEASE || "local",
      session_id: session.id,
      trace_id: graphTraceId,
      user_hash: user.id,
      workflow: rawMessage.workflow ?? null,
      langchain_runtime: "@langchain/langgraph",
      openclaw_enabled: Boolean(rawMessage.useOfficialOpenClawWorker || rawMessage.workerContinuationId),
      safety_mode: "deterministic_rails_llm_planner",
      phi_redaction_enabled: true
    }
  };
  activeStores.set(session.id, store);
  const rootCheckpoint = await start_checkpoint(
    "agent.run",
    "agent.run",
    {
      app_name: "brainstyworkers-ai-concierge",
      environment: process.env.LANGFUSE_ENVIRONMENT || process.env.NODE_ENV || "local",
      release: process.env.LANGFUSE_RELEASE || "local",
      workflow: rawMessage.workflow ?? null,
      tenant_id: rawMessage.tenantId ?? user.tenant_id ?? null,
      session_id: session.id,
      trace_id: graphTraceId,
      user_hash: user.id,
      agent_version: LANGGRAPH_RUNNER_VERSION,
      route: null,
      planner_version: "llm_orchestration_decision.v1",
      router_version: "structured_intent_classifier",
      profile_name: "brainstyworkers",
      langchain_runtime: "@langchain/langgraph",
      openclaw_enabled: Boolean(rawMessage.useOfficialOpenClawWorker || rawMessage.workerContinuationId),
      safety_mode: "deterministic_rails_llm_planner",
      phi_redaction_enabled: true
    },
    {
      input_summary: String(userInput ?? "").slice(0, 180),
      channel
    }
  );
  let state;
  try {
    const checkpointState = rawMessage?.approvalToken ? await graph.getState(config).catch(() => null) : null;
    const graphInput =
      rawMessage?.approvalToken && hasPendingApprovalInterrupt(checkpointState)
        ? new Command({
            resume: rawMessage.approvalToken,
            update: initialState
          })
        : initialState;
    state = interruptedStatePatch(
      await runWithTraceContext(
        { traceId: graphTraceId, sessionId: session.id, userId: user.id },
        () => graph.invoke(graphInput, config)
      )
    );
    rootCheckpoint.end_checkpoint(summarizeNodeOutput(state), {
      workflow: state.workflow,
      route: state.workflow_route?.workflowKey ?? state.workflow,
      status: state.workflow_outcome ?? "completed",
      source_pointer_count: state.source_pointers?.length ?? 0,
      approval_status: state.approval_resume?.status ?? state.approval_interrupt?.status ?? null,
      result_status: state.evidence_observation?.status ?? null
    });
  } catch (error) {
    rootCheckpoint.fail_checkpoint(error, classifyFailureClass(error, FAILURE_CLASSES.UNKNOWN_ERROR), {
      status: "failed"
    });
    throw error;
  } finally {
    activeStores.delete(session.id);
  }
  if (state.openclaw_skill_validation && state.openclaw_envelope) {
    const proposal = await recordOpenClawSkillInvocationProposal(store, {
      user,
      session,
      contextPacketId: context.row.id,
      envelope: state.openclaw_envelope,
      validation: state.openclaw_skill_validation,
      workerPlan: state.openclaw_worker_plan,
      taskProposal: state.openclaw_task_proposal
    });
    state.openclaw_skill_proposal = proposal;
    state.proof = mergeProof(state, "openclaw_skill_invocation_proposal", {
      taskId: proposal.task.id,
      auditEventId: proposal.auditEvent.id,
      executionMode: proposal.executionMode,
      actionsTaken: proposal.actionsTaken
    });
  }
  await audit(store, session.id, "langgraph_run_completed", {
    graphTraceId,
    version: LANGGRAPH_RUNNER_VERSION,
    workflow: state.workflow,
    routeReason: state.route_reason,
    contextPacketId: context.row.id,
    evidenceObservationStatus: state.evidence_observation?.status ?? null,
    sourcePointerCount: state.source_pointers?.length ?? 0,
    openclawEnvelopePrepared: Boolean(state.openclaw_envelope),
    openclawSkillValidated: Boolean(state.openclaw_skill_validation),
    openclawWorkerPlanPrepared: Boolean(state.openclaw_worker_plan),
    openclawTaskProposalPrepared: Boolean(state.openclaw_task_proposal),
    openclawSkillProposalTaskId: state.openclaw_skill_proposal?.task?.id ?? null,
    humanHandoffId: state.human_handoff?.handoff?.id ?? null,
    humanHandoffTaskId: state.human_handoff?.handoff?.taskId ?? state.human_handoff?.task?.id ?? null,
    modelInvocationMode: state.model_invocation?.mode,
    continuousIntelligenceMode: state.continuous_intelligence?.mode ?? null,
    continuousIntelligenceGateScore: state.continuous_intelligence?.gateSummary?.score ?? null,
    continuousIntelligencePemsTrusted: state.continuous_intelligence?.pems?.trusted ?? null,
    graphCheckpointer: {
      mode: graphCheckpointerReadiness.mode,
      durable: graphCheckpointerReadiness.durable,
      status: graphCheckpointerReadiness.status
    },
    nativeHitlInterrupt: state.approval_interrupt?.status ?? null
  });
  const checkpointResult = await checkpointSession(store, {
    session,
    stepName: "langgraph_run_completed",
    statePatch: {
      langgraph: {
        runnerVersion: LANGGRAPH_RUNNER_VERSION,
        graphTraceId,
        workflow: state.workflow,
        routeReason: state.route_reason,
        contextPacketId: context.row.id,
        evidenceObservationStatus: state.evidence_observation?.status ?? null,
        sourcePointers: state.source_pointers ?? [],
        openclawEnvelopePrepared: Boolean(state.openclaw_envelope),
        openclawSkillValidated: Boolean(state.openclaw_skill_validation),
        openclawWorkerPlanPrepared: Boolean(state.openclaw_worker_plan),
        openclawTaskProposalPrepared: Boolean(state.openclaw_task_proposal),
        openclawSkillProposalTaskId: state.openclaw_skill_proposal?.task?.id ?? null,
        humanHandoff: state.human_handoff?.handoff ?? null,
        continuousIntelligence: state.continuous_intelligence
          ? {
              version: state.continuous_intelligence.version,
              mode: state.continuous_intelligence.mode,
              gateSummary: state.continuous_intelligence.gateSummary,
              pems: state.continuous_intelligence.pems,
              productionDrivingAllowed: false
            }
          : null,
        modelInvocationMode: state.model_invocation?.mode
        ,
        graphCheckpointer: {
          mode: graphCheckpointerReadiness.mode,
          durable: graphCheckpointerReadiness.durable,
          status: graphCheckpointerReadiness.status
        },
        nativeHitlInterrupt: state.approval_interrupt?.status ?? null
      }
    },
    metadata: {
      source: "live_langgraph_runtime",
      package: "@langchain/langgraph",
      checkpointResumePlan
    }
  });
  const refreshedManagedSession = await getManagedSessionState(store, session.id);
  const runtimeContextCache = createRuntimeContextCache();
  const runtimeContextManifest = buildRuntimeContextManifest({
    session,
    contextPacket: context.packet,
    managedSession: refreshedManagedSession,
    previous: context.packet.runtimeContext ?? null
  });
  const runtimeContextStored = await storeRuntimeContextManifest({
    cache: runtimeContextCache,
    key: runtimeContextKey(session.id),
    manifest: runtimeContextManifest
  });
  state.runtime_context_cache = {
    version: runtimeContextManifest.version,
    backend: runtimeContextCache.backend,
    cacheKey: runtimeContextKey(session.id),
    manifestHash: runtimeContextManifest.manifestHash,
    stored: runtimeContextStored.ok,
    storeError: runtimeContextStored.error ?? null,
    checkpointId: checkpointResult.checkpointId,
    achievedCheckpointCount: runtimeContextManifest.achievedCheckpoints.length,
    promptCompaction: runtimeContextManifest.promptCompaction
  };
  state.proof = mergeProof(state, "runtime_context_cache", {
    backend: runtimeContextCache.backend,
    stored: runtimeContextStored.ok,
    manifestHash: runtimeContextManifest.manifestHash,
    checkpointId: checkpointResult.checkpointId,
    achievedCheckpointCount: runtimeContextManifest.achievedCheckpoints.length
  });
  if (persistConversation && state.final_response) {
    await store.insert("conversation_messages", {
      id: createId("msg"),
      session_id: session.id,
      role: "assistant",
      content: state.final_response,
      created_at: nowIso()
    });
    await audit(store, session.id, "response_composed", {
      runtime: "langgraph",
      graphTraceId,
      finalResponse: state.final_response,
      sourcePointers: state.source_pointers ?? []
    });
  }
  const retainedMemory = await retainMemoryFromSession(store, {
    user,
    session: { ...session, current_step: "langgraph_run_completed" },
    reason: "langgraph_run_completed"
  });
  const productMemoryRetain = await retainProductMemoryFromGraphRun(store, {
    user,
    session: { ...session, current_step: "langgraph_run_completed" },
    state,
    localMemoryItems: retainedMemory
  });
  state.product_memory_retain = productMemoryRetain;
  state.proof = mergeProof(state, "product_memory_retain", {
    adapter: productMemoryRetain.adapter,
    enabled: productMemoryRetain.enabled,
    retained: productMemoryRetain.retained,
    episodeUuid: productMemoryRetain.episodeUuid ?? null,
    error: productMemoryRetain.error ?? null
  });
  const continuousIntelligencePersistence = await persistFinalContinuousIntelligenceShadow(store, {
    user,
    session,
    graphTraceId,
    channel,
    userInput,
    contextPacket: context.packet,
    productMemoryRecall,
    productMemoryRetain,
    state
  });
  state.continuous_intelligence = continuousIntelligencePersistence.shadow;
  state.case_state = continuousIntelligencePersistence.shadow.caseState;
  state.continuous_intelligence_persistence = {
    version: continuousIntelligencePersistence.version,
    shadowRunId: continuousIntelligencePersistence.shadowRun.id,
    candidateId: continuousIntelligencePersistence.maturity.candidateId,
    pemsScore: continuousIntelligencePersistence.maturity.score,
    pemsTrusted: continuousIntelligencePersistence.maturity.trusted,
    shadowRunCount: continuousIntelligencePersistence.aggregate.shadowRunCount,
    productionDrivingAllowed: false
  };
  state.proof = mergeProof(state, "continuous_intelligence_shadow_persistence", {
    version: continuousIntelligencePersistence.version,
    shadowRunId: continuousIntelligencePersistence.shadowRun.id,
    candidateId: continuousIntelligencePersistence.maturity.candidateId,
    pemsScore: continuousIntelligencePersistence.maturity.score,
    pemsTrusted: continuousIntelligencePersistence.maturity.trusted,
    shadowRunCount: continuousIntelligencePersistence.aggregate.shadowRunCount,
    productionDrivingAllowed: false
  });
  await store.update(
    "sessions",
    {
      current_step: "langgraph_run_completed",
      active_workflow_key: state.workflow ?? session.active_workflow_key ?? null,
      journey_stage: state.workflow_route?.journeyStage ?? session.journey_stage ?? null,
      last_context_packet_id: context.row?.id ?? session.last_context_packet_id ?? null,
      state_version: Number(session.state_version ?? 0) + 1,
      last_active_at: nowIso()
    },
    { id: session.id }
  );
  await audit(store, session.id, "continuous_intelligence_shadow_persisted", {
    graphTraceId,
    shadowRunId: continuousIntelligencePersistence.shadowRun.id,
    candidateId: continuousIntelligencePersistence.maturity.candidateId,
    pemsScore: continuousIntelligencePersistence.maturity.score,
    pemsTrusted: continuousIntelligencePersistence.maturity.trusted,
    shadowRunCount: continuousIntelligencePersistence.aggregate.shadowRunCount,
    productionDrivingAllowed: false
  });
  state.ai2ui_blocks = buildAi2UiBlocksFromState(state, {
    productMemory: {
      recall: productMemoryRecall,
      retain: productMemoryRetain
    }
  });
  state.proof = mergeProof(state, "ai2ui_blocks_prepared", {
    version: state.ai2ui_blocks[0]?.version ?? null,
    blockCount: state.ai2ui_blocks.length,
    blockTypes: state.ai2ui_blocks.map((block) => block.type)
  });
  await publishLangGraphLifecycleEvents(store, {
    user,
    session: { ...session, current_step: "langgraph_run_completed" },
    state,
    productMemoryRetain
  });
  return {
    version: LANGGRAPH_RUNNER_VERSION,
    contextPacket: context,
    state,
    retainedMemory,
    productMemory: {
      recall: productMemoryRecall,
      retain: productMemoryRetain
    }
  };
}
