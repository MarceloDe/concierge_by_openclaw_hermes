import { AsyncLocalStorage } from "node:async_hooks";
import { createLangfuseTrace } from "./langfuseClient.mjs";
import { classifyFailureClass, FAILURE_CLASSES } from "./failures.mjs";
import { redact_payload, safe_metadata, safeSummaryFromPayload } from "./redaction.mjs";

export const CHECKPOINTS_VERSION = "2026-06-27.langfuse-checkpoints.v1";

// Carries the active root trace identity across async boundaries so that deeply
// nested checkpoints (e.g. model.* spans created inside LangGraph nodes) attach
// to the same Langfuse trace as agent.run instead of spawning orphan root traces.
const traceContextStorage = new AsyncLocalStorage();

export function getActiveTraceContext() {
  return traceContextStorage.getStore() ?? null;
}

export function runWithTraceContext(traceContext, fn) {
  if (!traceContext?.traceId) return fn();
  return traceContextStorage.run(traceContext, fn);
}

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

function checkpointMetadata(name, kind, metadata = {}, startedAt = null) {
  return safe_metadata({
    ...metadata,
    checkpoint_name: name,
    checkpoint_kind: kind,
    status: metadata.status ?? "running",
    latency_ms: startedAt ? nowMs() - startedAt : metadata.latency_ms,
    retry_count: metadata.retry_count ?? 0
  });
}

export async function start_checkpoint(name, kind = "span", metadata = {}, input = null) {
  const startedAt = nowMs();
  const ambient = getActiveTraceContext();
  const traceId = metadata.trace_id ?? metadata.traceId ?? metadata.graph_trace_id ?? ambient?.traceId ?? null;
  const trace = await createLangfuseTrace({
    traceId,
    name: metadata.root_trace_name ?? "brainstyworkers.agentic_runtime",
    metadata,
    input: redact_payload(input),
    userId: metadata.user_hash ?? ambient?.userId ?? null,
    sessionId: metadata.session_id ?? ambient?.sessionId ?? null
  });
  const span = trace?.span
    ? trace.span({
        name,
        input: redact_payload(input),
        metadata: checkpointMetadata(name, kind, metadata, startedAt)
      })
    : null;
  return {
    name,
    kind,
    traceId,
    startedAt,
    span,
    end_checkpoint(output = null, moreMetadata = {}) {
      const meta = checkpointMetadata(name, kind, { ...metadata, ...moreMetadata, status: "ok" }, startedAt);
      span?.end?.({
        output: redact_payload(output),
        metadata: {
          ...meta,
          output_summary: moreMetadata.output_summary ?? safeSummaryFromPayload(output, "output")
        }
      });
      return { checkpoint_name: name, checkpoint_kind: kind, status: "ok", latency_ms: meta.latency_ms };
    },
    fail_checkpoint(error, failureClass = null, moreMetadata = {}) {
      const resolvedFailure = failureClass ?? classifyFailureClass(error, FAILURE_CLASSES.UNKNOWN_ERROR);
      const meta = checkpointMetadata(name, kind, { ...metadata, ...moreMetadata, status: "failed", failure_class: resolvedFailure }, startedAt);
      span?.end?.({
        output: {
          error: error?.message ? String(error.message).slice(0, 280) : "unknown_error",
          failure_class: resolvedFailure
        },
        metadata: meta,
        level: "ERROR"
      });
      return { checkpoint_name: name, checkpoint_kind: kind, status: "failed", failure_class: resolvedFailure, latency_ms: meta.latency_ms };
    }
  };
}

export async function withCheckpoint(name, { kind = "span", metadata = {}, input = null, outputSummary = null, failureClass = null } = {}, fn) {
  const checkpoint = await start_checkpoint(name, kind, metadata, input);
  try {
    const output = await fn(checkpoint);
    checkpoint.end_checkpoint(output, { output_summary: outputSummary ?? safeSummaryFromPayload(output, "output") });
    return output;
  } catch (error) {
    checkpoint.fail_checkpoint(error, failureClass);
    throw error;
  }
}

export function summarizeNodeOutput(output = {}) {
  if (!output || typeof output !== "object") return safeSummaryFromPayload(output, "node_output");
  return {
    keys: Object.keys(output).slice(0, 20),
    workflow: output.workflow ?? null,
    route: output.workflow_route?.workflowKey ?? output.route ?? null,
    status: output.evidence_observation?.status ?? output.openclaw_task_proposal?.status ?? output.approval_resume?.status ?? null,
    sourcePointerCount: output.source_pointers?.length ?? null,
    toolCallCount: output.tool_calls?.length ?? null,
    workerContinuationStatus: output.worker_continuation?.status ?? null
  };
}

// Full-state trace toggle: ON by default in dev (so every node shows its complete hydrated
// context), OFF in production unless forced. Mirrors traceFullPromptsEnabled in modelTierPolicy.
export function fullStateTraceEnabled(env = process.env) {
  const flag = String(env.BRAINSTY_TRACE_FULL_PROMPTS ?? "");
  if (flag === "1") return true;
  if (flag === "0") return false;
  const runtimeEnv = String(env.BRAINSTY_RUNTIME_ENV ?? env.NODE_ENV ?? env.APP_ENV ?? "").toLowerCase();
  return !["production", "prod", "staging", "production-candidate"].includes(runtimeEnv);
}

// The complete orchestration state a node received: every context-injection channel + every
// decision/evidence field, so Langfuse shows the full state evolution turn-by-turn, node-by-node
// (the basis for finding latency + quality levers). redact_payload masks PHI downstream.
export function fullOrchestrationStateSnapshot(state = {}) {
  const ctx = state.context_packet || {};
  const trim = (arr, n = 12) => (Array.isArray(arr) ? arr.slice(0, n) : arr);
  return {
    user_input: state.user_input,
    intent: state.intent,
    messages: trim((state.messages || []).map((m) => ({ role: m?.role, content: m?.content })), 20),
    conversation_history: trim(state.conversation_history, 12),
    policy_result: state.policy_result,
    structured_intent: state.structured_intent,
    llm_orchestration_decision: state.llm_orchestration_decision,
    workflow: state.workflow,
    workflow_route: state.workflow_route,
    route_reason: state.route_reason,
    offerable_processes: trim(state.offerable_processes, 12),
    hydrated_capabilities: state.hydrated_capabilities,
    capability_offer: state.capability_offer,
    checkpoint_resume_plan: state.checkpoint_resume_plan,
    context_packet: {
      runtimeContext: ctx.runtimeContext,
      capabilityPortfolio: ctx.capabilityPortfolio
        ? { ...ctx.capabilityPortfolio, promptTable: trim(ctx.capabilityPortfolio.promptTable, 20) }
        : null,
      llmOutputIndex: ctx.llmOutputIndex,
      runtimeVectorIndex: ctx.runtimeVectorIndex,
      workflowArchitecture: ctx.workflowArchitecture
        ? { routeCandidates: trim(ctx.workflowArchitecture.routeCandidates, 10), readiness: trim(ctx.workflowArchitecture.readiness, 10) }
        : null,
      memorySkillTree: ctx.memorySkillTree
    },
    product_memory_recall: state.product_memory_recall,
    dynamic_skill_context: state.dynamic_skill_context,
    evidence_observation: state.evidence_observation,
    source_pointers: trim(state.source_pointers, 12),
    answer_claims: trim(state.answer_claims, 12),
    final_response: state.final_response,
    workflow_outcome: state.workflow_outcome
  };
}

export function observedLangGraphNode(nodeName, checkpointKind, fn, metadataBuilder = null) {
  return async function observedNode(state) {
    const metadata = {
      trace_id: state.graph_trace_id,
      session_id: state.session_id,
      workflow: state.workflow,
      route: state.workflow_route?.workflowKey ?? state.workflow,
      node_name: nodeName,
      checkpoint_name: nodeName,
      checkpoint_kind: checkpointKind,
      safety_mode: "deterministic_rails_llm_planner",
      openclaw_enabled: Boolean(state.openclaw_envelope || state.raw_message?.useOfficialOpenClawWorker)
    };
    const extra = metadataBuilder ? metadataBuilder(state) : {};
    // Full-state mode (dev default-on): capture the COMPLETE hydrated orchestration state the node
    // received, so every node span in Langfuse shows the full context + decisions (find perf/quality
    // levers). Production stays lean with the lightweight summary.
    const fullState = fullStateTraceEnabled();
    const spanInput = fullState
      ? { full_state: fullOrchestrationStateSnapshot(state) }
      : {
          workflow: state.workflow,
          routeReason: state.route_reason,
          sourcePointerCount: state.source_pointers?.length ?? 0,
          hasApprovalToken: Boolean(state.raw_message?.approvalToken),
          hasWorkerContinuation: Boolean(state.raw_message?.workerContinuationId)
        };
    return withCheckpoint(
      nodeName,
      {
        kind: checkpointKind,
        metadata: { ...metadata, ...extra, full_state_trace: fullState },
        input: spanInput
      },
      async () => fn(state)
    );
  };
}

export const startCheckpoint = start_checkpoint;
