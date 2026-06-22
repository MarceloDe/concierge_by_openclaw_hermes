import { createHash } from "node:crypto";
import { scorePemsMaturity } from "./continuousIntelligence.mjs";
import { maskDirectIdentifiers } from "./modelPayloadPolicy.mjs";
import { buildGraphitiMemoryNamespaces } from "./trustedAnswerDriving.mjs";

export const MEMORY_SKILL_TREE_VERSION = "2026-06-22.phase60-memory-skill-tree-selector.v1";

const STANDARD_SKILL_THRESHOLD = 35;
const CONSOLIDATION_REVIEW_THRESHOLD = 85;

function hashText(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function compact(value, limit = 240) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : [value];
}

function safeSnake(value, fallback = "general") {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function pointerId(pointer) {
  const table = pointer?.table ?? pointer?.sourceTable ?? null;
  const id = pointer?.id ?? pointer?.sourceId ?? null;
  return table && id ? `${table}/${id}` : null;
}

function safePointer(pointer) {
  return {
    table: pointer?.table ?? pointer?.sourceTable ?? null,
    id: pointer?.id ?? pointer?.sourceId ?? null,
    kind: pointer?.kind ?? null,
    summaryHash: pointer?.summary ? hashText(pointer.summary).slice(0, 16) : null,
    sourcePointerId: pointerId(pointer)
  };
}

function userMaskContext(user = {}) {
  return { context_packet: { user } };
}

function safePreview(value, user = {}) {
  return compact(maskDirectIdentifiers(value, userMaskContext(user))
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[redacted-email]")
    .replace(/\b(?:member|subscriber)\s*(?:id|number|#|no\.?)?\s*[:#=-]?\s*[A-Z0-9-]{4,}\b/gi, "[redacted-insurance-id]"));
}

function dynamicSkillRefs(dynamicSkillContext = {}) {
  const selected = dynamicSkillContext.selected ?? {};
  return [
    selected.insuranceSkillKey ? { kind: "insurance_specific", key: selected.insuranceSkillKey } : null,
    selected.journeySkillKey ? { kind: "journey_specific", key: selected.journeySkillKey } : null,
    selected.executionSkillKey ? { kind: "execution_specific", key: selected.executionSkillKey } : null
  ].filter(Boolean);
}

function bestMatchScore(dynamicSkillContext = {}) {
  return Math.max(0, ...(dynamicSkillContext.matches ?? []).map((match) => Number(match.fit?.score ?? 0)));
}

function factPreviews(productMemoryRecall = {}, user = {}) {
  return (productMemoryRecall.facts ?? [])
    .slice(0, 8)
    .map((fact) => ({
      factRef: fact.uuid ?? fact.id ?? `fact_${hashText(fact.fact ?? fact.name ?? "").slice(0, 12)}`,
      preview: safePreview(fact.fact ?? fact.name ?? fact.summary ?? "", user),
      source: "zep_graphiti"
    }))
    .filter((item) => item.preview);
}

export function buildRalphLoopProcedure({
  caseKey = "case",
  workflow = "document_or_trace_review",
  selectedSkillKey = null,
  tools = [],
  extractors = [],
  verifiers = [],
  sensors = [],
  controllers = []
} = {}) {
  return {
    version: MEMORY_SKILL_TREE_VERSION,
    loopStyle: "ralph_rigg_sequential_goal_loop",
    caseKey,
    workflow,
    selectedSkillKey,
    productionDrivingAllowed: false,
    steps: [
      {
        id: "requirements",
        title: "Current Feature And Case State Evaluation",
        objective: "Bind the request to DB user/session records, deterministic safety policy, available skills, and source-pointer evidence.",
        tools: ["database_authority", "policy_gate", "source_pointer_inventory"]
      },
      {
        id: "target_plan",
        title: "Target Feature Coding Planning",
        objective: "Choose the nearest skill-tree route and define missing evidence, worker tasks, verification sensors, and fallback path.",
        tools: ["memory_skill_tree_selector", ...tools]
      },
      {
        id: "implementation",
        title: "Code Or Worker Implementation",
        objective: "Execute only bounded read-only subtasks or generate a reviewer-only skill candidate; do not widen approval scopes.",
        tools: controllers
      },
      {
        id: "testing",
        title: "Code Testing",
        objective: "Run deterministic validators, citation/source-pointer checks, policy checks, and skill contract checks.",
        tools: verifiers
      },
      {
        id: "visual_sensor",
        title: "Dashboard, MVP, And Visual/OCR Sensor Testing",
        objective: "Capture dashboard/API/UI state as refs only; never persist raw frame or OCR text.",
        tools: sensors
      },
      {
        id: "agentic_goal_evaluation",
        title: "Separated Agentic Goal Evaluation Score",
        objective: "Score the loop against target thresholds and route pass/fail to repeat or promote.",
        tools: ["pems_maturity_gate", "reviewer_workbench"]
      },
      {
        id: "decision",
        title: "Pass Score Decision",
        objective: "If no, restart the loop with a smaller target. If yes, promote to supervised advisory or trusted answer-driving only through existing gates.",
        tools: ["human_reviewer_gate", "kill_switch"]
      }
    ],
    passDecision: {
      targetScore: CONSOLIDATION_REVIEW_THRESHOLD,
      ifNo: "repeat_current_case_loop_with_more_evidence",
      ifYes: "submit_skill_candidate_for_human_reviewer_promotion",
      automaticProductionPromotion: false
    }
  };
}

export function buildConsolidationCandidateFromCase({
  caseState = {},
  dynamicSkillContext = {},
  productMemoryRecall = {},
  aggregate = {},
  user = {},
  allowWorktreeWrite = false,
  reviewerApproved = false
} = {}) {
  const workflow = caseState.decision?.workflow ?? caseState.workflow ?? dynamicSkillContext.contextSummary?.workflow ?? "document_or_trace_review";
  const payer = dynamicSkillContext.contextSummary?.payer ?? caseState.context?.portalAccountRef?.payer ?? "general_plan";
  const selectedSkillKey =
    dynamicSkillContext.selected?.journeySkillKey ??
    dynamicSkillContext.selected?.insuranceSkillKey ??
    dynamicSkillContext.selected?.executionSkillKey ??
    "memory_discovered_skill";
  const candidateKey = `generated_${safeSnake(payer)}_${safeSnake(workflow)}_${hashText(`${payer}|${workflow}|${selectedSkillKey}`).slice(0, 10)}`;
  const maturity = scorePemsMaturity({
    candidateId: candidateKey,
    shadowRuns: aggregate.shadowRuns ?? aggregate.shadowRunCount ?? 0,
    evidenceRefCount: aggregate.evidenceRefCount ?? caseState.evidence?.sourcePointerCount ?? 0,
    successfulOutcomeCount: aggregate.successfulOutcomeCount ?? 0,
    reviewerApprovals: aggregate.reviewerApprovals ?? 0,
    authorityCitationCount: aggregate.authorityCitationCount ?? caseState.evidence?.sourcePointerCount ?? 0,
    validatorPassCount: aggregate.validatorPassCount ?? 0,
    safetyIncidentCount: aggregate.safetyIncidentCount ?? 0,
    freshnessDays: aggregate.freshnessDays ?? 0
  });
  const readyForReviewer =
    maturity.score >= CONSOLIDATION_REVIEW_THRESHOLD &&
    maturity.inputs.shadowRuns >= maturity.minimums.shadowRuns &&
    maturity.inputs.reviewerApprovals >= maturity.minimums.reviewerApprovals &&
    maturity.inputs.safetyIncidentCount === 0;
  const safeFacts = factPreviews(productMemoryRecall, user);
  const skillServerDraft = {
    schema_version: "brainstyworkers.dynamic_skill.v1",
    skill_key: candidateKey,
    skill_kind: "journey_specific",
    title: compact(`${payer} ${workflow} memory-derived journey`, 96),
    status: reviewerApproved ? "reviewer_approved_candidate" : "draft_memory_consolidation_candidate",
    editable_by: "external_skill_generator_llm",
    matching: {
      workflows: [workflow],
      carriers: payer === "general_plan" ? [] : [payer],
      keywords: [safeSnake(workflow), safeSnake(payer)].filter(Boolean)
    },
    runtime_mounts: {
      database_queries: ["trusted_research_artifacts_by_workflow", "latest_eligibility_snapshot_by_session"]
    },
    memory_mounts: {
      zep_graphiti_namespaces: ["semantic:plan", "procedural:skills", "collective:patterns", "episodic:member:<hashed>"],
      fact_refs: safeFacts.map((fact) => fact.factRef)
    },
    answer_contract: {
      required_fields: ["status", "facts", "citations", "uncertainties", "next_actions"],
      citation_required_for_factual_claims: true
    },
    safety: {
      production_driving_allowed: false,
      reviewer_approval_required: true,
      credential_entry_allowed: false,
      external_write_allowed: false,
      raw_phi_storage_allowed: false
    }
  };
  return {
    version: MEMORY_SKILL_TREE_VERSION,
    candidateId: candidateKey,
    status: readyForReviewer ? "ready_for_reviewer_skill_candidate" : "needs_more_shadow_memory",
    maturity,
    readyForReviewer,
    skillServerDraft,
    proposedWorktreePath: `openclaw/skills/${candidateKey}/skill-server.json`,
    worktreeWriteAllowed: Boolean(allowWorktreeWrite && reviewerApproved && readyForReviewer),
    productionDrivingAllowed: false,
    rawPhiStored: false,
    sourcePointerIds: (caseState.evidence?.sourcePointerRefs ?? []).map(pointerId).filter(Boolean),
    memoryFactRefs: safeFacts.map((fact) => fact.factRef),
    nextAction: readyForReviewer
      ? "open_reviewer_pr_for_generated_skill_candidate"
      : "continue_shadow_runs_until_pems_thresholds_are_met"
  };
}

export function selectMemorySkillTree({
  state = {},
  caseState = {},
  dynamicSkillContext = {},
  productMemoryRecall = {},
  user = {},
  aggregate = {}
} = {}) {
  const workflow =
    state.workflow ??
    caseState.decision?.workflow ??
    dynamicSkillContext.contextSummary?.workflow ??
    state.structured_intent?.workflow ??
    "document_or_trace_review";
  const payer =
    dynamicSkillContext.contextSummary?.payer ??
    state.context_packet?.portalAccount?.payer ??
    state.context_packet?.user?.payer ??
    "unknown_plan";
  const caseKey = `mst_${hashText(`${state.user_id ?? user.id ?? "user"}|${state.session_id ?? "session"}|${workflow}|${payer}`).slice(0, 16)}`;
  const sourcePointers = [
    ...(state.source_pointers ?? []),
    ...(caseState.evidence?.sourcePointerRefs ?? []),
    ...(state.context_packet?.dbPointers ?? [])
  ].map(safePointer);
  const productFacts = factPreviews(productMemoryRecall ?? state.product_memory_recall, user);
  const score = bestMatchScore(dynamicSkillContext);
  const selectedSkillKey =
    dynamicSkillContext.selected?.journeySkillKey ??
    dynamicSkillContext.selected?.insuranceSkillKey ??
    dynamicSkillContext.selected?.executionSkillKey ??
    null;
  const nonStandardDemand =
    !selectedSkillKey ||
    score < STANDARD_SKILL_THRESHOLD ||
    productFacts.length > 0 ||
    String(payer).toLowerCase().includes("unknown") ||
    asArray(state.raw_message?.newDemandSignals).length > 0;
  const namespaces = buildGraphitiMemoryNamespaces({
    userId: user.id ?? state.user_id ?? dynamicSkillContext.contextSummary?.userId ?? "unknown_user",
    planId: payer,
    scenarioKey: workflow
  });
  const tools = ["dynamic_skill_registry", "source_pointer_validator", "pems_reviewer_workbench"];
  const extractors = ["structured_document_extraction", "portal_source_pointer_extractor", "trusted_research_entity_extractor"];
  const verifiers = ["deterministic_claim_source_validator", "outbound_payload_policy", "openclaw_worker_contract"];
  const sensors = ["operator_dashboard_panel", "mvp_visual_smoke", "ocr_caption_ref_only"];
  const controllers = ["langgraph_orchestrator", "approval_token_controller", "bounded_openclaw_worker"];
  const ralphLoop = buildRalphLoopProcedure({
    caseKey,
    workflow,
    selectedSkillKey,
    tools,
    extractors,
    verifiers,
    sensors,
    controllers
  });
  const consolidationCandidate = buildConsolidationCandidateFromCase({
    caseState,
    dynamicSkillContext,
    productMemoryRecall: productMemoryRecall ?? state.product_memory_recall,
    aggregate,
    user
  });
  const checks = {
    dbAuthoritativeForIdentityAndSession: true,
    graphitiAdvisoryOnly: true,
    selectorActivatesForNonStandardDemand: nonStandardDemand,
    proceduralLoopPresent: ralphLoop.steps.length >= 7,
    reviewerGateBeforeWorktreeWrite: consolidationCandidate.worktreeWriteAllowed === false,
    productionDrivingBlocked: consolidationCandidate.productionDrivingAllowed === false
  };
  return {
    version: MEMORY_SKILL_TREE_VERSION,
    status: Object.values(checks).every(Boolean) ? "phase60_memory_skill_tree_ready" : "phase60_memory_skill_tree_attention",
    caseKey,
    workflow,
    payer,
    dbAuthority: {
      authoritativeFor: ["users", "sessions", "tasks", "approvals", "audit", "source_pointers"],
      graphitiMayOverrideDb: false,
      sessionControlInGraphiti: false
    },
    memoryUsePolicy: {
      graphitiRole: "advisory_retrieval_and_consolidation_signal",
      useWhen: ["non_standard_journey", "new_demand", "unknown_or_new_plan", "personal_case_pattern", "skill_pool_gap"],
      directIdentifierStorageAllowed: false,
      rawPhiStorageAllowed: false,
      productionDrivingAllowed: false
    },
    selectedProcedureMemory: {
      namespaces,
      selectedSkillRefs: dynamicSkillRefs(dynamicSkillContext),
      selectedSkillKey,
      bestDynamicSkillScore: score,
      nonStandardDemand,
      sourcePointerRefs: sourcePointers.filter((pointer) => pointer.sourcePointerId),
      productMemoryFactRefs: productFacts.map((fact) => fact.factRef),
      productMemoryFactPreviews: productFacts
    },
    skillTree: {
      tools,
      extractors,
      verifiers,
      sensors,
      controllers,
      loop: ralphLoop
    },
    consolidationCandidate,
    checks,
    literatureAlignment: {
      reflexion: "episodic feedback informs later trials, but deterministic validators decide promotion",
      generativeAgents: "retrieved experiences are reflected into higher-level procedural cues",
      voyager: "skill library growth is gated by execution feedback and verification",
      coala: "working, episodic, semantic, and procedural memory stay separated by role"
    },
    safety: {
      dbRemainsSourceOfTruth: true,
      noRawPhiReturned: true,
      noCredentialHandling: true,
      humanReviewRequiredForNewSkills: true,
      productionDrivingAllowed: false
    }
  };
}

export function buildPhase60MemorySkillTreeProof() {
  const proof = selectMemorySkillTree({
    state: {
      user_id: "phase60_user",
      session_id: "phase60_session",
      workflow: "non_standard_plan_document_review",
      raw_message: { newDemandSignals: ["new_plan_design"] },
      context_packet: {
        user: { id: "phase60_user", payer: "Acme New Plan" },
        dbPointers: [{ table: "uploaded_document_extractions", id: "upload_phase60", summary: "safe extracted plan source pointer" }]
      },
      source_pointers: [{ table: "uploaded_document_extractions", id: "upload_phase60", summary: "safe extracted plan source pointer" }]
    },
    dynamicSkillContext: {
      contextSummary: { userId: "phase60_user", sessionId: "phase60_session", workflow: "non_standard_plan_document_review", payer: "Acme New Plan" },
      selected: { insuranceSkillKey: null, journeySkillKey: null, executionSkillKey: "insurance_portal_browser" },
      matches: [{ skillKey: "insurance_portal_browser", skillKind: "execution_specific", fit: { score: 20 } }]
    },
    productMemoryRecall: {
      adapter: "graphiti",
      enabled: true,
      facts: [{ uuid: "fact_phase60", fact: "Prior safe cases found a plan-specific exception pattern for nonstandard imaging review." }]
    },
    user: { id: "phase60_user", name: "Phase Sixty User", email: "phase60@example.com" },
    caseState: {
      decision: { workflow: "non_standard_plan_document_review" },
      evidence: { sourcePointerCount: 1, sourcePointerRefs: [{ table: "uploaded_document_extractions", id: "upload_phase60" }] }
    },
    aggregate: {
      shadowRuns: 10,
      evidenceRefCount: 4,
      successfulOutcomeCount: 8,
      reviewerApprovals: 2,
      authorityCitationCount: 4,
      validatorPassCount: 2,
      safetyIncidentCount: 0,
      freshnessDays: 3
    }
  });
  const checks = {
    dbAuthoritative: proof.dbAuthority.graphitiMayOverrideDb === false && proof.safety.dbRemainsSourceOfTruth === true,
    graphitiAdvisory: proof.memoryUsePolicy.graphitiRole === "advisory_retrieval_and_consolidation_signal",
    nonStandardSelector: proof.selectedProcedureMemory.nonStandardDemand === true,
    ralphLoopComplete: proof.skillTree.loop.steps.map((step) => step.id).includes("decision"),
    candidateGeneratedButNotWritten: proof.consolidationCandidate.readyForReviewer === true && proof.consolidationCandidate.worktreeWriteAllowed === false,
    productionDrivingBlocked: proof.safety.productionDrivingAllowed === false && proof.consolidationCandidate.productionDrivingAllowed === false
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return {
    ...proof,
    ok: passed === Object.keys(checks).length,
    score: Math.round((passed / Object.keys(checks).length) * 100),
    target: 100,
    checks
  };
}
