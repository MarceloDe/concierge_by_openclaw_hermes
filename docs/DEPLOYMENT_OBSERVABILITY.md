# Phase 10A Deployment And Observability Runbook

This runbook documents the current deployment-ready shape of the Wefella/FastAPI facade while preserving the existing Node/LangGraph/OpenClaw/Zep Graphiti runtime as the product source of truth.

Phase 10A does not rewrite orchestration into Python. FastAPI remains the public API facade. Node/LangGraph still owns workflow routing, approval consumption, OpenClaw dispatch, source pointers, final answer composition, audit, and product-memory ingest. FastAPI now also owns the first authenticated document upload/extraction harness.

## Local Services

Start the Node/LangGraph/OpenClaw runtime:

```bash
npm run dev
```

Start the FastAPI public facade in a second terminal:

```bash
npm run facade:dev
```

Check the facade smoke gate:

```bash
npm run smoke:facade
```

The smoke gate expects `WEFELLA_FACADE_URL` to point at the running FastAPI service. By default it uses `http://127.0.0.1:8000`.

## Required Local Verification

Run these before treating a local build as ready for user testing:

```bash
python3 -m compileall -q project
npm run test:facade
WEFELLA_TEST_NODE_LIVE=1 npm run test:facade
node --check src/app/mvp.js
node --check src/app/app.js
node --test src/tests/chat-ui-contract.test.mjs
npm run build
npm run test:local
npm run smoke:facade
```

`WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` requires the Node runtime at `WEFELLA_NODE_RUNTIME_URL`. The official OpenClaw authenticated tests remain separately gated by user-controlled portal login.

## API Readiness

`GET /api/readiness` returns:

- `status: "ready"` when all error-severity checks pass.
- `status: "degraded"` when an error-severity dependency is unavailable or unsafe.
- `checks.node_runtime` for FastAPI-to-Node connectivity.
- `checks.auth` for local/provider auth posture.
- `checks.cors` for production-origin safety.
- `checks.task_registry` for in-memory or JSON-file task registry health.
- `checks.rate_limit` as a warning-level deployment knob.
- `checks.source_grounding` as a warning-level policy knob.
- `checks.observability` as a warning-level tracing/export knob.
- `checks.uploads` for local upload-store writability and configured file limits.

Warnings do not make readiness degraded. They exist so local development can stay lightweight while deployment still exposes what should be enabled.

## Environment Variables

Core facade:

```bash
WEFELLA_NODE_RUNTIME_URL=http://127.0.0.1:4173
WEFELLA_ALLOWED_ORIGINS=https://app.example.com
WEFELLA_JWT_SECRET=replace-me
```

Provider auth:

```bash
WEFELLA_AUTH_MODE=provider
WEFELLA_JWT_ISSUER=https://issuer.example.com
WEFELLA_JWT_AUDIENCE=brainstyworkers-api
WEFELLA_ENABLE_LOCAL_AUTH=0
```

Hardening:

```bash
WEFELLA_RATE_LIMIT_PER_MINUTE=120
WEFELLA_RATE_LIMIT_DISABLED=0
WEFELLA_TASK_REGISTRY_PATH=/var/lib/wefella/tasks.json
WEFELLA_ENFORCE_SOURCE_GROUNDING=1
WEFELLA_UPLOAD_STORE_PATH=/var/lib/wefella/uploads
WEFELLA_UPLOAD_MAX_BYTES=5242880
```

Observability:

```bash
WEFELLA_OBSERVABILITY_EVENTS_PATH=/var/log/wefella/facade-events.jsonl
LANGSMITH_TRACING=true
LANGSMITH_PROJECT=brainstyworkers-production
LANGSMITH_API_KEY=...
```

`WEFELLA_OBSERVABILITY_EVENTS_PATH` writes JSONL task lifecycle events with safe metadata only. It records task ids, user/session hashes, message hash, message length, task status, and source-grounding status. It does not write raw user messages, raw user identifiers, raw portal text, credentials, SSNs, passwords, 2FA, screenshots, or document dumps.

## Deployment Posture

For a production-like facade:

- Use `WEFELLA_AUTH_MODE=provider`.
- Set `WEFELLA_ENABLE_LOCAL_AUTH=0`.
- Configure `WEFELLA_ALLOWED_ORIGINS` to the real frontend domain list.
- Configure a non-default JWT secret or provider verifier.
- Enable source-grounding enforcement after the sourced-result and precise-blocker branches are stable for the target environment.
- Configure a durable task store path or replace `TaskRegistry` with Redis/Postgres behind the same interface.
- Configure durable private upload storage before production; the local filesystem store is an MVP harness.
- Enable observability export and/or LangSmith tracing.
- Keep Node/LangGraph/OpenClaw behind FastAPI; the frontend must not call OpenClaw directly.

## Live OpenClaw Gate

Live authenticated worker proof still requires user-controlled browser state:

```bash
npm run test:live:openclaw-auth
```

Requirements:

- Dedicated Brainstyworkers OpenClaw profile is running.
- User manually completes login/password/passkey/2FA/captcha.
- The authenticated member portal tab remains open.
- `BRAINSTY_PORTAL_LIVE=1` and official OpenClaw live flags are set by the script.

Acceptable outcomes:

- Verified source pointers and safe Graphiti retain.
- A precise fail-closed external blocker.

Unacceptable outcomes:

- Fabricated evidence.
- Credential entry.
- Password-manager use.
- 2FA/passkey/captcha handling by the worker.
- Payer contact.
- Form submission.
- Raw portal dump in answer, logs, audit, or product memory.

## CI-Friendly Gate

A minimal CI job can run:

```bash
npm run build
npm run test:facade
```

A stronger integration job should start both local services and then run:

```bash
npm run smoke:facade
WEFELLA_TEST_NODE_LIVE=1 npm run test:facade
```

Full local confidence remains:

```bash
npm run test:local
```

Live OpenClaw and live portal tests should stay opt-in because they depend on a real authenticated external browser state.

## Remaining Deployment Gaps

- JSON-file task persistence is suitable for local and single-host proof only; production should use Redis or Postgres.
- LangSmith tracing is documented and surfaced in readiness metadata, but the current facade does not yet send LangSmith spans directly.
- Provider JWT validation is HS256/local-provider style; a production provider can add JWKS/RS256 verification behind the same `require_user` contract.
- User document upload/extraction is now locally implemented, but uploaded document evidence is not yet connected to LangGraph chat grounding, source pointers, or Graphiti retain.
- The full broad final-system contract in `docs/goal_final_system.md` still includes operator/research APIs, automation pipelines, MockWorker/Hermes modes, uploaded-document grounded chat, and a full final verification report.
