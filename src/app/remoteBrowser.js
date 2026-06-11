// Phase 11 — Remote-browser view + supervised takeover (vanilla JS, no build step).
//
// Mounts a live view of the worker browser and, on explicit user approval, relays
// the user's own keyboard/pointer (password, captcha, 2FA) into that browser.
// The autonomous agent never types credentials; this widget only forwards human input.
//
// Usage:
//   import { mountRemoteBrowser } from "./remoteBrowser.js";
//   mountRemoteBrowser(document.querySelector("#remote-browser"), { sessionId, userId, apiBase });

const API = (base, path) => `${base ?? ""}${path}`;

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {})
  });
  return res.json().catch(() => ({ ok: false, status: "bad_json" }));
}

export function mountRemoteBrowser(root, { sessionId, userId = null, apiBase = "" } = {}) {
  if (!root) throw new Error("mountRemoteBrowser requires a root element");
  root.innerHTML = TEMPLATE;
  const el = (sel) => root.querySelector(sel);

  const screen = el("[data-screen]");
  const statusLine = el("[data-status]");
  const takeoverBadge = el("[data-takeover-badge]");
  const relayField = el("[data-relay]");
  const startBtn = el("[data-action='start']");
  const takeoverBtn = el("[data-action='takeover']");
  const returnBtn = el("[data-action='return']");
  const enterBtn = el("[data-action='enter']");

  const state = { framesSource: null, takeoverId: null, grantToken: null, active: false };

  const setStatus = (text) => { statusLine.textContent = text; };
  const setTakeover = (on) => {
    state.active = on;
    takeoverBadge.hidden = !on;
    relayField.disabled = !on;
    returnBtn.hidden = !on;
    enterBtn.hidden = !on;
    takeoverBtn.hidden = on;
    screen.classList.toggle("is-live-control", on);
    if (on) relayField.focus();
  };

  // --- live frames (read-only by default) ---
  function openFrames() {
    if (state.framesSource) return;
    const url = API(apiBase, `/api/runtime/browser/frames/stream?sessionId=${encodeURIComponent(sessionId)}${userId ? `&userId=${encodeURIComponent(userId)}` : ""}`);
    const source = new EventSource(url);
    source.addEventListener("browser.frame", (evt) => {
      try {
        const frame = JSON.parse(evt.data);
        screen.src = `data:${frame.mime ?? "image/jpeg"};base64,${frame.data}`;
        screen.dataset.metadata = JSON.stringify(frame.metadata ?? {});
      } catch { /* skip malformed frame */ }
    });
    source.addEventListener("error", () => setStatus("Live view reconnecting…"));
    state.framesSource = source;
  }

  startBtn.addEventListener("click", async () => {
    setStatus("Starting live view…");
    const result = await postJson(API(apiBase, "/api/runtime/browser/screencast/start"), { sessionId, userId });
    if (!result.ok) { setStatus(`Could not start live view: ${result.status ?? result.error}`); return; }
    openFrames();
    setStatus(`Live view of ${result.targetUrl ?? "worker browser"} — read-only.`);
    takeoverBtn.hidden = false;
  });

  // --- takeover (request -> grant -> relay) ---
  takeoverBtn.addEventListener("click", async () => {
    setStatus("Requesting control…");
    const req = await postJson(API(apiBase, "/api/runtime/browser/takeover/request"), { sessionId, userId, reason: "user_password_or_captcha" });
    if (!req.ok) { setStatus(`Takeover request failed: ${req.status}`); return; }
    state.takeoverId = req.takeoverId;
    // In production the grant is the user's explicit approval tap; the same gesture both
    // requests and confirms here. The server records an interactive_takeover approval gate.
    const grant = await postJson(API(apiBase, "/api/runtime/browser/takeover/grant"), { takeoverId: state.takeoverId, sessionId, userId, approvedBy: "user" });
    if (!grant.ok) { setStatus(`Takeover not granted: ${grant.status}`); return; }
    state.grantToken = grant.grantToken;
    setTakeover(true);
    setStatus("You have control. Tap the page to focus a field, then type your password or captcha. It is sent only to the portal.");
  });

  returnBtn.addEventListener("click", async () => {
    if (state.takeoverId) await postJson(API(apiBase, "/api/runtime/browser/takeover/end"), { takeoverId: state.takeoverId, reason: "user_returned_control" });
    state.takeoverId = null; state.grantToken = null;
    setTakeover(false);
    relayField.value = "";
    setStatus("Control returned to the assistant. Live view continues (read-only).");
  });

  // --- input relay helpers ---
  const sendInput = (input) => {
    if (!state.active || !state.grantToken) return;
    return postJson(API(apiBase, "/api/runtime/browser/takeover/input"), {
      takeoverId: state.takeoverId, grantToken: state.grantToken, sessionId, userId, input
    });
  };

  // Tap/click on the live image -> remote click at normalized coords (focuses fields).
  screen.addEventListener("pointerdown", (e) => {
    if (!state.active) return;
    const rect = screen.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    sendInput({ kind: "mouse", type: "mousePressed", x, y, button: "left", clickCount: 1 });
    sendInput({ kind: "mouse", type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    relayField.focus(); // keep the mobile keyboard up for typing into the focused remote field
  });

  // Mobile keyboard text (incl. autocorrect/paste) -> insertText into the focused remote field.
  // We forward the delta so the remote field mirrors what the user typed.
  let lastValue = "";
  relayField.addEventListener("input", () => {
    const value = relayField.value;
    if (value.length >= lastValue.length && value.startsWith(lastValue)) {
      const delta = value.slice(lastValue.length);
      if (delta) sendInput({ kind: "text", text: delta });
    } else {
      // user deleted — send backspaces for the removed characters
      const removed = lastValue.length - value.length;
      for (let i = 0; i < Math.max(0, removed); i += 1) {
        sendInput({ kind: "key", type: "keyDown", key: "Backspace", code: "Backspace", keyCode: 8 });
        sendInput({ kind: "key", type: "keyUp", key: "Backspace", code: "Backspace", keyCode: 8 });
      }
    }
    lastValue = value;
  });

  // Submit (Enter) without leaving the relay field, and clear the local mirror so the
  // password/captcha is not left visible on the phone.
  enterBtn.addEventListener("click", () => {
    sendInput({ kind: "key", type: "keyDown", key: "Enter", code: "Enter", keyCode: 13 });
    sendInput({ kind: "key", type: "keyUp", key: "Enter", code: "Enter", keyCode: 13 });
    relayField.value = "";
    lastValue = "";
  });

  return {
    destroy() {
      state.framesSource?.close();
      if (state.takeoverId) postJson(API(apiBase, "/api/runtime/browser/takeover/end"), { takeoverId: state.takeoverId, reason: "widget_destroyed" });
    }
  };
}

const TEMPLATE = `
  <div class="remote-browser">
    <div class="remote-browser__bar">
      <span class="remote-browser__title">Worker browser</span>
      <span class="remote-browser__badge" data-takeover-badge hidden>You are in control</span>
    </div>
    <div class="remote-browser__stage">
      <img alt="Live worker browser view" data-screen class="remote-browser__screen" />
    </div>
    <div class="remote-browser__controls">
      <button type="button" data-action="start">Start live view</button>
      <button type="button" data-action="takeover" hidden>Take over (password / captcha)</button>
      <button type="button" data-action="return" hidden>Return control</button>
    </div>
    <div class="remote-browser__relay">
      <input type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false"
             placeholder="Tap the page, then type here (password / captcha)" data-relay disabled />
      <button type="button" data-action="enter" hidden>Enter</button>
    </div>
    <p class="remote-browser__status" data-status>Idle. Start the live view to watch the worker browser.</p>
  </div>
`;

// Convenience global for the standalone demo page.
if (typeof window !== "undefined") window.mountRemoteBrowser = mountRemoteBrowser;
