import { createId, nowIso } from "./database.mjs";
import { createLangGraphThreadId } from "./langgraphScope.mjs";
import { CHANNELS } from "./types.mjs";

const CHECKPOINT_NS = "brainstyworkers";
const checkpointLocks = new Map();

async function withCheckpointLock(sessionId, fn) {
  const previous = checkpointLocks.get(sessionId) ?? Promise.resolve();
  let release;
  const next = new Promise((resolve) => {
    release = resolve;
  });
  const lock = previous.then(() => next);
  checkpointLocks.set(sessionId, lock);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (checkpointLocks.get(sessionId) === lock) {
      checkpointLocks.delete(sessionId);
    }
  }
}

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function baseState({ user, session, portal }) {
  return {
    schemaVersion: 1,
    sessionId: session.id,
    userId: user.id,
    channel: session.channel,
    langchain: {
      configurable: {
        thread_id: session.langgraph_thread_id,
        checkpoint_ns: CHECKPOINT_NS
      }
    },
    memory: {
      scope: "session_only",
      crossSessionMemory: false,
      hindsightDeferred: true
    },
    portal: portal
      ? {
          portalAccountId: portal.id,
          payer: portal.payer,
          portalUrl: portal.portal_url
        }
      : null,
    workflow: {
      currentStep: session.current_step ?? "created",
      lastIntent: session.last_intent ?? null,
      latestBrowserRunId: null,
      latestEligibilitySnapshotId: null
    },
    timestamps: {
      createdAt: session.created_at,
      updatedAt: nowIso()
    }
  };
}

async function insertSessionEvent(store, sessionId, eventType, payload = {}) {
  const row = {
    id: createId("sevent"),
    session_id: sessionId,
    event_type: eventType,
    event_payload: JSON.stringify(payload),
    created_at: nowIso()
  };
  await store.insert("session_events", row);
  return row;
}

export async function createManagedSession(store, { user, portal, channel = CHANNELS.WEB_CHAT, title }) {
  const createdAt = nowIso();
  const session = {
    id: createId("session"),
    user_id: user.id,
    channel,
    langgraph_thread_id: createLangGraphThreadId(user.id, crypto.randomUUID()),
    title: title ?? "Eligibility and benefits session",
    current_step: "created",
    last_intent: null,
    state_version: 1,
    metadata_json: JSON.stringify({
      source: "local_web_chat",
      langchainStatefulReady: true
    }),
    status: "active",
    last_active_at: createdAt,
    expires_at: addHours(new Date(), 4),
    closed_at: null,
    created_at: createdAt
  };
  await store.insert("sessions", session);

  const state = baseState({ user, session, portal });
  await store.insert("session_state", {
    session_id: session.id,
    user_id: user.id,
    langgraph_thread_id: session.langgraph_thread_id,
    checkpoint_ns: CHECKPOINT_NS,
    state_json: JSON.stringify(state),
    state_version: session.state_version,
    updated_at: createdAt
  });
  await insertSessionEvent(store, session.id, "session_created", {
    langgraphThreadId: session.langgraph_thread_id,
    checkpointNamespace: CHECKPOINT_NS
  });

  return session;
}

export async function resolveManagedSession(store, { user, portal, sessionId, resumeLatestSession = false, channel = CHANNELS.WEB_CHAT, title }) {
  let session = null;
  let resumed = false;
  if (sessionId) {
    session = await store.findOne("sessions", { id: sessionId });
    if (!session || session.user_id !== user.id) {
      throw new Error("Session not found for this user.");
    }
    if (session.status !== "active") {
      throw new Error(`Session ${session.id} is ${session.status}; create a new session or reopen it first.`);
    }
    resumed = true;
  } else if (resumeLatestSession) {
    session = await store.get(
      `SELECT * FROM sessions WHERE user_id = ${sql(user.id)} AND channel = ${sql(channel)} AND status = 'active' ORDER BY COALESCE(last_active_at, created_at) DESC LIMIT 1;`
    );
    resumed = Boolean(session);
  }

  if (!session) {
    session = await createManagedSession(store, { user, portal, channel, title });
  } else {
    await touchSession(store, session.id);
    await ensureSessionState(store, { user, session, portal });
    await insertSessionEvent(store, session.id, "session_resumed", {
      langgraphThreadId: session.langgraph_thread_id,
      checkpointNamespace: CHECKPOINT_NS
    });
  }

  return { session, resumed };
}

export async function ensureSessionState(store, { user, session, portal }) {
  const existing = await store.findOne("session_state", { session_id: session.id });
  if (existing) return existing;
  const state = baseState({ user, session, portal });
  const row = {
    session_id: session.id,
    user_id: user.id,
    langgraph_thread_id: session.langgraph_thread_id,
    checkpoint_ns: CHECKPOINT_NS,
    state_json: JSON.stringify(state),
    state_version: session.state_version ?? 1,
    updated_at: nowIso()
  };
  await store.insert("session_state", row);
  return row;
}

export async function touchSession(store, sessionId) {
  await store.update("sessions", { last_active_at: nowIso() }, { id: sessionId });
}

export async function checkpointSession(store, { session, stepName, statePatch = {}, metadata = {} }) {
  return withCheckpointLock(session.id, async () => {
  const current = await store.findOne("session_state", { session_id: session.id });
  const currentState = parseJson(current?.state_json, {});
  const currentVersion = Number(current?.state_version ?? session.state_version ?? 0);
  const nextVersion = currentVersion + 1;
  const updatedAt = nowIso();
  const nextState = {
    ...currentState,
    ...statePatch,
    workflow: {
      ...(currentState.workflow ?? {}),
      ...(statePatch.workflow ?? {}),
      currentStep: stepName
    },
    timestamps: {
      ...(currentState.timestamps ?? {}),
      updatedAt
    }
  };
  const checkpointId = createId("checkpoint");

  await store.insert("session_checkpoints", {
    id: checkpointId,
    session_id: session.id,
    langgraph_thread_id: session.langgraph_thread_id,
    checkpoint_ns: CHECKPOINT_NS,
    checkpoint_id: checkpointId,
    parent_checkpoint_id: metadata.parentCheckpointId ?? null,
    step_name: stepName,
    state_json: JSON.stringify(nextState),
    metadata_json: JSON.stringify(metadata),
    created_at: updatedAt
  });

  if (current) {
    await store.update(
      "session_state",
      {
        state_json: JSON.stringify(nextState),
        state_version: nextVersion,
        updated_at: updatedAt
      },
      { session_id: session.id }
    );
  }

  await store.update(
    "sessions",
    {
      current_step: stepName,
      last_intent: nextState.workflow?.lastIntent ?? session.last_intent ?? null,
      state_version: nextVersion,
      last_active_at: updatedAt
    },
    { id: session.id }
  );
  await insertSessionEvent(store, session.id, "session_checkpointed", {
    checkpointId,
    stepName,
    stateVersion: nextVersion
  });

  return { checkpointId, state: nextState, stateVersion: nextVersion };
  });
}

export async function getManagedSessionState(store, sessionId) {
  const [session, state, checkpoints, events] = await Promise.all([
    store.findOne("sessions", { id: sessionId }),
    store.findOne("session_state", { session_id: sessionId }),
    store.list("session_checkpoints", { session_id: sessionId }),
    store.list("session_events", { session_id: sessionId })
  ]);
  return {
    session,
    state: state ? { ...state, state: parseJson(state.state_json, {}) } : null,
    checkpoints: checkpoints.map((checkpoint) => ({
      ...checkpoint,
      state: parseJson(checkpoint.state_json, {}),
      metadata: parseJson(checkpoint.metadata_json, {})
    })),
    events: events.map((event) => ({
      ...event,
      payload: parseJson(event.event_payload, {})
    }))
  };
}

export async function listManagedSessions(store, { email, userId, limit = 20 }) {
  const where = userId ? `u.id = ${sql(userId)}` : `u.email = ${sql(email)}`;
  return store.all(
    `SELECT s.*, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE ${where} ORDER BY COALESCE(s.last_active_at, s.created_at) DESC LIMIT ${Number(limit)};`
  );
}

export async function closeManagedSession(store, sessionId) {
  const closedAt = nowIso();
  await store.update("sessions", { status: "closed", closed_at: closedAt, last_active_at: closedAt }, { id: sessionId });
  await insertSessionEvent(store, sessionId, "session_closed", { closedAt });
}
