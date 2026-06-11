// Phase 11 — Live remote-browser view + supervised mobile takeover.
//
// This module turns the dedicated OpenClaw worker browser (profile `brainstyworkers`,
// gateway :19789) into a screen the user can WATCH live and, under an explicit
// approval, TAKE OVER to type a password or solve a captcha from their phone.
//
// SAFETY MODEL (do not weaken):
//   * The autonomous agent/worker NEVER enters credentials. That invariant is unchanged.
//     `relayHumanInput()` is the only path that produces keystrokes, and it requires an
//     active, human-granted takeover token. No agent/worker code imports it.
//   * Takeover is a deterministic state machine gated by an `interactive_takeover`
//     approval gate (audited via approvalGate) and is session/host/time-bound.
//   * We relay raw input events (key/mouse/text) but DO NOT log their values — audit
//     records aggregate counts only, so a password or captcha solution never lands in
//     the hash-chained audit or the SQLite store.
//   * Screencast frames are broadcast in-memory only (never written to the DB) because
//     they are high-frequency and may contain the user's own portal content.
//
// Transport reuse: lifecycle events flow over the existing runtime-event SSE bus;
// frames flow over a dedicated lightweight in-memory pub/sub (see subscribeBrowserFrames).

import { createId, nowIso } from "./database.mjs";
import { publishRuntimeEvent } from "./runtimeEvents.mjs";
import { audit, approvalGate } from "./audit.mjs";
import { getOfficialOpenClawConfig, resolveActivePageCdpTarget } from "./openclawOfficialRuntime.mjs";

export const BROWSER_STREAM_VERSION = "2026-06-11.remote-browser-control.v1";

const DEFAULT_TAKEOVER_TTL_MS = 5 * 60 * 1000; // a takeover window is short by design
const SCREENCAST_DEFAULTS = { format: "jpeg", quality: 60, maxWidth: 1280, maxHeight: 1280, everyNthFrame: 1 };
const ALLOWED_INPUT_KINDS = new Set(["key", "text", "mouse", "scroll"]);
const ALLOWED_KEY_TYPES = new Set(["keyDown", "keyUp", "rawKeyDown", "char"]);
const ALLOWED_MOUSE_TYPES = new Set(["mousePressed", "mouseReleased", "mouseMoved", "mouseWheel"]);

// sessionKey -> { client, frameListeners:Set, lastMetadata, status, config, targetUrl, startedAt }
const screencastSessions = new Map();
// takeoverId -> grant record
const takeoverGrants = new Map();

function streamKeyFor(sessionId, userId) {
  return `${userId ?? "anon"}::${sessionId ?? "default"}`;
}

// ---------------------------------------------------------------------------
// Minimal CDP client with event support (the in-file CdpScreenshotClient only
// matches id-keyed responses; screencast needs Page.screencastFrame events).
// ---------------------------------------------------------------------------
class CdpSessionClient {
  constructor(webSocketDebuggerUrl) {
    this.webSocketDebuggerUrl = webSocketDebuggerUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.eventHandlers = new Map();
    this.closed = false;
  }

  async connect() {
    this.socket = new WebSocket(this.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out connecting to OpenClaw browser CDP")), 8000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      });
      this.socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("OpenClaw browser CDP websocket error"));
      });
    });
    this.socket.addEventListener("message", (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (payload.id && this.pending.has(payload.id)) {
        const { resolve, reject } = this.pending.get(payload.id);
        this.pending.delete(payload.id);
        if (payload.error) reject(new Error(payload.error.message));
        else resolve(payload.result);
        return;
      }
      if (payload.method) {
        for (const handler of this.eventHandlers.get(payload.method) ?? []) {
          try {
            handler(payload.params ?? {});
          } catch {
            // a broken UI listener must never break the CDP pump
          }
        }
      }
    });
    this.socket.addEventListener("close", () => {
      this.closed = true;
    });
    return this;
  }

  on(method, handler) {
    const handlers = this.eventHandlers.get(method) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(method, handlers);
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error("CDP socket closed"));
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`OpenClaw CDP call timed out: ${method}`));
      }, 12000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  close() {
    this.closed = true;
    try {
      this.socket?.close();
    } catch {
      // already gone
    }
  }
}

// ---------------------------------------------------------------------------
// Frame pub/sub (in-memory, never persisted).
// ---------------------------------------------------------------------------
export function subscribeBrowserFrames(streamKey, listener) {
  const session = screencastSessions.get(streamKey);
  if (session) session.frameListeners.add(listener);
  else pendingFrameListeners(streamKey).add(listener);
  return () => {
    screencastSessions.get(streamKey)?.frameListeners.delete(listener);
    pendingFrameListeners(streamKey).delete(listener);
  };
}

const pendingListenersByKey = new Map();
function pendingFrameListeners(streamKey) {
  if (!pendingListenersByKey.has(streamKey)) pendingListenersByKey.set(streamKey, new Set());
  return pendingListenersByKey.get(streamKey);
}

function broadcastFrame(streamKey, frame) {
  const session = screencastSessions.get(streamKey);
  const listeners = new Set([...(session?.frameListeners ?? []), ...pendingFrameListeners(streamKey)]);
  for (const listener of listeners) {
    try {
      listener(frame);
    } catch {
      // diagnostic stream — ignore listener faults
    }
  }
}

// ---------------------------------------------------------------------------
// Screencast lifecycle.
// ---------------------------------------------------------------------------
export async function startScreencast({
  store = null,
  sessionId,
  userId = null,
  targetUrl = null,
  config = getOfficialOpenClawConfig(),
  options = {}
} = {}) {
  const streamKey = streamKeyFor(sessionId, userId);
  if (screencastSessions.has(streamKey)) {
    return { ok: true, status: "browser_screencast_already_running", streamKey };
  }
  const target = await resolveActivePageCdpTarget({ config, targetUrl });
  if (!target.ok) {
    return { ok: false, status: target.status, error: target.error };
  }
  const client = await new CdpSessionClient(target.webSocketDebuggerUrl).connect();
  const session = {
    client,
    frameListeners: pendingFrameListeners(streamKey),
    lastMetadata: null,
    status: "running",
    config,
    targetUrl: target.url,
    targetId: target.targetId,
    startedAt: nowIso()
  };
  screencastSessions.set(streamKey, session);
  pendingListenersByKey.delete(streamKey); // listeners are now owned by the live session

  client.on("Page.screencastFrame", async (params) => {
    session.lastMetadata = params.metadata ?? session.lastMetadata;
    broadcastFrame(streamKey, {
      version: BROWSER_STREAM_VERSION,
      kind: "browser.frame",
      sessionId,
      userId,
      mime: `image/${(options.format ?? SCREENCAST_DEFAULTS.format)}`,
      data: params.data, // base64; rendered as an <img> client-side, never stored
      metadata: params.metadata ?? null,
      capturedAt: nowIso()
    });
    // ack so Chromium keeps streaming; without this the screencast stalls after a few frames
    try {
      await client.send("Page.screencastFrameAck", { sessionId: params.sessionId });
    } catch {
      // frame already superseded
    }
  });

  await client.send("Page.enable");
  // Chromium only screencasts the foregrounded tab; bring the streamed page to front
  // so frames actually flow (no-op if it is already active).
  try {
    await client.send("Page.bringToFront");
  } catch {
    // some targets reject bringToFront; screencast still works if the tab is visible
  }
  await client.send("Page.startScreencast", { ...SCREENCAST_DEFAULTS, ...options });

  if (store) {
    await publishRuntimeEvent(store, {
      source: "browser-controller",
      eventType: "browser.screencast.started",
      sessionId,
      userId,
      payload: { targetUrl: session.targetUrl, streamKey }
    });
  }
  return { ok: true, status: "browser_screencast_started", streamKey, targetUrl: session.targetUrl };
}

export async function stopScreencast({ store = null, sessionId, userId = null } = {}) {
  const streamKey = streamKeyFor(sessionId, userId);
  const session = screencastSessions.get(streamKey);
  if (!session) return { ok: true, status: "browser_screencast_not_running" };
  try {
    await session.client.send("Page.stopScreencast");
  } catch {
    // best effort
  }
  session.client.close();
  screencastSessions.delete(streamKey);
  if (store) {
    await publishRuntimeEvent(store, {
      source: "browser-controller",
      eventType: "browser.screencast.stopped",
      sessionId,
      userId,
      payload: { streamKey }
    });
  }
  return { ok: true, status: "browser_screencast_stopped", streamKey };
}

// ---------------------------------------------------------------------------
// Takeover lifecycle — request -> grant (approval gate) -> input relay -> end.
// ---------------------------------------------------------------------------
export async function requestTakeover({ store, sessionId, userId = null, reason = null, host = null } = {}) {
  const takeoverId = createId("takeover");
  const grant = {
    takeoverId,
    sessionId,
    userId,
    host,
    reason: reason ?? "user_requested_interactive_takeover",
    status: "pending_approval",
    grantToken: null,
    createdAt: nowIso(),
    expiresAt: null,
    counters: { key: 0, text: 0, mouse: 0, scroll: 0 }
  };
  takeoverGrants.set(takeoverId, grant);
  await audit(store, sessionId, "interactive_takeover_requested", {
    takeoverId,
    userId,
    host,
    reason: grant.reason,
    boundary: "agent_never_enters_credentials_human_relay_only"
  });
  await publishRuntimeEvent(store, {
    source: "browser-controller",
    eventType: "browser.takeover.requested",
    sessionId,
    userId,
    correlationId: takeoverId,
    payload: { takeoverId, host, reason: grant.reason, status: grant.status }
  });
  return { ok: true, status: "interactive_takeover_pending_approval", takeoverId };
}

// Granting requires an explicit human approval decision. This is the ONLY place a
// grantToken is minted; an agent has no path to call it with decision === "approved".
export async function grantTakeover({
  store,
  takeoverId,
  sessionId,
  userId = null,
  approvedBy = "user",
  ttlMs = DEFAULT_TAKEOVER_TTL_MS
} = {}) {
  const grant = takeoverGrants.get(takeoverId);
  if (!grant) return { ok: false, status: "interactive_takeover_not_found" };
  if (grant.sessionId !== sessionId) return { ok: false, status: "interactive_takeover_session_mismatch" };
  if (grant.status === "active") return { ok: true, status: "interactive_takeover_already_active", takeoverId, grantToken: grant.grantToken };
  if (grant.status !== "pending_approval") return { ok: false, status: "interactive_takeover_not_grantable" };

  grant.status = "active";
  grant.grantToken = createId("takeovertoken");
  grant.expiresAt = new Date(Date.now() + ttlMs).toISOString();

  await approvalGate(store, sessionId, "interactive_takeover", "approved", {
    takeoverId,
    approvedBy,
    expiresAt: grant.expiresAt,
    scope: "human_keyboard_pointer_relay_into_worker_browser",
    boundary: "agent_actions_unchanged_blocked"
  });
  await publishRuntimeEvent(store, {
    source: "browser-controller",
    eventType: "browser.takeover.granted",
    sessionId,
    userId: userId ?? grant.userId,
    correlationId: takeoverId,
    payload: { takeoverId, expiresAt: grant.expiresAt, status: grant.status }
  });
  return { ok: true, status: "interactive_takeover_active", takeoverId, grantToken: grant.grantToken, expiresAt: grant.expiresAt };
}

function activeGrantOrReason(takeoverId, grantToken) {
  const grant = takeoverGrants.get(takeoverId);
  if (!grant) return { ok: false, status: "interactive_takeover_not_found" };
  if (grant.status !== "active") return { ok: false, status: "interactive_takeover_not_active" };
  if (!grantToken || grantToken !== grant.grantToken) return { ok: false, status: "interactive_takeover_token_invalid" };
  if (grant.expiresAt && Date.parse(grant.expiresAt) < Date.now()) {
    grant.status = "expired";
    return { ok: false, status: "interactive_takeover_expired" };
  }
  return { ok: true, grant };
}

// THE input relay. Requires origin==="human" AND a valid active grant token.
// It only forwards CDP input primitives; it cannot navigate, submit, or read the DOM.
export async function relayHumanInput({ store, takeoverId, grantToken, origin, input, sessionId = null, userId = null } = {}) {
  // Hard safety gate: this function exists exclusively for human-originated keystrokes.
  if (origin !== "human") {
    if (store) {
      await audit(store, sessionId, "interactive_takeover_input_rejected", {
        takeoverId,
        reason: "non_human_origin",
        origin: String(origin ?? "unspecified")
      });
    }
    return { ok: false, status: "interactive_takeover_human_origin_required" };
  }
  const resolved = activeGrantOrReason(takeoverId, grantToken);
  if (!resolved.ok) return resolved;
  const grant = resolved.grant;

  const kind = input?.kind;
  if (!ALLOWED_INPUT_KINDS.has(kind)) return { ok: false, status: "interactive_takeover_input_kind_unsupported" };

  const streamKey = streamKeyFor(grant.sessionId, grant.userId);
  const session = screencastSessions.get(streamKey);
  if (!session) return { ok: false, status: "interactive_takeover_no_live_browser" };

  try {
    await dispatchInput(session, kind, input);
  } catch (error) {
    return { ok: false, status: "interactive_takeover_input_dispatch_failed", error: error.message };
  }
  // Count only — never persist the key/text VALUE (it may be a password or captcha).
  grant.counters[kind] = (grant.counters[kind] ?? 0) + 1;
  return { ok: true, status: "interactive_takeover_input_relayed", kind };
}

async function dispatchInput(session, kind, input) {
  const client = session.client;
  const meta = session.lastMetadata;
  // CDP Input coordinates are CSS pixels relative to the viewport. The client sends
  // normalized [0..1] coords; we scale by the last frame's device CSS size.
  const deviceWidth = Number(meta?.deviceWidth) || 1280;
  const deviceHeight = Number(meta?.deviceHeight) || 800;
  const toX = (nx) => Math.max(0, Math.min(deviceWidth, Number(nx) * deviceWidth));
  const toY = (ny) => Math.max(0, Math.min(deviceHeight, Number(ny) * deviceHeight));

  if (kind === "text") {
    // Best path for mobile keyboards entering a password/captcha into a focused field.
    await client.send("Input.insertText", { text: String(input.text ?? "") });
    return;
  }
  if (kind === "key") {
    if (!ALLOWED_KEY_TYPES.has(input.type)) throw new Error(`unsupported key type ${input.type}`);
    await client.send("Input.dispatchKeyEvent", {
      type: input.type,
      key: input.key,
      code: input.code,
      text: input.text,
      unmodifiedText: input.text,
      windowsVirtualKeyCode: input.keyCode,
      modifiers: Number(input.modifiers ?? 0)
    });
    return;
  }
  if (kind === "mouse") {
    if (!ALLOWED_MOUSE_TYPES.has(input.type)) throw new Error(`unsupported mouse type ${input.type}`);
    await client.send("Input.dispatchMouseEvent", {
      type: input.type,
      x: toX(input.x),
      y: toY(input.y),
      button: input.button ?? "left",
      buttons: input.buttons ?? 0,
      clickCount: input.clickCount ?? (input.type === "mousePressed" ? 1 : 0),
      modifiers: Number(input.modifiers ?? 0)
    });
    return;
  }
  if (kind === "scroll") {
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: toX(input.x ?? 0.5),
      y: toY(input.y ?? 0.5),
      deltaX: Number(input.deltaX ?? 0),
      deltaY: Number(input.deltaY ?? 0)
    });
    return;
  }
  throw new Error(`unsupported input kind ${kind}`);
}

export async function endTakeover({ store, takeoverId, reason = "user_returned_control" } = {}) {
  const grant = takeoverGrants.get(takeoverId);
  if (!grant) return { ok: true, status: "interactive_takeover_not_found" };
  grant.status = "ended";
  await audit(store, grant.sessionId, "interactive_takeover_ended", {
    takeoverId,
    reason,
    // aggregate telemetry only; no keystroke values are ever recorded
    relayedEventCounts: grant.counters
  });
  await publishRuntimeEvent(store, {
    source: "browser-controller",
    eventType: "browser.takeover.ended",
    sessionId: grant.sessionId,
    userId: grant.userId,
    correlationId: takeoverId,
    payload: { takeoverId, reason, relayedEventCounts: grant.counters }
  });
  takeoverGrants.delete(takeoverId);
  return { ok: true, status: "interactive_takeover_ended", takeoverId, relayedEventCounts: grant.counters };
}

export function describeTakeover(takeoverId) {
  const grant = takeoverGrants.get(takeoverId);
  if (!grant) return null;
  return {
    takeoverId: grant.takeoverId,
    sessionId: grant.sessionId,
    status: grant.status,
    host: grant.host,
    createdAt: grant.createdAt,
    expiresAt: grant.expiresAt
  };
}

// Test/diagnostic helper: report whether a live screencast exists for a stream.
export function screencastStatus(sessionId, userId = null) {
  const session = screencastSessions.get(streamKeyFor(sessionId, userId));
  return session
    ? { running: true, targetUrl: session.targetUrl, startedAt: session.startedAt, hasMetadata: Boolean(session.lastMetadata) }
    : { running: false };
}
