import { maskDirectIdentifiers } from "./modelPayloadPolicy.mjs";

export const LLM_ORCHESTRATION_DECISION_VERSION = "2026-05-28.llm-orchestration-decision.v1";

export const LLM_DECISION_WORKFLOWS = Object.freeze([
  "eligibility_benefits_navigation",
  "claim_status_navigation",
  "pharmacy_formulary",
  "prior_authorization_navigation",
  "denial_appeal_preparation",
  "payer_portal_read_only_extraction",
  "document_or_trace_review",
  "human_approval_escalation"
]);

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
  return {
    contractVersion: LLM_ORCHESTRATION_DECISION_VERSION,
    purpose:
      "Choose the healthcare insurance workflow and worker strategy for LangGraph. Deterministic safety gates already ran first.",
    userInput: maskDirectIdentifiers(state.user_input, state),
    deterministicPolicy: {
      allowed: state.policy_result?.allowed ?? null,
      approvalRequired: state.policy_result?.approvalRequired ?? null,
      failedChecks: (state.policy_result?.checks ?? []).filter((check) => !check.passed).map((check) => check.name)
    },
    curatedClassifier: state.structured_intent,
    routeCandidates: routeCandidatesFrom(state),
    sourcePointers: sourcePointerHints(state),
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
    openclawCapabilityPolicy: {
      workerMayChooseWorkflow: false,
      workerMayCreateSubtasks: true,
      workerMayRunTaskScopedSubagents: true,
      workerMayChooseToolPathWithinAssignedTask: true,
      workerMustReportEverySeconds: 30,
      workerMayEnterCredentials: false,
      workerMaySubmitForms: false,
      workerMayContactPayer: false
    },
    expectedJsonShape: {
      workflow: "one of the allowed workflow keys",
      intent: "short snake_case intent",
      confidence: "number from 0 to 1",
      rationale: "short reason based on user message, memory, and available evidence",
      requiredEvidence: ["evidence names"],
      missingEvidence: ["missing evidence names"],
      approvalRequired: "boolean",
      approvalScope: "read_only_observation or specific action scope",
      workerGoal: "specific OpenClaw task goal inside the selected workflow",
      responseStrategy: "how LangGraph should explain the next step to the user",
      userFacingNextQuestion: "one concise question if more information is needed, otherwise empty string",
      selectedCapabilityPortfolioIds: ["portfolio IDs from capabilityPortfolio.promptTable"],
      selectedCapabilityPointers: ["cache pointers from capabilityPortfolio.promptTable"]
    }
  };
}

export function buildLlmOrchestrationDecisionMessages(state) {
  const payload = buildLlmOrchestrationDecisionPayload(state);
  return [
    {
      role: "system",
      content: [
        "You are the live GPT orchestration intelligence inside Brainstyworkers' LangGraph healthcare insurance concierge.",
        "Return strict JSON only. Do not include markdown.",
        "LangGraph is the healthcare workflow master. You advise LangGraph, and LangGraph will enforce safety, approval, worker, and memory rules.",
        `Allowed workflows: ${LLM_DECISION_WORKFLOWS.join(", ")}.`,
        "Never select a workflow outside that list.",
        "Never authorize credential entry, SSN entry, 2FA/passkey handling, payer contact, external messaging, form submission, payment, cancellation, record change, or medical advice.",
        "OpenClaw workers may be powerful inside the delegated read-only task, but they do not choose the healthcare workflow.",
        "If authenticated portal evidence is needed, ask for manual login/readiness and read-only approval rather than claiming evidence exists.",
        "If source pointers are absent, say what evidence is missing."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify(payload)
    }
  ];
}

export function normalizeLlmOrchestrationDecision(raw, options = {}) {
  const issues = [];
  const warnings = [];
  let parsed = null;
  try {
    parsed = parseJsonLike(raw);
  } catch (error) {
    return {
      contractVersion: LLM_ORCHESTRATION_DECISION_VERSION,
      mode: options.mode ?? "invalid_response",
      provider: options.provider ?? "openai",
      model: options.model ?? null,
      valid: false,
      usedByRouter: false,
      workflow: options.fallbackWorkflow ?? null,
      confidence: 0,
      intent: null,
      rationale: error.message,
      requiredEvidence: [],
      missingEvidence: [],
      approvalRequired: false,
      approvalScope: null,
      workerGoal: null,
      responseStrategy: null,
      userFacingNextQuestion: "",
      issues: [error.message],
      warnings,
      rawDecision: null
    };
  }

  const workflow = String(parsed.workflow ?? "").trim();
  if (!LLM_DECISION_WORKFLOWS.includes(workflow)) {
    issues.push(`workflow_not_allowed:${workflow || "empty"}`);
  }
  const confidence = clampConfidence(parsed.confidence);
  if (confidence < 0.5) warnings.push("low_confidence_llm_decision");
  if (!parsed.rationale) warnings.push("missing_rationale");
  if (!parsed.workerGoal) warnings.push("missing_worker_goal");

  return {
    contractVersion: LLM_ORCHESTRATION_DECISION_VERSION,
    mode: options.mode ?? "normalized_response",
    provider: options.provider ?? "openai",
    model: options.model ?? null,
    valid: issues.length === 0,
    usedByRouter: false,
    workflow: issues.length ? options.fallbackWorkflow ?? null : workflow,
    confidence,
    intent: parsed.intent ? String(parsed.intent) : null,
    rationale: compact(parsed.rationale, 800),
    requiredEvidence: asArray(parsed.requiredEvidence),
    missingEvidence: asArray(parsed.missingEvidence),
    approvalRequired: Boolean(parsed.approvalRequired),
    approvalScope: parsed.approvalScope ? String(parsed.approvalScope) : null,
    workerGoal: parsed.workerGoal ? compact(parsed.workerGoal, 1000) : null,
    responseStrategy: parsed.responseStrategy ? compact(parsed.responseStrategy, 1000) : null,
    userFacingNextQuestion: parsed.userFacingNextQuestion ? compact(parsed.userFacingNextQuestion, 500) : "",
    selectedCapabilityPortfolioIds: asArray(parsed.selectedCapabilityPortfolioIds),
    selectedCapabilityPointers: asArray(parsed.selectedCapabilityPointers),
    issues,
    warnings,
    rawDecision: parsed
  };
}

export function shouldUseLlmDecision(decision) {
  return Boolean(decision?.valid && decision.workflow && Number(decision.confidence ?? 0) >= 0.5);
}

export function confidenceBand(decision) {
  const confidence = clampConfidence(decision?.confidence);
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}
