import { createHmac } from "node:crypto";
import { createId, nowIso } from "./database.mjs";

export const RUNTIME_EVENTS_VERSION = "2026-05-28.runtime-events.v1";

const listeners = new Set();
const codeHooks = new Map();

function safePayload(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function compactEvent(event) {
  return {
    version: RUNTIME_EVENTS_VERSION,
    id: event.id,
    eventType: event.event_type,
    source: event.source,
    userId: event.user_id ?? null,
    sessionId: event.session_id ?? null,
    correlationId: event.correlation_id ?? null,
    payload: JSON.parse(event.payload_json ?? "{}"),
    createdAt: event.created_at
  };
}

async function insertRuntimeEvent(store, event) {
  await store.insert("runtime_events", event);
  if (event.session_id) {
    await store.insert("session_events", {
      id: createId("sevent"),
      session_id: event.session_id,
      event_type: event.event_type,
      event_payload: event.payload_json,
      created_at: event.created_at
    });
  }
}

function notifyListeners(event) {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      // Runtime listeners are diagnostic; one broken UI stream must not break the graph.
    }
  }
}

async function runCodeHooks(store, event) {
  const handlers = [
    ...(codeHooks.get("*") ?? []),
    ...(codeHooks.get(event.eventType) ?? [])
  ];
  for (const handler of handlers) {
    try {
      await handler(event);
    } catch (error) {
      if (store) {
        await store.insert("runtime_hook_deliveries", {
          id: createId("hookdel"),
          subscription_id: null,
          runtime_event_id: event.id,
          target_type: "code",
          target_url: null,
          status: "code_hook_failed",
          response_status: null,
          response_body: String(error.message ?? error).slice(0, 1000),
          created_at: nowIso()
        });
      }
    }
  }
}

function signatureFor(secret, body) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

async function deliverWebhook(store, subscription, event) {
  const body = JSON.stringify(event);
  const enabled = process.env.BRAINSTY_ENABLE_OUTBOUND_WEBHOOKS === "1";
  if (!enabled) {
    await store.insert("runtime_hook_deliveries", {
      id: createId("hookdel"),
      subscription_id: subscription.id,
      runtime_event_id: event.id,
      target_type: subscription.target_type,
      target_url: subscription.target_url,
      status: "dry_run_blocked",
      response_status: null,
      response_body: "Set BRAINSTY_ENABLE_OUTBOUND_WEBHOOKS=1 to deliver outbound webhooks.",
      created_at: nowIso()
    });
    return;
  }

  try {
    const response = await fetch(subscription.target_url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-brainsty-event-id": event.id,
        "x-brainsty-event-type": event.eventType,
        "x-brainsty-signature": signatureFor(subscription.secret, body)
      },
      body
    });
    await store.insert("runtime_hook_deliveries", {
      id: createId("hookdel"),
      subscription_id: subscription.id,
      runtime_event_id: event.id,
      target_type: subscription.target_type,
      target_url: subscription.target_url,
      status: response.ok ? "delivered" : "delivery_failed",
      response_status: response.status,
      response_body: (await response.text()).slice(0, 1000),
      created_at: nowIso()
    });
  } catch (error) {
    await store.insert("runtime_hook_deliveries", {
      id: createId("hookdel"),
      subscription_id: subscription.id,
      runtime_event_id: event.id,
      target_type: subscription.target_type,
      target_url: subscription.target_url,
      status: "delivery_error",
      response_status: null,
      response_body: String(error.message ?? error).slice(0, 1000),
      created_at: nowIso()
    });
  }
}

async function deliverHookSubscriptions(store, event) {
  if (!store) return;
  const rows = await store.all(
    `SELECT * FROM runtime_hook_subscriptions
     WHERE status = 'active'
       AND (event_type = '*' OR event_type = ?)
       AND (session_id IS NULL OR session_id = ?)
       AND (user_id IS NULL OR user_id = ?)
     ORDER BY created_at ASC;`,
    [event.eventType, event.sessionId ?? null, event.userId ?? null]
  );
  for (const row of rows) {
    if (row.target_type === "webhook") {
      await deliverWebhook(store, row, event);
    } else {
      await store.insert("runtime_hook_deliveries", {
        id: createId("hookdel"),
        subscription_id: row.id,
        runtime_event_id: event.id,
        target_type: row.target_type,
        target_url: row.target_url,
        status: "code_hook_registered",
        response_status: null,
        response_body: "Code hooks run in-process through registerRuntimeCodeHook().",
        created_at: nowIso()
      });
    }
  }
}

export function subscribeRuntimeEvents(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerRuntimeCodeHook(eventType, handler) {
  const key = eventType || "*";
  const handlers = codeHooks.get(key) ?? [];
  handlers.push(handler);
  codeHooks.set(key, handlers);
  return () => {
    const current = codeHooks.get(key) ?? [];
    codeHooks.set(
      key,
      current.filter((item) => item !== handler)
    );
  };
}

export async function publishRuntimeEvent(store, options = {}) {
  const createdAt = nowIso();
  const row = {
    id: options.id ?? createId("rtevt"),
    session_id: options.sessionId ?? null,
    user_id: options.userId ?? null,
    source: options.source ?? "langgraph",
    event_type: options.eventType,
    correlation_id: options.correlationId ?? null,
    payload_json: JSON.stringify(safePayload(options.payload ?? {})),
    created_at: createdAt
  };
  if (!row.event_type) throw new Error("Runtime event type is required.");
  if (store) await insertRuntimeEvent(store, row);
  const event = compactEvent(row);
  notifyListeners(event);
  await runCodeHooks(store, event);
  await deliverHookSubscriptions(store, event);
  return event;
}

export async function listRuntimeEvents(store, { sessionId = null, userId = null, eventType = null, limit = 100 } = {}) {
  const bounded = Math.max(1, Math.min(200, Number(limit) || 100));
  const clauses = [];
  const params = [];
  if (sessionId) {
    clauses.push("session_id = ?");
    params.push(sessionId);
  }
  if (userId) {
    clauses.push("user_id = ?");
    params.push(userId);
  }
  if (eventType) {
    clauses.push("event_type = ?");
    params.push(eventType);
  }
  const where = clauses.join(" AND ");
  const rows = await store.all(
    `SELECT * FROM runtime_events${where ? ` WHERE ${where}` : ""} ORDER BY created_at DESC LIMIT ${bounded};`,
    params
  );
  return rows.map(compactEvent);
}

export async function createRuntimeHookSubscription(
  store,
  { userId = null, sessionId = null, eventType = "*", targetType = "webhook", targetUrl = null, secret = null, status = "active" } = {}
) {
  if (!["webhook", "code"].includes(targetType)) throw new Error("targetType must be webhook or code.");
  if (targetType === "webhook" && !targetUrl) throw new Error("Webhook subscriptions require targetUrl.");
  const now = nowIso();
  const row = {
    id: createId("hooksub"),
    user_id: userId,
    session_id: sessionId,
    event_type: eventType || "*",
    target_type: targetType,
    target_url: targetUrl,
    secret: secret ?? createId("hooksecret"),
    status,
    created_at: now,
    updated_at: now
  };
  await store.insert("runtime_hook_subscriptions", row);
  return { ...row, secret: row.secret ? "[stored]" : null };
}

export async function listRuntimeHookSubscriptions(store, { sessionId = null, userId = null, limit = 100 } = {}) {
  const bounded = Math.max(1, Math.min(200, Number(limit) || 100));
  const clauses = [];
  const params = [];
  if (sessionId) {
    clauses.push("session_id = ?");
    params.push(sessionId);
  }
  if (userId) {
    clauses.push("user_id = ?");
    params.push(userId);
  }
  const where = clauses.join(" AND ");
  const rows = await store.all(
    `SELECT id, user_id, session_id, event_type, target_type, target_url, status, created_at, updated_at
     FROM runtime_hook_subscriptions${where ? ` WHERE ${where}` : ""}
     ORDER BY created_at DESC LIMIT ${bounded};`,
    params
  );
  return rows;
}
