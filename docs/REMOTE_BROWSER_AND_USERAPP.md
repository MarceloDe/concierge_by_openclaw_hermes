# Remote browser (AWS Steel) + user webapps — implementation notes

Branch: `phase-66-production-contract`. Author: Claude. For the next implementer (Codex).

Two web apps share one backend:
- **Node runtime** `src/server/server.mjs` (:4226; default PORT is **4173** — start with `PORT=4226`). Chat `POST /api/chat`, session `POST /api/orchestrator/auth-start`, serves `/mvp` (dashboard tool) and `/userapp` (new opaque app).
- **FastAPI facade** `project/api/main.py` (:8000 by `npm run facade:dev`; optional test instance :8001). Hosted Steel remote browser: `POST /api/v1/browser/sessions` (+ `/stream`, `/takeover`, `/input`, `/openclaw/claims-observe`, `/openclaw/explore`). `node_client` base = `WEFELLA_NODE_RUNTIME_URL` (default :4173 — **set to :4226**).

## AWS channel
Steel self-host runs on a remote host; reached from this Mac via an **SSH tunnel** exposing loopback `ws://127.0.0.1:9223` (CDP) and `http://127.0.0.1:3000` (Steel API, tokenless locally). See `infra/steel/README.md`. The real production provider config (private file + proof files + readiness flags) is out-of-Git.

## The takeover fix
Don't embed Steel's `sessionViewerUrl` iframe — its live pane is broken behind the Caddy proxy. Instead **render the facade's SSE CDP frame stream into an `<img>` and relay input via `/input`** (CDP Input dispatch, normalized 0..1 coords, object-fit:contain mapping). Takeover = `/takeover` request→grant (`grantToken`)→input.
- New app: `src/userapp/components/LiveView.tsx`, `src/userapp/api.ts` (`streamFrames`, `relayInput`).
- Prior MVP: `src/app/remoteBrowser.js` already uses this approach; its failures were config (facade base/down, raw `www.aetna.com` target — allowlist is `member.aetna.com`/`health.aetna.com`). Both apps support a `?facade=<url>` override.

## Smoothness: screencast (1fps → change-driven)
`_start_steel_self_host_screencast` in `project/api/browser_sandbox.py` — persistent `Page.startScreencast` bridge. CRITICAL: `create_subprocess_exec(..., limit=16*1024*1024)` (frame lines exceed asyncio's 64KB readline default).

## Worker broad read-only traversal
CDP `extract` (structured tables/dt-dd/headings + classified control catalog) and `interact` (safe click/select by ref) ops; `explore_portal_read_only`; endpoint `/openclaw/explore`. Hard deny-list `window.__wfClassify`: credentials/2FA/captcha/free-text inputs, submit buttons, auth/payment-form controls, write keywords, offsite — never actioned.

## Post-login read-only claim observation
The React `/userapp` live view now matches the prior `/mvp` widget handoff:

1. Start the live browser from `/userapp`.
2. Tap **Take control** and complete portal login, 2FA, or captcha yourself.
3. Tap **Return control**.
4. Tap **Continue read-only claim scan**.

That button calls FastAPI `POST /api/v1/browser/sessions/{id}/openclaw/claims-observe`. The facade asks the Steel provider to observe the current page and, when safe claim rows are visible, sends source pointers + structured claim rows back to the Node/LangChain sourced-answer composer. If the user has not logged in or no claims page is visible, the endpoint returns a next action instead of fabricating evidence. The assistant still cannot enter credentials, solve 2FA/captcha, submit forms, upload payer documents, contact Aetna, or change account data.

## Local-run env (`.env.local`, dev only; production gate untouched, default off)
```
WEFELLA_BROWSER_SANDBOX_PROVIDER=hosted_remote
WEFELLA_BROWSER_SANDBOX_PROVIDER_READY=1
WEFELLA_BROWSER_SANDBOX_PROVIDER_NAME=steel-self-host
WEFELLA_BROWSER_SANDBOX_CDP_URL=ws://127.0.0.1:9223
WEFELLA_BROWSER_SANDBOX_STEEL_API_URL=http://127.0.0.1:3000
WEFELLA_BROWSER_SANDBOX_STEEL_DEV_DIRECT=1   # bypasses production launch-proof gate (dev only)
WEFELLA_NODE_RUNTIME_URL=http://127.0.0.1:4226
WEFELLA_BROWSER_SANDBOX_SCREENCAST_QUALITY=55
WEFELLA_BROWSER_SANDBOX_SCREENCAST_EVERY_NTH_FRAME=1
WEFELLA_BROWSER_SANDBOX_SCREENCAST_MAX_SECONDS=240
```
Run default facade: `npm run facade:dev`. The script sets `WEFELLA_FACADE_LOAD_LOCAL_ENV=1`, so FastAPI loads missing values from `.env.local` without overriding explicit process env.
Apps: `http://127.0.0.1:4226/userapp` and `http://127.0.0.1:4226/mvp`.

Optional second facade for A/B debugging:
`set -a; source .env.local; set +a; python3 -m uvicorn project.api.main:app --port 8001`.
Apps with override: `http://127.0.0.1:4226/userapp?facade=http://127.0.0.1:8001` and `http://127.0.0.1:4226/mvp?facade=http://127.0.0.1:8001`.
