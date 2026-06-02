import { audit } from "./audit.mjs";
import { createId, nowIso } from "./database.mjs";
import {
  DOCUMENT_CANDIDATE_TASK_TYPE,
  READ_ONLY_DOCUMENT_ALLOWED_ACTION,
  READ_ONLY_DOCUMENT_APPROVAL_GATE,
  READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
  approvalMetadataForDocumentCandidateTask
} from "./documentCandidateApproval.mjs";
import { OPENCLAW_PROPOSAL_TASK_TYPE } from "./openclawSkillInvocation.mjs";

export const READ_ONLY_APPROVAL_GATE = "openclaw_read_only_observation";
export const READ_ONLY_ALLOWED_ACTION = "read_only_observation";

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseJson(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function addMinutes(minutes) {
  return new Date(Date.now() + Number(minutes) * 60 * 1000).toISOString();
}

function approvalConfigForTask(task, { approvalScope = READ_ONLY_ALLOWED_ACTION, allowedAction = READ_ONLY_ALLOWED_ACTION } = {}) {
  if (task?.task_type === OPENCLAW_PROPOSAL_TASK_TYPE) {
    return {
      ok: approvalScope === READ_ONLY_ALLOWED_ACTION && allowedAction === READ_ONLY_ALLOWED_ACTION,
      taskType: OPENCLAW_PROPOSAL_TASK_TYPE,
      gateType: READ_ONLY_APPROVAL_GATE,
      approvalScope: READ_ONLY_ALLOWED_ACTION,
      allowedAction: READ_ONLY_ALLOWED_ACTION,
      executionMode: "read_only_observation_only",
      approvedStatus: "approved_read_only_observation",
      auditRecordedEvent: "openclaw_read_only_observation_approval_recorded",
      auditConsumedEvent: "openclaw_read_only_observation_approval_consumed",
      consumedAction: "approved_read_only_observation",
      unsupportedError: "This MVP approval endpoint can authorize only read-only observation for the OpenClaw proposal task."
    };
  }
  if (task?.task_type === DOCUMENT_CANDIDATE_TASK_TYPE) {
    const { candidate } = approvalMetadataForDocumentCandidateTask(task);
    const scopeMatches = approvalScope === READ_ONLY_DOCUMENT_APPROVAL_SCOPE && allowedAction === READ_ONLY_DOCUMENT_ALLOWED_ACTION;
    return {
      ok: scopeMatches && Boolean(candidate?.candidateId && candidate?.url),
      taskType: DOCUMENT_CANDIDATE_TASK_TYPE,
      gateType: READ_ONLY_DOCUMENT_APPROVAL_GATE,
      approvalScope: READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
      allowedAction: READ_ONLY_DOCUMENT_ALLOWED_ACTION,
      executionMode: "read_only_document_observation_only",
      approvedStatus: "approved_read_only_document_observation",
      auditRecordedEvent: "openclaw_read_only_document_observation_approval_recorded",
      auditConsumedEvent: "openclaw_read_only_document_observation_approval_consumed",
      consumedAction: "approved_read_only_document_observation",
      unsupportedError: candidate?.candidateId
        ? "This document-candidate task can authorize only read_only_document_observation."
        : "Document-candidate approval task is missing a bound candidate.",
      candidate
    };
  }
  return {
    ok: false,
    status: "invalid_task_type",
    unsupportedError: "Only OpenClaw read-only proposal tasks can be approved here."
  };
}

export async function createReadOnlyObservationApproval(
  store,
  { taskId, sessionId, userId, decision = "approved", approvalScope = READ_ONLY_ALLOWED_ACTION, allowedAction = READ_ONLY_ALLOWED_ACTION, expiresInMinutes = 15 }
) {
  const task = await store.findOne("agent_tasks", { id: taskId });
  if (!task) {
    return { ok: false, status: "not_found", error: "Approval task not found." };
  }
  const config = approvalConfigForTask(task, { approvalScope, allowedAction });
  if (config.status === "invalid_task_type") return { ok: false, status: "invalid_task_type", error: config.unsupportedError, task };
  if (task.session_id !== sessionId || task.user_id !== userId) {
    return { ok: false, status: "binding_mismatch", error: "Approval request does not match task session/user binding.", task };
  }
  if (!config.ok) {
    return {
      ok: false,
      status: "unsupported_scope",
      error: config.unsupportedError,
      task
    };
  }

  const now = nowIso();
  const token = createId("approval");
  const details = {
    version: "2026-05-27.approval-resume.v1",
    approvalToken: token,
    taskId: task.id,
    sessionId: task.session_id,
    userId: task.user_id,
    workflow: task.workflow_key,
    approvalScope: config.approvalScope,
    allowedAction: config.allowedAction,
    executionMode: config.executionMode,
    candidateId: config.candidate?.candidateId ?? null,
    candidateUrl: config.candidate?.url ?? null,
    candidateLabel: config.candidate?.label ?? null,
    candidateType: config.candidate?.type ?? null,
    expiresAt: addMinutes(expiresInMinutes),
    actionsTaken: [],
    consumedAt: null
  };
  const row = {
    id: createId("gate"),
    session_id: task.session_id,
    gate_type: config.gateType,
    decision,
    details: JSON.stringify(details),
    created_at: now
  };
  await store.insert("approval_gates", row);
  await store.update(
    "agent_tasks",
    {
      status: decision === "approved" ? config.approvedStatus : "approval_denied",
      updated_at: now
    },
    { id: task.id }
  );
  const auditEvent = await audit(store, task.session_id, config.auditRecordedEvent, {
    gateId: row.id,
    taskId: task.id,
    sessionId: task.session_id,
    userId: task.user_id,
    workflow: task.workflow_key,
    decision,
    approvalScope: config.approvalScope,
    allowedAction: config.allowedAction,
    candidateId: config.candidate?.candidateId ?? null,
    candidateUrl: config.candidate?.url ?? null,
    expiresAt: details.expiresAt,
    actionsTaken: []
  });
  return { ok: decision === "approved", status: decision, approvalGate: row, approvalToken: token, approval: details, task, auditEvent };
}

export async function consumeReadOnlyObservationApproval(
  store,
  {
    approvalToken,
    taskId,
    sessionId,
    userId,
    workflow,
    approvalScope = READ_ONLY_ALLOWED_ACTION,
    allowedAction = approvalScope,
    candidateId = null,
    candidateUrl = null
  }
) {
  if (!approvalToken) {
    return { ok: false, status: "missing_approval_token", reason: "Read-only observation requires an approval token.", actionsTaken: [] };
  }
  if (!taskId) {
    return { ok: false, status: "missing_approval_task", reason: "Read-only observation approval must bind to a task ID.", actionsTaken: [] };
  }
  const gateType = approvalScope === READ_ONLY_DOCUMENT_APPROVAL_SCOPE ? READ_ONLY_DOCUMENT_APPROVAL_GATE : READ_ONLY_APPROVAL_GATE;
  const rows = await store.all(
    `SELECT * FROM approval_gates
     WHERE session_id = ${sql(sessionId)}
       AND gate_type = ${sql(gateType)}
     ORDER BY created_at DESC;`
  );
  const gate = rows.find((row) => parseJson(row.details).approvalToken === approvalToken);
  if (!gate) {
    return { ok: false, status: "approval_not_found", reason: "Approval token was not found for this session.", actionsTaken: [] };
  }
  const details = parseJson(gate.details);
  const bindingChecks = [
    ["taskId", taskId],
    ["sessionId", sessionId],
    ["userId", userId],
    ["workflow", workflow],
    ["approvalScope", approvalScope],
    ["allowedAction", allowedAction],
    ["candidateId", candidateId],
    ["candidateUrl", candidateUrl]
  ];
  for (const [key, expected] of bindingChecks) {
    if (expected && details[key] !== expected) {
      return {
        ok: false,
        status: "approval_binding_mismatch",
        reason: `Approval ${key} binding mismatch.`,
        approvalGateId: gate.id,
        actionsTaken: []
      };
    }
  }
  if (details.consumedAt) {
    return { ok: false, status: "approval_already_consumed", reason: "Approval token was already consumed.", approvalGateId: gate.id, actionsTaken: [] };
  }
  if (gate.decision !== "approved") {
    return { ok: false, status: "approval_denied", reason: "Approval was denied.", approvalGateId: gate.id, actionsTaken: [] };
  }
  if (new Date(details.expiresAt).getTime() <= Date.now()) {
    return { ok: false, status: "approval_expired", reason: "Approval token expired.", approvalGateId: gate.id, actionsTaken: [] };
  }

  const consumedAt = nowIso();
  await store.update(
    "approval_gates",
    {
      details: JSON.stringify({ ...details, consumedAt }),
      decision: "approved_consumed"
    },
    { id: gate.id }
  );
  const consumedAction =
    approvalScope === READ_ONLY_DOCUMENT_APPROVAL_SCOPE ? "approved_read_only_document_observation" : "approved_read_only_observation";
  const auditEvent =
    approvalScope === READ_ONLY_DOCUMENT_APPROVAL_SCOPE
      ? "openclaw_read_only_document_observation_approval_consumed"
      : "openclaw_read_only_observation_approval_consumed";
  await audit(store, sessionId, auditEvent, {
    approvalGateId: gate.id,
    taskId,
    sessionId,
    userId,
    workflow,
    approvalScope: details.approvalScope,
    allowedAction: details.allowedAction,
    candidateId: details.candidateId ?? null,
    candidateUrl: details.candidateUrl ?? null,
    consumedAt,
    actionsTaken: [consumedAction]
  });
  return {
    ok: true,
    status: "approved_consumed",
    approvalGateId: gate.id,
    approval: { ...details, consumedAt },
    actionsTaken: [consumedAction]
  };
}

export async function consumeReadOnlyDocumentObservationApproval(store, options = {}) {
  return consumeReadOnlyObservationApproval(store, {
    ...options,
    approvalScope: READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
    allowedAction: READ_ONLY_DOCUMENT_ALLOWED_ACTION
  });
}
