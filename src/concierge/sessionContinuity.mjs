import { createHash } from "node:crypto";
import { audit } from "./audit.mjs";
import { createId, nowIso } from "./database.mjs";
import { maskDirectIdentifiers } from "./modelPayloadPolicy.mjs";

export const SESSION_CONTINUITY_VERSION = "2026-06-01.phase10d-session-continuity.v1";

export class SessionContinuityError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "SessionContinuityError";
    this.statusCode = statusCode;
  }
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function textHash(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function normalizeRating(value) {
  const rating = String(value ?? "").trim().toLowerCase();
  if (["useful", "not_useful", "needs_follow_up", "unsafe_or_wrong"].includes(rating)) return rating;
  if (["up", "positive", "thumbs_up", "good"].includes(rating)) return "useful";
  if (["down", "negative", "thumbs_down", "bad"].includes(rating)) return "not_useful";
  throw new SessionContinuityError("Feedback rating must be useful, not_useful, needs_follow_up, or unsafe_or_wrong.", 400);
}

function sourcePointersFromState(state) {
  const direct = state?.langgraph?.sourcePointers;
  if (Array.isArray(direct)) return direct;
  const nested = state?.graphRun?.state?.source_pointers;
  if (Array.isArray(nested)) return nested;
  return [];
}

function latestGraphState(managedState) {
  return managedState?.state?.state ?? null;
}

function sessionUserMaskState(user, session) {
  return {
    context_packet: {
      user: {
        id: user?.id,
        name: user?.name,
        email: user?.email
      },
      session: {
        id: session?.id
      }
    }
  };
}

function safeMessage(row, maskState) {
  return {
    id: row.id,
    role: row.role,
    content: maskDirectIdentifiers(row.content, maskState),
    contentHash: textHash(row.content),
    createdAt: row.created_at
  };
}

async function loadOwnedSession(store, { sessionId, userId }) {
  if (!sessionId) throw new SessionContinuityError("Session id is required.", 400);
  const session = await store.findOne("sessions", { id: sessionId });
  if (!session) throw new SessionContinuityError("Session not found.", 404);
  if (userId && session.user_id !== userId) {
    throw new SessionContinuityError("Session does not belong to this user.", 403);
  }
  const user = await store.findOne("users", { id: session.user_id });
  return { session, user };
}

export async function getSessionContinuity(store, { sessionId, userId }) {
  const { session, user } = await loadOwnedSession(store, { sessionId, userId });
  const [messages, managedState, feedbackRows, handoffRows] = await Promise.all([
    store.all("SELECT * FROM conversation_messages WHERE session_id = ? ORDER BY sequence_number ASC;", [session.id]),
    store.findOne("session_state", { session_id: session.id }),
    store.list("feedback_items", { session_id: session.id }),
    store.list("human_handoff_items", { session_id: session.id })
  ]);
  const parsedState = parseJson(managedState?.state_json, null);
  const pointers = sourcePointersFromState(parsedState);
  const maskState = sessionUserMaskState(user, session);
  return {
    version: SESSION_CONTINUITY_VERSION,
    user: user ? { id: user.id, name: user.name, email: user.email } : null,
    session,
    messages: messages.map((message) => safeMessage(message, maskState)),
    latestState: parsedState,
    sourcePointers: pointers,
    sourcePointerCount: pointers.length,
    feedback: feedbackRows.map((row) => ({
      id: row.id,
      rating: row.rating,
      status: row.status,
      messageId: row.message_id,
      taskId: row.task_id,
      answerHash: row.answer_hash,
      sourcePointerCount: row.source_pointer_count,
      metadata: parseJson(row.metadata_json, {}),
      createdAt: row.created_at
    })),
    handoffs: handoffRows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      handoffType: row.handoff_type,
      priority: row.priority,
      status: row.status,
      summary: row.summary,
      reason: row.reason,
      responseGuidance: row.response_guidance,
      metadata: parseJson(row.metadata_json, {}),
      auditEventId: row.audit_event_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })),
    exportAvailable: messages.some((message) => message.role === "assistant")
  };
}

export async function recordSessionFeedback(
  store,
  { sessionId, userId, messageId = null, taskId = null, answerHash = null, rating, comment = "", metadata = {} }
) {
  const { session, user } = await loadOwnedSession(store, { sessionId, userId });
  const normalizedRating = normalizeRating(rating);
  const maskState = sessionUserMaskState(user, session);
  const safeComment = maskDirectIdentifiers(String(comment ?? "").slice(0, 2000), maskState);
  let message = null;
  if (messageId) {
    message = await store.findOne("conversation_messages", { id: messageId });
    if (!message || message.session_id !== session.id) {
      throw new SessionContinuityError("Feedback message does not belong to this session.", 403);
    }
  }
  const state = await store.findOne("session_state", { session_id: session.id });
  const sourcePointerCount = sourcePointersFromState(parseJson(state?.state_json, null)).length;
  const row = {
    id: createId("feedback"),
    user_id: session.user_id,
    session_id: session.id,
    message_id: message?.id ?? null,
    task_id: taskId ?? null,
    answer_hash: answerHash ?? (message?.content ? textHash(message.content) : null),
    rating: normalizedRating,
    comment: safeComment,
    source_pointer_count: sourcePointerCount,
    metadata_json: JSON.stringify({
      ...metadata,
      version: SESSION_CONTINUITY_VERSION,
      rawCommentStored: false
    }),
    status: "recorded",
    created_at: nowIso()
  };
  await store.insert("feedback_items", row);
  const auditEvent = await audit(store, session.id, "user_feedback_recorded", {
    feedbackId: row.id,
    rating: row.rating,
    messageId: row.message_id,
    taskId: row.task_id,
    sourcePointerCount,
    commentHash: textHash(comment),
    rawCommentStored: false
  });
  return {
    ok: true,
    version: SESSION_CONTINUITY_VERSION,
    feedback: {
      id: row.id,
      sessionId: row.session_id,
      userId: row.user_id,
      messageId: row.message_id,
      taskId: row.task_id,
      answerHash: row.answer_hash,
      rating: row.rating,
      comment: row.comment,
      sourcePointerCount,
      status: row.status,
      createdAt: row.created_at
    },
    audit: {
      id: auditEvent.id,
      eventType: auditEvent.event_type,
      eventHash: auditEvent.event_hash
    }
  };
}

function sourcePointerMarkdown(pointer, index) {
  const label = pointer.displayLabel || pointer.title || pointer.sourceUrl || `${pointer.table ?? "source"}/${pointer.id ?? pointer.rowId ?? index + 1}`;
  const url = pointer.sourceUrl ? `, URL: ${pointer.sourceUrl}` : "";
  const hash = pointer.extractionHash || pointer.sha256 ? `, hash: ${pointer.extractionHash ?? pointer.sha256}` : "";
  return `- ${label} (${pointer.table ?? pointer.kind ?? "source"}${url}${hash})`;
}

export async function buildSessionExport(store, { sessionId, userId }) {
  const continuity = await getSessionContinuity(store, { sessionId, userId });
  const maskState = sessionUserMaskState(continuity.user, continuity.session);
  const assistantMessages = continuity.messages.filter((message) => message.role === "assistant");
  const latestAssistant = assistantMessages.at(-1);
  const sourcePointers = continuity.sourcePointers ?? [];
  const latestState = latestGraphState({ state: { state: continuity.latestState } }) ?? continuity.latestState ?? {};
  const workflow = latestState?.langgraph?.workflow ?? continuity.session.active_workflow_key ?? "not reported";
  const answer = latestAssistant?.content ?? "No assistant answer has been recorded for this session yet.";
  const sourceSection = sourcePointers.length
    ? sourcePointers.map(sourcePointerMarkdown).join("\n")
    : "- No stored source pointers yet.";
  const content = maskDirectIdentifiers(
    [
      `# Brainstyworkers Concierge Session Export`,
      "",
      `Generated: ${nowIso()}`,
      `Session: ${continuity.session.id}`,
      `Workflow: ${workflow}`,
      `Messages: ${continuity.messages.length}`,
      `Source pointers: ${sourcePointers.length}`,
      "",
      "## Latest Answer",
      "",
      answer,
      "",
      "## Stored Source Pointers",
      "",
      sourceSection,
      "",
      "## Checklist",
      "",
      "- Review the cited source pointers before making benefit decisions.",
      "- Keep credential entry, 2FA, payer contact, form submission, and account changes outside worker automation.",
      "- Re-run read-only observation only through a fresh LangGraph approval gate when new evidence is needed."
    ].join("\n"),
    maskState
  );
  return {
    ok: true,
    version: SESSION_CONTINUITY_VERSION,
    sessionId: continuity.session.id,
    filename: `brainstyworkers-session-${continuity.session.id}.md`,
    contentType: "text/markdown",
    content,
    messageCount: continuity.messages.length,
    sourcePointerCount: sourcePointers.length,
    latestAssistantMessageId: latestAssistant?.id ?? null
  };
}
