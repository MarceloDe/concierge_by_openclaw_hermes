import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  createBrowserSession,
  takeover,
  streamFrames,
  relayInput,
  FACADE_BASE_URL,
  type SessionState,
  type BrowserSession,
  type Frame,
  type RemoteInput
} from "../api";
import { Close } from "./icons";

type Phase = "starting" | "ready" | "controlling" | "error";

// Renders the facade's verified SSE CDP JPEG stream (real remote-browser pixels) and,
// on explicit takeover, relays the user's mouse/keyboard to the remote browser via the
// facade input endpoint (CDP Input dispatch, human-only). This is the path proven to work;
// Steel's own viewer UI is not reachable for live frames behind this deployment's proxy.
export function LiveView({
  session,
  targetUrl,
  onClose
}: {
  session: SessionState;
  targetUrl: string | null;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [status, setStatus] = useState("Starting the live worker browser in the AWS sandbox…");
  const [busy, setBusy] = useState(false);
  const [relay, setRelay] = useState("");

  const bsRef = useRef<BrowserSession | null>(null);
  const takeoverIdRef = useRef<string | null>(null);
  const grantRef = useRef<string | null>(null);
  const controllingRef = useRef(false);
  const metaRef = useRef<Frame["metadata"]>({});
  const lastRelayRef = useRef("");

  const screenRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const started = useRef(false);

  // fps meter — shows the screencast gain at a glance
  const frameCountRef = useRef(0);
  const [fps, setFps] = useState(0);
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const rippleId = useRef(0);
  useEffect(() => {
    const t = setInterval(() => { setFps(frameCountRef.current); frameCountRef.current = 0; }, 1000);
    return () => clearInterval(t);
  }, []);

  const focusStage = () => {
    try { stageRef.current?.focus({ preventScroll: true }); } catch { stageRef.current?.focus(); }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const abort = new AbortController();
    abortRef.current = abort;
    (async () => {
      try {
        const created = await createBrowserSession(session, targetUrl);
        bsRef.current = created;
        if (!created.streamUrl) {
          setPhase("error");
          setStatus(
            created.providerLiveConnected
              ? "Live provider connected but returned no frame stream URL."
              : "Remote browser provider is not live-connected right now."
          );
          return;
        }
        setPhase("ready");
        setStatus("Live worker browser — read-only. Tap Take control to sign in yourself.");
        streamFrames(
          session,
          created.streamUrl,
          {
            onFrame: (f: Frame) => {
              const img = screenRef.current;
              if (!img) return;
              img.src = `data:${f.mime};base64,${f.data}`;
              metaRef.current = f.metadata ?? {};
              frameCountRef.current += 1;
            },
            onStatus: (s) => setStatus(s)
          },
          abort.signal
        );
      } catch (e: any) {
        setPhase("error");
        setStatus(e?.message ?? "Could not start the remote browser.");
      }
    })();
    return () => abort.abort();
  }, [session, targetUrl]);

  const send = useCallback(
    (input: RemoteInput) => {
      const bs = bsRef.current;
      if (!controllingRef.current || !bs || !takeoverIdRef.current || !grantRef.current) return;
      void relayInput(session, bs.browserSessionId, takeoverIdRef.current, grantRef.current, input);
    },
    [session]
  );

  function normalizedPoint(e: React.PointerEvent | React.WheelEvent) {
    const img = screenRef.current;
    if (!img) return { x: 0.5, y: 0.5 };
    const rect = img.getBoundingClientRect();
    const nw = Number(metaRef.current.width || img.naturalWidth || 0);
    const nh = Number(metaRef.current.height || img.naturalHeight || 0);
    let cl = rect.left, ct = rect.top, cw = rect.width, ch = rect.height;
    if (nw > 0 && nh > 0 && rect.width > 0 && rect.height > 0) {
      const scale = Math.min(rect.width / nw, rect.height / nh); // object-fit: contain
      cw = nw * scale; ch = nh * scale;
      cl = rect.left + (rect.width - cw) / 2;
      ct = rect.top + (rect.height - ch) / 2;
    }
    return {
      x: Math.max(0, Math.min(1, (e.clientX - cl) / Math.max(1, cw))),
      y: Math.max(0, Math.min(1, (e.clientY - ct) / Math.max(1, ch)))
    };
  }

  async function onTakeControl() {
    const bs = bsRef.current;
    if (!bs) return;
    setBusy(true);
    try {
      const req = await takeover(session, bs.browserSessionId, "request");
      const id = req?.takeoverId ?? req?.takeover_id ?? null;
      takeoverIdRef.current = id;
      const grant = await takeover(session, bs.browserSessionId, "grant", id ?? undefined);
      grantRef.current = grant?.grantToken ?? grant?.grant_token ?? null;
      if (!grantRef.current) throw new Error("no grant token returned");
      controllingRef.current = true;
      setPhase("controlling");
      setStatus("You have control. Click the page, type your password, pass 2FA/captcha — it goes only to Aetna.");
      setTimeout(focusStage, 0);
    } catch (e: any) {
      setStatus(`Take control failed: ${e?.message ?? "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function onReturn() {
    const bs = bsRef.current;
    setBusy(true);
    try {
      if (bs && takeoverIdRef.current) await takeover(session, bs.browserSessionId, "end", takeoverIdRef.current);
    } catch { /* best effort */ }
    controllingRef.current = false;
    takeoverIdRef.current = null;
    grantRef.current = null;
    setRelay("");
    lastRelayRef.current = "";
    setPhase("ready");
    setStatus("Control returned to the assistant. Live view continues (read-only).");
    setBusy(false);
  }

  // ---- input handlers (active only while controlling) ----
  const moveCursor = (e: React.PointerEvent) => {
    const stage = stageRef.current, cur = cursorRef.current;
    if (!stage || !cur) return;
    const rect = stage.getBoundingClientRect();
    cur.style.transform = `translate(${e.clientX - rect.left}px, ${e.clientY - rect.top}px)`;
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!controllingRef.current) return;
    e.preventDefault();
    // instant local feedback so control feels responsive even before the next frame
    const stage = stageRef.current;
    if (stage) {
      const rect = stage.getBoundingClientRect();
      const id = ++rippleId.current;
      setRipples((r) => [...r, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
      setTimeout(() => setRipples((r) => r.filter((p) => p.id !== id)), 450);
    }
    const { x, y } = normalizedPoint(e);
    send({ kind: "mouse", type: "mousePressed", x, y, button: "left", clickCount: 1 });
    focusStage();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!controllingRef.current) return;
    e.preventDefault();
    const { x, y } = normalizedPoint(e);
    send({ kind: "mouse", type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!controllingRef.current) return;
    moveCursor(e);
    if (e.buttons !== 1) return;
    const { x, y } = normalizedPoint(e);
    send({ kind: "mouse", type: "mouseMoved", x, y, button: "left", clickCount: 0 });
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!controllingRef.current) return;
    const { x, y } = normalizedPoint(e);
    send({ kind: "wheel", x, y, deltaX: Number(e.deltaX || 0), deltaY: Number(e.deltaY || 0) });
  };

  const KEY_MAP: Record<string, { code: string; keyCode: number }> = {
    Enter: { code: "Enter", keyCode: 13 }, Backspace: { code: "Backspace", keyCode: 8 },
    Delete: { code: "Delete", keyCode: 46 }, Tab: { code: "Tab", keyCode: 9 },
    Escape: { code: "Escape", keyCode: 27 }, ArrowLeft: { code: "ArrowLeft", keyCode: 37 },
    ArrowUp: { code: "ArrowUp", keyCode: 38 }, ArrowRight: { code: "ArrowRight", keyCode: 39 },
    ArrowDown: { code: "ArrowDown", keyCode: 40 }
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!controllingRef.current) return;
    if (e.metaKey || e.altKey || (e.ctrlKey && e.key.toLowerCase() !== "v")) return;
    if (e.key.length === 1 && !e.ctrlKey) {
      e.preventDefault();
      send({ kind: "text", text: e.key });
      return;
    }
    const m = KEY_MAP[e.key];
    if (m) {
      e.preventDefault();
      send({ kind: "key", type: "keyDown", key: e.key, code: m.code, keyCode: m.keyCode });
      send({ kind: "key", type: "keyUp", key: e.key, code: m.code, keyCode: m.keyCode });
    }
  };
  const onPaste = (e: React.ClipboardEvent) => {
    if (!controllingRef.current) return;
    const text = e.clipboardData?.getData("text");
    if (!text) return;
    e.preventDefault();
    send({ kind: "text", text: text.slice(0, 2048) });
  };

  // Mobile keyboard mirror: forward the typed delta as text / backspaces.
  const onRelayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    const prev = lastRelayRef.current;
    if (v.length >= prev.length && v.startsWith(prev)) {
      const delta = v.slice(prev.length);
      if (delta) send({ kind: "text", text: delta });
    } else {
      for (let i = 0; i < prev.length - v.length; i++) {
        send({ kind: "key", type: "keyDown", key: "Backspace", code: "Backspace", keyCode: 8 });
        send({ kind: "key", type: "keyUp", key: "Backspace", code: "Backspace", keyCode: 8 });
      }
    }
    lastRelayRef.current = v;
    setRelay(v);
  };
  const onRelayEnter = () => {
    send({ kind: "key", type: "keyDown", key: "Enter", code: "Enter", keyCode: 13 });
    send({ kind: "key", type: "keyUp", key: "Enter", code: "Enter", keyCode: 13 });
    setRelay("");
    lastRelayRef.current = "";
  };

  const controlling = phase === "controlling";

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true">
      <div className="sheet">
        <div className="sheet-bar">
          <span className="t">Aetna · live worker browser</span>
          {(phase === "ready" || controlling) && fps > 0 && <span className="fps">{fps} fps</span>}
          {phase === "ready" && <span className="badge read">Read-only</span>}
          {controlling && <span className="badge control">You are in control</span>}
          <button className="x" onClick={onClose} aria-label="Close"><Close /></button>
        </div>

        <div
          className={"stage" + (controlling ? " controlling" : "")}
          ref={stageRef}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerMove={onPointerMove}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          aria-label="Remote browser control surface"
        >
          {(phase === "starting" || phase === "error") && (
            <div className="placeholder">
              {phase === "starting" && <div className="spinner" />}
              {status}
              {phase === "error" && (
                <div style={{ marginTop: 10, fontSize: ".72rem", opacity: 0.6 }}>facade: {FACADE_BASE_URL}</div>
              )}
            </div>
          )}
          {/* The frame image stays mounted so streamed frames paint; pointer events go to the stage. */}
          <img
            ref={screenRef}
            className="remote-screen"
            alt="Live remote browser"
            style={{ display: phase === "ready" || controlling ? "block" : "none" }}
          />
          {controlling && <div ref={cursorRef} className="remote-cursor" />}
          {controlling && ripples.map((r) => (
            <span key={r.id} className="remote-ripple" style={{ left: r.x, top: r.y }} />
          ))}
        </div>

        {controlling && (
          <div className="relay-row">
            <input
              className="relay-input"
              value={relay}
              onChange={onRelayChange}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onRelayEnter(); } }}
              placeholder="Type here if the page field won't focus (password, code)…"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button className="btn" onClick={onRelayEnter}>Enter</button>
          </div>
        )}

        <div className="sheet-controls">
          <div className="grow">{status}</div>
          {phase === "ready" && (
            <button className="btn primary" onClick={onTakeControl} disabled={busy}>Take control</button>
          )}
          {controlling && (
            <button className="btn warn" onClick={onReturn} disabled={busy}>Return control</button>
          )}
        </div>
      </div>
    </div>
  );
}
