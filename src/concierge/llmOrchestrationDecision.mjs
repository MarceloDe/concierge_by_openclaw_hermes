import { maskDirectIdentifiers } from "./modelPayloadPolicy.mjs";
import { computeRiskTierFloor, riskTierAtLeast, RISK_TIERS } from "./policy.mjs";

// DECISION_CONTRACT_V2 (three-layer planner pivot, plan §3.3). ONE normalizer lifts
// v1 flat decisions losslessly; grouped v2 output carries flat v1 aliases for exactly
// one release (alias removal is a named Phase 85 task).
export const LLM_ORCHESTRATION_DECISION_VERSION = "2026-07-02.llm-orchestration-decision.v2";

// --- Draft-adopted enums (docs/THREE_LAYER_PLANNER_PROMPT_DRAFT.md, verbatim) ---
export const TASK_CLASSES = Object.freeze([
  "generic_public",
  "plan_specific_public",
  "member_specific_read",
  "transactional_action",
  "prior_auth_support",
  "provider_search",
  "claims_support",
  "medication_support",
  "cost_estimation",
  "appeal_or_denial_support",
  "scheduling_support",
  "mixed"
]);

export const DATA_LAYERS = Object.freeze([
  "layer_1_public",
  "layer_2_member_authorized_api",
  "layer_3_portal_control"
]);

export const AUTH_TYPES = Object.freeze([
  "none",
  "payer_oauth_smart_fhir",
  "employer_portal",
  "provider_portal",
  "pbm_portal",
  "unknown"
]);

export const PROVIDER_DELEGATION_STATUSES = Object.freeze(["not_required", "required_unverified", "verified"]);

export const SOURCE_PREFERENCES = Object.freeze(["public", "member_api", "portal", "user_input", "internal_db"]);

export const DATA_ACCESS_LEVELS = Object.freeze(["public", "member_phi", "portal_session", "internal"]);

// Runtime interrupt kinds (plan §4.3): resolvable targets for fallback plans.
export const INTERRUPT_KINDS = Object.freeze([
  "openclaw_read_only_observation",
  "document_candidate_approval",
  "single_write_action_approval",
  "consent_grant",
  "auth_handoff"
]);

// The four execution-policy runtime invariants (plan §3.3): force-normalized, the
// model may not vote on credential storage, PHI redaction, audit, or the write interrupt.
export const EXECUTION_POLICY_INVARIANTS = Object.freeze({
  requireHumanInterruptBeforeWrite: true,
  storeRawCredentials: false,
  redactPhiInLogs: true,
  auditEveryToolCall: true
});

const EXECUTION_POLICY_PREFERENCE_DEFAULTS = Object.freeze({
  preferPublicBeforeMemberData: true,
  preferApiBeforePortalControl: true,
  allowOpenclawPublicScraping: true,
  allowOpenclawLoggedPortalControl: false,
  allowWriteActions: false
});

// answer_contract defaults (draft's lists; the must-not items are ALSO enforced by the
// deterministic composer guards regardless of what the LLM emits here — plan §3.3).
export const ANSWER_CONTRACT_DEFAULTS = Object.freeze({
  finalAnswerShouldInclude: Object.freeze([
    "direct answer",
    "data sources used",
    "confidence level",
    "important caveats",
    "next best action",
    "whether data was public, member-authorized, or portal-derived"
  ]),
  finalAnswerMustNotInclude: Object.freeze([
    "raw chain-of-thought",
    "unnecessary PHI",
    "unsupported coverage guarantees",
    "legal or medical certainty beyond evidence",
    "claims that a provider is in-network without plan-specific verification"
  ])
});

// The grouped shape rendered into the Layer-1 system message and iterated by the
// normalizer — the contract lives ONCE, here (expectedJsonShape is deleted, plan §3.2).
export const DECISION_CONTRACT_V2_PROMPT_SHAPE = Object.freeze({
  classification: {
    workflow: "one of the keys in payload.allowedWorkflows — never any other value",
    taskClass: `exactly one of: ${TASK_CLASSES.join(" | ")}`,
    intent: "short snake_case intent",
    confidence: "number from 0 to 1",
    extractedDemand: "one sentence: what the user is actually asking for, in your words",
    targetOutcome: "the concrete final information or action the user wants (e.g. 'current out-of-pocket balance')",
    rationale: "short reason based on user message, memory, and available evidence"
  },
  data_layer: [`one or more of: ${DATA_LAYERS.join(" | ")}`],
  risk_tier: `one of: ${RISK_TIERS.join(" | ")} — you may RAISE above the runtime floor, never lower`,
  demand_and_evidence: {
    informationNeeds: ["specific data required to fulfill the demand, e.g. payer, member_id, claim_id, drug_name"],
    collectedUserData: "object of data the user has ALREADY provided across the conversation (empty object if none)",
    requiredEvidence: ["evidence names"],
    missingEvidence: ["missing evidence names"],
    userDataSufficiency: "one of: sufficient | insufficient | none",
    missingPlanDetails: ["specific user/plan details you still need, e.g. which_payer_portal, member_id"],
    priorLlmOutputPointersUsed: ["LLM output index pointers consulted, if any"],
    assumptions: ["explicit assumptions you made, if any"],
    requiredDataPoints: [
      { name: "data point", sourcePreference: `one of: ${SOURCE_PREFERENCES.join(" | ")}`, required: "boolean" }
    ]
  },
  auth_and_consent: {
    requiresMemberAuth: "boolean",
    authType: `one of: ${AUTH_TYPES.join(" | ")}`,
    requiresUserConsent: "boolean",
    requiresProviderDelegation: "boolean",
    providerDelegationStatus: `one of: ${PROVIDER_DELEGATION_STATUSES.join(" | ")}`,
    approvalRequired: "boolean: human approval required before any write",
    approvalScope: "read_only_observation or specific action scope",
    portalLoginRequired: "boolean: authenticated portal evidence is needed and the portal session is not logged in"
  },
  selected_tools: {
    capabilityPointers: ["cache pointers from capabilityPortfolio.promptTable"],
    toolPlan: [
      {
        capabilityPointer: "a pointer from capabilityPointers",
        purpose: "why this capability is selected",
        dataAccessLevel: `one of: ${DATA_ACCESS_LEVELS.join(" | ")}`,
        fallbackIfUnavailable: "another catalog capability, an interrupt kind, or honest_decline"
      }
    ],
    offeredProcessIds: ["process ids chosen from offerableProcesses to OFFER the user"],
    recommendedProcessId: "the single best process id from offerableProcesses, or empty",
    workerGoal: "specific OpenClaw task goal inside the selected workflow"
  },
  workflow_graph: {
    processId: "echo recommendedProcessId when you recommend a process, else null",
    steps: [{ boundary: "the step's checkpoint boundary from offerableProcesses[].steps", capabilityPointer: "the step's bound capability" }],
    resumeFromCheckpointId: "echo checkpointResumePlan.resumeCheckpointId when resuming, else null"
  },
  response: {
    responseStrategy: "one of: answer_from_evidence | offer_process_and_ask | honest_capability_decline | degraded_best_effort",
    clarificationNeeded: "boolean: do you need to ask the user something before proceeding?",
    userFacingNextQuestion: "REQUIRED non-empty question when clarificationNeeded is true; otherwise empty string",
    answerComposerMode: "one of: evidence_sourced | capability_meta | degraded",
    capabilityAssessment: { canAnswerNow: "boolean: can you answer from existing evidence now?", reason: "short reason", limitations: ["what you cannot do"] },
    answerContract: {
      finalAnswerShouldInclude: ["guidance for the final composer"],
      finalAnswerMustNotInclude: ["items the final answer must never contain"]
    }
  },
  execution_policy: {
    preferPublicBeforeMemberData: "boolean (default true)",
    preferApiBeforePortalControl: "boolean (default true)",
    allowOpenclawPublicScraping: "boolean (default true)",
    allowOpenclawLoggedPortalControl: "boolean — true ONLY when data_layer includes layer_3_portal_control",
    allowWriteActions: "boolean — true ONLY when risk_tier is high or critical; never enables writes by itself",
    requireHumanInterruptBeforeWrite: "always true (runtime invariant)",
    storeRawCredentials: "always false (runtime invariant)",
    redactPhiInLogs: "always true (runtime invariant)",
    auditEveryToolCall: "always true (runtime invariant)"
  },
  fallback_strategy: [
    { if: "failure condition", then: "a catalog capability, process id, interrupt kind, or honest_decline" }
  ]
});

export const DECISION_CONTRACT_V2 = Object.freeze({
  version: LLM_ORCHESTRATION_DECISION_VERSION,
  taskClasses: TASK_CLASSES,
  dataLayers: DATA_LAYERS,
  riskTiers: RISK_TIERS,
  authTypes: AUTH_TYPES,
  providerDelegationStatuses: PROVIDER_DELEGATION_STATUSES,
  sourcePreferences: SOURCE_PREFERENCES,
  dataAccessLevels: DATA_ACCESS_LEVELS,
  interruptKinds: INTERRUPT_KINDS,
  executionPolicyInvariants: EXECUTION_POLICY_INVARIANTS,
  shape: DECISION_CONTRACT_V2_PROMPT_SHAPE
});

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.map((item) => String(item)) : [String(value)];
}

function compact(value, limit = 1200) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function parseJsonLike(value) {
  if (value && typeof value === "object") return value;
  const text = String(value ?? "").trim();
  if (!text) throw new Error("empty LLM decision response");
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) return JSON.parse(fenced);
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(text.slice(first, last + 1));
    throw new Error("LLM decision response did not contain parseable JSON");
  }
}

function routeCandidatesFrom(state) {
  return (state.context_packet?.workflowArchitecture?.routeCandidates ?? []).map((route) => ({
    workflowKey: route.workflowKey,
    journeyStage: route.journeyStage,
    executableNow: route.executableNow,
    routeScore: route.routeScore,
    missingUserFields: route.missingUserFields ?? [],
    missingDataPointers: route.missingDataPointers ?? [],
    disabledTools: route.disabledTools ?? []
  }));
}

function sourcePointerHints(state) {
  return (state.context_packet?.dbPointers ?? []).slice(0, 20).map((pointer) => ({
    table: pointer.table,
    id: pointer.id,
    summary: pointer.summary ? compact(pointer.summary, 240) : null,
    sourceUrl: pointer.sourceUrl ?? null
  }));
}

function dynamicSkillHints(state) {
  const context = state.dynamic_skill_context ?? {};
  return {
    selected: context.selected ?? {},
    successEstimate: context.successEstimate ?? {},
    matches: (context.matches ?? []).slice(0, 8).map((item) => ({
      skillKey: item.skillKey,
      skillKind: item.skillKind,
      title: item.title,
      fitScore: item.fit?.score ?? 0,
      successChance: item.success?.chance ?? null,
      questionsToSolve: item.questionsToSolve ?? [],
      dataNeeded: item.dataNeeded ?? {},
      requiredWorkers: item.requiredWorkers ?? {},
      requiredSearch: item.requiredSearch ?? {},
      requiredApis: item.requiredApis ?? {}
    })),
    requiredOpenClawTasks: context.requiredOpenClawTasks ?? [],
    requiredSearch: context.requiredSearch ?? [],
    requiredApis: context.requiredApis ?? []
  };
}

function memorySkillTreeHints(state) {
  const tree = state.memory_skill_tree ?? {};
  return {
    version: tree.version ?? null,
    status: tree.status ?? null,
    workflow: tree.workflow ?? null,
    payer: tree.payer ?? null,
    dbAuthority: tree.dbAuthority ?? {},
    memoryUsePolicy: tree.memoryUsePolicy ?? {},
    selectedProcedureMemory: tree.selectedProcedureMemory
      ? {
          selectedSkillKey: tree.selectedProcedureMemory.selectedSkillKey ?? null,
          bestDynamicSkillScore: tree.selectedProcedureMemory.bestDynamicSkillScore ?? 0,
          nonStandardDemand: Boolean(tree.selectedProcedureMemory.nonStandardDemand),
          selectedSkillRefs: tree.selectedProcedureMemory.selectedSkillRefs ?? [],
          sourcePointerCount: tree.selectedProcedureMemory.sourcePointerRefs?.length ?? 0,
          productMemoryFactCount: tree.selectedProcedureMemory.productMemoryFactRefs?.length ?? 0
        }
      : null,
    ralphLoop: tree.skillTree?.loop
      ? {
          loopStyle: tree.skillTree.loop.loopStyle,
          stepIds: (tree.skillTree.loop.steps ?? []).map((step) => step.id),
          passDecision: tree.skillTree.loop.passDecision
        }
      : null,
    consolidationCandidate: tree.consolidationCandidate
      ? {
          status: tree.consolidationCandidate.status,
          readyForReviewer: Boolean(tree.consolidationCandidate.readyForReviewer),
          worktreeWriteAllowed: Boolean(tree.consolidationCandidate.worktreeWriteAllowed),
          productionDrivingAllowed: Boolean(tree.consolidationCandidate.productionDrivingAllowed)
        }
      : null,
    safety: tree.safety ?? {}
  };
}

export function buildLlmOrchestrationDecisionPayload(state) {
  const uploadedDocuments = Array.isArray(state.raw_message?.uploadedDocuments) ? state.raw_message.uploadedDocuments : [];
  return {
    contractVersion: LLM_ORCHESTRATION_DECISION_VERSION,
    purpose:
      "Choose the healthcare insurance workflow and worker strategy for LangGraph. Deterministic safety gates already ran first.",
    userInput: maskDirectIdentifiers(state.user_input, state),
    conversationHistory: (state.conversation_history ?? []).slice(-6),
    deterministicPolicy: {
      allowed: state.policy_result?.allowed ?? null,
      approvalRequired: state.policy_result?.approvalRequired ?? null,
      riskTierFloor: state.policy_result?.riskTier ?? null,
      failedChecks: (state.policy_result?.checks ?? []).filter((check) => !check.passed).map((check) => check.name)
    },
    // Prompt layer 2 (plan §3.1): the ONLY workflow keys the planner may select —
    // derived from the DB catalog (workflow_definitions ∩ active+production capabilities).
    allowedWorkflows: asArray(state.allowed_workflows),
    // Prompt layer 3 consent/auth projections (channels land with Phase 84; null-safe).
    consentState: state.consent_state ?? null,
    authState: state.auth_state ?? null,
    // Masked, PHI-cleared plan identities (member_plan_identities read path — plan
    // §5.1): a portal_verified identity satisfies plan-context information needs.
    planIdentities: (state.context_packet?.planIdentities ?? []).slice(0, 4),
    routeCandidates: routeCandidatesFrom(state),
    sourcePointers: sourcePointerHints(state),
    availableEvidence: {
      uploadedDocuments: uploadedDocuments.slice(0, 6).map((document) => ({
        uploadId: compact(document.uploadId, 120),
        filename: compact(document.filename, 180),
        contentType: compact(document.contentType, 80),
        extractionStatus: compact(document.extraction?.status, 80),
        extractionMethod: compact(document.extraction?.method, 80),
        fieldLabels: (document.extraction?.fields ?? []).slice(0, 20).map((field) => compact(field.label, 80)),
        sourceSpanCount: (document.extraction?.sourceSpans ?? []).length,
        blockerCount: (document.extraction?.blockers ?? []).length
      }))
    },
    dynamicSkills: dynamicSkillHints(state),
    memorySkillTree: memorySkillTreeHints(state),
    productMemory: {
      adapter: state.product_memory_recall?.adapter ?? "disabled",
      enabled: Boolean(state.product_memory_recall?.enabled),
      facts: (state.product_memory_recall?.facts ?? []).slice(0, 6).map((fact) => compact(fact.fact ?? fact.name ?? fact.uuid, 360))
    },
    runtimeContext: state.context_packet?.runtimeContext
      ? {
          cacheBackend: state.context_packet.runtimeContext.cacheBackend,
          cacheStatus: state.context_packet.runtimeContext.cacheStatus,
          cacheKey: state.context_packet.runtimeContext.cacheKey,
          manifestHash: state.context_packet.runtimeContext.manifestHash,
          previousManifestHash: state.context_packet.runtimeContext.previousManifestHash,
          latestCheckpoint: state.context_packet.runtimeContext.latestCheckpoint,
          achievedCheckpoints: (state.context_packet.runtimeContext.achievedCheckpoints ?? []).slice(0, 6),
          priorDecisionPointers: (state.context_packet.runtimeContext.priorDecisionPointers ?? []).slice(0, 4),
          promptCompaction: state.context_packet.runtimeContext.promptCompaction,
          capabilitySummary: (state.context_packet.runtimeContext.capabilitySummary ?? []).slice(0, 5)
      }
      : null,
    capabilityPortfolio: state.context_packet?.capabilityPortfolio
      ? {
          cacheBackend: state.context_packet.capabilityPortfolio.cacheBackend,
          cacheKey: state.context_packet.capabilityPortfolio.cacheKey,
          portfolioHash: state.context_packet.capabilityPortfolio.portfolioHash,
          entryCount: state.context_packet.capabilityPortfolio.entryCount,
          promptTable: (state.context_packet.capabilityPortfolio.promptTable ?? []).slice(0, 18)
      }
      : null,
    // DB-catalog processes the planner may OFFER (when/why metadata + id only; HOW is
    // hydrated by pointer). Populated by the orchestration node from loadSessionPortfolio.
    offerableProcesses: (state.offerable_processes ?? []).slice(0, 12),
    llmOutputIndex: state.context_packet?.llmOutputIndex
      ? {
          cacheBackend: state.context_packet.llmOutputIndex.cacheBackend,
          cacheKey: state.context_packet.llmOutputIndex.cacheKey,
          status: state.context_packet.llmOutputIndex.status,
          latestOutputId: state.context_packet.llmOutputIndex.latestOutputId,
          entries: (state.context_packet.llmOutputIndex.entries ?? []).slice(0, 8)
      }
      : null,
    runtimeVectorContext: state.context_packet?.runtimeVectorIndex
      ? {
          cacheBackend: state.context_packet.runtimeVectorIndex.cacheBackend,
          cacheKey: state.context_packet.runtimeVectorIndex.cacheKey,
          method: state.context_packet.runtimeVectorIndex.method,
          embeddingProvider: state.context_packet.runtimeVectorIndex.embeddingProvider,
          queryHash: state.context_packet.runtimeVectorIndex.queryHash,
          topMatches: (state.context_packet.runtimeVectorIndex.topMatches ?? []).slice(0, 10)
        }
      : null,
    checkpointResumePlan: state.checkpoint_resume_plan
      ? {
          requested: state.checkpoint_resume_plan.requested,
          available: state.checkpoint_resume_plan.available,
          strategy: state.checkpoint_resume_plan.strategy,
          cacheKey: state.checkpoint_resume_plan.cacheKey,
          resumeCheckpointId: state.checkpoint_resume_plan.resumeCheckpointId,
          latestCompletedStep: state.checkpoint_resume_plan.latestCompletedStep,
          priorWorkflow: state.checkpoint_resume_plan.priorWorkflow,
          priorRouteReason: state.checkpoint_resume_plan.priorRouteReason,
          priorEvidenceObservationStatus: state.checkpoint_resume_plan.priorEvidenceObservationStatus,
          priorSourcePointerCount: state.checkpoint_resume_plan.priorSourcePointerCount,
          priorLlmOutputPointers: state.checkpoint_resume_plan.priorLlmOutputPointers,
          safeToResumeWithoutReplayingPriorSteps: state.checkpoint_resume_plan.safeToResumeWithoutReplayingPriorSteps
        }
      : null,
    openclawCapabilityPolicy: {
      workerMayChooseWorkflow: false,
      workerMayCreateSubtasks: true,
      workerMayRunTaskScopedSubagents: true,
      workerMayChooseToolPathWithinAssignedTask: true,
      workerMustReportEverySeconds: 30,
      workerMayEnterCredentials: false,
      workerMaySubmitForms: false,
      workerMayContactPayer: false
    }
  };
}

// Production Layer-1 system message (plan §3.2). Lines marked [KEPT] in the plan are
// byte-preserved from the v1 prompt; the contract is rendered ONCE from
// DECISION_CONTRACT_V2_PROMPT_SHAPE and iterated by the normalizer below.
export function buildLlmOrchestrationDecisionMessages(state) {
  const payload = buildLlmOrchestrationDecisionPayload(state);
  return [
    {
      role: "system",
      content: [
        "You are the live GPT orchestration intelligence inside Brainstyworkers' LangGraph healthcare insurance concierge.",
        "Return strict JSON only. Do not include markdown.",
        "LangGraph is the healthcare workflow master. You advise LangGraph, and LangGraph will enforce safety, approval, worker, and memory rules.",
        "Your context has three PROMPT layers (distinct from the insurance data_layer values you output). PROMPT LAYER 1 (this message) is your constitution: identity, prohibitions, and the output contract. PROMPT LAYER 2 is the capability surface in the payload (capabilityPortfolio.promptTable, offerableProcesses, allowedWorkflows): the ONLY workflows, processes, and capability pointers you may select — all authored in the database, never invented. PROMPT LAYER 3 is this turn's context (userInput, conversationHistory, deterministicPolicy, consentState, authState, runtime pointers, checkpointResumePlan): the facts you reason over.",
        "Allowed workflows: use ONLY keys present in payload.allowedWorkflows. Never select a workflow outside that list.",
        "PLANNED (not yet executable) capabilities: a promptTable row carrying notYetExecutable:true is Capability Registry information only — you may classify the intent, PREPARE packets/work orders/instructions for review, explain the process, and create follow-up tasks (its plannerExposure.planner_may list), but you MUST NOT select it in selected_tools, claim the action was performed, or imply the system executed it. Phrase such outcomes as 'prepared for review/submission' or 'not yet executable by the system'. Write/submission requests route to preparation plus human_approval_escalation, never to a planned row.",
        "Never authorize credential entry, SSN entry, 2FA/passkey handling, payer contact, external messaging, form submission, payment, cancellation, record change, or medical advice.",
        "OpenClaw workers may be powerful inside the delegated read-only task, but they do not choose the healthcare workflow.",
        "If authenticated portal evidence is needed, ask for manual login/readiness and read-only approval rather than claiming evidence exists.",
        "If source pointers are absent, say what evidence is missing.",
        "AVAILABLE EVIDENCE: payload.availableEvidence contains masked evidence already attached to this turn. When an uploaded document has extractionStatus='completed', treat the document as present; do not ask the user to upload it again. Select only the matching workflow from payload.allowedWorkflows.",
        `CLASSIFICATION: set classification.taskClass to exactly one of ${TASK_CLASSES.join(" | ")}.`,
        "DATA LAYER: set data_layer to one or more of layer_1_public | layer_2_member_authorized_api | layer_3_portal_control. layer_1_public = public/no-auth data (RAG, MRF pricing, provider directory, CMS data, public web). layer_2_member_authorized_api = member-authorized payer APIs (SMART-on-FHIR/OAuth reads: coverage, claims/EOB, accumulators, eligibility, formulary, prior-auth status). layer_3_portal_control = authenticated portal control, ONLY where no suitable API exists or the user requests a portal action. Prefer lower layers: public before member data, API before portal control.",
        "RISK TIER: set risk_tier to one of low | medium | high | critical. low = answer from already-approved evidence, no new access (general education, public plan explanation, no PHI, no action). medium = member-specific read-only data or read-only portal/document observation (approval interrupt); provider search, cost estimate, benefits interpretation. high = requires an irreversible write action — claims submission, prior-auth packet submission, appeal filing, scheduling, messages, portal writes (single-use approval token; almost never yours to choose). critical = cancellations, enrollment changes, payment, ambiguous high-stakes action, human escalation, or safety refusal. The runtime computes a deterministic floor from policy results and the selected capabilities' approval scopes; you may RAISE the tier, never lower it below the floor.",
        "AUTH & CONSENT: read payload.consentState and payload.authState. Set ALL auth_and_consent fields: requiresMemberAuth, authType (none | payer_oauth_smart_fhir | employer_portal | provider_portal | pbm_portal | unknown), requiresUserConsent, requiresProviderDelegation, providerDelegationStatus (not_required | required_unverified | verified), approvalRequired (before any write), approvalScope, portalLoginRequired. If the required consent flag is absent/false, or the portal session is not logged in when portal evidence is needed, set auth_and_consent.portalLoginRequired and/or clarificationNeeded accordingly instead of assuming access. Consent is required before member-API access; auth handoff is required before payer/employer/provider/PBM portal control; human approval is required before ALL write actions.",
        "PRIOR AUTHORIZATION: if the user asks whether prior auth is needed, use the PA-requirements capability if plan/member data is available, otherwise policy/insurance RAG. If the user asks for prior-auth status, use the PA-status or Patient Access FHIR capability; if unavailable, portal control with auth handoff. If the user asks to SUBMIT prior authorization: select the PAS submission capability ONLY if providerDelegationStatus = verified; with no verified provider delegation, do NOT plan direct PAS submission — plan a support workflow instead (collect requirements, draft packet, prepare forms, route to provider, or portal control only if user and system authorization permit), and always require write approval before any submission. Prior-auth submission is not a normal patient-side read action — it usually requires provider, EHR, clearinghouse, or delegated vendor authority; explicitly mark the authorization basis.",
        "OPENCLAW SELECTION: use the public web scraper only when needed data is public but dynamic/JS-rendered/unindexed. Use logged portal control only when the needed data or action exists solely inside an authenticated portal with no API. Use the document downloader for PDFs/EOBs/ID cards/letters/portal messages; the claim-submission, scheduling, and form-filling workers for their named write actions. OpenClaw workers never perform a write action without a preceding consumed write approval.",
        "DATA MINIMIZATION: request only the minimum necessary data; never request PHI unless required. Source preference order: 1) public RAG/API, 2) member-authorized FHIR/API, 3) logged portal control, 4) manual user upload/input. Never use public social media or forums as authoritative sources for personalized plan, coverage, claim, or medical-policy decisions — social content may be used only as weak signal for user-confusion patterns, never final answers.",
        "WORKFLOW GRAPH: when you recommend a process, populate workflow_graph.processId with recommendedProcessId and workflow_graph.steps ONLY from that process's steps in offerableProcesses (echo each step's boundary and capabilityPointer; never invent steps). Echo checkpointResumePlan.resumeCheckpointId into workflow_graph.resumeFromCheckpointId when resuming.",
        "Reason as a PROCESS: if you cannot answer now (no evidence, or you need user/plan details), set capabilityAssessment.canAnswerNow=false, set userDataSufficiency, set responseStrategy='offer_process_and_ask', set clarificationNeeded=true with a concrete userFacingNextQuestion, and populate offeredProcessIds/recommendedProcessId from offerableProcesses (never invent a process id not in that list).",
        "A member's CURRENT / real-time figures — out-of-pocket balance or maximum, deductible balance, accumulators, copay/coinsurance owed, claim-specific amounts, or 'what do I still owe' — CANNOT be known from research/policy/general evidence. They require authenticated member evidence from layer_2_member_authorized_api (for example persisted Patient Access Coverage/EOB pointers) or, only when no suitable API evidence exists, layer_3_portal_control. If matching current authenticated member evidence is already present, set canAnswerNow=true and responseStrategy='answer_from_evidence'; never require portal control merely because the evidence came from the preferred API layer. If it is absent, set canAnswerNow=false and responseStrategy='offer_process_and_ask' using the lowest available rail. Research/policy evidence supports only general coverage explanations, never a live balance.",
        "DEMAND EXTRACTION (do this first): set extractedDemand (what the user wants, in one sentence), targetOutcome (the concrete final info/action), and informationNeeds (the specific data required to fulfill it). Build collectedUserData from conversationHistory + the current message — every datum the user has ALREADY provided (payer, member_id, claim_id, drug, the data they want). informationNeeds MINUS what's in collectedUserData = what you still need (drives clarificationNeeded + missingPlanDetails). Never list a need the user already satisfied.",
        "If you can answer from cited evidence (general coverage/policy facts that are actually present), set canAnswerNow=true and responseStrategy='answer_from_evidence'.",
        "Use conversationHistory (recent prior turns). NEVER re-ask for information the user already gave (payer name, the data they want) and NEVER repeat an offer you already made. If you ALREADY offered the portal-lookup process in a prior turn AND the user's latest message accepts/confirms/proceeds (e.g. 'ready', 'yes', 'ok', 'let's go', names the payer, names the data), DO NOT re-explain the offer — keep responseStrategy='offer_process_and_ask' with the offeredProcessIds set, set clarificationNeeded=false, and set userFacingNextQuestion to a SINGLE short instruction to use the live portal action (the UI shows a 'Connect portal (live)' button).",
        "BREVITY: keep userFacingNextQuestion and rationale short and direct — at most one or two short sentences. No preamble, no repeating caveats already stated earlier in the conversation.",
        "OUTPUT CONTRACT (DECISION_CONTRACT_V2 — return exactly this grouped shape):",
        JSON.stringify(DECISION_CONTRACT_V2_PROMPT_SHAPE, null, 2)
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify(payload)
    }
  ];
}

// ---------------------------------------------------------------------------
// Normalizer helpers
// ---------------------------------------------------------------------------

function enumOr(value, allowed, fallback) {
  const v = String(value ?? "");
  return allowed.includes(v) ? v : fallback;
}

function asBool(value, fallback = false) {
  if (value === true || value === false) return value;
  return fallback;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

// A capability row is the PAS-submission capability when its tool key or capability
// key names the Da Vinci PAS submission surface (plan §3.3 hard gate).
function isPasSubmissionRow(row) {
  const toolKey = String(row?.toolKey ?? row?.tool_key ?? "");
  const capKey = String(row?.capabilityKey ?? row?.capability_key ?? "");
  return toolKey === "prior_auth_submission_pas_api" || /(^|[:_])(pas|prior_auth)_submission/i.test(capKey);
}

function rowCapabilityKey(row) {
  return String(row?.capabilityKey ?? row?.capability_key ?? row?.toolKey ?? row?.tool_key ?? "unknown");
}

// Registry gate (plan §7.0): a row that CARRIES the runtime_selectable column and has it
// off may be prepared/explained but never selected as executable. Rows without the
// column (pre-Phase-85 catalogs) are not gated here — the backing-status gate in
// hydrateCapabilityPointer still applies to them.
function rowNotRuntimeSelectable(row) {
  const v = row?.runtimeSelectable ?? row?.runtime_selectable;
  if (v === undefined || v === null) return false;
  return !(v === 1 || v === true || v === "1");
}

// Shared §3.3 capability-row gates. Used at normalize time (when rows are passed in)
// AND post-hydration via applyDecisionCapabilityGates — ONE implementation.
function capabilityRowGateIssues(rows, providerDelegationStatus) {
  const issues = [];
  for (const row of rows ?? []) {
    if (rowNotRuntimeSelectable(row)) {
      issues.push(`tool_not_runtime_selectable:${rowCapabilityKey(row)}`);
    }
    if (isPasSubmissionRow(row) && providerDelegationStatus !== "verified") {
      issues.push("pas_submission_without_provider_delegation");
    }
  }
  return [...new Set(issues)];
}

function normalizeExecutionPolicy(raw, { dataLayer, riskTier }, warnings) {
  const src = asObject(raw);
  const read = (camel, snake) => (src[camel] !== undefined ? src[camel] : src[snake]);
  const policy = {};
  // Five genuine planner preferences (validated).
  policy.preferPublicBeforeMemberData = asBool(read("preferPublicBeforeMemberData", "prefer_public_before_member_data"), EXECUTION_POLICY_PREFERENCE_DEFAULTS.preferPublicBeforeMemberData);
  policy.preferApiBeforePortalControl = asBool(read("preferApiBeforePortalControl", "prefer_api_before_portal_control"), EXECUTION_POLICY_PREFERENCE_DEFAULTS.preferApiBeforePortalControl);
  policy.allowOpenclawPublicScraping = asBool(read("allowOpenclawPublicScraping", "allow_openclaw_public_scraping"), EXECUTION_POLICY_PREFERENCE_DEFAULTS.allowOpenclawPublicScraping);
  policy.allowOpenclawLoggedPortalControl = asBool(read("allowOpenclawLoggedPortalControl", "allow_openclaw_logged_portal_control"), EXECUTION_POLICY_PREFERENCE_DEFAULTS.allowOpenclawLoggedPortalControl);
  policy.allowWriteActions = asBool(read("allowWriteActions", "allow_write_actions"), EXECUTION_POLICY_PREFERENCE_DEFAULTS.allowWriteActions);
  if (policy.allowOpenclawLoggedPortalControl && !dataLayer.includes("layer_3_portal_control")) {
    policy.allowOpenclawLoggedPortalControl = false;
    warnings.push("execution_policy_preference_corrected:allowOpenclawLoggedPortalControl");
  }
  if (policy.allowWriteActions && !["high", "critical"].includes(riskTier)) {
    policy.allowWriteActions = false;
    warnings.push("execution_policy_preference_corrected:allowWriteActions");
  }
  // Four runtime INVARIANTS: force-normalized; a contrary LLM value is overwritten and
  // recorded, never obeyed (plan §3.3 — the model may not vote on these; the decision
  // continues with the corrected values, which is why this records rather than rejects).
  for (const [field, forced] of Object.entries(EXECUTION_POLICY_INVARIANTS)) {
    const snake = field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    const emitted = read(field, snake);
    if (emitted !== undefined && asBool(emitted, forced) !== forced) {
      warnings.push(`execution_policy_invariant_overridden:${field}`);
    }
    policy[field] = forced;
  }
  return policy;
}

function normalizeFallbackStrategy(raw, resolvableTokens, warnings) {
  const entries = Array.isArray(raw) ? raw : [];
  const kept = [];
  for (const entry of entries) {
    const cond = compact(entry?.if, 300);
    const then = compact(entry?.then, 300);
    if (!cond || !then) continue;
    const resolvable = then === "honest_decline" || resolvableTokens.some((token) => token && then.includes(token));
    if (!resolvable) {
      // Advisory plan entries that name nothing resolvable are DROPPED and recorded
      // (plan §3.3 "dropped with issue fallback_unresolvable" — corrective, the
      // decision continues without the entry).
      warnings.push(`fallback_unresolvable:${compact(then, 80)}`);
      continue;
    }
    kept.push({ if: cond, then });
  }
  return kept;
}

function normalizeToolPlan(raw, capabilityPointers, resolvableTokens, warnings) {
  const entries = Array.isArray(raw) ? raw : [];
  return entries
    .map((entry) => {
      const pointer = String(entry?.capabilityPointer ?? entry?.capability_pointer ?? "").trim();
      if (!pointer) return null;
      if (capabilityPointers.length && !capabilityPointers.includes(pointer)) {
        warnings.push(`tool_plan_pointer_unselected:${compact(pointer, 80)}`);
      }
      const level = enumOr(entry?.dataAccessLevel ?? entry?.data_access_level, DATA_ACCESS_LEVELS, null);
      if (!level) warnings.push(`tool_plan_data_access_level_invalid:${compact(pointer, 80)}`);
      let fallback = compact(entry?.fallbackIfUnavailable ?? entry?.fallback_if_unavailable, 200);
      const fallbackResolvable = fallback === "honest_decline" || resolvableTokens.some((token) => token && fallback.includes(token));
      if (fallback && !fallbackResolvable) {
        warnings.push(`tool_plan_fallback_unresolvable:${compact(fallback, 80)}`);
        fallback = "honest_decline";
      }
      return {
        capabilityPointer: pointer,
        purpose: compact(entry?.purpose, 300),
        dataAccessLevel: level,
        fallbackIfUnavailable: fallback || "honest_decline"
      };
    })
    .filter(Boolean);
}

// v1 flat shape → canonical intermediate (plan §3.3 lift table; lossless).
function liftV1(parsed) {
  return {
    workflow: parsed.workflow,
    taskClass: null,
    intent: parsed.intent,
    confidence: parsed.confidence,
    extractedDemand: parsed.extractedDemand,
    targetOutcome: parsed.targetOutcome,
    rationale: parsed.rationale,
    dataLayer: [],
    riskTier: null,
    riskTierAsserted: false,
    v1RiskLift: true,
    informationNeeds: parsed.informationNeeds,
    collectedUserData: parsed.collectedUserData,
    requiredEvidence: parsed.requiredEvidence,
    missingEvidence: parsed.missingEvidence,
    userDataSufficiency: parsed.userDataSufficiency,
    missingPlanDetails: parsed.missingPlanDetails,
    priorLlmOutputPointersUsed: parsed.priorLlmOutputPointersUsed,
    assumptions: [],
    requiredDataPoints: [],
    approvalRequired: parsed.approvalRequired,
    approvalScope: parsed.approvalScope,
    portalLoginRequired: false,
    requiresMemberAuth: false,
    authType: "unknown",
    requiresUserConsent: false,
    requiresProviderDelegation: false,
    providerDelegationStatus: null,
    capabilityPointers: [...asArray(parsed.selectedCapabilityPointers)],
    selectedCapabilityPortfolioIds: asArray(parsed.selectedCapabilityPortfolioIds),
    toolPlan: [],
    offeredProcessIds: parsed.offeredProcessIds,
    recommendedProcessId: parsed.recommendedProcessId,
    workerGoal: parsed.workerGoal,
    workflowGraphSteps: [],
    resumeFromCheckpointId: null,
    responseStrategy: parsed.responseStrategy,
    clarificationNeeded: parsed.clarificationNeeded,
    userFacingNextQuestion: parsed.userFacingNextQuestion,
    answerComposerMode: parsed.answerComposerMode,
    capabilityAssessment: parsed.capabilityAssessment,
    answerContract: null,
    executionPolicy: null,
    fallbackStrategy: []
  };
}

// v2 grouped shape → canonical intermediate.
function readV2(parsed) {
  const classification = asObject(parsed.classification);
  const demand = asObject(parsed.demand_and_evidence);
  const auth = asObject(parsed.auth_and_consent);
  const tools = asObject(parsed.selected_tools);
  const graph = asObject(parsed.workflow_graph);
  const response = asObject(parsed.response);
  return {
    workflow: classification.workflow,
    taskClass: classification.taskClass ?? classification.task_class,
    intent: classification.intent,
    confidence: classification.confidence,
    extractedDemand: classification.extractedDemand ?? classification.extracted_demand,
    targetOutcome: classification.targetOutcome ?? classification.target_outcome,
    rationale: classification.rationale ?? parsed.decision_summary,
    dataLayer: asArray(parsed.data_layer ?? parsed.dataLayer),
    riskTier: parsed.risk_tier ?? parsed.riskTier,
    riskTierAsserted: (parsed.risk_tier ?? parsed.riskTier) !== undefined && (parsed.risk_tier ?? parsed.riskTier) !== null,
    v1RiskLift: false,
    informationNeeds: demand.informationNeeds ?? demand.information_needs,
    collectedUserData: demand.collectedUserData ?? demand.collected_user_data,
    requiredEvidence: demand.requiredEvidence ?? demand.required_evidence,
    missingEvidence: demand.missingEvidence ?? demand.missing_evidence,
    userDataSufficiency: demand.userDataSufficiency ?? demand.user_data_sufficiency,
    missingPlanDetails: demand.missingPlanDetails ?? demand.missing_plan_details,
    priorLlmOutputPointersUsed: demand.priorLlmOutputPointersUsed ?? demand.prior_llm_output_pointers_used,
    assumptions: asArray(demand.assumptions),
    requiredDataPoints: Array.isArray(demand.requiredDataPoints ?? demand.required_data_points)
      ? (demand.requiredDataPoints ?? demand.required_data_points)
      : [],
    approvalRequired: auth.approvalRequired ?? auth.requires_human_approval_before_write,
    approvalScope: auth.approvalScope ?? auth.approval_scope,
    portalLoginRequired: auth.portalLoginRequired ?? auth.portal_login_required,
    requiresMemberAuth: auth.requiresMemberAuth ?? auth.requires_member_auth,
    authType: auth.authType ?? auth.auth_type,
    requiresUserConsent: auth.requiresUserConsent ?? auth.requires_user_consent,
    requiresProviderDelegation: auth.requiresProviderDelegation ?? auth.requires_provider_delegation,
    providerDelegationStatus: auth.providerDelegationStatus ?? auth.provider_delegation_status,
    capabilityPointers: asArray(tools.capabilityPointers ?? tools.capability_pointers),
    selectedCapabilityPortfolioIds: [],
    toolPlan: tools.toolPlan ?? tools.tool_plan,
    offeredProcessIds: tools.offeredProcessIds ?? tools.offered_process_ids,
    recommendedProcessId: tools.recommendedProcessId ?? tools.recommended_process_id,
    workerGoal: tools.workerGoal ?? tools.worker_goal,
    workflowGraphSteps: Array.isArray(graph.steps) ? graph.steps : [],
    resumeFromCheckpointId: graph.resumeFromCheckpointId ?? graph.resume_from_checkpoint_id ?? null,
    responseStrategy: response.responseStrategy ?? response.response_strategy,
    clarificationNeeded: response.clarificationNeeded ?? response.clarification_needed,
    userFacingNextQuestion: response.userFacingNextQuestion ?? response.user_facing_next_question,
    answerComposerMode: response.answerComposerMode ?? response.answer_composer_mode,
    capabilityAssessment: response.capabilityAssessment ?? response.capability_assessment,
    answerContract: response.answerContract ?? response.answer_contract ?? parsed.answer_contract,
    executionPolicy: parsed.execution_policy ?? parsed.executionPolicy,
    fallbackStrategy: parsed.fallback_strategy ?? parsed.fallbackStrategy
  };
}

function invalidResponseDecision(error, options, warnings) {
  return {
    contractVersion: LLM_ORCHESTRATION_DECISION_VERSION,
    mode: options.mode ?? "invalid_response",
    provider: options.provider ?? "openai",
    model: options.model ?? null,
    valid: false,
    usedByRouter: false,
    classification: { workflow: null, taskClass: null, intent: null, confidence: 0, extractedDemand: "", targetOutcome: "", rationale: error.message },
    data_layer: [],
    risk_tier: null,
    riskTierFloor: null,
    demand_and_evidence: {
      informationNeeds: [], collectedUserData: {}, requiredEvidence: [], missingEvidence: [],
      userDataSufficiency: "none", missingPlanDetails: [], priorLlmOutputPointersUsed: [],
      assumptions: [], requiredDataPoints: []
    },
    auth_and_consent: {
      requiresMemberAuth: false, authType: "unknown", requiresUserConsent: false,
      requiresProviderDelegation: false, providerDelegationStatus: "not_required",
      approvalRequired: false, approvalScope: null, portalLoginRequired: false
    },
    selected_tools: { capabilityPointers: [], toolPlan: [], offeredProcessIds: [], recommendedProcessId: null, workerGoal: null },
    workflow_graph: { processId: null, steps: [], resumeFromCheckpointId: null },
    response: {
      responseStrategy: null, clarificationNeeded: false, userFacingNextQuestion: "",
      answerComposerMode: "degraded",
      capabilityAssessment: { canAnswerNow: false, reason: "invalid_response", limitations: [] },
      answerContract: { finalAnswerShouldInclude: [...ANSWER_CONTRACT_DEFAULTS.finalAnswerShouldInclude], finalAnswerMustNotInclude: [...ANSWER_CONTRACT_DEFAULTS.finalAnswerMustNotInclude] }
    },
    execution_policy: { ...EXECUTION_POLICY_PREFERENCE_DEFAULTS, ...EXECUTION_POLICY_INVARIANTS },
    fallback_strategy: [],
    issues: [error.message],
    warnings,
    rawDecision: null
  };
}

// ---------------------------------------------------------------------------
// THE one normalizer (plan §3.3). Detects a v1 flat shape (no `classification`
// group) and lifts it losslessly; validates a v2 grouped shape. Required options:
//   allowedWorkflows      — DB-derived workflow keys; empty/missing is a HARD issue
//                           `allowed_workflows_unavailable` (fail loud, never permissive)
//   offerableProcessIds   — process ids the planner was shown (offer filter)
//   selectedCapabilityRows— hydrated capability rows for the selection (row gates +
//                           risk floor); may be [] pre-hydration — the runner re-runs
//                           the row gates post-hydration via applyDecisionCapabilityGates
// Optional: policyResult (risk-tier floor input), knownCapabilityKeys (fallback
// resolvability), consentState (requiresUserConsent cross-check when present).
// `options.fallbackWorkflow` is REMOVED: a rejected decision never inherits a
// classifier workflow (plan §3.3 / §10.8).
// ---------------------------------------------------------------------------
export function normalizeLlmOrchestrationDecision(raw, options = {}) {
  const issues = [];
  const warnings = [];
  let parsed = null;
  try {
    parsed = parseJsonLike(raw);
  } catch (error) {
    return invalidResponseDecision(error, options, warnings);
  }

  const isV1 = !(parsed.classification && typeof parsed.classification === "object");
  // Tolerate the draft's flat `classification` enum string by folding it into taskClass.
  if (typeof parsed.classification === "string") {
    parsed = { ...parsed, classification: { ...asObject(null), workflow: parsed.workflow, taskClass: parsed.classification, intent: parsed.intent, confidence: parsed.confidence, extractedDemand: parsed.extractedDemand, targetOutcome: parsed.targetOutcome, rationale: parsed.rationale } };
  }
  const g = isV1 && typeof parsed.classification !== "object" ? liftV1(parsed) : (parsed.classification && typeof parsed.classification === "object" ? readV2(parsed) : liftV1(parsed));

  // --- allowed workflows (DB-derived; fail loud, never permissive) ---
  const allowedWorkflows = asArray(options.allowedWorkflows);
  let workflow = String(g.workflow ?? "").trim();
  // Deterministic canonicalization (NOT a fallback): the prompt shows workflows in two
  // representations — bare keys in payload.allowedWorkflows and "workflow:<key>"
  // portfolioIds in the promptTable — and the model occasionally returns the prefixed
  // form. Strip the unambiguous prefix ONLY when the remainder is in the allowlist;
  // anything else still fails loud with workflow_not_allowed.
  if (workflow.startsWith("workflow:") && allowedWorkflows.includes(workflow.slice("workflow:".length))) {
    workflow = workflow.slice("workflow:".length);
    warnings.push("workflow_prefix_canonicalized");
  }
  if (!allowedWorkflows.length) {
    issues.push("allowed_workflows_unavailable");
  } else if (!allowedWorkflows.includes(workflow)) {
    issues.push(`workflow_not_allowed:${workflow || "empty"}`);
  }

  const confidence = clampConfidence(g.confidence);
  if (confidence < 0.5) warnings.push("low_confidence_llm_decision");
  if (!g.rationale) warnings.push("missing_rationale");
  if (!g.workerGoal) warnings.push("missing_worker_goal");

  // --- classification ---
  const taskClass = enumOr(g.taskClass, TASK_CLASSES, null);
  if (g.taskClass && !taskClass) warnings.push(`task_class_invalid:${compact(g.taskClass, 60)}`);
  if (!isV1 && !taskClass) warnings.push("task_class_missing");

  // --- data_layer ---
  const dataLayerRaw = asArray(g.dataLayer);
  const dataLayer = dataLayerRaw.filter((v) => DATA_LAYERS.includes(v));
  for (const v of dataLayerRaw) {
    if (!DATA_LAYERS.includes(v)) warnings.push(`data_layer_invalid:${compact(v, 60)}`);
  }
  if (!isV1 && !dataLayer.length) warnings.push("data_layer_missing");

  // --- auth & consent ---
  const requiresProviderDelegation = asBool(g.requiresProviderDelegation, false);
  const providerDelegationStatus = enumOr(
    g.providerDelegationStatus,
    PROVIDER_DELEGATION_STATUSES,
    requiresProviderDelegation ? "required_unverified" : "not_required"
  );
  const authAndConsent = {
    requiresMemberAuth: asBool(g.requiresMemberAuth, false),
    authType: enumOr(g.authType, AUTH_TYPES, "unknown"),
    requiresUserConsent: asBool(g.requiresUserConsent, false),
    requiresProviderDelegation,
    providerDelegationStatus,
    approvalRequired: Boolean(g.approvalRequired),
    approvalScope: g.approvalScope ? String(g.approvalScope) : null,
    portalLoginRequired: asBool(g.portalLoginRequired, false)
  };
  if (options.consentState && authAndConsent.requiresMemberAuth && !authAndConsent.requiresUserConsent && options.consentState.memberApiConsentGranted !== true) {
    warnings.push("member_auth_without_consent_flag");
  }

  // --- risk tier: floor is deterministic (plan §8.1); the LLM may only raise ---
  const selectedCapabilityRows = Array.isArray(options.selectedCapabilityRows) ? options.selectedCapabilityRows : [];
  const riskTierFloor = computeRiskTierFloor(options.policyResult ?? null, selectedCapabilityRows);
  let riskTier = enumOr(g.riskTier, RISK_TIERS, null);
  if (g.riskTierAsserted && g.riskTier && !riskTier) warnings.push(`risk_tier_invalid:${compact(g.riskTier, 40)}`);
  if (g.v1RiskLift) {
    // v1 lift rule (plan §3.3): escalation → critical; irreversible approval scope →
    // high; approval required → medium; else low. Lossless replays never gain issues.
    riskTier = workflow === "human_approval_escalation"
      ? "critical"
      : authAndConsent.approvalRequired
        ? (/submit|send|file|appeal|authorize|change|cancel|delete|pay|write/i.test(String(authAndConsent.approvalScope ?? "")) ? "high" : "medium")
        : "low";
    riskTier = riskTierAtLeast(riskTier, riskTierFloor);
  } else if (riskTier) {
    if (RISK_TIERS.indexOf(riskTier) < RISK_TIERS.indexOf(riskTierFloor)) {
      issues.push("risk_tier_below_floor");
      riskTier = riskTierFloor;
    }
  } else {
    riskTier = riskTierFloor;
  }

  // --- capability-row hard gates (PAS delegation + registry runtime_selectable) ---
  issues.push(...capabilityRowGateIssues(selectedCapabilityRows, providerDelegationStatus));

  // --- response group (fail-closed defaults preserved from v1) ---
  const canAnswerNow = g.capabilityAssessment?.canAnswerNow === true; // default false
  const allowedSufficiency = ["sufficient", "insufficient", "none"];
  const userDataSufficiency = allowedSufficiency.includes(String(g.userDataSufficiency))
    ? String(g.userDataSufficiency)
    : "none";
  const clarificationNeeded = Boolean(g.clarificationNeeded);
  const userFacingNextQuestion = g.userFacingNextQuestion ? compact(g.userFacingNextQuestion, 500) : "";
  const allowedStrategies = ["answer_from_evidence", "offer_process_and_ask", "honest_capability_decline", "degraded_best_effort"];
  const responseStrategyRaw = String(g.responseStrategy ?? "");
  const responseStrategy = allowedStrategies.includes(responseStrategyRaw) ? responseStrategyRaw : (responseStrategyRaw ? compact(responseStrategyRaw, 1000) : null);
  if (clarificationNeeded && !userFacingNextQuestion) warnings.push("clarification_needed_without_question");

  // --- offered processes: filtered at normalize time against the offerable set ---
  const offerableProcessIds = asArray(options.offerableProcessIds);
  let offeredProcessIds = asArray(g.offeredProcessIds);
  if (offerableProcessIds.length) {
    for (const id of offeredProcessIds) {
      if (!offerableProcessIds.includes(id)) warnings.push(`offered_process_not_offerable:${compact(id, 80)}`);
    }
    offeredProcessIds = offeredProcessIds.filter((id) => offerableProcessIds.includes(id));
  }
  if (["offer_process_and_ask", "honest_capability_decline"].includes(responseStrategy) && offeredProcessIds.length === 0) warnings.push("capability_question_without_offer");
  let recommendedProcessId = g.recommendedProcessId ? String(g.recommendedProcessId) : (offeredProcessIds[0] ?? null);
  if (recommendedProcessId && offerableProcessIds.length && !offerableProcessIds.includes(recommendedProcessId)) {
    warnings.push(`recommended_process_not_offerable:${compact(recommendedProcessId, 80)}`);
    recommendedProcessId = offeredProcessIds[0] ?? null;
  }

  // --- demand & evidence ---
  const extractedDemand = g.extractedDemand ? compact(g.extractedDemand, 500) : "";
  const targetOutcome = g.targetOutcome ? compact(g.targetOutcome, 300) : "";
  const informationNeeds = asArray(g.informationNeeds);
  const collectedUserData = asObject(g.collectedUserData);
  if (!extractedDemand) warnings.push("demand_not_extracted");
  const requiredDataPoints = (Array.isArray(g.requiredDataPoints) ? g.requiredDataPoints : [])
    .map((entry) => {
      const name = compact(entry?.name, 120);
      if (!name) return null;
      const sourcePreference = enumOr(entry?.sourcePreference ?? entry?.source_preference, SOURCE_PREFERENCES, null);
      if (!sourcePreference) warnings.push(`required_data_point_source_invalid:${name}`);
      return { name, sourcePreference, required: asBool(entry?.required, true) };
    })
    .filter(Boolean);

  // --- selected tools ---
  const capabilityPointers = [...new Set([...asArray(g.capabilityPointers)])];
  const knownCapabilityKeys = asArray(options.knownCapabilityKeys);
  const resolvableTokens = [...offerableProcessIds, ...knownCapabilityKeys, ...INTERRUPT_KINDS];
  const toolPlan = normalizeToolPlan(g.toolPlan, capabilityPointers, resolvableTokens, warnings);

  // --- workflow graph (row-level DB validation runs in plan_journey via validateWorkflowGraph) ---
  const workflowGraph = {
    processId: recommendedProcessId ?? null,
    steps: (g.workflowGraphSteps ?? [])
      .map((step) => ({
        boundary: compact(step?.boundary, 120) || null,
        capabilityPointer: step?.capabilityPointer ? String(step.capabilityPointer) : (step?.capability ? String(step.capability) : null)
      }))
      .filter((step) => step.boundary || step.capabilityPointer),
    resumeFromCheckpointId: g.resumeFromCheckpointId ? String(g.resumeFromCheckpointId) : null
  };

  // --- answer contract (composer guidance; deterministic guards still apply) ---
  const answerContractRaw = asObject(g.answerContract);
  const answerContract = {
    finalAnswerShouldInclude: asArray(answerContractRaw.finalAnswerShouldInclude ?? answerContractRaw.final_answer_should_include).length
      ? asArray(answerContractRaw.finalAnswerShouldInclude ?? answerContractRaw.final_answer_should_include)
      : [...ANSWER_CONTRACT_DEFAULTS.finalAnswerShouldInclude],
    finalAnswerMustNotInclude: [...new Set([
      ...asArray(answerContractRaw.finalAnswerMustNotInclude ?? answerContractRaw.final_answer_must_not_include),
      ...ANSWER_CONTRACT_DEFAULTS.finalAnswerMustNotInclude
    ])]
  };

  // --- execution policy (5 preferences + 4 forced invariants) ---
  const executionPolicy = normalizeExecutionPolicy(g.executionPolicy, { dataLayer, riskTier }, warnings);

  // --- fallback strategy (advisory; unresolvable entries dropped + recorded) ---
  const fallbackStrategy = normalizeFallbackStrategy(g.fallbackStrategy, resolvableTokens, warnings);

  const answerComposerMode = ["evidence_sourced", "capability_meta", "degraded"].includes(String(g.answerComposerMode))
    ? String(g.answerComposerMode)
    : (canAnswerNow ? "evidence_sourced" : "capability_meta");
  const capabilityAssessment = {
    canAnswerNow,
    reason: g.capabilityAssessment?.reason ? compact(g.capabilityAssessment.reason, 400) : null,
    limitations: asArray(g.capabilityAssessment?.limitations)
  };

  const valid = issues.length === 0;
  const rationale = compact(g.rationale, 800);
  const workerGoal = g.workerGoal ? compact(g.workerGoal, 1000) : null;

  return {
    contractVersion: LLM_ORCHESTRATION_DECISION_VERSION,
    mode: options.mode ?? "normalized_response",
    provider: options.provider ?? "openai",
    model: options.model ?? null,
    valid,
    usedByRouter: false,
    // --- grouped DECISION_CONTRACT_V2 sections ---
    classification: {
      workflow: valid ? workflow : (allowedWorkflows.includes(workflow) ? workflow : null),
      taskClass,
      intent: g.intent ? String(g.intent) : null,
      confidence,
      extractedDemand,
      targetOutcome,
      rationale
    },
    data_layer: dataLayer,
    risk_tier: riskTier,
    riskTierFloor,
    demand_and_evidence: {
      informationNeeds,
      collectedUserData,
      requiredEvidence: asArray(g.requiredEvidence),
      missingEvidence: asArray(g.missingEvidence),
      userDataSufficiency,
      missingPlanDetails: asArray(g.missingPlanDetails),
      priorLlmOutputPointersUsed: asArray(g.priorLlmOutputPointersUsed),
      assumptions: asArray(g.assumptions),
      requiredDataPoints
    },
    auth_and_consent: authAndConsent,
    selected_tools: {
      capabilityPointers,
      selectedCapabilityPortfolioIds: asArray(g.selectedCapabilityPortfolioIds),
      toolPlan,
      offeredProcessIds,
      recommendedProcessId,
      workerGoal
    },
    workflow_graph: workflowGraph,
    response: {
      responseStrategy,
      clarificationNeeded,
      userFacingNextQuestion,
      answerComposerMode,
      capabilityAssessment,
      answerContract
    },
    execution_policy: executionPolicy,
    fallback_strategy: fallbackStrategy,
    // Flat v1 aliases REMOVED (Phase 85 — the §3.3 one-release affordance expired):
    // consumers read ONLY the grouped v2 sections. The v1 INPUT lift above stays
    // forever so recorded flat decisions keep normalizing.
    issues,
    warnings,
    rawDecision: parsed
  };
}

// Post-hydration second pass over the SAME §3.3 row gates (PAS delegation, registry
// runtime_selectable, capability-driven risk floor). The runner hydrates pointers
// AFTER normalization, so it re-applies the gates once the resolved rows exist —
// one gate implementation, two call points, no dual logic.
export function applyDecisionCapabilityGates(decision, selectedCapabilityRows = [], { policyResult = null } = {}) {
  if (!decision || typeof decision !== "object") return decision;
  const rows = Array.isArray(selectedCapabilityRows) ? selectedCapabilityRows : [];
  const gateIssues = capabilityRowGateIssues(rows, decision.auth_and_consent?.providerDelegationStatus ?? "not_required")
    .filter((issue) => !(decision.issues ?? []).includes(issue));
  const floor = computeRiskTierFloor(policyResult, rows);
  const issues = [...(decision.issues ?? []), ...gateIssues];
  let riskTier = decision.risk_tier ?? floor;
  if (RISK_TIERS.indexOf(riskTier) < RISK_TIERS.indexOf(floor)) {
    riskTier = floor;
  }
  return {
    ...decision,
    risk_tier: riskTier,
    riskTierFloor: riskTierAtLeast(decision.riskTierFloor ?? "low", floor),
    issues,
    valid: issues.length === 0
  };
}

// Grouped-only reads (Phase 85): the flat aliases are gone; thresholds are
// explicitly NOT resemanticized (plan §3.3).
export function decisionWorkflow(decision) {
  return decision?.classification?.workflow ?? null;
}

export function decisionConfidence(decision) {
  return clampConfidence(decision?.classification?.confidence);
}

export function shouldUseLlmDecision(decision) {
  return Boolean(decision?.valid && decisionWorkflow(decision) && decisionConfidence(decision) >= 0.5);
}

export function confidenceBand(decision) {
  const confidence = decisionConfidence(decision);
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}
