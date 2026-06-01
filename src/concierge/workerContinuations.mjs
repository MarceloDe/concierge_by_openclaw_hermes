import { audit } from "./audit.mjs";
import { createId, nowIso } from "./database.mjs";
import {
  DOCUMENT_CANDIDATE_TASK_TYPE,
  READ_ONLY_DOCUMENT_ALLOWED_ACTION,
  READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
  approvalMetadataForDocumentCandidateTask
} from "./documentCandidateApproval.mjs";
import { OPENCLAW_PROPOSAL_TASK_TYPE } from "./openclawSkillInvocation.mjs";
import { publishRuntimeEvent } from "./runtimeEvents.mjs";

export const WORKER_CONTINUATIONS_VERSION = "2026-05-29.worker-continuations.v1";
export const READ_ONLY_CONTINUATION_SCOPE = "read_only_observation";
export const READ_ONLY_DOCUMENT_CONTINUATION_SCOPE = READ_ONLY_DOCUMENT_APPROVAL_SCOPE;
const ACTIVE_CONTINUATION_STATUSES = new Set(["pending_async_followup", "continue_requested"]);
const TERMINAL_CONTINUATION_STATUSES = new Set(["completed", "blocked", "cancelled", "expired"]);
const COMPLETED_TERMINAL_OUTCOMES = new Set(["completed_with_sourced_result", "partial_result_with_blockers"]);

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value ?? "{}");
  } catch {
    return fallback;
  }
}

function compactContinuation(row) {
  if (!row) return null;
  const metadata = parseJson(row.metadata_json);
  return {
    version: WORKER_CONTINUATIONS_VERSION,
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    taskId: row.task_id,
    scheduledJobId: row.scheduled_job_id ?? null,
    workflow: row.workflow_key ?? null,
    approvalScope: row.approval_scope,
    allowedAction: row.allowed_action,
    correlationId: row.correlation_id,
    status: row.status,
    terminalOutcome: row.terminal_outcome ?? null,
    lastRuntimeEventId: row.last_runtime_event_id ?? null,
    lastProgressEvent: parseJson(row.last_progress_event_json),
    nextCheckAt: row.next_check_at ?? null,
    expiresAt: row.expires_at ?? null,
    metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    actionsTaken: Array.isArray(metadata.actionsTaken) ? metadata.actionsTaken : []
  };
}

async function latestWorkerEvent(store, { sessionId, correlationId = null, taskId = null }) {
  const rows = await store.all(
    `SELECT * FROM runtime_events
     WHERE session_id = ${sql(sessionId)}
       AND event_type IN ('worker.status.updated', 'worker.plan.prepared', 'approval.consumed')
     ORDER BY created_at DESC
     LIMIT 20;`
  );
  return (
    rows.find((row) => row.correlation_id === correlationId || row.correlation_id === taskId) ??
    rows.find((row) => {
      const payload = parseJson(row.payload_json);
      return payload.taskId === taskId || payload.correlationId === correlationId;
    }) ??
    rows[0] ??
    null
  );
}

async function emitContinuationEvent(store, eventType, continuation, payload = {}) {
  return publishRuntimeEvent(store, {
    userId: continuation.userId,
    sessionId: continuation.sessionId,
    source: "worker_continuation",
    eventType,
    correlationId: continuation.correlationId,
    payload: {
      continuationId: continuation.id,
      taskId: continuation.taskId,
      workflow: continuation.workflow,
      status: continuation.status,
      terminalOutcome: continuation.terminalOutcome,
      approvalScope: continuation.approvalScope,
      allowedAction: continuation.allowedAction,
      nextCheckAt: continuation.nextCheckAt,
      actionsTaken: [],
      ...payload
    }
  });
}

function continuationScopeAllowedForTask(task, approvalScope, allowedAction) {
  if (
    task?.task_type === OPENCLAW_PROPOSAL_TASK_TYPE &&
    approvalScope === READ_ONLY_CONTINUATION_SCOPE &&
    allowedAction === READ_ONLY_CONTINUATION_SCOPE
  ) {
    return { ok: true, scopeKind: "portal_read_only_observation", candidate: null };
  }
  if (
    task?.task_type === DOCUMENT_CANDIDATE_TASK_TYPE &&
    approvalScope === READ_ONLY_DOCUMENT_APPROVAL_SCOPE &&
    allowedAction === READ_ONLY_DOCUMENT_ALLOWED_ACTION
  ) {
    const { candidate } = approvalMetadataForDocumentCandidateTask(task);
    if (candidate?.candidateId && candidate?.url) {
      return { ok: true, scopeKind: "document_candidate_observation", candidate };
    }
    return {
      ok: false,
      status: "document_candidate_binding_missing",
      error: "Document-candidate continuation requires a bound candidate in task metadata."
    };
  }
  return {
    ok: false,
    status: "unsupported_action_scope",
    error: "This MVP can continue only approved read-only portal observation or one approved read-only document candidate."
  };
}

export async function createWorkerContinuation(
  store,
  {
    taskId,
    sessionId = null,
    userId = null,
    approvalScope = READ_ONLY_CONTINUATION_SCOPE,
    allowedAction = READ_ONLY_CONTINUATION_SCOPE,
    correlationId = null,
    reason = "Worker task may take longer than the current chat turn.",
    reportEverySeconds = 30,
    expiresInMinutes = 120,
    lastProgressEvent = null,
    metadata = {}
  } = {}
) {
  if (!taskId) return { ok: false, status: "missing_task_id", error: "taskId is required.", actionsTaken: [] };
  const task = await store.findOne("agent_tasks", { id: taskId });
  if (!task) return { ok: false, status: "task_not_found", error: "Worker proposal task was not found.", actionsTaken: [] };
  const resolvedSessionId = sessionId ?? task.session_id;
  const resolvedUserId = userId ?? task.user_id;
  if (task.session_id && resolvedSessionId !== task.session_id) {
    return { ok: false, status: "session_binding_mismatch", error: "Continuation session does not match the task.", actionsTaken: [] };
  }
  if (task.user_id && resolvedUserId !== task.user_id) {
    return { ok: false, status: "user_binding_mismatch", error: "Continuation user does not match the task.", actionsTaken: [] };
  }
  const scopeCheck = continuationScopeAllowedForTask(task, approvalScope, allowedAction);
  if (!scopeCheck.ok) {
    return {
      ok: false,
      status: scopeCheck.status,
      error: scopeCheck.error,
      actionsTaken: []
    };
  }

  const now = nowIso();
  const nextCheckAt = new Date(Date.now() + Number(reportEverySeconds) * 1000).toISOString();
  const expiresAt = new Date(Date.now() + Number(expiresInMinutes) * 60 * 1000).toISOString();
  const resolvedCorrelationId = correlationId ?? taskId;
  const latestEvent = lastProgressEvent ?? (await latestWorkerEvent(store, { sessionId: resolvedSessionId, correlationId: resolvedCorrelationId, taskId }));
  const lastProgress = latestEvent
    ? {
        id: latestEvent.id,
        eventType: latestEvent.event_type ?? latestEvent.eventType,
        payload: latestEvent.payload ?? parseJson(latestEvent.payload_json),
        createdAt: latestEvent.created_at ?? latestEvent.createdAt
      }
    : {
        eventType: "worker.status.updated",
        payload: {
          status: "needs_long_running_followup",
          reason,
          actionsTaken: []
        },
        createdAt: now
      };

  const scheduledJob = {
    id: createId("job"),
    user_id: resolvedUserId,
    session_id: resolvedSessionId,
    workflow_key: task.workflow_key ?? null,
    journey_stage: task.journey_stage ?? null,
    job_type: "worker_async_followup_status_check",
    schedule_label: `Every ${Number(reportEverySeconds)} seconds until worker continuation resolves`,
    status: "pending_async_followup",
    next_run_at: nextCheckAt,
    last_run_at: null,
    requires_integration: "openclaw_status_subagent_or_manual_resume",
    approval_status: "read_only_scope_bound",
    payload_json: JSON.stringify({
      version: WORKER_CONTINUATIONS_VERSION,
      taskId,
      sessionId: resolvedSessionId,
      userId: resolvedUserId,
      correlationId: resolvedCorrelationId,
      approvalScope,
      allowedAction,
      reason,
      scopeKind: scopeCheck.scopeKind,
      candidate: scopeCheck.candidate,
      actionsTaken: []
    }),
    created_at: now,
    updated_at: now
  };
  const row = {
    id: createId("cont"),
    user_id: resolvedUserId,
    session_id: resolvedSessionId,
    task_id: taskId,
    scheduled_job_id: scheduledJob.id,
    workflow_key: task.workflow_key ?? null,
    approval_scope: approvalScope,
    allowed_action: allowedAction,
    correlation_id: resolvedCorrelationId,
    status: "pending_async_followup",
    terminal_outcome: "needs_long_running_followup",
    last_runtime_event_id: lastProgress.id ?? null,
    last_progress_event_json: JSON.stringify(lastProgress),
    next_check_at: nextCheckAt,
    expires_at: expiresAt,
    metadata_json: JSON.stringify({
      reason,
      reportEverySeconds: Number(reportEverySeconds),
      source: "phase_8e_async_followup",
      scopeKind: scopeCheck.scopeKind,
      candidate: scopeCheck.candidate,
      ...metadata,
      actionsTaken: []
    }),
    created_at: now,
    updated_at: now
  };
  await store.insert("scheduled_jobs", scheduledJob);
  await store.insert("worker_continuations", row);
  await store.update("agent_tasks", { status: "async_followup_pending", scheduled_job_id: scheduledJob.id, updated_at: nowIso() }, { id: taskId });

  const continuation = compactContinuation(row);
  const event = await emitContinuationEvent(store, "worker.followup.scheduled", continuation, {
    reason,
    scheduledJobId: scheduledJob.id,
    reportEverySeconds: Number(reportEverySeconds)
  });
  await audit(store, resolvedSessionId, "worker_async_followup_scheduled", {
    continuationId: row.id,
    taskId,
    scheduledJobId: scheduledJob.id,
    workflow: row.workflow_key,
    approvalScope,
    allowedAction,
    correlationId: resolvedCorrelationId,
    reason,
    nextCheckAt,
    expiresAt,
    runtimeEventId: event.id,
    actionsTaken: []
  });

  return { ok: true, status: row.status, continuation, scheduledJob, runtimeEvent: event, actionsTaken: [] };
}

export async function listWorkerContinuations(store, { sessionId = null, userId = null, status = null, limit = 20 } = {}) {
  const where = [
    sessionId ? `session_id = ${sql(sessionId)}` : null,
    userId ? `user_id = ${sql(userId)}` : null,
    status ? `status = ${sql(status)}` : null
  ]
    .filter(Boolean)
    .join(" AND ");
  const rows = await store.all(
    `SELECT * FROM worker_continuations${where ? ` WHERE ${where}` : ""} ORDER BY created_at DESC LIMIT ${Number(limit)};`
  );
  return rows.map(compactContinuation);
}

async function getBoundContinuation(store, { continuationId, sessionId = null, userId = null }) {
  const row = continuationId ? await store.findOne("worker_continuations", { id: continuationId }) : null;
  if (!row) return { ok: false, status: "continuation_not_found", error: "Worker continuation was not found.", actionsTaken: [] };
  if (sessionId && row.session_id !== sessionId) {
    return { ok: false, status: "session_binding_mismatch", error: "Continuation session does not match.", actionsTaken: [] };
  }
  if (userId && row.user_id !== userId) {
    return { ok: false, status: "user_binding_mismatch", error: "Continuation user does not match.", actionsTaken: [] };
  }
  return { ok: true, row, continuation: compactContinuation(row) };
}

async function refreshContinuation(store, continuationId) {
  return compactContinuation(await store.findOne("worker_continuations", { id: continuationId }));
}

async function expireWorkerContinuation(store, continuation, { reason = "Worker continuation expired before approved dispatch." } = {}) {
  const now = nowIso();
  await store.update(
    "worker_continuations",
    {
      status: "expired",
      terminal_outcome: "not_possible_policy_or_approval_block",
      metadata_json: JSON.stringify({ ...continuation.metadata, expireReason: reason, actionsTaken: [] }),
      updated_at: now
    },
    { id: continuation.id }
  );
  if (continuation.scheduledJobId) {
    await store.update("scheduled_jobs", { status: "expired", updated_at: now }, { id: continuation.scheduledJobId });
  }
  await store.update("agent_tasks", { status: "async_followup_expired", updated_at: now }, { id: continuation.taskId });
  const expired = await refreshContinuation(store, continuation.id);
  const event = await emitContinuationEvent(store, "worker.followup.expired", expired, { reason });
  await audit(store, continuation.sessionId, "worker_async_followup_expired", {
    continuationId: continuation.id,
    taskId: continuation.taskId,
    reason,
    runtimeEventId: event.id,
    actionsTaken: []
  });
  return { ok: false, status: "expired", error: reason, continuation: expired, runtimeEvent: event, actionsTaken: [] };
}

export async function validateWorkerContinuationForDispatch(
  store,
  { continuationId, sessionId = null, userId = null, taskId = null, workflow = null } = {}
) {
  const bound = await getBoundContinuation(store, { continuationId, sessionId, userId });
  if (!bound.ok) return bound;
  const continuation = bound.continuation;
  if (taskId && continuation.taskId !== taskId) {
    return { ok: false, status: "task_binding_mismatch", error: "Continuation task does not match the approved task.", continuation, actionsTaken: [] };
  }
  if (workflow && continuation.workflow !== workflow) {
    return { ok: false, status: "workflow_binding_mismatch", error: "Continuation workflow does not match the graph route.", continuation, actionsTaken: [] };
  }
  const portalScope =
    continuation.approvalScope === READ_ONLY_CONTINUATION_SCOPE && continuation.allowedAction === READ_ONLY_CONTINUATION_SCOPE;
  const documentScope =
    continuation.approvalScope === READ_ONLY_DOCUMENT_APPROVAL_SCOPE &&
    continuation.allowedAction === READ_ONLY_DOCUMENT_ALLOWED_ACTION &&
    continuation.metadata?.scopeKind === "document_candidate_observation";
  if (!portalScope && !documentScope) {
    return {
      ok: false,
      status: "unsupported_action_scope",
      error: "This MVP can dispatch only read-only observation worker continuations.",
      continuation,
      actionsTaken: []
    };
  }
  if (TERMINAL_CONTINUATION_STATUSES.has(continuation.status)) {
    return {
      ok: false,
      status: continuation.status,
      error: "Terminal worker continuations cannot be dispatched.",
      continuation,
      actionsTaken: []
    };
  }
  if (!ACTIVE_CONTINUATION_STATUSES.has(continuation.status)) {
    return {
      ok: false,
      status: "unsupported_continuation_status",
      error: `Worker continuation status ${continuation.status} is not dispatchable.`,
      continuation,
      actionsTaken: []
    };
  }
  if (continuation.expiresAt && new Date(continuation.expiresAt).getTime() <= Date.now()) {
    return expireWorkerContinuation(store, continuation);
  }
  return { ok: true, status: "ready_for_approved_dispatch", continuation, actionsTaken: [] };
}

export async function consumeWorkerContinuationForApprovedDispatch(
  store,
  { continuationId, sessionId = null, userId = null, taskId = null, workflow = null, approvalGateId = null } = {}
) {
  const validation = await validateWorkerContinuationForDispatch(store, { continuationId, sessionId, userId, taskId, workflow });
  if (!validation.ok) return validation;
  const continuation = validation.continuation;
  const now = nowIso();
  await store.update(
    "worker_continuations",
    {
      status: "dispatching_official_openclaw",
      metadata_json: JSON.stringify({
        ...continuation.metadata,
        dispatchStartedAt: now,
        approvalGateId,
        runtime: "official_openclaw",
        actionsTaken: []
      }),
      updated_at: now
    },
    { id: continuation.id }
  );
  if (continuation.scheduledJobId) {
    await store.update(
      "scheduled_jobs",
      { status: "dispatching_official_openclaw", last_run_at: now, updated_at: now },
      { id: continuation.scheduledJobId }
    );
  }
  await store.update("agent_tasks", { status: "official_worker_dispatching", updated_at: now }, { id: continuation.taskId });
  const dispatching = await refreshContinuation(store, continuation.id);
  const event = await emitContinuationEvent(store, "worker.followup.dispatching", dispatching, {
    runtime: "official_openclaw",
    approvalGateId,
    progressEverySeconds: dispatching.metadata?.reportEverySeconds ?? 30
  });
  await audit(store, continuation.sessionId, "worker_async_followup_dispatching", {
    continuationId: continuation.id,
    taskId: continuation.taskId,
    workflow: continuation.workflow,
    approvalGateId,
    runtimeEventId: event.id,
    runtime: "official_openclaw",
    actionsTaken: []
  });
  return { ok: true, status: "dispatching_official_openclaw", continuation: dispatching, runtimeEvent: event, actionsTaken: [] };
}

export async function finalizeWorkerContinuationDispatch(
  store,
  {
    continuationId,
    sessionId = null,
    userId = null,
    resultStatus,
    terminalOutcome,
    reason = null,
    browserRunId = null,
    sourcePointerCount = 0,
    structuredBenefitCount = 0,
    discoveryReport = null,
    portalSearchStatus = null,
    documentCandidateCount = 0,
    sbcPdfCandidateCount = 0,
    actionsTaken = []
  } = {}
) {
  const bound = await getBoundContinuation(store, { continuationId, sessionId, userId });
  if (!bound.ok) return bound;
  const continuation = bound.continuation;
  const finalStatus = COMPLETED_TERMINAL_OUTCOMES.has(terminalOutcome) ? "completed" : "blocked";
  const now = nowIso();
  await store.update(
    "worker_continuations",
    {
      status: finalStatus,
      terminal_outcome: terminalOutcome,
      metadata_json: JSON.stringify({
        ...continuation.metadata,
        resultStatus,
        reason,
        browserRunId,
        sourcePointerCount,
        structuredBenefitCount,
        discoveryReport,
        portalSearchStatus,
        documentCandidateCount,
        sbcPdfCandidateCount,
        completedAt: now,
        runtime: "official_openclaw",
        actionsTaken
      }),
      updated_at: now
    },
    { id: continuation.id }
  );
  if (continuation.scheduledJobId) {
    await store.update(
      "scheduled_jobs",
      { status: finalStatus, last_run_at: now, updated_at: now },
      { id: continuation.scheduledJobId }
    );
  }
  await store.update("agent_tasks", { status: `official_worker_${finalStatus}`, updated_at: now }, { id: continuation.taskId });
  const completed = await refreshContinuation(store, continuation.id);
  const eventType = finalStatus === "completed" ? "worker.followup.completed" : "worker.followup.blocked";
  const event = await emitContinuationEvent(store, eventType, completed, {
    runtime: "official_openclaw",
    resultStatus,
    reason,
    browserRunId,
    sourcePointerCount,
    structuredBenefitCount,
    discoveryReport,
    portalSearchStatus,
    documentCandidateCount,
    sbcPdfCandidateCount,
    actionsTaken
  });
  await audit(store, continuation.sessionId, `worker_async_followup_${finalStatus}`, {
    continuationId: continuation.id,
    taskId: continuation.taskId,
    workflow: continuation.workflow,
    resultStatus,
    terminalOutcome,
    reason,
    browserRunId,
    sourcePointerCount,
    structuredBenefitCount,
    portalSearchStatus,
    documentCandidateCount,
    sbcPdfCandidateCount,
    runtimeEventId: event.id,
    actionsTaken
  });
  return { ok: true, status: finalStatus, continuation: completed, runtimeEvent: event, actionsTaken };
}

export async function cancelWorkerContinuation(store, { continuationId, sessionId = null, userId = null, reason = "Cancelled by user." } = {}) {
  const bound = await getBoundContinuation(store, { continuationId, sessionId, userId });
  if (!bound.ok) return bound;
  if (TERMINAL_CONTINUATION_STATUSES.has(bound.continuation.status)) {
    return {
      ok: false,
      status: bound.continuation.status,
      error: "Terminal worker continuations cannot be cancelled again.",
      continuation: bound.continuation,
      actionsTaken: []
    };
  }
  const now = nowIso();
  await store.update(
    "worker_continuations",
    {
      status: "cancelled",
      terminal_outcome: "not_possible_policy_or_approval_block",
      metadata_json: JSON.stringify({ ...bound.continuation.metadata, cancelReason: reason, actionsTaken: [] }),
      updated_at: now
    },
    { id: continuationId }
  );
  if (bound.continuation.scheduledJobId) {
    await store.update("scheduled_jobs", { status: "cancelled", updated_at: now }, { id: bound.continuation.scheduledJobId });
  }
  await store.update("agent_tasks", { status: "async_followup_cancelled", updated_at: now }, { id: bound.continuation.taskId });
  const continuation = (await listWorkerContinuations(store, { sessionId: bound.continuation.sessionId, limit: 100 })).find(
    (item) => item.id === continuationId
  );
  const event = await emitContinuationEvent(store, "worker.followup.cancelled", continuation, { reason });
  await audit(store, bound.continuation.sessionId, "worker_async_followup_cancelled", {
    continuationId,
    taskId: bound.continuation.taskId,
    reason,
    runtimeEventId: event.id,
    actionsTaken: []
  });
  return { ok: true, status: "cancelled", continuation, runtimeEvent: event, actionsTaken: [] };
}

export async function requestWorkerContinuation(store, { continuationId, sessionId = null, userId = null } = {}) {
  const bound = await getBoundContinuation(store, { continuationId, sessionId, userId });
  if (!bound.ok) return bound;
  if (TERMINAL_CONTINUATION_STATUSES.has(bound.continuation.status) || bound.continuation.status === "dispatching_official_openclaw") {
    return {
      ok: false,
      status: bound.continuation.status,
      error: "This worker continuation cannot accept another status request.",
      continuation: bound.continuation,
      actionsTaken: []
    };
  }
  const now = nowIso();
  await store.update(
    "worker_continuations",
    {
      status: "continue_requested",
      metadata_json: JSON.stringify({ ...bound.continuation.metadata, continueRequestedAt: now, actionsTaken: [] }),
      updated_at: now
    },
    { id: continuationId }
  );
  if (bound.continuation.scheduledJobId) {
    await store.update("scheduled_jobs", { status: "continue_requested", last_run_at: now, updated_at: now }, { id: bound.continuation.scheduledJobId });
  }
  const continuation = (await listWorkerContinuations(store, { sessionId: bound.continuation.sessionId, limit: 100 })).find(
    (item) => item.id === continuationId
  );
  const event = await emitContinuationEvent(store, "worker.followup.continue_requested", continuation, {
    note: "Continuation was requested. No worker action is executed by this control without a fresh approved graph run."
  });
  await audit(store, bound.continuation.sessionId, "worker_async_followup_continue_requested", {
    continuationId,
    taskId: bound.continuation.taskId,
    runtimeEventId: event.id,
    actionsTaken: []
  });
  return { ok: true, status: "continue_requested", continuation, runtimeEvent: event, actionsTaken: [] };
}
