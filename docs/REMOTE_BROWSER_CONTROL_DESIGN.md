# Remote Browser Control — live view + supervised mobile takeover

**Branch:** `feature/phase-11-remote-browser-control`
**Date:** 2026-06-11
**Status:** Initial implementation (web + native iOS reference) on branch, gated for next-phase integration.

## Goal

Give the mobile user a **live view of the worker's browser** (like Manus / Gemini agentic browsing) and, when the portal needs a **login, 2FA, or captcha**, let the user **take over and type it from their phone keyboard** — without ever letting the autonomous agent handle credentials.

This closes the gap the architecture evaluation flagged (`docs/SENIOR_ARCHITECTURE_EVALUATION_2026-06-11.md` §2/§9): today the worker captures CDP screenshots only for OCR and the UI shows a text timeline; there is no visual surface and no takeover path.

## Safety model (the core invariant)

The product rule is **the agent never enters credentials** (`policy.mjs`, `ai2uiBlocks.mjs:244-251`). This feature preserves it by moving the *human's own* keystrokes — which the product already expects the user to perform during login — from "the user's separate browser" into a **live relay into the worker's browser**. Concretely:

- `relayHumanInput()` is the **only** code path that produces keystrokes, and it requires `origin === "human"` **and** a valid, active, human-granted takeover token. No agent/worker module imports it.
- Takeover is a deterministic state machine: `request → grant (interactive_takeover approval gate) → active → end`. The grant is the user's explicit "hand me the keyboard" tap and is recorded via `approvalGate(store, …, "interactive_takeover", "approved", …)`.
- **Keystroke values are never logged.** Audit records aggregate counts only (`relayedEventCounts`), so a password/captcha never lands in the hash-chained audit or SQLite.
- **Frames are never persisted.** Screencast frames broadcast over an in-memory pub/sub, not the runtime-events table (they are high-frequency and may show the user's own portal data).
- Takeover is time-boxed (`DEFAULT_TAKEOVER_TTL_MS = 5 min`), session-bound, and single-target.
- The agent's blocked-action set (`credential_entry`, `captcha_bypass`, `form_submission`) is **unchanged**; those remain forbidden for the agent. `interactive_takeover` is a new, separate scope describing *human* action.

## Architecture

```
 Mobile app (web widget or native iOS)
   │   ▲ live frames (SSE, base64 JPEG)            ┌─────────────────────────────┐
   │   └───────────────────────────────────────── │  Node runtime :4173          │
   │                                               │  src/server/server.mjs       │
   ├─ POST screencast/start ─────────────────────▶ │   /api/runtime/browser/*     │
   ├─ POST takeover/request,grant ───────────────▶ │                              │
   └─ POST takeover/input (human keystrokes) ────▶ │  browserStreamController.mjs │
                                                   │   • CdpSessionClient (WS)    │
                                                   │   • screencast pub/sub       │
                                                   │   • human-only input relay   │
                                                   └──────────────┬───────────────┘
                                                                  │ CDP over WebSocket
                                                                  ▼
                                                   OpenClaw worker browser (profile
                                                   brainstyworkers, gateway :19789)
                                                   Page.startScreencast / Input.dispatch*
```

The CDP target is resolved by `resolveActivePageCdpTarget()` (added to `openclawOfficialRuntime.mjs`), reusing the existing `openclaw --profile brainstyworkers browser status` → `cdpUrl` → `/json/list` path.

## Components delivered on this branch

| File | Role |
|---|---|
| `src/concierge/browserStreamController.mjs` | Core: CDP screencast session, in-memory frame pub/sub, takeover state machine, **human-only input relay**, audit + runtime events. |
| `src/concierge/openclawOfficialRuntime.mjs` | Added `resolveActivePageCdpTarget()` (exported CDP target resolver). |
| `src/server/server.mjs` | 8 endpoints under `/api/runtime/browser/*` (frames SSE, screencast start/stop, takeover request/grant/input/end/status). |
| `src/app/remoteBrowser.js` | Vanilla-JS widget: renders frames as `<img>`, tap-to-focus, mobile-keyboard relay, password/captcha entry, return-control. |
| `src/app/remote-browser.html` | Mobile-first standalone mount page (`/remote-browser.html?sessionId=…`). |
| `ios/RemoteBrowserView.swift` | Native SwiftUI reference: SSE frame stream, tap→remote-click, `SecureField` keyboard relay. |
| `src/tests/browser-takeover-safety.test.mjs` | Pins the safety gate (non-human origin rejected, ungranted rejected, bad token rejected, ended blocks input). 6 tests, registered in `test:local`. |

## API

| Method · Path | Purpose |
|---|---|
| `GET /api/runtime/browser/frames/stream?sessionId&userId` | SSE of `browser.frame` events (base64 JPEG), heartbeat-kept. |
| `POST /api/runtime/browser/screencast/start` | Attach CDP screencast to the worker page. |
| `POST /api/runtime/browser/screencast/stop` | Detach. |
| `POST /api/runtime/browser/takeover/request` | Create a pending takeover (audited). |
| `POST /api/runtime/browser/takeover/grant` | User approval → mint relay token (`interactive_takeover` approval gate). |
| `POST /api/runtime/browser/takeover/input` | Relay one human key/mouse/text/scroll event (origin forced to `human`). |
| `POST /api/runtime/browser/takeover/end` | End takeover; audit aggregate counts. |
| `GET /api/runtime/browser/takeover/status?takeoverId` | Inspect a takeover. |

Input contract (`input` body): `{kind:"text", text}` · `{kind:"key", type, key, code, keyCode}` · `{kind:"mouse", type, x, y (normalized 0..1), button, clickCount}` · `{kind:"scroll", x, y, deltaX, deltaY}`.

## Try it locally

1. Ensure the brainstyworkers OpenClaw browser is up: `openclaw --profile brainstyworkers browser --browser-profile openclaw start` (and `open <url>`).
2. `npm run dev` (Node runtime on :4173).
3. Open `http://127.0.0.1:4173/remote-browser.html?sessionId=demo-session` on the phone (same LAN) → **Start live view** → **Take over** → tap a field → type → **Enter**.

## Integration into `/mvp` (next step, not done here)

Mount the widget into the proof rail of `src/app/mvp.html` and trigger **Take over** automatically when `evidence_observation.status` indicates a login/2FA/captcha wall (the runner already detects "user must clear login/2FA/captcha", `openclawLiveReadiness.mjs:13,35`). Surface it as a new AI2UI block type `interactive_takeover` so the user-facing app renders the call-to-action inline.

## Known limitations / next-phase hardening

- **Transport:** screencast attaches to the CDP page directly. When OpenClaw execution moves from CLI-shelling to the real gateway/app-server task channel (eval §8, P1.7), route the screencast/input through that channel for durable, multi-worker sessions.
- **Viewport fidelity:** input coordinates scale by the last frame's `deviceWidth/Height`; add `Page.setDeviceMetricsOverride` to pin the worker viewport to the phone's aspect ratio for pixel-accurate taps.
- **Rate limiting / abuse:** add per-takeover input rate limits and an idle auto-end; enforce the FastAPI facade's JWT/RBAC on the new routes (currently the Node routes assume facade auth in front).
- **Reconnection:** the web widget reconnects frames on SSE error; add last-frame replay and exponential backoff.
- **Multi-tab / popups:** current target selection picks the first page target; handle OAuth popups and tab switches.
- **Lift the agent block only for humans:** keep `credential_entry`/`captcha_bypass` blocked for the agent; the `interactive_takeover` scope is human-only by construction.
