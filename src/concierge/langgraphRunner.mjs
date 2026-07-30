import { Annotation, Command, END, MemorySaver, START, StateGraph, interrupt } from "@langchain/langgraph";
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
import { createId, nowIso, insertConversationMessage } from "./database.mjs";
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
import { deriveRiskTier, evaluateInputPolicy } from "./policy.mjs";
import { persistEligibilitySnapshot } from "./portalExtraction.mjs";
import {
  recordBlockedPortalEvidence,
  recordVerifiedPortalSourcePointer,
  verifyAuthenticatedPortalEvidence
} from "./portalEvidenceVerifier.mjs";
import { persistPortalPageScan } from "./portalScan.mjs";
import { buildRuntimeCompatibilityBundle, toOpenClawChannelEnvelope } from "./runtimeAdapters.mjs";
import { checkpointSession, getManagedSessionState } from "./sessionManager.mjs";
import { runLedgerMode, processRuntimeEnabled, writeShadowCheckpointLedger } from "./checkpointRunLedger.mjs";
import { composeProcessOfferResponse } from "./plannerResponseComposer.mjs";
import {
  buildRuntimeContextManifest,
  createRuntimeContextCache,
  runtimeContextKey,
  storeRuntimeContextManifest
} from "./runtimeContextCache.mjs";
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
  applyDecisionCapabilityGates,
  buildLlmOrchestrationDecisionMessages,
  confidenceBand,
  LLM_ORCHESTRATION_DECISION_VERSION,
  normalizeLlmOrchestrationDecision,
  shouldUseLlmDecision
} from "./llmOrchestrationDecision.mjs";
import { createTieredChatModel, selectModelForStep, traceFullPromptsEnabled } from "./modelTierPolicy.mjs";
import { composeSourcedAnswerWithOpenAI } from "./intelligence/sourcedAnswerComposer.mjs";
import { publishRuntimeEvent } from "./runtimeEvents.mjs";
import { composeBestEffortAnswer, proposeBasicClarification } from "./gracefulDegradation.mjs";
import { createGraphCheckpointer } from "./graphCheckpointer.mjs";
import { CHECKPOINT_RUNTIME_VERSIONS, resumeCompatibility } from "./graphCheckpointerStore.mjs";
import { observedLangGraphNode, runWithTraceContext, start_checkpoint, summarizeNodeOutput, withCheckpoint } from "../observability/checkpoints.mjs";
import { readWorkerRuntimeState, recordWorkerDispatchState } from "./workerRuntimeState.mjs";
import { classifyBrowserRemoteReadiness } from "./browserRemoteReadiness.mjs";
import { toolExecutorAssignments } from "./workflowArchitecture.mjs";
import { classifyFailureClass, FAILURE_CLASSES } from "../observability/failures.mjs";
import {
  consumeWorkerContinuationForApprovedDispatch,
  finalizeWorkerContinuationDispatch,
  validateWorkerContinuationForDispatch
} from "./workerContinuations.mjs";

export const LANGGRAPH_RUNNER_VERSION = "2026-07-02.langgraph-runner.phase83-84-three-layer-planner.v2";

// Node's test runner starts one process per test file. Giving every hermetic unit
// process a PostgreSQL pool can exhaust the server before behavior assertions run.
// This branch is unreachable in the application runtime and is never accepted as a
// durability proof; the explicit live PostgreSQL suites call createGraphCheckpointer
// directly and may force this module onto PostgreSQL for process-restart coverage.
const unitTestCheckpointer = Boolean(process.env.NODE_TEST_CONTEXT) && process.env.BRAINSTY_FORCE_POSTGRES_TEST_CHECKPOINTER !== "1";
const { checkpointer, readiness: graphCheckpointerReadiness } = unitTestCheckpointer
  ? {
      checkpointer: new MemorySaver(),
      readiness: {
        mode: "memory_test_only",
        durable: false,
        survivesRestart: false,
        status: "test_only_not_runtime_acceptance"
      }
    }
  : createGraphCheckpointer();
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
  // Three-layer pivot (Phase 84): the structured_intent channel is DELETED — the
  // planner decision is the single classification authority. consent_state/auth_state
  // are the Layer-3 prompt projections (plan §3.1/§4.1); errors is the loud-failure
  // channel the draft's state contract names.
  consent_state: field(null),
  auth_state: field(null),
  errors: appendArrayField(),
  // Phase 88 (§4.3): interrupt-kind discriminator + the pending consent/auth gate.
  // Old checkpoints hydrate null (tolerant defaults — the Phase 84 new-channel pattern).
  approval_interrupt_kind: field(null),
  consent_gate: field(null),
  llm_orchestration_decision: field(null),
  hydrated_capabilities: field(null),
  worker_runtime_state: field(null),
  capability_offer: field(null),
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
  answer_claims: appendArrayField(),
  should_remember: field(false),
  memory_summary: field(null),
  memory_type: field(null),
  workflow_outcome: field(null),
  safety: mergeObjectField({}),
  proof: appendArrayField(),
  // Canonical conversation channel (concat reducer). Carried across turns by the checkpointer
  // per thread_id. MUST be omitted from initialState/Command.update (appendArrayField resets on
  // []), so prior turns are preserved. Appended: user turn in inputPolicyNode, assistant turn
  // via graph.updateState after the run. Authoritative durable record stays in conversation_messages.
  messages: appendArrayField()
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

// Phase 87 (§7): the planner-selected OpenClaw capability — a RESOLVED hydrated entry
// whose backing maps to the read-only browser (or document-download) executor. This is
// what makes dispatch decision-first: the client cannot veto or force it with a flag.
function plannerSelectedOpenclawCapability(state) {
  const resolved = state.hydrated_capabilities?.resolved ?? [];
  const map = toolExecutorAssignments();
  return (
    resolved.find((entry) => {
      const key = String(entry?.portfolioId ?? "");
      if (key === "skill:insurance_portal_browser") return true;
      const toolKey = entry?.hydrate?.toolKey ?? entry?.hydrate?.tool_key ?? (key.startsWith("tool:") ? key.slice(5) : null);
      const executorKey = toolKey ? map[toolKey]?.executorKey ?? null : null;
      return executorKey === "read_only_browser" || executorKey === "document_download";
    }) ?? null
  );
}

// Phase 87 (§7 node-entry gate rewrite): keyed on the PLANNER's resolved openclaw
// selection plus genuine resume/evidence artifacts. The deleted client-side
// legacy worker flag can no longer veto or force dispatch;
// executeEvidenceObservation stays as a NON-AUTHORITATIVE entry hint only.
function shouldObserveEvidence(state) {
  const raw = state.raw_message ?? {};
  return Boolean(
      plannerSelectedOpenclawCapability(state) ||
      raw.workerContinuationId ||
      raw.documentCandidateId ||
      raw.approvedDocumentCandidateId ||
      raw.browserSnapshot ||
      raw.remoteDebuggerUrl ||
      raw.portalPageSnapshots?.length ||
      raw.uploadedDocuments?.length ||
      raw.executeEvidenceObservation === true
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
  // Three-layer pivot (plan §5.1): MRF price observations join the trusted-evidence
  // pool as CITED pointers — consent-gated (mrf_pricing_lookup_approved, fail-closed)
  // and code-gated (a shoppable CPT/HCPCS code in the question). Never planner
  // metadata; prices flow only as evidence for the composer's source-pointer guard.
  try {
    if (state.consent_state?.mrfPricingLookupApproved === true) {
      const { extractBillingCode, queryMrfPriceEvidence } = await import("./mrfPricing.mjs");
      const billingCode = extractBillingCode(state.user_input);
      if (billingCode) {
        const priceRows = await queryMrfPriceEvidence(store, {
          billingCode,
          payer: state.auth_state?.payer ?? null,
          limit: 3
        });
        for (const row of priceRows) {
          sourcePointers.push({ table: row.table, id: row.id, summary: row.summary, sourceUrl: row.sourceUrl, sourcePointer: row.sourcePointer });
        }
      }
    }
  } catch {
    /* MRF evidence is additive; research evidence flow continues */
  }
  // Phase 89 (§9): provider-directory evidence joins the pool as CITED rows when the
  // decision routed to the provider-network journey (deterministic specialty/zip
  // extraction — never LLM-guessed). Rows carry the REAL directory source_url.
  try {
    if (state.workflow === "provider_network_navigation") {
      const { extractDirectoryQuery, queryProviderDirectoryEvidence } = await import("./connectors/planNetDirectory.mjs");
      const { specialty, zip, nuccCode } = extractDirectoryQuery(state.user_input);
      if (specialty || zip) {
        const rows = await queryProviderDirectoryEvidence(store, { specialty, nuccCode, zip, limit: 5 });
        for (const row of rows) {
          sourcePointers.push({ table: row.table, id: row.id, summary: row.summary, sourceUrl: row.sourceUrl, sourcePointer: row.sourcePointer });
        }
      }
    }
  } catch {
    /* directory evidence is additive; research flow continues */
  }
  // Phase 87 (§7): public-corpus RAG chunks join the trusted-evidence pool as CITED
  // pointers (rag_chunks#id + the backing extraction_artifacts anchor). Public data
  // classes only; a missing artifact anchor fails LOUD inside queryRagEvidence
  // (rag_chunk_artifact_missing) and is surfaced, never swallowed into an uncited answer.
  try {
    const { queryRagEvidence } = await import("./knowledge/publicRagRetrieval.mjs");
    for (const dataClass of ["official_payer_public", "cms_public", "official_employer_public"]) {
      const rag = await queryRagEvidence(store, {
        query: state.user_input,
        dataClass,
        limit: 3,
        sessionId: state.session_id
      });
      for (const row of rag.evidence) {
        if (row.score >= 0.25) {
          sourcePointers.push({
            table: "rag_chunks",
            id: row.chunkId,
            summary: row.chunkText.slice(0, 240),
            sourcePointer: row.source_pointer,
            artifactPointer: row.artifact_pointer,
            evidenceClass: row.sourceEvidenceClass,
            score: row.score
          });
        }
      }
    }
  } catch (error) {
    if (error?.failureClass === "rag_chunk_artifact_missing") throw error; // loud, classified
    /* provider-unavailable and empty-corpus states are additive skips; research flow continues */
  }
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


// Phase 88 (§8.1): re-derive the tier WITH the hydrated capability rows, stamp the
// (possibly raised) floor back onto policy_result, and audit risk_tier_assigned with
// the capability ids. The LLM's asserted tier may only raise above this floor.
async function assignDecisionRiskTier(state, gatedDecision, hydratedCapabilities) {
  const store = activeStores.get(state.session_id);
  const rows = hydratedCapabilityRows(hydratedCapabilities);
  const derived = deriveRiskTier(state.policy_result, { selectedCapabilityRows: rows });
  const policyResult = state.policy_result ?? {};
  policyResult.riskTier = derived.riskTier;
  policyResult.riskTierReasonCode = derived.reasonCode;
  if (store) {
    try {
      await audit(store, state.session_id, "risk_tier_assigned", {
        workflow_id: gatedDecision.classification?.workflow ?? state.workflow ?? null,
        capability_id: rows[0]?.capabilityKey ?? rows[0]?.capability_key ?? null,
        capability_ids: rows.map((row) => row.capabilityKey ?? row.capability_key).filter(Boolean),
        risk_tier: gatedDecision.risk_tier ?? derived.riskTier,
        risk_tier_floor: derived.riskTier,
        reason_code: derived.reasonCode,
        policy_version: derived.policyVersion,
        timestamp: nowIso(),
        stage: "llm_decision"
      });
    } catch {
      /* chain verifier surfaces audit failures */
    }
  }
  return policyResult;
}

async function inputPolicyNode(state) {
  const policyResult = evaluateInputPolicy(state.user_input);
  // Phase 88 (§8.1): the derived tier is stamped on policy_result at the gate and
  // audited (risk_tier_assigned). The decision node re-derives WITH the hydrated
  // capability rows and audits again if the tier moved (LLM may only raise).
  const derived = deriveRiskTier(policyResult);
  policyResult.riskTier = derived.riskTier;
  policyResult.riskTierReasonCode = derived.reasonCode;
  {
    const store = activeStores.get(state.session_id);
    if (store) {
      try {
        await audit(store, state.session_id, "risk_tier_assigned", {
          workflow_id: state.workflow ?? null,
          capability_id: null,
          risk_tier: derived.riskTier,
          reason_code: derived.reasonCode,
          policy_version: derived.policyVersion,
          timestamp: nowIso(),
          stage: "input_policy"
        });
      } catch {
        /* audit failure surfaces via the chain verifier; the gate itself stays deterministic */
      }
    }
  }
  const intent = classifyIntent(state.user_input, policyResult);
  // Append the current user turn to the canonical messages channel. Cold start (fresh process,
  // empty/lost checkpoint): rehydrate prior turns from the authoritative DB in order, dropping
  // the just-inserted current user row. Warm path: channel already holds history -> seed empty.
  const priorInChannel = Array.isArray(state.messages) ? state.messages : [];
  let seed = [];
  if (priorInChannel.length === 0) {
    const store = activeStores.get(state.session_id);
    if (store) {
      try {
        const rows = await store.all(
          "SELECT role, content FROM conversation_messages WHERE session_id = ? ORDER BY sequence_number ASC;",
          [state.session_id]
        );
        seed = rows.map((r) => ({ role: r.role, content: String(r.content ?? "") }));
        const last = seed[seed.length - 1];
        if (last && last.role === "user" && last.content === String(state.user_input ?? "")) seed.pop();
      } catch {
        seed = [];
      }
    }
  }
  const currentUserTurn = { role: "user", content: String(state.user_input ?? ""), at: nowIso() };
  return {
    messages: [...seed, currentUserTurn],
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
  const runtimeContext = packet?.runtimeContext ?? null;
  // Trace the runtime-context cache read-back as a memory.read span.
  await withCheckpoint(
    "memory.read",
    {
      kind: "cache.read",
      metadata: {
        trace_id: state.graph_trace_id,
        session_id: state.session_id,
        cache_backend: runtimeContext?.cacheBackend ?? null,
        cache_status: runtimeContext?.cacheStatus ?? null,
        achieved_checkpoints: runtimeContext?.achievedCheckpoints?.length ?? 0,
        prior_decision_pointers: runtimeContext?.priorDecisionPointers?.length ?? 0
      },
      input: { cacheKey: runtimeContext?.cacheKey ?? null }
    },
    async () => ({
      cacheBackend: runtimeContext?.cacheBackend ?? null,
      cacheStatus: runtimeContext?.cacheStatus ?? "no_runtime_context",
      achievedCheckpoints: runtimeContext?.achievedCheckpoints?.length ?? 0
    })
  );
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
  // Three-layer pivot (plan §4.1): hydrate the consent/auth snapshots the planner
  // payload projects as prompt-layer-3 context. DB-read only (fail-closed
  // {missing:true} without a consent row); the graph never writes these channels.
  let consentState = { missing: true, reason: "no_store" };
  let authState = { loginState: "unknown", portalAccountId: null };
  if (store && state.user_id) {
    try {
      const { loadConsentState, loadAuthState } = await import("./credentialVault.mjs");
      consentState = await loadConsentState(store, { userId: state.user_id });
      authState = await loadAuthState(store, { userId: state.user_id });
    } catch (error) {
      consentState = { missing: true, reason: `consent_hydration_failed:${error.message}` };
    }
  }
  return {
    consent_state: consentState,
    auth_state: authState,
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

function summarizeHydration(hydratedCapabilities) {
  if (!hydratedCapabilities) return null;
  return {
    cacheBackend: hydratedCapabilities.cacheBackend,
    cacheHit: hydratedCapabilities.cacheHit,
    requested: hydratedCapabilities.requested,
    resolvedCount: hydratedCapabilities.resolvedCount,
    resolvedPortfolioIds: hydratedCapabilities.resolved.map((entry) => entry.portfolioId).slice(0, 10),
    missing: hydratedCapabilities.missing
  };
}

// Dereference the pointers the planner selected back into hydrated capability
// payloads, traced as capability.hydrate. Runs for any valid decision (live or
// replayed) so the read-back is deterministic and feeds the worker dispatch.
async function hydrateDecisionCapabilities(state, decision) {
  const selectedPointers = [
    ...(decision?.selected_tools?.capabilityPointers ?? []),
    ...(decision?.selected_tools?.selectedCapabilityPortfolioIds ?? [])
  ];
  if (!selectedPointers.length) return null;
  return withCheckpoint(
    "capability.hydrate",
    {
      kind: "cache.read",
      metadata: {
        trace_id: state.graph_trace_id,
        session_id: state.session_id,
        requested_pointers: selectedPointers.length
      },
      input: { requestedPointerCount: selectedPointers.length }
    },
    async () => {
      // Phase 86 (§6.3): the DB catalog is the ONLY hydration surface — selected
      // pointers resolve via the authoritative catalog hydrator (by key,
      // backing-precedence, §7.0 runtime_selectable gate). The legacy Redis-trusting
      // portfolio deref (hydrateCapabilityPointers) and its BRAINSTY_PLANNER_DB_CATALOG
      // switch are DELETED — a pointer the catalog cannot resolve reports missing, loud.
      const store = activeStores.get(state.session_id);
      const { hydrateCapabilityPointer } = await import("./capabilityCatalog.mjs");
      // Phase 88 (§8.1): the authorized tier for this turn derives from the SATISFIED
      // gates (riskTierAuthorizedByGates): a consumed single-use write token authorizes
      // high; otherwise the read-only baseline (medium). Never a free string.
      const { riskTierAuthorizedByGates } = await import("./policy.mjs");
      const authorizedTier = riskTierAuthorizedByGates({
        writeTokenConsumed: state.approval_resume?.ok === true && state.approval_resume?.executionMode === "approved_single_write_action_only",
        readOnlyGateSatisfied: true
      });
      const resolved = [];
      const missing = [];
      for (const pointer of selectedPointers) {
        const r = await hydrateCapabilityPointer(store, { pointer, authorizedTier });
        if (r.resolved) resolved.push({ portfolioId: r.capabilityKey, kind: r.kind, title: r.hydrate?.title ?? r.capabilityKey, pointer, hydrate: r.hydrate });
        else missing.push(pointer);
      }
      return { cacheBackend: "db_catalog", requested: selectedPointers.length, resolvedCount: resolved.length, cacheHit: resolved.length > 0, missing, resolved };
    }
  );
}

// Flatten hydrated capability entries into the row shape the §3.3 gates and the
// risk-tier floor consume (approvalScope/riskLevel/toolKey/capabilityKey).
function hydratedCapabilityRows(hydratedCapabilities) {
  return (hydratedCapabilities?.resolved ?? [])
    .map((entry) => (entry?.hydrate ? { ...entry.hydrate, capabilityKey: entry.hydrate.capabilityKey ?? entry.portfolioId } : entry))
    .filter(Boolean);
}

// Prompt layer 2 surface (plan §3.1): DB-catalog processes, promptTable, and the
// DB-derived allowedWorkflows manifest. Loaded once per decision turn and shared by
// the live and replay paths so both normalize with identical options. An empty
// allowedWorkflows list is a LOUD state downstream (allowed_workflows_unavailable).
async function loadPlannerCatalogSurface(state) {
  const surface = { offerableProcesses: [], dbCatalogPortfolio: null, allowedWorkflows: [], knownCapabilityKeys: [] };
  const store = activeStores.get(state.session_id);
  if (!store) return surface;
  try {
    const { loadSessionPortfolio } = await import("./capabilityCatalog.mjs");
    const portfolio = await loadSessionPortfolio(store, { sessionId: state.session_id });
    const table = portfolio.manifest?.promptTable ?? [];
    surface.allowedWorkflows = (portfolio.manifest?.allowedWorkflows ?? []).map((key) => String(key));
    surface.knownCapabilityKeys = table.map((row) => String(row.portfolioId));
    const processRows = table.filter((row) => row.kind === "process");
    // Lever 2: surface each process's ORDERED STEPS (boundary + the tool/skill bound to it) so the
    // planner reasons about feasibility ("can these steps reach the user's target?"). Tool/skill
    // selection is authored into process_steps (deterministic), not LLM-guessed. Batched (1 query).
    let stepsByProc = {};
    try {
      const procDbIds = processRows.map((p) => `proc:${p.portfolioId}`);
      if (procDbIds.length) {
        const placeholders = procDbIds.map(() => "?").join(", ");
        const stepRows = await store.all(
          `SELECT ps.process_id, ps.step_order, ps.step_key, ps.checkpoint_boundary, c.capability_key
           FROM process_steps ps LEFT JOIN capabilities c ON c.id = ps.capability_id
           WHERE ps.process_id IN (${placeholders}) ORDER BY ps.process_id, ps.step_order;`,
          procDbIds
        );
        for (const r of stepRows) {
          (stepsByProc[r.process_id] ??= []).push({ boundary: r.checkpoint_boundary, capability: r.capability_key || null });
        }
      }
    } catch {
      stepsByProc = {};
    }
    surface.offerableProcesses = processRows.map((p) => ({
      id: p.portfolioId,
      title: p.title,
      whenToUse: p.whenToUse,
      target: p.whyUse || p.bestUsedFor || p.title,
      approvalScope: p.approvalScope,
      steps: stepsByProc[`proc:${p.portfolioId}`] ?? []
    }));
    if (table.length > 0) {
      surface.dbCatalogPortfolio = {
        cacheBackend: portfolio.backend,
        cacheKey: portfolio.cacheKey,
        portfolioHash: portfolio.manifest?.version ?? "db_catalog",
        entryCount: table.length,
        promptTable: table,
        source: "db_catalog"
      };
    }
  } catch {
    /* loud downstream: empty allowedWorkflows hard-fails normalization */
  }
  return surface;
}

function plannerNormalizeOptions(state, surface, extra = {}) {
  return {
    allowedWorkflows: surface.allowedWorkflows,
    offerableProcessIds: surface.offerableProcesses.map((process) => process.id),
    knownCapabilityKeys: surface.knownCapabilityKeys,
    policyResult: state.policy_result ?? null,
    consentState: state.consent_state ?? null,
    ...extra
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
        classification: { workflow: "human_approval_escalation", taskClass: null, intent: null, confidence: 0, rationale: "Urgent or emergency content bypasses external LLM decisioning and routes directly to safe handoff." },
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
        classification: { workflow: null, taskClass: null, intent: null, confidence: 0, rationale: "Deterministic safety policy blocked the request before any external LLM decision." },
        issues: ["deterministic_policy_refusal"],
        warnings: []
      },
      proof: appendProof(state, "llm_orchestration_decision", { mode: "skipped_policy_refusal" })
    };
  }

  if (state.raw_message?.llmOrchestrationDecisionReplay) {
    const surface = await loadPlannerCatalogSurface(state);
    const decision = normalizeLlmOrchestrationDecision(
      state.raw_message.llmOrchestrationDecisionReplay,
      plannerNormalizeOptions(state, surface, {
        mode: "replayed_live_decision",
        model: state.raw_message.llmOrchestrationDecisionReplay.model ?? "replay"
      })
    );
    const hydratedCapabilities = await hydrateDecisionCapabilities(state, decision);
    // §3.3 row gates re-run once the selected pointers are hydrated (PAS delegation,
    // registry runtime_selectable, capability-driven risk floor) — same implementation
    // the normalizer uses, applied post-hydration.
    const gated = applyDecisionCapabilityGates(decision, hydratedCapabilityRows(hydratedCapabilities), { policyResult: state.policy_result });
    const tieredPolicyResult = await assignDecisionRiskTier(state, gated, hydratedCapabilities);
    return {
      hydrated_capabilities: hydratedCapabilities,
      policy_result: tieredPolicyResult,
      llm_orchestration_decision: { ...gated, hydratedCapabilities },
      proof: appendProof(state, "llm_orchestration_decision", {
        mode: gated.mode,
        valid: gated.valid,
        workflow: gated.classification?.workflow ?? null,
        confidence: gated.classification?.confidence ?? 0,
        confidenceBand: confidenceBand(gated),
        riskTier: gated.risk_tier,
        dataLayer: gated.data_layer,
        taskClass: gated.classification?.taskClass ?? null,
        issues: gated.issues,
        capabilityHydration: summarizeHydration(hydratedCapabilities)
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
        classification: { workflow: null, taskClass: null, intent: null, confidence: 0, rationale: "Live GPT orchestration decision was not requested." },
        issues: [],
        warnings: []
      },
      proof: appendProof(state, "llm_orchestration_decision", { mode: "not_requested" })
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    // A missing key is UNCONDITIONALLY a loud degraded-intelligence state (plan §10.13):
    // degraded mode is determined solely by real dependency absence, never by a flag,
    // and there is no classifier to pretend with.
    return {
      llm_orchestration_decision: {
        mode: "skipped_missing_openai_api_key",
        provider: "openai",
        model,
        baseURL,
        modelTier: selection,
        valid: false,
        usedByRouter: false,
        degraded: true,
        degradedReason: "missing_openai_api_key",
        classification: { workflow: null, taskClass: null, intent: null, confidence: 0, rationale: "OPENAI_API_KEY is not configured: orchestration intelligence is DEGRADED and no workflow decision can be made." },
        issues: ["missing_openai_api_key"],
        warnings: ["intelligence_degraded_missing_key"]
      },
      proof: appendProof(state, "llm_orchestration_decision", { mode: "skipped_missing_openai_api_key", degraded: true })
    };
  }

  const store = activeStores.get(state.session_id);
  // Phase B + go-live 3/3 + Phase 83: feed the planner the DB-catalog surface —
  // offerableProcesses, the promptTable, and the DB-derived allowedWorkflows manifest.
  const surface = await loadPlannerCatalogSurface(state);
  const { offerableProcesses, dbCatalogPortfolio } = surface;
  // Recent conversation turns so the planner does NOT re-offer / re-ask, and can ADVANCE when the
  // user accepts a prior offer. Read from the canonical messages channel (populated by
  // inputPolicyNode, carried across turns by the checkpointer) — not a DB re-read. The current
  // user turn (appended in inputPolicyNode) is dropped here since it is already in user_input.
  let conversationHistory = (Array.isArray(state.messages) ? state.messages : [])
    .map((m) => ({ role: m.role, content: String(m.content ?? "").slice(0, 500) }));
  const lastTurn = conversationHistory[conversationHistory.length - 1];
  if (lastTurn && lastTurn.role === "user" && lastTurn.content === String(state.user_input ?? "").slice(0, 500)) {
    conversationHistory.pop();
  }
  conversationHistory = conversationHistory.slice(-6);
  const plannerState = dbCatalogPortfolio
    ? { ...state, offerable_processes: offerableProcesses, allowed_workflows: surface.allowedWorkflows, conversation_history: conversationHistory, context_packet: { ...state.context_packet, capabilityPortfolio: dbCatalogPortfolio } }
    : { ...state, offerable_processes: offerableProcesses, allowed_workflows: surface.allowedWorkflows, conversation_history: conversationHistory };
  const messages = buildLlmOrchestrationDecisionMessages(plannerState);
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
  const plannerCheckpoint = await start_checkpoint(
    "planner.start",
    "planner",
    {
      trace_id: state.graph_trace_id,
      session_id: state.session_id,
      model,
      prompt_version: "v2",
      contract_version: LLM_ORCHESTRATION_DECISION_VERSION,
      prompt_message_count: messages.length,
      allowed_workflow_count: surface.allowedWorkflows.length,
      capability_rows: plannerState.context_packet?.capabilityPortfolio?.promptTable?.length ?? 0
    },
    // Debug trace mode: capture the FULL hydrated planner prompt (system + the payload
    // with capability portfolio text, pointers, runtime context) as the span input.
    traceFullPromptsEnabled()
      ? { promptMessageCount: messages.length, full_prompt: messages.map((m) => ({ role: m.role, content: m.content })) }
      : { promptMessageCount: messages.length }
  );
  try {
    // Planner is gpt-4.1 (~3-4s, 45s hard timeout). The earlier llm_unavailable under
    // rapid calls was transient rate-limiting (429), not latency -> retry with backoff
    // (LangChain exponential backoff on 429/5xx) before ever failing loud.
    const { llm } = createTieredChatModel("llm_orchestration_decision", {
      timeout: 60000,
      maxRetries: Number(process.env.BRAINSTY_PLANNER_MAX_RETRIES || 3)
    });
    const response = await llm.invoke(messages);
    const decision = normalizeLlmOrchestrationDecision(
      response.content,
      plannerNormalizeOptions(state, surface, {
        mode: "openai_chatopenai_invoked",
        provider: "openai",
        model
      })
    );
    plannerCheckpoint.end_checkpoint(
      // Debug trace mode: capture the FULL normalized decision (every contract field +
      // selected pointers) as the span output; summary-only when off.
      traceFullPromptsEnabled()
        ? { decision }
        : { workflow: decision.classification?.workflow ?? null, confidence: decision.classification?.confidence ?? 0, valid: decision.valid },
      { checkpoint_name: "planner.output", output_summary: { workflow: decision.classification?.workflow ?? null, confidence: decision.classification?.confidence ?? 0, selectedPointerCount: (decision.selected_tools?.capabilityPointers ?? []).length } }
    );
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
    // Dereference the pointers the planner selected: read the portfolio back from
    // the runtime cache (Redis) and hydrate the selected entries (capability.hydrate).
    const hydratedCapabilities = await hydrateDecisionCapabilities(state, decision);
    // §3.3 row gates re-run post-hydration (PAS delegation, registry
    // runtime_selectable, capability-driven risk floor) — same gate implementation
    // as the normalizer, no dual logic.
    const gated = applyDecisionCapabilityGates(decision, hydratedCapabilityRows(hydratedCapabilities), { policyResult: state.policy_result });
    const tieredPolicyResult = await assignDecisionRiskTier(state, gated, hydratedCapabilities);
    return {
      hydrated_capabilities: hydratedCapabilities,
      policy_result: tieredPolicyResult,
      llm_orchestration_decision: {
        ...gated,
        baseURL,
        modelTier: selection,
        llmOutputIndex,
        hydratedCapabilities,
        confidenceBand: confidenceBand(gated),
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
        valid: gated.valid,
        workflow: gated.classification?.workflow ?? null,
        confidence: gated.classification?.confidence ?? 0,
        confidenceBand: confidenceBand(gated),
        riskTier: gated.risk_tier,
        dataLayer: gated.data_layer,
        taskClass: gated.classification?.taskClass ?? null,
        issues: gated.issues,
        plannerSurface: dbCatalogPortfolio ? "db_catalog" : "legacy",
        allowedWorkflowCount: surface.allowedWorkflows.length,
        offerableProcessCount: offerableProcesses.length,
        capabilityHydration: summarizeHydration(hydratedCapabilities)
      })
    };
  } catch (error) {
    plannerCheckpoint.fail_checkpoint(error);
    return {
      llm_orchestration_decision: {
        mode: "openai_chatopenai_failed",
        provider: "openai",
        model,
        baseURL,
        modelTier: selection,
        valid: false,
        usedByRouter: false,
        classification: { workflow: null, taskClass: null, intent: null, confidence: 0, rationale: error.message },
        issues: [error.message],
        warnings: [],
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
  // Urgent/handoff rail: safety semantics kept verbatim (plan §3.4); the legacy
  // classifier backfill is deleted with the structured_intent channel (plan §10.3).
  if (state.policy_result?.urgentEscalationRequired || state.intent === WORKFLOWS.URGENT_HUMAN_HANDOFF) {
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
        classification: { workflow: "human_approval_escalation", taskClass: null, intent: null, confidence: 0, rationale: "Urgent or emergency content routes directly to safe handoff before external LLM decisioning." },
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

  // Refusal rail: safety semantics kept verbatim (plan §3.4); classifier backfill and
  // structured_intent write deleted with the channel (plan §10.3/§10.11).
  const refusal = refusalForIntent(state.intent);
  if (refusal) {
    return {
      workflow: state.intent,
      workflow_route: null,
      route_reason: "blocked_by_input_policy",
      llm_orchestration_decision: state.llm_orchestration_decision ?? {
        mode: "skipped_policy_refusal",
        provider: "openai",
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        valid: false,
        usedByRouter: false,
        classification: { workflow: null, taskClass: null, intent: null, confidence: 0, rationale: "Deterministic safety policy blocked the request before external LLM decisioning." },
        issues: ["deterministic_policy_refusal"],
        warnings: []
      },
      final_response: refusal,
      workflow_outcome: "blocked",
      proof: appendProof(state, "workflow_router", { route: state.intent, reason: "blocked_by_input_policy" })
    };
  }
  if (state.intent === WORKFLOWS.ESCALATE_APPROVAL) {
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
  // GATE (LLM planner): LLM-primary routing is UNCONDITIONAL (plan §10.13 — the
  // legacy orchestrator-mode env switch is deleted). An UNAVAILABLE planner
  // (no key / invocation failure / unparseable / not requested) must NOT silently
  // fall back to any keyword shortcut. Fail loud: degrade honestly, emit an audit event.
  const llmDecisionMode = String(state.llm_orchestration_decision?.mode ?? "");
  const llmUnavailable =
    ["openai_chatopenai_failed", "invalid_response", "skipped_missing_openai_api_key", "not_requested", ""].includes(llmDecisionMode) ||
    /missing_openai|api_key|unavailable/i.test(llmDecisionMode);
  if (llmUnavailable && !llmDecisionUsed) {
    const store = activeStores.get(state.session_id);
    if (store) {
      await audit(store, state.session_id, "llm_planner_unavailable_no_silent_regex", {
        trace_id: state.graph_trace_id,
        mode: state.llm_orchestration_decision?.mode,
        issues: state.llm_orchestration_decision?.issues ?? []
      }).catch(() => {});
    }
    return {
      workflow: "human_approval_escalation",
      workflow_route: null,
      route_reason: "llm_unavailable_no_silent_regex",
      workflow_outcome: "llm_unavailable",
      final_response:
        "I can't complete the reasoning for this request right now because the planning model is unavailable. I won't guess with a keyword shortcut — please try again in a moment, or I can connect you with a human.",
      llm_orchestration_decision: { ...state.llm_orchestration_decision, usedByRouter: false },
      should_remember: false,
      proof: appendProof(state, "workflow_router", {
        route: "human_approval_escalation",
        reason: "llm_unavailable_no_silent_regex",
        llmMode: state.llm_orchestration_decision?.mode ?? null,
        silentRegexRoutePrevented: true
      })
    };
  }
  // NEW branch (plan §3.4.2): the planner RAN (live or replayed recorded decision)
  // but its decision is invalid (workflow_not_allowed, allowed_workflows_unavailable,
  // risk_tier_below_floor, PAS-delegation gate, registry gate...). Never silently
  // re-route — escalate loud.
  if (["openai_chatopenai_invoked", "replayed_live_decision"].includes(llmDecisionMode) && state.llm_orchestration_decision?.valid === false) {
    const store = activeStores.get(state.session_id);
    if (store) {
      await audit(store, state.session_id, "llm_invalid_decision_no_silent_fallback", {
        trace_id: state.graph_trace_id,
        mode: llmDecisionMode,
        issues: state.llm_orchestration_decision?.issues ?? []
      }).catch(() => {});
    }
    return {
      workflow: "human_approval_escalation",
      workflow_route: null,
      route_reason: "llm_invalid_decision_no_silent_fallback",
      workflow_outcome: "llm_invalid_decision",
      final_response:
        "I can't act on the plan I produced for this request because it failed the safety contract checks. I won't guess — please rephrase, try again in a moment, or I can connect you with a human.",
      llm_orchestration_decision: { ...state.llm_orchestration_decision, usedByRouter: false },
      should_remember: false,
      proof: appendProof(state, "workflow_router", {
        route: "human_approval_escalation",
        reason: "llm_invalid_decision_no_silent_fallback",
        issues: state.llm_orchestration_decision?.issues ?? [],
        silentFallbackPrevented: true
      })
    };
  }
  const lowConfidenceLlmDecision =
    state.llm_orchestration_decision?.valid &&
    state.llm_orchestration_decision?.classification?.workflow &&
    confidenceBand(state.llm_orchestration_decision) === "low";
  // The legacy classifier/positional fallback chain is DELETED (plan §3.4/§10.7):
  // the DB-validated decision workflow is the only selection source.
  const selectedWorkflow = state.llm_orchestration_decision?.classification?.workflow ?? null;
  const route =
    state.context_packet?.workflowArchitecture?.readiness?.find((item) => item.workflowKey === selectedWorkflow) ??
    state.context_packet?.workflowArchitecture?.routeCandidates?.find((item) => item.workflowKey === selectedWorkflow) ??
    null;
  const clarifyQuestion =
    state.llm_orchestration_decision?.response?.userFacingNextQuestion || "";
  return {
    workflow: route?.workflowKey ?? selectedWorkflow ?? "human_approval_escalation",
    workflow_route: route,
    route_reason: llmDecisionUsed ? "llm_orchestration_decision" : "low_confidence_clarify",
    // Founder rule (docs/FOUNDER_IMPLEMENTATION_PROMPT_TEMPLATES.md:102): on low
    // confidence, ASK — never default to a guessed workflow.
    ...(llmDecisionUsed
      ? {}
      : {
          final_response:
            clarifyQuestion ||
            "I want to make sure I route this correctly — could you tell me a bit more about what you need (for example the payer, the document, or the claim involved)?",
          workflow_outcome: "low_confidence_clarify"
        }),
    llm_orchestration_decision: state.llm_orchestration_decision
      ? {
          ...state.llm_orchestration_decision,
          usedByRouter: llmDecisionUsed
        }
      : null,
    proof: appendProof(state, "workflow_router", {
      route: route?.workflowKey ?? selectedWorkflow ?? "human_approval_escalation",
      llmWorkflow: state.llm_orchestration_decision?.classification?.workflow ?? null,
      llmDecisionUsed,
      lowConfidenceClarify: Boolean(lowConfidenceLlmDecision),
      llmConfidenceBand: state.llm_orchestration_decision ? confidenceBand(state.llm_orchestration_decision) : null,
      llmConfidence: state.llm_orchestration_decision?.classification?.confidence ?? null,
      riskTier: state.llm_orchestration_decision?.risk_tier ?? null,
      dataLayer: state.llm_orchestration_decision?.data_layer ?? null,
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

// Node NAME kept (protects seeded graph_subpath rows, plan §10.5); body rewritten:
// the journey plan materializes from decision.workflow_graph — steps validated
// row-by-row against DB-authored process_steps via validateWorkflowGraph (§3.3).
async function planJourneyNode(state) {
  const decision = state.llm_orchestration_decision ?? {};
  const workflowGraph = decision.workflow_graph ?? {};
  let workflowGraphValidation = { valid: false, rejectedSteps: [], reason: "no_process_bound" };
  const store = activeStores.get(state.session_id);

  // Phase 88 (§4.3): consent_grant interrupt. When the DECISION requires
  // layer_3_portal_control and the consent snapshot denies it, the graph pauses with
  // kind=consent_grant; the SAME Command.resume path re-runs this node, where token
  // CONSUMPTION is what authorizes flipping the authoritative user_consents flag
  // (mirror evicted synchronously — Phase 86 §6.1 rule).
  const requiresPortalConsent = (decision.data_layer ?? []).includes("layer_3_portal_control");
  const portalConsentAllowed = state.consent_state?.layers?.layer_3_portal_control?.allowed === true;
  // The RESUME path re-enters this node from approval_pause WITHOUT re-running
  // llm_decision — the pending gate on the channel (not the decision) is the record
  // of why the graph paused, so the consume path keys on it.
  const resumeToken = state.raw_message?.consentGrantToken ?? state.raw_message?.approvalToken ?? null;
  const pendingGateToken = state.consent_gate?.status === "pending" ? state.consent_gate?.approvalToken ?? null : null;
  const consentConsumePending = Boolean(store && resumeToken && pendingGateToken && resumeToken === pendingGateToken);
  if (consentConsumePending || (store && requiresPortalConsent && !portalConsentAllowed && !state.policy_result?.urgentEscalationRequired)) {
    if (consentConsumePending) {
      const { consumeConsentGrantGate } = await import("./approvalResume.mjs");
      const consumed = await consumeConsentGrantGate(store, {
        approvalToken: resumeToken,
        sessionId: state.session_id,
        userId: state.user_id,
        consentField: "read_only_extraction_approved"
      });
      if (consumed.ok) {
        // Consumption authorizes the AUTHORITATIVE consent write + synchronous mirror eviction.
        await store.all("UPDATE user_consents SET read_only_extraction_approved = 1, updated_at = ? WHERE user_id = ?;", [nowIso(), state.user_id]);
        const { evictConsentState } = await import("./consentStateRuntime.mjs");
        await evictConsentState([state.session_id]);
        const { loadConsentState: loadConsentSnapshot } = await import("./credentialVault.mjs");
        const refreshedConsent = await loadConsentSnapshot(store, { userId: state.user_id });
        state = {
          ...state,
          consent_state: refreshedConsent,
          approval_interrupt_kind: null,
          consent_gate: { ...state.consent_gate, status: "consumed", consumedGateId: consumed.approvalGateId }
        };
      } else {
        // Rejected consume (binding mismatch / double-consume / expired) is LOUD and
        // audited inside the gate; the journey stays consent-blocked.
        return {
          approval_interrupt_kind: null,
          consent_gate: { ...(state.consent_gate ?? {}), status: consumed.status, blocked: true },
          journey_plan: {
            version: "2026-07-03.phase88-consent-blocked-journey.v1",
            workflow: state.workflow,
            outcome: "consent_grant_rejected",
            reason: consumed.reason ?? consumed.status
          },
          proof: appendProof(state, "plan_journey", { consentGrant: consumed.status, blocked: true })
        };
      }
    } else {
      const { createConsentGrantGate } = await import("./approvalResume.mjs");
      const gate = await createConsentGrantGate(store, {
        sessionId: state.session_id,
        userId: state.user_id,
        workflow: state.workflow,
        consentField: "read_only_extraction_approved",
        dataLayer: "layer_3_portal_control"
      });
      return {
        approval_interrupt_kind: "consent_grant",
        consent_gate: {
          approvalToken: gate.approvalToken,
          approvalGateId: gate.approvalGate?.id ?? null,
          consentField: "read_only_extraction_approved",
          status: "pending",
          userVisibleReviewText: gate.approval?.user_visible_review_text ?? null,
          expiresAt: gate.approval?.expiresAt ?? null
        },
        journey_plan: {
          version: "2026-07-03.phase88-consent-pending-journey.v1",
          workflow: state.workflow,
          outcome: "consent_grant_required",
          reason: "The selected route requires layer_3_portal_control and the user has not granted read-only extraction consent."
        },
        proof: appendProof(state, "plan_journey", { consentGrant: "gate_created", gateId: gate.approvalGate?.id ?? null })
      };
    }
  }
  if (store && workflowGraph.processId) {
    try {
      const { validateWorkflowGraph } = await import("./capabilityCatalog.mjs");
      workflowGraphValidation = await validateWorkflowGraph(store, {
        processId: workflowGraph.processId,
        steps: workflowGraph.steps ?? []
      });
    } catch (error) {
      workflowGraphValidation = { valid: false, rejectedSteps: [], reason: error.message };
    }
  }
  const neededEvidence = [
    ...(decision.demand_and_evidence?.missingEvidence ?? decision.missingEvidence ?? []),
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
    version: "2026-07-02.phase84-decision-first-journey-plan.v2",
    workflow: state.workflow,
    routeReason: state.route_reason,
    processId: workflowGraph.processId ?? null,
    workflowGraph: { ...workflowGraph, validation: workflowGraphValidation },
    riskTier: decision.risk_tier ?? null,
    dataLayer: decision.data_layer ?? [],
    // Consumer-facing plan step keys preserved (plan §10.5).
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
    }
  };
  return {
    journey_plan: journeyPlan,
    approval_interrupt_kind: null,
    consent_state: state.consent_state,
    consent_gate: state.consent_gate,
    proof: appendProof(state, "plan_journey", {
      workflow: journeyPlan.workflow,
      processId: journeyPlan.processId,
      workflowGraphValid: workflowGraphValidation.valid,
      rejectedStepCount: workflowGraphValidation.rejectedSteps?.length ?? 0,
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
  // Read-back changes behavior: the capabilities the planner selected (hydrated
  // from the authoritative catalog) are surfaced into the dispatch so the worker job
  // carries the planner's chosen skills/tools/workflows, not deterministic defaults.
  const plannerHydratedCapabilities = (state.hydrated_capabilities?.resolved ?? []).map((entry) => ({
    portfolioId: entry.portfolioId,
    kind: entry.kind,
    title: entry.title,
    skillKey: entry.hydrate?.key ?? entry.hydrate?.skillKey ?? null,
    toolKey: entry.hydrate?.key ?? entry.hydrate?.toolKey ?? null,
    workflowKey: entry.hydrate?.workflowKey ?? null
  }));
  // Contract v4 (Phase 87 §7): the plan is BUILT FROM the hydrated pointers; every
  // tool key is asserted registered in the executor map (unregistered -> blocked).
  const workerPlan = buildLangGraphOpenClawWorkerPlan(envelope, validation, {
    hydratedCapabilities: plannerHydratedCapabilities
  });
  const plannerSelectedSkillKeys = plannerHydratedCapabilities
    .filter((entry) => entry.kind === "skill" && entry.skillKey)
    .map((entry) => entry.skillKey);
  // Stateful OpenClaw: hydrate prior worker runtime state from Redis so this
  // dispatch resumes with what earlier dispatches observed (cross-turn/process),
  // keyed to the LangGraph thread. Traced as worker.state.read.
  const threadId = state.context_packet?.currentSession?.langgraph_thread_id ?? sessionFromState(state)?.langgraph_thread_id ?? null;
  const priorWorkerState = await withCheckpoint(
    "worker.state.read",
    { kind: "cache.read", metadata: { trace_id: state.graph_trace_id, session_id: state.session_id } },
    async () => readWorkerRuntimeState(state.session_id)
  );
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
    workerJobIds: workerPlan.workerJobs.map((job) => job.jobId),
    plannerHydratedCapabilities,
    plannerSelectedSkillKeys,
    plannerCapabilitySource: state.hydrated_capabilities
      ? { cacheBackend: state.hydrated_capabilities.cacheBackend, cacheHit: state.hydrated_capabilities.cacheHit, resolvedCount: state.hydrated_capabilities.resolvedCount }
      : null,
    // Stateful worker: what this dispatch resumed from (prior runtime state).
    resumedFromWorkerState: priorWorkerState.cacheHit
      ? { dispatchCount: priorWorkerState.prior?.dispatchCount ?? 0, lastWorkflow: priorWorkerState.prior?.latestDispatch?.workflow ?? null }
      : null
  };
  // Persist this dispatch into the worker runtime state (Redis) so the next
  // dispatch/turn/process resumes from it — making OpenClaw stateful like LangGraph.
  const browserReadiness = classifyBrowserRemoteReadiness();
  const workerStateRecord = await recordWorkerDispatchState({
    sessionId: state.session_id,
    threadId,
    dispatch: {
      dispatchedAt: nowIso(),
      workflow: state.workflow,
      skillKey: validation.skillKey,
      executionMode: validation.executionMode,
      plannerSelectedSkillKeys,
      hydratedCapabilityCount: plannerHydratedCapabilities.length,
      workerPlanId: workerPlan.planId,
      // Phase 86 (§6.2): decision layer fields + the oauth-session handle POINTER
      // (never the raw credential — pointer/hash discipline of the oauth mirror).
      dataLayer: state.llm_orchestration_decision?.data_layer?.length ? state.llm_orchestration_decision.data_layer : null,
      riskTier: state.llm_orchestration_decision?.risk_tier ?? null,
      oauthHandlePointer: state.context_packet?.runtimeContext?.layerRouting?.oauthHandles?.[0]?.vaultPointer ?? null,
      // Stateful worker carries the (honestly-classified) remote browser tier + the
      // reusable session endpoint so later dispatches can reuse the live session.
      browserReadinessTier: browserReadiness.tier,
      browserProductionReady: browserReadiness.productionReady,
      browserCdpUrl: browserReadiness.cdpUrl
    }
  });
  toolCall.workerStatePersisted = { cacheBackend: workerStateRecord.cacheBackend, stored: workerStateRecord.stored, dispatchCount: workerStateRecord.state.dispatchCount };
  toolCall.remoteBrowserReadiness = { tier: browserReadiness.tier, productionReady: browserReadiness.productionReady };
  return {
    worker_runtime_state: workerStateRecord.state,
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
  // Phase 87 (§7): a consumed document approval gate is SUFFICIENT on its own — the
  // deleted client flag can no longer strand an approved document observation.

  let workerContinuationValidation = null;
  if (state.raw_message?.workerContinuationId) {
    const taskId = approvalTaskId;
    // Phase 87 (§7): a bound ACTIVE worker continuation is SUFFICIENT on its own — a
    // "continue" turn or approval token must never be silently stranded by the
    // deleted client flag. Validation below is the real gate.
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

  // Phase 87 (§7 dispatch trigger replacement — complete): dispatch fires when ANY of
  // (1) the PLANNER selected a resolved openclaw capability (decision-first path),
  // (2) a bound ACTIVE worker continuation validated above (resume path), or
  // (3) a consumed read-only/document approval gate authorizes the observation.
  // The client flag is DELETED; same node, same state keys, same idempotency.
  const openclawDispatchTrigger =
    plannerSelectedOpenclawCapability(state) ||
    (state.raw_message?.workerContinuationId && workerContinuationValidation?.ok) ||
    documentObservationRequested;
  if (openclawDispatchTrigger) {
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
  // Phase 88 (§4.3): the ONE interrupt mechanism gains a kind DISCRIMINATOR. The
  // existing read-only payload type string stays BYTE-COMPATIBLE; consent/auth kinds
  // are new payloads on the same mechanism. Kind precedence: an explicit upstream
  // kind (consent_grant/auth_handoff from plan_journey) > document candidate > default.
  const kind =
    state.approval_interrupt_kind ??
    (evidence.candidateId ? "document_candidate_approval" : "read_only_observation_approval");
  const { interruptRecordFields } = await import("./approvalResume.mjs");
  const payload = {
    type: kind === "read_only_observation_approval" ? "read_only_observation_approval" : kind,
    kind,
    version: "2026-06-21.phase55-native-langgraph-interrupt.v1",
    sessionId: state.session_id,
    userId: state.user_id,
    workflow: state.workflow,
    taskId: evidence.taskId ?? state.raw_message?.approvalTaskId ?? state.raw_message?.taskId ?? null,
    approvalScope: kind === "consent_grant" ? "consent_grant" : kind === "auth_handoff" ? "auth_handoff" : evidence.approvalScope ?? "read_only_observation",
    allowedAction: kind === "consent_grant" ? `grant_consent:${state.consent_gate?.consentField ?? "read_only_extraction_approved"}` : evidence.allowedAction ?? "read_only_observation",
    candidateId: evidence.candidateId ?? null,
    candidateUrl: evidence.candidateUrl ?? null,
    consentGate: kind === "consent_grant"
      ? { approvalGateId: state.consent_gate?.approvalGateId ?? null, consentField: state.consent_gate?.consentField ?? null, expiresAt: state.consent_gate?.expiresAt ?? null }
      : null,
    // §4.3 versioned interrupt fields — ADDITIVE, never replacing the bindings above.
    ...interruptRecordFields({
      workflowId: state.workflow,
      userId: state.user_id,
      actionType: kind,
      riskTierDerived: state.policy_result?.riskTier ?? null,
      targetSiteOrApi: evidence.candidateUrl ?? state.raw_message?.portalUrl ?? null,
      userVisibleReviewText:
        kind === "consent_grant"
          ? state.consent_gate?.userVisibleReviewText ?? "Grant consent so the requested portal step can run."
          : evidence.reason ?? "Read-only worker observation requires explicit human approval.",
      approvalStatus: "pending",
      expiresAt: state.consent_gate?.expiresAt ?? null
    }),
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
      approvalToken,
      ...(kind === "consent_grant" ? { consentGrantToken: approvalToken } : {})
    },
    approval_interrupt: {
      status: "resumed",
      kind,
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
  // Phase 89 (§9 MRF row): cited negotiated-rate evidence carries the MANDATORY
  // non-guarantee disclaimer; directory evidence names its directory-source citation.
  const hasMrfEvidence = sourcePointers.some((pointer) => pointer.table === "mrf_price_observations");
  const hasDirectoryEvidence = sourcePointers.some((pointer) => pointer.table === "provider_directory_entries");
  return [
    `LangGraph routed this request to ${state.workflow} and answered from operator-reviewed research evidence.`,
    `Routing evidence: ${routeSummary}`,
    resultLines.length ? `Reviewed evidence used:\n${resultLines.join("\n")}` : "Reviewed evidence used: none.",
    pointerLine,
    hasMrfEvidence
      ? "Price disclaimer: these are published Transparency-in-Coverage negotiated rates for the cited source file and month — an ESTIMATE for comparison, not a guarantee of your final cost; your plan's deductible, coinsurance, and accumulators determine what you actually owe."
      : null,
    hasDirectoryEvidence
      ? "Directory note: results come from the payer's published provider directory (source URL cited per row, synced within the CMS freshness window); confirm network status with the office before booking."
      : null,
    "This answer is limited to reviewed, citation-approved research artifacts. It does not use pending review artifacts, MockWorker output, raw document dumps, payer contact, form submission, credential entry, medical advice, or account changes."
  ].filter(Boolean).join("\n\n");
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

// Type-II: compose an honest PROCESS OFFER from the catalog. Returns the full node-return
// object, or null if the composer can't offer (disabled, no live model, no decision, or
// the offer was invalid). Reused both when there is no evidence AND when evidence exists
// but couldn't ground an answer to the user's question.
async function attemptCapabilityProcessOffer(state) {
  if (process.env.BRAINSTY_TYPE_II_COMPOSER === "0") return null;
  if (state.raw_message?.useLiveModel === false) return null;
  if (!state.llm_orchestration_decision) return null;
  const store = activeStores.get(state.session_id);
  const offer = await withCheckpoint(
    "final.response",
    { kind: "final.response", metadata: { trace_id: state.graph_trace_id, session_id: state.session_id, mode: "type_ii_process_offer" } },
    async () => composeProcessOfferResponse({ store, state, sessionId: state.session_id })
  );
  if (!offer.valid) return null;
  const offeredProcesses = [];
  try {
    const { hydrateProcess } = await import("./capabilityCatalog.mjs");
    for (const pid of offer.offeredProcessIds ?? []) {
      const h = await hydrateProcess(store, pid);
      if (h.ok) offeredProcesses.push({ processId: pid, title: h.process.title, approvalScope: h.approvalScope, requiredUserInputs: h.requiredUserInputs, workerSkillKey: h.workerSkillKey });
    }
  } catch {
    /* offer still returned even if metadata enrichment fails */
  }
  return {
    final_response: offer.finalResponse,
    workflow_outcome: "capability_reasoned_offer",
    memory_type: "capability_offer_event",
    should_remember: false,
    capability_offer: { offeredProcessIds: offer.offeredProcessIds ?? [], recommendedProcessId: state.llm_orchestration_decision?.selected_tools?.recommendedProcessId ?? null, processes: offeredProcesses },
    proof: appendProof(state, "response_policy", {
      typeIIComposer: true,
      mode: offer.mode,
      offeredProcessCount: offer.offeredProcessIds?.length ?? 0,
      offeredProcessIds: offer.offeredProcessIds ?? []
    })
  };
}

// Does the planner explicitly want to offer a process (vs answer from evidence)?
export function plannerWantsProcessOffer(decision) {
  if (!decision) return false;
  return (
    decision.response?.responseStrategy === "offer_process_and_ask" ||
    decision.response?.responseStrategy === "honest_capability_decline" ||
    decision.response?.capabilityAssessment?.canAnswerNow === false ||
    (decision.selected_tools?.offeredProcessIds?.length ?? 0) > 0 ||
    Boolean(decision.selected_tools?.recommendedProcessId)
  );
}

async function composeResponseNode(state) {
  if (state.final_response) {
    return {
      proof: appendProof(state, "response_policy", { reusedPolicyResponse: true })
    };
  }
  // Trace source-pointer validation: whether cited evidence exists to ground the answer.
  const sourcePointers = state.source_pointers ?? [];
  await withCheckpoint(
    "source_pointer.validation",
    {
      kind: "source_pointer.validation",
      metadata: {
        trace_id: state.graph_trace_id,
        session_id: state.session_id,
        source_pointer_count: sourcePointers.length,
        has_trusted_evidence: sourcePointers.length > 0,
        evidence_status: state.evidence_observation?.status ?? null
      }
    },
    async () => ({ sourcePointerCount: sourcePointers.length, hasTrustedEvidence: sourcePointers.length > 0 })
  );
  const user = userFromContext(state.context_packet);
  const portal = portalFromContext(state.context_packet);
  const routeSummary = summarizeRoute(state.workflow_route);
  const uploadedEvidenceCaptured = ["captured_uploaded_document_extraction", "blocked_uploaded_document_extraction"].includes(
    state.evidence_observation?.status
  );
  // Type-II (gated): reason as a PROCESS and OFFER the relevant catalog process instead
  // of a flat template/degrade. Fires when there is NO stored evidence OR when the
  // planner explicitly wants to offer (canAnswerNow=false / offer_process_and_ask /
  // offeredProcessIds) — so tangential prior evidence (source_pointers>0) no longer
  // gates the offer out. Sourced answers with real grounded claims are unaffected.
  if (!uploadedEvidenceCaptured && (sourcePointers.length === 0 || plannerWantsProcessOffer(state.llm_orchestration_decision))) {
    const offered = await attemptCapabilityProcessOffer(state);
    if (offered) return offered;
  }
  if (state.evidence_observation?.status === "blocked_no_authenticated_evidence") {
    // Couldn't get authenticated evidence -> offer the read-only portal process instead
    // of a "consult your documents" degrade (degrade remains the fallback).
    const offered = await attemptCapabilityProcessOffer(state);
    if (offered) return offered;
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
    if ((composed.answerClaims?.length ?? 0) === 0) {
      const offered = await attemptCapabilityProcessOffer(state);
      if (offered) return offered;
    }
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
    // Evidence existed but couldn't ground an answer to THIS question (no claims) -> offer
    // the read-only portal process instead of a "consult your documents" degrade.
    if ((composed.answerClaims?.length ?? 0) === 0) {
      const offered = await attemptCapabilityProcessOffer(state);
      if (offered) return offered;
    }
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
    // No trusted research evidence to answer from -> offer the portal process instead of
    // a deterministic degrade (degrade remains the fallback).
    const offered = await attemptCapabilityProcessOffer(state);
    if (offered) return offered;
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
        taskClass: state.llm_orchestration_decision?.classification?.taskClass ?? null,
        dataLayer: state.llm_orchestration_decision?.data_layer ?? [],
        riskTier: state.llm_orchestration_decision?.risk_tier ?? null,
        llmDecision: state.llm_orchestration_decision
          ? {
              mode: state.llm_orchestration_decision.mode,
              valid: state.llm_orchestration_decision.valid,
              usedByRouter: state.llm_orchestration_decision.usedByRouter,
              workflow: state.llm_orchestration_decision.classification?.workflow ?? null,
              confidence: state.llm_orchestration_decision.classification?.confidence ?? 0,
              rationale: state.llm_orchestration_decision.classification?.rationale ?? null,
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
    .addEdge("recall_context", "llm_decision")
    .addEdge("llm_decision", "workflow_router")
    .addConditionalEdges("workflow_router", routeAfterWorkflowRouter, {
      compose_response: "compose_response",
      plan_journey: "plan_journey"
    })
    .addConditionalEdges("plan_journey", routeAfterPlanJourney, {
      approval_pause: "approval_pause",
      skill_resolver: "skill_resolver"
    })
    .addEdge("skill_resolver", "workflow_executor")
    .addEdge("workflow_executor", "observe_evidence")
    .addConditionalEdges("observe_evidence", routeAfterEvidenceObservation, {
      approval_pause: "approval_pause",
      case_state_shadow: "case_state_shadow"
    })
    .addConditionalEdges("approval_pause", routeAfterApprovalPause, {
      plan_journey: "plan_journey",
      observe_evidence: "observe_evidence"
    })
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

// Phase 88 (§4.3): consent/auth interrupts pause BEFORE execution planning completes;
// their return edge re-runs plan_journey (the token consume happens there).
export function routeAfterPlanJourney(state) {
  if (["consent_grant", "auth_handoff"].includes(state.approval_interrupt_kind)) return "approval_pause";
  return "skill_resolver";
}

export function routeAfterApprovalPause(state) {
  if (["consent_grant", "auth_handoff"].includes(state.approval_interrupt?.kind ?? state.approval_interrupt_kind)) return "plan_journey";
  return "observe_evidence";
}

export function routeAfterEvidenceObservation(state) {
  if (state.evidence_observation?.nativeLangGraphInterrupt && !state.approval_resume?.ok) return "approval_pause";
  return "case_state_shadow";
}

// Canonical registry of graph node names (matches the .addNode() calls in
// createBrainstyLangGraph). Capability/process graph_subpath_json is validated
// against this at seed time so subpaths cannot reference non-existent nodes.
export const BRAINSTY_GRAPH_NODE_NAMES = Object.freeze([
  "input_policy",
  "recall_context",
  "llm_decision",
  "workflow_router",
  "plan_journey",
  "skill_resolver",
  "workflow_executor",
  "observe_evidence",
  "approval_pause",
  "case_state_shadow",
  "compose_response"
]);

export function describeBrainstyLangGraphTopology() {
  return {
    version: LANGGRAPH_RUNNER_VERSION,
    nodes: BRAINSTY_GRAPH_NODE_NAMES,
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
    conditionalEdgesPhase88: [
      { from: "plan_journey", cases: ["approval_pause", "skill_resolver"], proves: ["consent_or_auth_interrupt", "journey_execution"] },
      { from: "approval_pause", cases: ["plan_journey", "observe_evidence"], proves: ["kind_aware_return_edge"] }
    ],
    linearEdges: [
      ["recall_context", "llm_decision"],
      ["llm_decision", "workflow_router"],
      ["skill_resolver", "workflow_executor"],
      ["workflow_executor", "observe_evidence"],
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

// Phase 91 (§4.3 deploy acceptance, founder #17): a pending interrupt written by a
// PREVIOUS deploy may encode a different interrupt/planner/checkpointer schema. Resuming
// it would replay an approval whose meaning has changed — an ambiguous post-deploy
// action. Durable savers stamp their runtime versions; on a mismatch we EXPIRE the stale
// thread and let the run re-raise the interrupt, so the user is asked again with the
// current contract. Non-durable savers carry no stamp and are never resumed across a
// restart anyway, so they report compatible and behave exactly as before.
async function resolveResumeCompatibility(store, { threadId, sessionId }) {
  if (typeof checkpointer.runtimeVersionsForThread !== "function") {
    return { compatible: true, action: "resume", reason: "checkpointer_not_version_stamped" };
  }
  const stored = await checkpointer.runtimeVersionsForThread(threadId);
  if (stored === null) return { compatible: true, action: "resume", reason: "no_stored_checkpoint" };
  const verdict = resumeCompatibility(stored);
  if (!verdict.compatible) {
    await checkpointer.deleteThread(threadId);
    await audit(store, sessionId, "graph_interrupt.expired_schema_change", {
      threadId,
      reason: verdict.reason,
      mismatched: verdict.mismatched ?? [],
      storedRuntimeVersions: stored,
      currentRuntimeVersions: CHECKPOINT_RUNTIME_VERSIONS,
      userFacingEffect: "the pending approval was re-asked under the current contract; nothing was executed"
    });
  }
  return verdict;
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
    await insertConversationMessage(store, { sessionId: session.id, role: "user", content: userInput });
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
    owner: "langgraph",
    workerAccess: "read_only_context_projection",
    retainAuthority: "langgraph_post_graph_only",
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
    consent_state: null,
    auth_state: null,
    errors: [],
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
      // Phase 87 (§7): seeded from GENUINE resume artifacts only; the planner-driven
      // trigger is re-derived post-decision (plannerSelectedOpenclawCapability).
      openclaw_enabled: Boolean(rawMessage.workerContinuationId),
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
      planner_version: "llm_orchestration_decision.v2",
      router_version: "llm_primary_no_silent_fallback",
      profile_name: "brainstyworkers",
      langchain_runtime: "@langchain/langgraph",
      // Phase 87 (§7): seeded from GENUINE resume artifacts only; the planner-driven
      // trigger is re-derived post-decision (plannerSelectedOpenclawCapability).
      openclaw_enabled: Boolean(rawMessage.workerContinuationId),
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
    const pendingInterrupt = Boolean(rawMessage?.approvalToken) && hasPendingApprovalInterrupt(checkpointState);
    const resumeVerdict = pendingInterrupt
      ? await resolveResumeCompatibility(store, {
          threadId: session.langgraph_thread_id,
          sessionId: session.id
        })
      : { compatible: true, action: "resume", reason: "no_pending_interrupt" };
    const graphInput =
      pendingInterrupt && resumeVerdict.compatible
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
        // Phase 86 (§6.2): decision layer fields flow into the checkpoint statePatch so
        // compactManagedCheckpoints/priorDecisionPointers hydrate them next turn
        // (empty data_layer normalizes to null — an empty array is not a routed layer).
        dataLayer: state.llm_orchestration_decision?.data_layer?.length ? state.llm_orchestration_decision.data_layer : null,
        riskTier: state.llm_orchestration_decision?.risk_tier ?? null,
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
  // Checkpoint run ledger: default-ON (process-driven; binds the workflow's process + writes real
  // per-step rows). Honors BRAINSTY_PROCESS_RUNTIME=off kill-switch and the legacy shadow mode.
  // Write-only here (never affects this turn's control flow); always wrapped so it cannot break it.
  if (processRuntimeEnabled() || runLedgerMode() === "shadow") {
    try {
      await writeShadowCheckpointLedger(store, {
        user,
        session,
        state,
        graphTraceId,
        sessionCheckpointId: checkpointResult.checkpointId
      });
    } catch {
      /* checkpoint ledger is write-only and must never break the orchestration */
    }
  }
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
    await insertConversationMessage(store, { sessionId: session.id, role: "assistant", content: state.final_response });
    // Append the assistant turn to the canonical LangGraph messages channel so the next turn's
    // planner sees it from state (not a DB re-read). Single robust append site; concat reducer.
    // SKIP when the run paused at a native approval interrupt: updateState would write a new
    // checkpoint on top of the pending interrupt and clear it (breaking resume).
    const pausedAtInterrupt = state.approval_interrupt?.status === "interrupted"
      || state.workflow_outcome === "approval_pending_interrupt";
    if (!pausedAtInterrupt) {
      try {
        await graph.updateState(config, { messages: [{ role: "assistant", content: String(state.final_response), at: nowIso() }] });
      } catch (channelError) {
        audit(store, session.id, "messages_channel_append_failed", { graphTraceId, error: String(channelError?.message ?? channelError) });
      }
    }
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
