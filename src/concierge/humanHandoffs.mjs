import { createHash } from "node:crypto";
import { audit } from "./audit.mjs";
import { createId, nowIso } from "./database.mjs";

export const HUMAN_HANDOFF_VERSION = "2026-06-01.phase10r-urgent-human-handoff.v1";

const URGENT_RESPONSE_GUIDANCE = [
  "If this may be an emergency or immediate safety concern, call 911 or local emergency services now.",
  "If you are in the U.S. and thinking about self-harm, call or text 988 for the Suicide and Crisis Lifeline.",
  "I cannot evaluate symptoms or provide clinical care decisions in chat. I created a human handoff record for follow-up, and I did not run OpenClaw, contact a payer, enter credentials, submit a form, or change any account record."
].join(" ");

function clampLimit(value, fallback = 25) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
}

function parseJson(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function hashValue(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function normalizeHandoffRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    taskId: row.task_id ?? null,
    messageId: row.message_id ?? null,
    handoffType: row.handoff_type,
    priority: row.priority,
    status: row.status,
    summary: row.summary,
    reason: row.reason,
    responseGuidance: row.response_guidance,
    metadata: parseJson(row.metadata_json, {}),
    auditEventId: row.audit_event_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function composeUrgentEscalationResponse(handoff) {
  return [
    "I’m pausing the normal concierge workflow because your message may involve an emergency or immediate safety concern.",
    URGENT_RESPONSE_GUIDANCE,
    `Handoff item: ${handoff?.id ?? "created"}. Status: ${handoff?.status ?? "open"}. Priority: ${handoff?.priority ?? "urgent"}.`
  ].join("\n\n");
}

export async function createHumanHandoffItem(
  store,
  { user, session, graphTraceId = null, policyResult = {}, userInput = "", workflow = "human_approval_escalation" }
) {
  if (!store) throw new Error("A store is required to create a human handoff.");
  if (!user?.id || !session?.id) throw new Error("A user and session are required to create a human handoff.");

  const latestMessage = await store.get(
    "SELECT id, content FROM conversation_messages WHERE session_id = ? AND role = 'user' ORDER BY sequence_number DESC LIMIT 1;",
    [session.id]
  );
  const category = policyResult.urgentEscalation?.category ?? "urgent_emergency";
  const time = nowIso();
  const summary = `Urgent/safety escalation detected (${category}); normal workflow and worker execution bypassed.`;
  const reason = policyResult.urgentEscalation?.reason ?? "Emergency or safety-critical content requires human handoff.";
  const inputHash = hashValue(userInput || latestMessage?.content || "");
  const messagePreview = "Urgent/safety message redacted; see inputHash and escalationCategory.";
  const metadata = {
    version: HUMAN_HANDOFF_VERSION,
    source: "langgraph",
    workflow,
    graphTraceId,
    escalationCategory: category,
    policySeverity: policyResult.urgentEscalation?.severity ?? "urgent",
    inputHash,
    messagePreview,
    rawUserInputStored: false,
    openclawExecuted: false,
    externalActionTaken: false
  };

  const task = await store.insert("agent_tasks", {
    id: createId("task"),
    user_id: user.id,
    session_id: session.id,
    workflow_key: workflow,
    journey_stage: "urgent_escalation",
    task_type: "urgent_human_handoff",
    status: "open",
    priority: "urgent",
    description: summary,
    source_table: null,
    source_id: null,
    scheduled_job_id: null,
    due_at: time,
    metadata_json: JSON.stringify(metadata),
    created_at: time,
    updated_at: time
  });

  const row = await store.insert("human_handoff_items", {
    id: createId("handoff"),
    user_id: user.id,
    session_id: session.id,
    task_id: task.id,
    message_id: latestMessage?.id ?? null,
    handoff_type: "urgent_emergency",
    priority: "urgent",
    status: "open",
    summary,
    reason,
    response_guidance: URGENT_RESPONSE_GUIDANCE,
    metadata_json: JSON.stringify(metadata),
    audit_event_id: null,
    created_at: time,
    updated_at: time
  });
  await store.update("agent_tasks", { source_table: "human_handoff_items", source_id: row.id, updated_at: nowIso() }, { id: task.id });

  const auditEvent = await audit(store, session.id, "human_handoff_created", {
    version: HUMAN_HANDOFF_VERSION,
    handoffId: row.id,
    taskId: task.id,
    handoffType: row.handoff_type,
    priority: row.priority,
    status: row.status,
    category,
    workflow,
    graphTraceId,
    inputHash,
    messageId: latestMessage?.id ?? null,
    rawUserInputStored: false,
    openclawExecuted: false,
    externalActionTaken: false
  });
  await store.update("human_handoff_items", { audit_event_id: auditEvent.id, updated_at: nowIso() }, { id: row.id });
  const saved = await store.findOne("human_handoff_items", { id: row.id });
  return {
    ok: true,
    version: HUMAN_HANDOFF_VERSION,
    handoff: normalizeHandoffRow(saved),
    task,
    audit: {
      id: auditEvent.id,
      eventType: auditEvent.event_type,
      eventHash: auditEvent.event_hash
    }
  };
}

export async function listHumanHandoffs(store, { userId = null, sessionId = null, status = null, limit = 25 } = {}) {
  const ownershipClauses = [];
  const ownershipParams = [];
  if (userId) {
    ownershipClauses.push("user_id = ?");
    ownershipParams.push(userId);
  }
  if (sessionId) {
    ownershipClauses.push("session_id = ?");
    ownershipParams.push(sessionId);
  }
  const clauses = [...ownershipClauses];
  const params = [...ownershipParams];
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await store.all(
    `SELECT * FROM human_handoff_items ${where} ORDER BY created_at DESC LIMIT ${clampLimit(limit)};`,
    params
  );
  const openClauses = [...ownershipClauses, "status = 'open'"];
  const open = await store.get(
    `SELECT COUNT(*) AS count FROM human_handoff_items WHERE ${openClauses.join(" AND ")};`,
    ownershipParams
  );
  return {
    version: HUMAN_HANDOFF_VERSION,
    handoffs: rows.map(normalizeHandoffRow),
    count: rows.length,
    openCount: open?.count ?? 0,
    safety: {
      rawUserInputReturned: false,
      rawUserInputStored: false,
      openclawExecutedByHandoff: false,
      externalActionTakenByHandoff: false
    }
  };
}
