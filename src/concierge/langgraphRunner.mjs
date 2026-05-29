import { Annotation, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { audit } from "./audit.mjs";
import { consumeReadOnlyObservationApproval } from "./approvalResume.mjs";
import { persistClaimedChromeSnapshot, runPortalExtraction } from "./browserAutomation.mjs";
import { classifyIntent } from "./classifier.mjs";
import { createId, nowIso } from "./database.mjs";
import { buildContextPacket, retainMemoryFromSession } from "./memoryHarness.mjs";
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
import { checkpointSession } from "./sessionManager.mjs";
import { classifyHealthcareIntent } from "./structuredIntentClassifier.mjs";
import { WORKFLOWS } from "./types.mjs";
import { selectModelPayload } from "./modelPayloadPolicy.mjs";
import { loadOpenClawSkillArtifact } from "./openclawSkillArtifacts.mjs";
import { recordOpenClawSkillInvocationProposal, validateOpenClawEnvelopeAgainstSkill } from "./openclawSkillInvocation.mjs";
import { runOfficialOpenClawReadOnlyObservation } from "./openclawOfficialRuntime.mjs";
import { buildLangGraphOpenClawWorkerPlan } from "./openclawWorkerContract.mjs";
import { recallProductMemoryForRequest, retainProductMemoryFromGraphRun } from "./productMemory.mjs";
import {
  buildLlmOrchestrationDecisionMessages,
  normalizeLlmOrchestrationDecision,
  shouldUseLlmDecision
} from "./llmOrchestrationDecision.mjs";
import { publishRuntimeEvent } from "./runtimeEvents.mjs";
import {
  consumeWorkerContinuationForApprovedDispatch,
  finalizeWorkerContinuationDispatch,
  validateWorkerContinuationForDispatch
} from "./workerContinuations.mjs";

export const LANGGRAPH_RUNNER_VERSION = "2026-05-17.langgraph-runner.v1";

const checkpointer = new MemorySaver();
const activeStores = new Map();

function field(defaultValue = null) {
  return Annotation({
    reducer: (_, value) => value,
    default: () => defaultValue
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
  runtime_bundle: field(null),
  memory_context: field(""),
  product_memory_recall: field(null),
  product_memory_retain: field(null),
  policy_result: field(null),
  intent: field(null),
  structured_intent: field(null),
  llm_orchestration_decision: field(null),
  workflow: field(null),
  workflow_route: field(null),
  route_reason: field(null),
  openclaw_envelope: field(null),
  openclaw_skill_validation: field(null),
  openclaw_worker_plan: field(null),
  openclaw_skill_proposal: field(null),
  worker_continuation: field(null),
  approval_resume: field(null),
  evidence_observation: field(null),
  browser_result: field(null),
  eligibility_result: field(null),
  portal_scan: field(null),
  source_pointers: field([]),
  tool_calls: field([]),
  tool_results: field([]),
  model_invocation: field(null),
  final_response: field(null),
  should_remember: field(false),
  memory_summary: field(null),
  memory_type: field(null),
  workflow_outcome: field(null),
  safety: field({}),
  proof: field([])
});

function appendProof(state, step, details = {}) {
  return [...(state.proof ?? []), { step, at: nowIso(), ...details }];
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

function sourcePointersFromObservation({ browserResult = null, eligibility = null, portalScan = null }) {
  const pointers = [];
  const eligibilityPointer = pointerFromEligibility(eligibility);
  if (eligibilityPointer) pointers.push(eligibilityPointer);
  pointers.push(...coverageBalancePointersFromEligibility(eligibility));
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

function evidenceChannelsFromBrowserResult(browserResult = null) {
  if (!browserResult?.extraction) return [];
  const channels = [];
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

function shouldObserveEvidence(state) {
  const raw = state.raw_message ?? {};
  return Boolean(
      raw.executeEvidenceObservation === true ||
      raw.useOfficialOpenClawWorker === true ||
      raw.workerContinuationId ||
      raw.browserSnapshot ||
      raw.remoteDebuggerUrl ||
      raw.portalPageSnapshots?.length
  );
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
      checks: policyResult.checks
    },
    proof: appendProof(state, "input_policy", { intent, allowed: policyResult.allowed })
  };
}

async function recallContextNode(state) {
  const packet = state.context_packet;
  const bundle = buildRuntimeCompatibilityBundle(packet, {
    source: "langgraph_runner",
    requestedAt: nowIso()
  });
  return {
    runtime_bundle: bundle,
    memory_context: [
      bundle.langgraph.state.memory_context,
      ...(state.product_memory_recall?.facts ?? []).map((item) => `Graphiti memory fact: ${item.fact ?? item.name ?? item.uuid}`)
    ]
      .filter(Boolean)
      .join("\n"),
    proof: appendProof(state, "memory_recall_context", {
      contextPacketVersion: packet?.schemaVersion,
      memoryItemCount: packet?.memoryItems?.length ?? 0,
      routeCandidateCount: packet?.workflowArchitecture?.routeCandidates?.length ?? 0,
      productMemoryAdapter: state.product_memory_recall?.adapter ?? "disabled",
      productMemoryFactCount: state.product_memory_recall?.facts?.length ?? 0
    })
  };
}

async function structuredIntentNode(state) {
  const structuredIntent = classifyHealthcareIntent({
    message: state.user_input,
    policyResult: state.policy_result,
    contextPacket: state.context_packet
  });
  return {
    structured_intent: structuredIntent,
    proof: appendProof(state, "structured_intent_classifier", {
      classifier: structuredIntent.classifier,
      intent: structuredIntent.intent,
      workflow: structuredIntent.workflow,
      confidence: structuredIntent.confidence,
      refusalOrEscalationFlag: structuredIntent.refusalOrEscalationFlag,
      missingEvidence: structuredIntent.missingEvidence
    })
  };
}

async function llmOrchestrationDecisionNode(state) {
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
        issues: decision.issues
      })
    };
  }

  const useLiveModel = Boolean(state.raw_message?.useLiveModel);
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";
  const baseURL = process.env.BRAINSTY_OPENAI_BASE_URL || "https://api.openai.com/v1";
  if (!useLiveModel) {
    return {
      llm_orchestration_decision: {
        mode: "not_requested",
        provider: "openai",
        model,
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
    return {
      llm_orchestration_decision: {
        mode: "skipped_missing_openai_api_key",
        provider: "openai",
        model,
        valid: false,
        usedByRouter: false,
        workflow: state.structured_intent?.workflow ?? null,
        confidence: 0,
        rationale: "OPENAI_API_KEY is not configured, so LangGraph fell back to the curated classifier.",
        issues: ["missing_openai_api_key"],
        warnings: []
      },
      proof: appendProof(state, "llm_orchestration_decision", { mode: "skipped_missing_openai_api_key" })
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
    const llm = new ChatOpenAI({
      model,
      timeout: 60000,
      maxRetries: 1,
      configuration: { baseURL }
    });
    const response = await llm.invoke(messages);
    const decision = normalizeLlmOrchestrationDecision(response.content, {
      mode: "openai_chatopenai_invoked",
      provider: "openai",
      model,
      fallbackWorkflow: state.structured_intent?.workflow
    });
    return {
      llm_orchestration_decision: {
        ...decision,
        baseURL,
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
  const refusal = refusalForIntent(state.intent);
  if (refusal) {
    return {
      workflow: state.intent,
      workflow_route: null,
      route_reason: "blocked_by_input_policy",
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
      classifierConfidence: state.structured_intent?.confidence ?? null,
      llmConfidence: state.llm_orchestration_decision?.confidence ?? null,
      executableNow: Boolean(route?.executableNow)
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
  const skillArtifact = await loadOpenClawSkillArtifact("insurance_portal_browser");
  const validation = validateOpenClawEnvelopeAgainstSkill(envelope, skillArtifact, {
    workflowKey: state.workflow
  });
  const workerPlan = buildLangGraphOpenClawWorkerPlan(envelope, validation);
  const toolCall = {
    tool: "openclaw_channel_envelope",
    status: "prepared_not_executed",
    workflow: state.workflow,
    approvalPolicy: envelope.approval_policy,
    skillKey: validation.skillKey,
    executionMode: validation.executionMode,
    workerPlanId: workerPlan.planId,
    workerJobIds: workerPlan.workerJobs.map((job) => job.jobId)
  };
  return {
    openclaw_envelope: envelope,
    openclaw_skill_validation: validation,
    openclaw_worker_plan: workerPlan,
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
  if (!shouldObserveEvidence(state)) {
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

  const user = userFromContext(state.context_packet);
  const portal = portalFromContext(state.context_packet);
  const session = sessionFromState(state);
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

  const store = activeStores.get(state.session_id);
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

  let workerContinuationValidation = null;
  if (state.raw_message?.workerContinuationId) {
    const taskId = state.raw_message?.approvalTaskId ?? state.raw_message?.taskId;
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
    taskId: state.raw_message?.approvalTaskId ?? state.raw_message?.taskId,
    sessionId: state.session_id,
    userId: state.user_id,
    workflow: state.workflow
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
      taskId: state.raw_message?.approvalTaskId ?? state.raw_message?.taskId ?? null,
      approvalGateId: approvalResume.approvalGateId ?? null,
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
      targetUrl: state.raw_message?.officialOpenClawTargetUrl ?? state.raw_message?.portalUrl ?? portal.portal_url,
      approval: approvalResume
    });
    const actionsTaken = browserResult.actionsTaken ?? [];
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

    const verification = verifyAuthenticatedPortalEvidence({ page: browserResult.page, portal });
    if (!verification.valid) {
      const blocked = await recordBlockedPortalEvidence(store, {
        session,
        portal,
        browserRunId: browserResult.browserRunId,
        page: browserResult.page,
        verification,
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
          verification,
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

    const artifact = await recordVerifiedPortalSourcePointer(store, {
      session,
      browserRunId: browserResult.browserRunId,
      verification
    });
    const eligibility = await persistEligibilitySnapshot(store, { user, session, portal, browserResult });
    const sourcePointers = sourcePointersFromObservation({ browserResult, eligibility });
    const structuredBenefits = structuredBenefitRowsFromEligibility(eligibility);
    const evidenceChannels = evidenceChannelsFromBrowserResult(browserResult);
    sourcePointers.push({
      table: "extraction_artifacts",
      id: artifact.id,
      sourceUrl: verification.sourcePointer.url,
      summary: `${verification.sourcePointer.pageKind} verified official OpenClaw live portal source pointer`,
      createdAt: artifact.created_at,
      domHash: verification.sourcePointer.domHash,
      extractionHash: verification.sourcePointer.extractionHash,
      evidenceFields: verification.sourcePointer.evidenceFields
    });
    const completedActions = [
      ...actionsTaken,
      "verify_authenticated_member_portal",
      "record_verified_source_pointer",
      "persist_eligibility_snapshot"
    ];
    const finalizedContinuation = await finalizeContinuation({
      resultStatus: "captured_official_openclaw_read_only_observation",
      terminalOutcome: "completed_with_sourced_result",
      browserRunId: browserResult.browserRunId ?? null,
      sourcePointerCount: sourcePointers.length,
      structuredBenefitCount: structuredBenefits.length,
      actionsTaken: completedActions
    });
    await publishGraphRuntimeEvent(store, state, {
      eventType: "worker.status.updated",
      session,
      user,
      payload: {
        status: "completed_with_sourced_result",
        terminalOutcome: "completed_with_sourced_result",
        workflow: state.workflow,
        runtime: "official_openclaw",
        browserRunId: browserResult.browserRunId ?? null,
        sourcePointerCount: sourcePointers.length,
        structuredBenefitCount: structuredBenefits.length,
        evidenceChannels,
        actionsTaken: completedActions
      }
    });
    return {
      worker_continuation: finalizedContinuation ?? workerContinuationDispatch,
      evidence_observation: {
        status: "captured_official_openclaw_read_only_observation",
        actionsTaken: completedActions,
        approval: approvalResume,
        livePortalProof: "verified",
        sourcePointers,
        structuredBenefits,
        evidenceChannels,
        verification,
        officialOpenClaw: browserResult.officialOpenClaw,
        workerContinuation: finalizedContinuation?.continuation ?? workerContinuationDispatch?.continuation ?? null
      },
      approval_resume: approvalResume,
      browser_result: browserResult,
      eligibility_result: eligibility,
      source_pointers: sourcePointers,
      proof: appendProof(state, "evidence_observation", {
        status: "captured_official_openclaw_read_only_observation",
        runtime: "official_openclaw",
        sourcePointerCount: sourcePointers.length,
        structuredBenefitCount: structuredBenefits.length,
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
        structuredBenefits
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
      evidenceChannels
    },
    approval_resume: approvalResume,
    browser_result: browserResult,
    eligibility_result: eligibility,
    source_pointers: sourcePointers,
    proof: appendProof(state, "evidence_observation", {
      status: "captured_visible_page",
      sourcePointerCount: sourcePointers.length,
      structuredBenefitCount: structuredBenefits.length
    })
  };
}

async function composeResponseNode(state) {
  if (state.final_response) {
    return {
      proof: appendProof(state, "response_policy", { reusedPolicyResponse: true })
    };
  }
  const user = userFromContext(state.context_packet);
  const portal = portalFromContext(state.context_packet);
  if (
    ["captured_visible_page", "captured_official_openclaw_read_only_observation"].includes(state.evidence_observation?.status) &&
    user &&
    portal &&
    state.browser_result
  ) {
    const finalResponse = composeResponse({
      user,
      portal,
      policyResult: state.policy_result,
      intent: state.intent,
      browserResult: state.browser_result,
      eligibility: state.eligibility_result
    });
    return {
      final_response: [
        finalResponse,
        `Source pointers: ${state.source_pointers.map((item) => `${item.table}/${item.id}`).join(", ")}.`,
        state.evidence_observation?.status === "captured_official_openclaw_read_only_observation"
          ? "The approved read-only observation was executed by the dedicated official OpenClaw profile and verified by LangGraph before evidence was retained."
          : null,
        "This answer was composed inside the LangGraph product runtime."
      ]
        .filter(Boolean)
        .join("\n\n"),
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
    const finalResponse = [
      `LangGraph routed this request to ${state.workflow} and captured ${state.portal_scan?.pageRows?.length ?? 0} read-only portal page snapshot(s).`,
      `Source pointers: ${state.source_pointers.map((item) => `${item.table}/${item.id}`).join(", ")}.`,
      `The OpenClaw task envelope was prepared, validated as ${state.openclaw_skill_validation?.status ?? "not_validated"}, and not executed in this slice.`,
      "No payer API, external message, credential entry, medical advice, or irreversible portal action was performed.",
      "This answer was composed inside the LangGraph product runtime."
    ].join("\n\n");
    return {
      final_response: finalResponse,
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
  const routeSummary = summarizeRoute(state.workflow_route);
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

async function maybeModelNode(state) {
  const useLiveModel = Boolean(state.raw_message?.useLiveModel);
  if (!useLiveModel) {
    return {
      model_invocation: {
        mode: "not_requested",
        provider: "openai",
        model: process.env.OPENAI_MODEL || "gpt-5-mini"
      },
      proof: appendProof(state, "model_invocation", { mode: "not_requested" })
    };
  }
  if (!process.env.OPENAI_API_KEY) {
    return {
      model_invocation: {
        mode: "skipped_missing_openai_api_key",
        provider: "openai",
        model: process.env.OPENAI_MODEL || "gpt-5-mini"
      },
      proof: appendProof(state, "model_invocation", { mode: "skipped_missing_openai_api_key" })
    };
  }
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";
  const baseURL = process.env.BRAINSTY_OPENAI_BASE_URL || "https://api.openai.com/v1";
  const payloadSelection = selectModelPayload(state, {
    payloadMode: state.raw_message?.payloadMode ?? "phi_allowed_identifier_masked_reasoning"
  });
  const llm = new ChatOpenAI({
    model,
    timeout: 60000,
    maxRetries: 1,
    configuration: { baseURL }
  });
  const messages = [
    {
      role: "system",
      content:
        "You are Brainstyworkers' healthcare insurance reasoning model inside a LangGraph-orchestrated system. The patient-approved product scope allows insurance, portal, and clinical context in this external LLM call. Use it only for insurance navigation reasoning. Keep patient name, SSN, email, member ID, subscriber ID, and subscription number masked as database pointers. Evaluate workflow routing, decision points, approval gates, and OpenClaw worker job contracts, but do not claim external action was performed. LangGraph is the workflow master; OpenClaw workers may only execute assigned jobs after approval. Do not provide diagnosis, treatment, dosage, or clinical care decisions."
    },
    {
      role: "user",
      content: JSON.stringify(payloadSelection.payload)
    }
  ];
  const store = activeStores.get(state.session_id);
  const payloadObservation = store
    ? await recordOutboundPayloadObservation(store, {
        sessionId: state.session_id,
        payload: {
          model,
          baseURL,
          messages
        },
        payloadType: "openai_chat_messages",
        destination: "openai",
        policyMode: payloadSelection.mode,
        user: userFromContext(state.context_packet)
      })
    : null;
  const response = await llm.invoke(messages);
  return {
    model_invocation: {
      mode: "openai_chatopenai_invoked",
      provider: "openai",
      model,
      baseURL,
      payloadMode: payloadSelection.mode,
      externalPhiDisclosureAllowed: payloadSelection.mode === "phi_allowed_identifier_masked_reasoning",
      outboundPayloadObservation: payloadObservation
        ? {
            eventType: "outbound_payload_observed",
            payloadHash: payloadObservation.payloadHash,
            containsPortalText: payloadObservation.containsPortalText,
            containsDirectIdentifier: payloadObservation.containsDirectIdentifier,
            containsSourcePointers: payloadObservation.containsSourcePointers,
            enforcementMode: payloadObservation.enforcementMode
          }
        : null,
      response: response.content
    },
    proof: appendProof(state, "model_invocation", {
      mode: "openai_chatopenai_invoked",
      model,
      baseURL,
      payloadMode: payloadSelection.mode
    })
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
        episodeUuid: productMemoryRetain?.episodeUuid ?? null
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
    .addNode("input_policy", inputPolicyNode)
    .addNode("recall_context", recallContextNode)
    .addNode("classify_intent", structuredIntentNode)
    .addNode("llm_decision", llmOrchestrationDecisionNode)
    .addNode("workflow_router", workflowRouterNode)
    .addNode("workflow_executor", workflowExecutorNode)
    .addNode("observe_evidence", evidenceObservationNode)
    .addNode("compose_response", composeResponseNode)
    .addNode("maybe_model", maybeModelNode)
    .addEdge(START, "input_policy")
    .addEdge("input_policy", "recall_context")
    .addEdge("recall_context", "classify_intent")
    .addEdge("classify_intent", "llm_decision")
    .addEdge("llm_decision", "workflow_router")
    .addEdge("workflow_router", "workflow_executor")
    .addEdge("workflow_executor", "observe_evidence")
    .addEdge("observe_evidence", "compose_response")
    .addEdge("compose_response", "maybe_model")
    .addEdge("maybe_model", END)
    .compile({ checkpointer });
}

const graph = createBrainstyLangGraph();

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
  const initialState = {
    schema_version: LANGGRAPH_RUNNER_VERSION,
    user_id: user.id,
    session_id: session.id,
    graph_trace_id: graphTraceId,
    channel,
    user_input: userInput,
    raw_message: rawMessage,
    context_packet: context.packet,
    runtime_bundle: null,
    memory_context: "",
    product_memory_recall: productMemoryRecall,
    product_memory_retain: null,
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
    openclaw_skill_proposal: null,
    worker_continuation: null,
    approval_resume: null,
    evidence_observation: null,
    browser_result: null,
    eligibility_result: null,
    portal_scan: null,
    source_pointers: [],
    tool_calls: [],
    tool_results: [],
    model_invocation: null,
    final_response: null,
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
      checkpoint_ns: "brainstyworkers",
      user_id: user.id,
      session_id: session.id
    },
    context: {
      userId: user.id,
      sessionId: session.id
    }
  };
  activeStores.set(session.id, store);
  let state;
  try {
    state = await graph.invoke(initialState, config);
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
      workerPlan: state.openclaw_worker_plan
    });
    state.openclaw_skill_proposal = proposal;
    state.proof = appendProof(state, "openclaw_skill_invocation_proposal", {
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
    openclawSkillProposalTaskId: state.openclaw_skill_proposal?.task?.id ?? null,
    modelInvocationMode: state.model_invocation?.mode
  });
  await checkpointSession(store, {
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
        openclawSkillProposalTaskId: state.openclaw_skill_proposal?.task?.id ?? null,
        modelInvocationMode: state.model_invocation?.mode
      }
    },
    metadata: {
      source: "live_langgraph_runtime",
      package: "@langchain/langgraph"
    }
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
  state.proof = appendProof(state, "product_memory_retain", {
    adapter: productMemoryRetain.adapter,
    enabled: productMemoryRetain.enabled,
    retained: productMemoryRetain.retained,
    episodeUuid: productMemoryRetain.episodeUuid ?? null,
    error: productMemoryRetain.error ?? null
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
