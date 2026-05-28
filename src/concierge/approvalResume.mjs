import { audit } from "./audit.mjs";
import { createId, nowIso } from "./database.mjs";
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

export async function createReadOnlyObservationApproval(
  store,
  { taskId, sessionId, userId, decision = "approved", approvalScope = READ_ONLY_ALLOWED_ACTION, allowedAction = READ_ONLY_ALLOWED_ACTION, expiresInMinutes = 15 }
) {
  const task = await store.findOne("agent_tasks", { id: taskId });
  if (!task) {
    return { ok: false, status: "not_found", error: "Approval task not found." };
  }
  if (task.task_type !== OPENCLAW_PROPOSAL_TASK_TYPE) {
    return { ok: false, status: "invalid_task_type", error: "Only OpenClaw skill invocation proposals can be approved here.", task };
  }
  if (task.session_id !== sessionId || task.user_id !== userId) {
    return { ok: false, status: "binding_mismatch", error: "Approval request does not match task session/user binding.", task };
  }
  if (approvalScope !== READ_ONLY_ALLOWED_ACTION || allowedAction !== READ_ONLY_ALLOWED_ACTION) {
    return {
      ok: false,
      status: "unsupported_scope",
      error: "This MVP approval endpoint can authorize only read-only observation.",
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
    approvalScope,
    allowedAction,
    executionMode: "read_only_observation_only",
    expiresAt: addMinutes(expiresInMinutes),
    actionsTaken: [],
    consumedAt: null
  };
  const row = {
    id: createId("gate"),
    session_id: task.session_id,
    gate_type: READ_ONLY_APPROVAL_GATE,
    decision,
    details: JSON.stringify(details),
    created_at: now
  };
  await store.insert("approval_gates", row);
  await store.update(
    "agent_tasks",
    {
      status: decision === "approved" ? "approved_read_only_observation" : "approval_denied",
      updated_at: now
    },
    { id: task.id }
  );
  const auditEvent = await audit(store, task.session_id, "openclaw_read_only_observation_approval_recorded", {
    gateId: row.id,
    taskId: task.id,
    sessionId: task.session_id,
    userId: task.user_id,
    workflow: task.workflow_key,
    decision,
    approvalScope,
    allowedAction,
    expiresAt: details.expiresAt,
    actionsTaken: []
  });
  return { ok: decision === "approved", status: decision, approvalGate: row, approvalToken: token, approval: details, task, auditEvent };
}

export async function consumeReadOnlyObservationApproval(store, { approvalToken, taskId, sessionId, userId, workflow }) {
  if (!approvalToken) {
    return { ok: false, status: "missing_approval_token", reason: "Read-only observation requires an approval token.", actionsTaken: [] };
  }
  if (!taskId) {
    return { ok: false, status: "missing_approval_task", reason: "Read-only observation approval must bind to a task ID.", actionsTaken: [] };
  }
  const rows = await store.all(
    `SELECT * FROM approval_gates
     WHERE session_id = ${sql(sessionId)}
       AND gate_type = ${sql(READ_ONLY_APPROVAL_GATE)}
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
    ["approvalScope", READ_ONLY_ALLOWED_ACTION],
    ["allowedAction", READ_ONLY_ALLOWED_ACTION]
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
  await audit(store, sessionId, "openclaw_read_only_observation_approval_consumed", {
    approvalGateId: gate.id,
    taskId,
    sessionId,
    userId,
    workflow,
    approvalScope: details.approvalScope,
    allowedAction: details.allowedAction,
    consumedAt,
    actionsTaken: ["approved_read_only_observation"]
  });
  return {
    ok: true,
    status: "approved_consumed",
    approvalGateId: gate.id,
    approval: { ...details, consumedAt },
    actionsTaken: ["approved_read_only_observation"]
  };
}
