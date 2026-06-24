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

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body ?? {})
  });
  const payload = await res.json().catch(() => ({ ok: false, status: "bad_json" }));
  if (!res.ok) {
    return {
      ok: false,
      httpStatus: res.status,
      status: payload?.detail ?? payload?.status ?? payload?.error ?? res.statusText,
      payload
    };
  }
  return { ok: payload?.ok ?? true, ...payload };
}

export function mountRemoteBrowser(root, {
  sessionId,
  userId = null,
  apiBase = "",
  targetUrl = null,
  providerMode = "local_cdp",
  facadeBaseUrl = "",
  authToken = null,
  provider = "hosted_remote"
} = {}) {
  if (!root) throw new Error("mountRemoteBrowser requires a root element");
  root.innerHTML = TEMPLATE;
  const el = (sel) => root.querySelector(sel);

  const stage = el("[data-stage]");
  const screen = el("[data-screen]");
  const statusLine = el("[data-status]");
  const takeoverBadge = el("[data-takeover-badge]");
  const relayField = el("[data-relay]");
  const startBtn = el("[data-action='start']");
  const takeoverBtn = el("[data-action='takeover']");
  const returnBtn = el("[data-action='return']");
  const expandBtn = el("[data-action='expand']");
  const enterBtn = el("[data-action='enter']");
  const goBtn = el("[data-action='go']");
  const urlField = el("[data-browser-url]");
  const scanClaimsBtn = el("[data-action='scan-claims']");
  const scanResult = el("[data-claims-result]");

  const state = {
    framesSource: null,
    frameStreamController: null,
    browserSessionId: null,
    streamUrl: null,
    takeoverId: null,
    grantToken: null,
    active: false
  };
  const usesFacadeRemote = providerMode === "facade_remote";
  const authHeaders = () => authToken ? { authorization: `Bearer ${authToken}` } : {};
  const facadeUrl = (path) => API(facadeBaseUrl.replace(/\/$/, ""), path);
  const hostPanel = root.closest(".worker-browser-panel");

  const setStatus = (text) => { statusLine.textContent = text; };
  const setExpanded = (expanded) => {
    hostPanel?.classList.toggle("is-expanded", expanded);
    document.body?.classList.toggle("remote-browser-expanded", expanded);
    expandBtn.textContent = expanded ? "Collapse browser" : "Expand browser";
    if (expanded) {
      setTimeout(() => {
        hostPanel?.scrollIntoView({ block: "start", inline: "nearest", behavior: "smooth" });
        focusControlSurface();
      }, 0);
    }
  };
  const setViewerUrl = (url) => {
    state.viewerUrl = url || null;
    screen.hidden = false;
  };
  const setTakeover = (on) => {
    state.active = on;
    takeoverBadge.hidden = !on;
    relayField.disabled = !on;
    urlField.disabled = !on;
    goBtn.disabled = !on;
    returnBtn.hidden = !on;
    enterBtn.hidden = !on;
    takeoverBtn.hidden = on;
    stage.classList.toggle("is-live-control", on);
    if (on) focusControlSurface();
  };

  function focusControlSurface() {
    try {
      stage.focus({ preventScroll: true });
    } catch {
      stage.focus();
    }
  }

  // --- live frames (read-only by default) ---
  function openLocalFrames() {
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

  async function openFacadeRemoteFrames(streamUrl) {
    if (state.frameStreamController) return;
    const controller = new AbortController();
    state.frameStreamController = controller;
    try {
      const response = await fetch(facadeUrl(streamUrl), {
        headers: { accept: "text/event-stream", ...authHeaders() },
        signal: controller.signal
      });
      if (!response.ok || !response.body) {
        setStatus(`Remote AWS browser stream unavailable: ${response.status} ${response.statusText}`);
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\n\n/);
        buffer = events.pop() ?? "";
        for (const eventText of events) handleSseEvent(eventText);
      }
    } catch (error) {
      if (!controller.signal.aborted) setStatus(`Remote AWS browser stream interrupted: ${error.message}`);
    }
  }

  function handleSseEvent(eventText) {
    const lines = eventText.split(/\r?\n/);
    const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
    const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
    if (!data) return;
    try {
      const payload = JSON.parse(data);
      if (payload.data && payload.mime) {
        screen.src = `data:${payload.mime};base64,${payload.data}`;
        screen.dataset.metadata = JSON.stringify(payload.metadata ?? {});
        if (payload.metadata?.url && document.activeElement !== urlField) {
          urlField.value = payload.metadata.url;
        }
        screen.hidden = false;
        setStatus(payload.metadata?.title
          ? `Remote AWS browser live: ${payload.metadata.title}. Use Take over for user-controlled input.`
          : "Remote AWS browser live. Use Take over for user-controlled input.");
        return;
      }
      if (payload.frameRefPresent || eventName?.startsWith("hosted.sandbox")) {
        setStatus(payload.providerLiveConnected
          ? "Remote AWS browser stream is live. Use Take over for user-controlled input."
          : "Remote browser sandbox contract stream is connected; waiting for live AWS provider frames.");
      }
    } catch { /* skip malformed stream events */ }
  }

  function remoteViewerUrl(result) {
    return result?.screencast?.sessionViewerUrl
      ?? result?.screencast?.viewerUrl
      ?? result?.sessionViewerUrl
      ?? result?.viewerUrl
      ?? null;
  }

  function currentFrameMetadata() {
    try {
      return JSON.parse(screen.dataset.metadata || "{}");
    } catch {
      return {};
    }
  }

  function normalizeNavigationUrl(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      const parsed = new URL(candidate);
      if (!["http:", "https:"].includes(parsed.protocol)) return "";
      return parsed.href;
    } catch {
      return "";
    }
  }

  function normalizedPointFromEvent(event) {
    const rect = screen.getBoundingClientRect();
    const metadata = currentFrameMetadata();
    const naturalWidth = Number(metadata.width || screen.naturalWidth || 0);
    const naturalHeight = Number(metadata.height || screen.naturalHeight || 0);
    let contentLeft = rect.left;
    let contentTop = rect.top;
    let contentWidth = rect.width;
    let contentHeight = rect.height;
    if (naturalWidth > 0 && naturalHeight > 0 && rect.width > 0 && rect.height > 0) {
      const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
      contentWidth = naturalWidth * scale;
      contentHeight = naturalHeight * scale;
      contentLeft = rect.left + (rect.width - contentWidth) / 2;
      contentTop = rect.top + (rect.height - contentHeight) / 2;
    }
    return {
      x: Math.max(0, Math.min(1, (event.clientX - contentLeft) / Math.max(1, contentWidth))),
      y: Math.max(0, Math.min(1, (event.clientY - contentTop) / Math.max(1, contentHeight)))
    };
  }

  function remoteViewportOptions() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, Number(window.devicePixelRatio || 1)));
    const renderedWidth = Math.max(1, rect.width || screen.clientWidth || 1280);
    const renderedHeight = Math.max(1, rect.height || screen.clientHeight || 720);
    return {
      width: Math.round(Math.max(1024, Math.min(1920, renderedWidth * dpr))),
      height: Math.round(Math.max(640, Math.min(1200, renderedHeight * dpr))),
      deviceScaleFactor: dpr
    };
  }

  startBtn.addEventListener("click", async () => {
    if (usesFacadeRemote) {
      setStatus("Starting remote AWS browser sandbox…");
      if (!authToken) {
        setStatus("Could not start remote AWS browser: start a facade session first so the browser API has a bearer token.");
        return;
      }
      const result = await postJson(
        facadeUrl("/api/v1/browser/sessions"),
        {
          session_id: sessionId,
          target_url: targetUrl,
          provider,
          options: {
            client: "mvp_worker_browser_live_view",
            requireHostedAwsSandbox: true,
            ...remoteViewportOptions(),
            targetUrlRef: targetUrl ? "mvp-user-selected-target-url-ref" : "approved-target-url-ref-redacted"
          }
        },
        authHeaders()
      );
      if (!result.ok) { setStatus(liveViewErrorMessage(result, { remote: true })); return; }
      state.browserSessionId = result.browser_session_id;
      state.streamUrl = result.stream_url;
      if (result.current_url) urlField.value = result.current_url;
      setViewerUrl(remoteViewerUrl(result));
      if (state.streamUrl) openFacadeRemoteFrames(state.streamUrl);
      setStatus(`Remote AWS browser sandbox ready — ${result.current_title ?? "read-only live view"}.`);
      takeoverBtn.hidden = false;
      scanClaimsBtn.hidden = false;
      return;
    }

    setStatus("Starting local live view…");
    const result = await postJson(API(apiBase, "/api/runtime/browser/screencast/start"), { sessionId, userId, targetUrl });
    if (!result.ok) { setStatus(liveViewErrorMessage(result)); return; }
    openLocalFrames();
    setStatus(`Local live view of ${result.targetUrl ?? "worker browser"} — read-only.`);
    takeoverBtn.hidden = false;
  });

  expandBtn.addEventListener("click", () => {
    setExpanded(!hostPanel?.classList.contains("is-expanded"));
  });

  // --- takeover (request -> grant -> relay) ---
  takeoverBtn.addEventListener("click", async () => {
    setStatus("Requesting control…");
    const req = usesFacadeRemote
      ? await postJson(facadeUrl(`/api/v1/browser/sessions/${encodeURIComponent(state.browserSessionId)}/takeover`), { mode: "request", reason: "user_password_or_captcha" }, authHeaders())
      : await postJson(API(apiBase, "/api/runtime/browser/takeover/request"), { sessionId, userId, reason: "user_password_or_captcha" });
    if (!req.ok) { setStatus(`Takeover request failed: ${req.status}`); return; }
    state.takeoverId = req.takeoverId;
    // In production the grant is the user's explicit approval tap; the same gesture both
    // requests and confirms here. The server records an interactive_takeover approval gate.
    const grant = usesFacadeRemote
      ? await postJson(facadeUrl(`/api/v1/browser/sessions/${encodeURIComponent(state.browserSessionId)}/takeover`), { mode: "grant", takeover_id: state.takeoverId, approved_by: "user" }, authHeaders())
      : await postJson(API(apiBase, "/api/runtime/browser/takeover/grant"), { takeoverId: state.takeoverId, sessionId, userId, approvedBy: "user" });
    if (!grant.ok) { setStatus(`Takeover not granted: ${grant.status}`); return; }
    state.grantToken = grant.grantToken;
    setTakeover(true);
    setExpanded(true);
    setStatus(usesFacadeRemote
      ? "You have control of the remote AWS sandbox. Click, type, scroll, or use the address bar. Use the relay field only as a fallback."
      : "You have control. Tap the page to focus a field, then type your password or captcha. It is sent only to the portal.");
  });

  returnBtn.addEventListener("click", async () => {
    if (state.takeoverId && usesFacadeRemote) {
      await postJson(facadeUrl(`/api/v1/browser/sessions/${encodeURIComponent(state.browserSessionId)}/takeover`), { mode: "end", takeover_id: state.takeoverId, reason: "user_returned_control" }, authHeaders());
    } else if (state.takeoverId) {
      await postJson(API(apiBase, "/api/runtime/browser/takeover/end"), { takeoverId: state.takeoverId, reason: "user_returned_control" });
    }
    state.takeoverId = null; state.grantToken = null;
    setTakeover(false);
    relayField.value = "";
    setStatus("Control returned to the assistant. Live view continues (read-only).");
    if (usesFacadeRemote) scanClaimsBtn.hidden = false;
  });

  scanClaimsBtn.addEventListener("click", async () => {
    if (!usesFacadeRemote || !state.browserSessionId) {
      setStatus("Start the remote AWS browser before running read-only claim observation.");
      return;
    }
    scanClaimsBtn.disabled = true;
    scanResult.hidden = false;
    scanResult.textContent = "OpenClaw is observing the current remote page in read-only mode...";
    setStatus("OpenClaw is continuing read-only observation in the remote AWS sandbox...");
    const result = await postJson(
      facadeUrl(`/api/v1/browser/sessions/${encodeURIComponent(state.browserSessionId)}/openclaw/claims-observe`),
      {
        message: "After human login, observe Aetna claims in read-only mode and compose a cited answer.",
        useLiveModel: true
      },
      authHeaders()
    );
    scanClaimsBtn.disabled = false;
    if (!result.ok) {
      const next = result.observation?.next_action ?? result.payload?.detail ?? result.status ?? "User login or claims page is still required.";
      scanResult.textContent = next;
      setStatus(`Read-only claim scan needs attention: ${next}`);
      return;
    }
    const claims = result.claim_rows ?? [];
    const sourceIds = (result.source_pointers ?? []).map((pointer) => `${pointer.table ?? "source"}/${pointer.id}`).join(", ");
    scanResult.textContent = [
      result.final_response ?? `OpenClaw found ${claims.length} claim row(s).`,
      sourceIds ? `Source pointers: ${sourceIds}` : null
    ].filter(Boolean).join("\n\n");
    setStatus(`OpenClaw read-only claim scan complete: ${claims.length} claim row(s), ${(result.source_pointers ?? []).length} source pointer(s).`);
  });

  // --- input relay helpers ---
  const sendInput = (input) => {
    if (!state.active || !state.grantToken) return;
    return usesFacadeRemote
      ? postJson(facadeUrl(`/api/v1/browser/sessions/${encodeURIComponent(state.browserSessionId)}/input`), {
          takeover_id: state.takeoverId, grant_token: state.grantToken, input
        }, authHeaders())
      : postJson(API(apiBase, "/api/runtime/browser/takeover/input"), {
          takeoverId: state.takeoverId, grantToken: state.grantToken, sessionId, userId, input
        });
  };

  goBtn.addEventListener("click", () => {
    if (!state.active) {
      setStatus("Take over first, then use the address bar to navigate the remote browser.");
      return;
    }
    const url = normalizeNavigationUrl(urlField.value);
    if (!url) {
      setStatus("Enter a valid http or https URL for the remote browser.");
      return;
    }
    sendInput({ kind: "navigate", url });
    setStatus(`Navigating remote browser to ${new URL(url).host} under your takeover control...`);
    focusControlSurface();
  });

  urlField.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    goBtn.click();
  });

  // Tap/click on the app-owned live stage -> remote click at normalized coords.
  // Do not attach this to an iframe/provider viewer: cross-origin viewer layers swallow
  // events and cannot provide a reliable regular-user control surface.
  stage.addEventListener("pointerdown", (e) => {
    if (!state.active) return;
    e.preventDefault();
    stage.setPointerCapture?.(e.pointerId);
    const { x, y } = normalizedPointFromEvent(e);
    sendInput({ kind: "mouse", type: "mousePressed", x, y, button: "left", clickCount: 1 });
    focusControlSurface();
  });

  stage.addEventListener("pointerup", (e) => {
    if (!state.active) return;
    e.preventDefault();
    stage.releasePointerCapture?.(e.pointerId);
    const { x, y } = normalizedPointFromEvent(e);
    sendInput({ kind: "mouse", type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  });

  stage.addEventListener("pointermove", (e) => {
    if (!state.active || e.buttons !== 1) return;
    e.preventDefault();
    const { x, y } = normalizedPointFromEvent(e);
    sendInput({ kind: "mouse", type: "mouseMoved", x, y, button: "left", clickCount: 0 });
  });

  stage.addEventListener("wheel", (e) => {
    if (!state.active) return;
    e.preventDefault();
    const { x, y } = normalizedPointFromEvent(e);
    sendInput({
      kind: "wheel",
      x,
      y,
      deltaX: Number(e.deltaX || 0),
      deltaY: Number(e.deltaY || 0)
    });
  }, { passive: false });

  function relayKey(event) {
    if (!state.active) return;
    const isModifierShortcut = event.metaKey || event.altKey || (event.ctrlKey && event.key.toLowerCase() !== "v");
    if (isModifierShortcut) return;
    const keyMap = {
      Enter: { code: "Enter", keyCode: 13 },
      Backspace: { code: "Backspace", keyCode: 8 },
      Delete: { code: "Delete", keyCode: 46 },
      Tab: { code: "Tab", keyCode: 9 },
      Escape: { code: "Escape", keyCode: 27 },
      ArrowLeft: { code: "ArrowLeft", keyCode: 37 },
      ArrowUp: { code: "ArrowUp", keyCode: 38 },
      ArrowRight: { code: "ArrowRight", keyCode: 39 },
      ArrowDown: { code: "ArrowDown", keyCode: 40 }
    };
    if (event.key.length === 1 && !event.ctrlKey) {
      event.preventDefault();
      sendInput({ kind: "text", text: event.key });
      return;
    }
    const mapped = keyMap[event.key];
    if (mapped) {
      event.preventDefault();
      sendInput({ kind: "key", type: "keyDown", key: event.key, code: mapped.code, keyCode: mapped.keyCode });
      sendInput({ kind: "key", type: "keyUp", key: event.key, code: mapped.code, keyCode: mapped.keyCode });
    }
  }

  function relayPaste(event) {
    if (!state.active) return;
    const text = event.clipboardData?.getData("text");
    if (!text) return;
    event.preventDefault();
    sendInput({ kind: "text", text: text.slice(0, 2048) });
  }

  stage.addEventListener("keydown", relayKey);
  stage.addEventListener("paste", relayPaste);

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
      state.frameStreamController?.abort();
      if (state.takeoverId && usesFacadeRemote) {
        postJson(facadeUrl(`/api/v1/browser/sessions/${encodeURIComponent(state.browserSessionId)}/takeover`), { mode: "end", takeover_id: state.takeoverId, reason: "widget_destroyed" }, authHeaders());
      } else if (state.takeoverId) {
        postJson(API(apiBase, "/api/runtime/browser/takeover/end"), { takeoverId: state.takeoverId, reason: "widget_destroyed" });
      }
    }
  };
}

function liveViewErrorMessage(result, { remote = false } = {}) {
  const status = result.status ?? result.error ?? "unknown_error";
  if (remote) return `Could not start remote AWS browser: ${status}`;
  if (status === "official_openclaw_cdp_target_missing") {
    return "Could not start live view: open the portal in the dedicated OpenClaw browser first, then try again.";
  }
  if (status === "official_openclaw_browser_status_failed" || status === "official_openclaw_live_view_open_url_failed") {
    return "Could not start live view: the dedicated OpenClaw browser is not available. Check Worker, then try again.";
  }
  return `Could not start live view: ${status}`;
}

const TEMPLATE = `
  <div class="remote-browser">
    <div class="remote-browser__bar">
      <span class="remote-browser__title">Worker browser</span>
      <span class="remote-browser__badge" data-takeover-badge hidden>You are in control</span>
    </div>
    <div class="remote-browser__stage" data-stage tabindex="0" aria-label="Remote browser control surface">
      <img alt="Live worker browser view" data-screen class="remote-browser__screen" />
    </div>
    <div class="remote-browser__controls">
      <button type="button" data-action="start">Start live view</button>
      <button type="button" data-action="takeover" hidden>Take over (password / captcha)</button>
      <button type="button" data-action="return" hidden>Return control</button>
      <button type="button" data-action="expand">Expand browser</button>
      <button type="button" data-action="scan-claims" hidden>Continue read-only claim scan</button>
    </div>
    <div class="remote-browser__nav">
      <input type="url" inputmode="url" autocomplete="off" spellcheck="false"
             placeholder="Remote browser URL" data-browser-url disabled />
      <button type="button" data-action="go" disabled>Go</button>
    </div>
    <div class="remote-browser__relay">
      <input type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false"
             placeholder="Fallback relay input only when direct typing does not focus the remote page" data-relay disabled />
      <button type="button" data-action="enter" hidden>Enter</button>
    </div>
    <pre class="remote-browser__claims" data-claims-result hidden></pre>
    <p class="remote-browser__status" data-status>Idle. Start the live view to watch the worker browser.</p>
  </div>
`;

// Convenience global for the standalone demo page.
if (typeof window !== "undefined") window.mountRemoteBrowser = mountRemoteBrowser;
