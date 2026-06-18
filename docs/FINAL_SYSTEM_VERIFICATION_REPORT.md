# Final System Verification Report

Project: `workerprototype_openclaw`
Report phase: Phase 10T research scheduler daemon update to the final-system PASS / FAIL / BLOCKED matrix
Created: 2026-06-01
Scope source: `docs/goal_final_system.md`

## Status Legend

- `PASSING`: Current code and verification evidence prove the requirement for the local MVP scope.
- `IMPLEMENTED DURING THIS RUN`: Added in Phase 10Q. This applies to the report/coverage guard itself, not to older product features.
- `BLOCKED BY EXTERNAL DEPENDENCY`: The local contract exists, but live completion depends on an external service, authenticated browser/profile, configured worker CLI, model credential, or production deployment setting.
- `FAILING / NEEDS FIX`: The requirement is missing, only partially implemented, or not yet proven by strong current evidence.

## Current Verification Evidence

- `node --test src/tests/research-ops.test.mjs src/tests/operator-assistant.test.mjs src/tests/chat-ui-contract.test.mjs` passed with 29/29 tests during Phase 10P.
- `npm run build` passed during Phase 10P and again after the Phase 10P documentation updates.
- `npm run test:facade` passed with 32 tests and 2 expected live-gated skips during Phase 10P.
- `npm run test:local` passed with 151 tests total, 149 passed, 0 failed, and 2 expected live-gated official OpenClaw skips during Phase 10P.
- Phase 10P API proof for `GET /api/research/citation-closure` returned `citation_closure_failed`, `unsupported_claims_found`, 2 claims, 1 supported, 1 unsupported, and audit event `audit_a190bf89-86a1-4752-9d4e-eb5f61ef6d4a`.
- Phase 10P browser proof passed on `/` and is saved at `artifacts/phase10p-citation-closure-browser-proof.png`.
- Phase 10R focused tests passed: `node --test src/tests/policy.test.mjs src/tests/structured-intent-classifier.test.mjs src/tests/langgraph-runner.test.mjs src/tests/chat-ui-contract.test.mjs` reported 36/36 passing.
- Phase 10R facade/build checks passed: `npm run test:facade` reported 32 tests with 2 expected live-gated skips, `npm run build` passed, and `node --test src/tests/database.test.mjs src/tests/session-continuity.test.mjs src/tests/final-system-verification-report.test.mjs` reported 5/5 passing.
- Phase 10R full local gate passed: `npm run test:local` reported 157 tests total, 155 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Urgent/emergency safe escalation now has a bypassed LangGraph route, durable handoff row, task record, audit proof, and UI/API visibility.
- Phase 10S focused proof passed: `node --check src/concierge/ai2uiBlocks.mjs`, `node --check src/concierge/langgraphRunner.mjs`, `node --check src/app/mvp.js`, and `node --check src/server/build-check.mjs` passed.
- Previous Phase 10S AI2UI modes update evidence remains active for A6/A7, including Chat/Split/Guided/Bento mode preservation.
- Phase 10S focused tests passed: `node --test src/tests/ai2ui-blocks.test.mjs src/tests/chat-ui-contract.test.mjs src/tests/langgraph-runner.test.mjs` reported 24/24 passing and proves the typed AI2UI block contract.
- LangGraph now returns a typed `brainstyworkers.ai2ui.blocks.v1` block payload, and `/mvp` can switch between Chat, Split, Guided, and Bento modes without resetting the active session or graph result.
- Phase 10S build/facade/local gates passed: `npm run build`, `npm run test:facade` with 32 tests and 2 expected live-gated skips, and `npm run test:local` with 159 tests total, 157 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Phase 10S browser proof passed on `/mvp`: Chat, Guided, Bento, and Split all rendered typed blocks against the same session `session_cc33e568-4612-4b88-bd35-29d06e8220d5`, with 0 console errors. Screenshot: `artifacts/phase10s-ai2ui-modes-browser-proof.png`.
- Phase 10T adds an always-on approved-schedule daemon contract around the existing due-tick primitive. It persists daemon state, starts from `BRAINSTY_RESEARCH_SCHEDULER_ENABLED=1`, emits runtime events, writes audit proof, prevents overlapping ticks, and exposes Node/FastAPI/dashboard status.
- Phase 10T focused proof passed: syntax checks for scheduler/server/dashboard, Python compile, and `node --test src/tests/research-scheduler.test.mjs src/tests/research-ops.test.mjs src/tests/chat-ui-contract.test.mjs` with 24/24 tests.
- Phase 10T build/facade/local gates passed: `npm run build`, `npm run test:facade` with 32 tests and 2 expected live-gated skips, and `npm run test:local` with 163 tests total, 161 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Phase 10T browser proof passed on `/`: scheduler daemon status showed `process running`, daemon tick queued `research_run_adc6aa4a-ce74-45ca-bc51-a2a750404bdf`, approved-schedule-only safety was visible, and console error count was 0. Screenshot: `artifacts/phase10t-research-scheduler-daemon-browser-proof.png`.
- Phase 10T graceful shutdown proof passed: scheduler-enabled Node server handled `SIGINT`, stopped the daemon, exited with code 0, and left no listener on port 4173.
- Earlier phase evidence in `docs/goal_final_system.md`, `docs/PROGRESS.md`, and `docs/ACCEPTANCE_CRITERIA.md` remains part of the verification base, but any item below marked `FAILING / NEEDS FIX` or `BLOCKED BY EXTERNAL DEPENDENCY` is not complete.

## Summary

| Category | Count |
| --- | ---: |
| PASSING | 118 |
| IMPLEMENTED DURING THIS RUN | 0 |
| BLOCKED BY EXTERNAL DEPENDENCY | 2 |
| FAILING / NEEDS FIX | 12 |

The system is not yet complete. The strongest local MVP path is real and well-instrumented, but the broad final contract still has unbuilt product surfaces and externally gated live worker proof.

## A. User Concierge Dashboard

| ID | Status | Evidence / next action |
| --- | --- | --- |
| A1 | PASSING | `/mvp` browser and UI-contract proofs cover dashboard load, main input, suggested workflow actions, and responsive local layout. |
| A2 | PASSING | FastAPI chat and local auth create isolated sessions; covered by facade and session-manager tests. |
| A3 | PASSING | Session history, resume, export, and persistence are covered by Phase 10D and session-continuity tests. |
| A4 | PASSING | Free-text chat routes through LangGraph, structured classifier, trusted research grounding, and safe refusals. |
| A5 | PASSING | `/mvp` workflow buttons route through the same chat path rather than mock-only handlers. |
| A6 | PASSING | Phase 10S adds `/mvp` Chat / Split / Guided / Bento mode controls. Mode selection is stored in localStorage and re-renders the same latest session/run state without calling reset or starting a new workflow. |
| A7 | PASSING | Phase 10S adds the backend `brainstyworkers.ai2ui.blocks.v1` typed block contract, returns blocks from LangGraph/API responses, renders typed answer/workflow/approval/worker/citation/memory/handoff/safety/next-step cards, and tests unknown-type fallback. |
| A8 | PASSING | Benefits/deductible/coinsurance answers use portal, upload, or trusted research source pointers. |
| A9 | FAILING / NEEDS FIX | Cost/comparison questions and comparison UI are not proven beyond limited benefits/cost signal extraction. |
| A10 | PASSING | Claims/EOB-style questions are supported through structured extraction, claims rows, and next-step checklist-style responses. |
| A11 | FAILING / NEEDS FIX | Pharmacy/formulary signals are extracted, but prescription-question answering is not a completed user journey. |
| A12 | FAILING / NEEDS FIX | Procedure-prep and administrative checklist behavior is not proven as a dedicated user flow. |
| A13 | FAILING / NEEDS FIX | Network/provider signals are extracted, but provider/facility option cards and verified in-network status handling are not complete. |
| A14 | PASSING | Authenticated upload endpoint and `/mvp` upload controls are implemented and tested. |
| A15 | PASSING | Text/PDF/image extraction path, confidence, blockers, snippets, and source pointers are implemented and tested. |
| A16 | PASSING | Multi-turn context, session state, and source-pointer continuity are covered by session and runtime tests. |
| A17 | PASSING | `/mvp` citation cards, source pointers, trusted research citation closure, and Phase 10P claim labels are implemented. |
| A18 | PASSING | Healthcare-domain boundary and off-topic refusal are covered by policy and workflow tests. |
| A19 | PASSING | Phase 10R detects urgent/emergency prompts, bypasses normal workflow/OpenClaw/GPT execution, returns immediate emergency-safe guidance, and audits `human_handoff_created`. |
| A20 | PASSING | Phase 10R persists `human_handoff_items` plus an `urgent_human_handoff` task, exposes `/api/handoffs`, includes handoffs in session/trace state, and renders `/mvp` plus `/` handoff panels. |
| A21 | PASSING | Feedback persistence, user binding, UI controls, and operator visibility are implemented in Phase 10D. |
| A22 | PASSING | Session export/checklist path is implemented with identifier masking and source context. |

## B. User-Concierge API Contract

| ID | Status | Evidence / next action |
| --- | --- | --- |
| B1 | PASSING | FastAPI and Node health endpoints are implemented and covered by facade tests/smoke checks. |
| B2 | PASSING | `POST /api/chat` is protected through FastAPI and returns task/session status through the registry. |
| B3 | PASSING | `GET /api/chat/stream/{task_id}` uses SSE and is covered by FastAPI facade tests. |
| B4 | PASSING | `GET /api/chat/status/{task_id}` returns queued/running/done/error with safe envelopes. |
| B5 | PASSING | `GET /api/sessions/{session_id}` is protected and user-bound. |
| B6 | PASSING | `POST /api/uploads` validates owner, type, size, and returns upload state. |
| B7 | PASSING | `GET /api/uploads/{upload_id}/extraction` returns extraction, confidence, and provenance. |
| B8 | PASSING | `POST /api/feedback` persists feedback with session/message linkage and audit proof. |

## C. Operator / Research Dashboard

| ID | Status | Evidence / next action |
| --- | --- | --- |
| C1 | PASSING | `/` operator dashboard loads Phase 10P panels and browser proof exists. |
| C2 | PASSING | KPIs come from backend research/session/audit tables. |
| C3 | PASSING | Research runs list is implemented through Node/FastAPI and UI controls. |
| C4 | PASSING | Run detail is implemented and tested through research lifecycle proof. |
| C5 | PASSING | Ordered run events are persisted and visible. |
| C6 | PASSING | Manual run creation is implemented and audit logged. |
| C7 | PASSING | Run cancel is implemented with safe terminal state and audit. |
| C8 | PASSING | Retry creates a new attempt/history and avoids duplicate evidence writes. |
| C9 | PASSING | Source registry lists status, health-style metadata, and run metadata. |
| C10 | PASSING | Source proposal validates URLs, stores pending sources, and audits actor. |
| C11 | PASSING | Source approve/reject changes status and records actor/reason. |
| C12 | PASSING | Source disable/update is implemented through patch semantics and scheduler status checks. |
| C13 | PASSING | Source priority persists and source lists/scheduling order by priority. |
| C14 | PASSING | Research source metadata/priority and run query/topic arguments validate and persist. |
| C15 | PASSING | Approved schedules persist with next-run time and due-tick proof. |
| C16 | PASSING | Pause/resume schedule lifecycle is implemented and audited. |
| C17 | FAILING / NEEDS FIX | Manual PDF upload into the operator knowledge-base pipeline is not implemented as a research API/dashboard path. |
| C18 | PASSING | Trusted evidence search returns source metadata, scores, snippets, and review status. |
| C19 | PASSING | Retrieval test/search shows chunks/snippets, scores, embedding contribution, and low-confidence states. |
| C20 | PASSING | Phase 10P claim closure links supported claims to citations and fails unsupported claims. |
| C21 | FAILING / NEEDS FIX | Pending artifact review exists, but low-confidence/downvoted/escalated/user-answer review queues are not complete. |
| C22 | PASSING | Operator NL console uses registry-bound tools only. |
| C23 | PASSING | Operator write requests become structured proposals with risk/effect and no mutation. |
| C24 | PASSING | Proposal approval executes exactly once; rejection causes no mutation; lifecycle is audited. |
| C25 | PASSING | Tool registry endpoint/UI exists with tool schemas and approval requirements. |
| C26 | FAILING / NEEDS FIX | Dedicated read-only analytics endpoint/dashboard is not implemented beyond KPIs. |
| C27 | FAILING / NEEDS FIX | Budget and kill-switch persistence/enforcement are not implemented. |
| C28 | PASSING | Embedding route selection persists and is visible. |
| C29 | PASSING | Reindex jobs complete/fail safely and preserve prior indexes on failure. |
| C30 | PASSING | Worker status reports deterministic/mock/OpenClaw/Hermes modes and feature gates. |
| C31 | PASSING | OpenClaw skill/proposal artifacts are visible and proposal-only/gated. |
| C32 | PASSING | Redacted audit log API/dashboard exists with hash-chain verification. |

## D. Operator / Research API Contract

| ID | Status | Evidence / next action |
| --- | --- | --- |
| D1 | PASSING | `GET /api/research/kpis` is implemented behind operator/admin RBAC. |
| D2 | PASSING | `GET /api/research/runs` is implemented. |
| D3 | PASSING | `GET /api/research/runs/{run_id}` is implemented. |
| D4 | PASSING | `GET /api/research/runs/{run_id}/events` is implemented. |
| D5 | PASSING | `POST /api/research/runs` creates manual runs and audits. |
| D6 | PASSING | `POST /api/research/runs/{run_id}/cancel` safely cancels and audits. |
| D7 | PASSING | `POST /api/research/runs/{run_id}/retry` retries safely. |
| D8 | PASSING | `GET /api/research/sources` lists sources. |
| D9 | PASSING | `POST /api/research/sources/propose` creates pending sources and audits. |
| D10 | PASSING | Source approve endpoint is implemented and audited. |
| D11 | PASSING | Source reject endpoint is implemented and audited. |
| D12 | PASSING | Source patch/update endpoint is implemented and audited. |
| D13 | FAILING / NEEDS FIX | Research knowledge-base PDF upload endpoint is not implemented. |
| D14 | FAILING / NEEDS FIX | Research document extraction endpoint is not implemented. |
| D15 | PASSING | `GET /api/research/search` searches reviewed artifacts with source metadata. |
| D16 | PASSING | `GET /api/research/evidence` is implemented; claims-specific endpoint remains future work but evidence path passes. |
| D17 | PASSING | `GET /api/research/graph` is implemented with metadata-only graph safety. |
| D18 | PASSING | `POST /api/research/graph/build` persists graph build/audit proof. |
| D19 | FAILING / NEEDS FIX | `GET /api/research/analytics` is not implemented. |
| D20 | PASSING | `POST /api/operator/assistant` handles read-only results and proposal creation. |
| D21 | PASSING | Proposal approve endpoint validates and executes once. |
| D22 | PASSING | Proposal reject endpoint prevents mutation and audits. |
| D23 | PASSING | `GET /api/operator/tools` returns registry and schemas. |
| D24 | PASSING | `GET /api/audit` is implemented with redaction and RBAC. |

## E. Background / Automation / Evidence Pipeline

| ID | Status | Evidence / next action |
| --- | --- | --- |
| E1 | PASSING | Phase 10T adds an always-on approved-schedule daemon proof: persisted daemon state, env-gated auto-start, runtime heartbeat/tick events, hash-chain audit events, overlap guard, Node/FastAPI status and tick endpoints, and operator dashboard proof. |
| E2 | PASSING | Deterministic fetch path stores artifacts, hashes, previews, and failure events. |
| E3 | PASSING | User document extraction and portal OCR are implemented; research PDF pipeline remains covered separately by C17/D13/D14 gaps. |
| E4 | PASSING | PHI/payload/audit policies block or redact sensitive content before model/memory/log surfaces. |
| E5 | FAILING / NEEDS FIX | General entity extraction with source/page/span/confidence is not fully implemented for the research evidence pipeline. |
| E6 | PASSING | Natural keys, stable candidate ids, source uniqueness, and retry controls reduce duplicate writes. |
| E7 | PASSING | Evidence/artifact/source-pointer writes are append-only with hashes and provenance metadata. |
| E8 | PASSING | Phase 10P closes claim-level citation closure over trusted reviewed evidence. |
| E9 | PASSING | Local TF-IDF embedding route and safe reindex lifecycle are implemented; live OpenAI route is optional and credential-gated. |
| E10 | PASSING | Quality judge writes labels/scores only and does not invent evidence. |
| E11 | PASSING | Health/readiness endpoints and dashboard degraded-state handling are implemented through FastAPI hardening. |

## F. Worker Adapters

| ID | Status | Evidence / next action |
| --- | --- | --- |
| F1 | PASSING | MockWorker mode works, is visible, and remains untrusted. |
| F2 | BLOCKED BY EXTERNAL DEPENDENCY | OpenClaw adapter contract, feature flag, typed envelope, and injected-command tests pass; live proof requires configured OpenClaw runtime/profile and authenticated portal/source context. |
| F3 | BLOCKED BY EXTERNAL DEPENDENCY | Hermes adapter contract and injected-command tests pass; live proof requires a configured Hermes CLI/provider environment. |
| F4 | PASSING | Worker skill proposals are stored/reviewable and never auto-applied in production behavior. |

## G. Security / Compliance / Safety

| ID | Status | Evidence / next action |
| --- | --- | --- |
| G1 | PASSING | Protected endpoints require bearer auth; unauthorized requests are rejected. |
| G2 | PASSING | User/operator/admin role separation and actor binding are implemented in FastAPI. |
| G3 | PASSING | Rate limiting is implemented and tested with 429 behavior. |
| G4 | PASSING | CORS configuration is environment-driven with production-safe defaults/metadata. |
| G5 | PASSING | Audit/log responses use hashes, previews, and masking instead of raw PHI. |
| G6 | PASSING | Healthcare answers require source pointers, approval blockers, or explicit evidence blockers. |
| G7 | PASSING | Standardized error envelopes avoid stack traces and keep request ids. |

## H. Minimum System Is Real Gate

| ID | Status | Evidence / next action |
| --- | --- | --- |
| H1 | PASSING | User dashboard loads. |
| H2 | PASSING | Operator dashboard loads. |
| H3 | PASSING | Health endpoint returns 200 in local/facade proof. |
| H4 | PASSING | Auth protects private routes. |
| H5 | PASSING | Chat request creates session/task. |
| H6 | PASSING | SSE stream returns assistant/task output. |
| H7 | PASSING | Polling fallback returns final task state. |
| H8 | PASSING | Multi-turn context works through session continuity. |
| H9 | PASSING | Off-topic guard works. |
| H10 | PASSING | Phase 10R LangGraph proof creates an urgent handoff, skips OpenClaw and GPT, records audit/session proof, and returns safe emergency guidance. |
| H11 | PASSING | Insurance answer uses retrieval context. |
| H12 | PASSING | Missing retrieval context causes refusal/escalation. |
| H13 | PASSING | Citation block/source view works. |
| H14 | PASSING | Document upload works. |
| H15 | PASSING | Uploaded document can be queried/explained. |
| H16 | PASSING | Source registry loads real data. |
| H17 | PASSING | Manual run creates a research job. |
| H18 | PASSING | Run detail shows event timeline. |
| H19 | PASSING | Operator NL request creates a proposal for write actions. |
| H20 | PASSING | Approved write action executes once and is audit-logged. |
| H21 | PASSING | Rejected proposal causes no mutation. |
| H22 | PASSING | Audit log shows write actions. |
| H23 | PASSING | MockWorker mode works. |
| H24 | PASSING | Real worker modes remain feature-flagged and bounded. |

## Blocked By External Dependency

- Live authenticated OpenClaw sourced-result proof requires the dedicated project OpenClaw profile, gateway/agent, browser/OCR skills, and an authenticated allowed member portal or approved source context.
- Live Hermes proof requires a configured Hermes CLI/provider environment.
- Production provider JWT deployment is locally tested in provider mode, but production issuer/audience/role mapping must be configured in the target deployment.
- Live OpenAI embedding/LLM-provider paths require credentials and provider availability; the local MVP has deterministic fallbacks.

## Failing / Needs Fix Backlog

Priority 1:
- Add research knowledge-base PDF upload/extraction endpoints and dashboard path (`C17`, `D13`, `D14`).
- Add research analytics endpoint/dashboard and budget/kill-switch enforcement (`C26`, `C27`, `D19`).
- Expand review queues for low-confidence/downvoted/escalated/user-answer items (`C21`).

Priority 2:
- Broaden domain journeys for cost/comparison, prescription, procedure-prep, provider/network options, and general entity extraction (`A9`, `A11`, `A12`, `A13`, `E5`).

## Code Changes Made In Phase 10Q

- Added this verification report.
- Added a test that ensures the report covers every explicit `A*` through `H*` item in `docs/goal_final_system.md`, uses only the allowed final-report status labels, and keeps blockers/failures visible.
- Updated `npm run test:local` to include the final verification report coverage test.
- Updated planning/progress/acceptance docs and the governing prompt with the Phase 10Q verification contract.

## Code Changes Made In Phase 10R

- Added urgent/emergency detection to deterministic input policy and structured intent routing.
- Added durable `human_handoff_items`, `urgent_human_handoff` task creation, hash-chained audit proof, session/trace visibility, and `/api/handoffs`.
- Updated LangGraph so urgent content bypasses normal workflow execution, OpenClaw proposal/dispatch, evidence observation, and external GPT calls.
- Updated `/mvp` and `/` to show handoff status, task id, summary, and queue visibility.
- Updated memory retention so urgent/safety prompts are not retained verbatim for prompt recall.

## Tests Added Or Updated In Phase 10Q

- Added `src/tests/final-system-verification-report.test.mjs`.
- Updated `package.json` `test:local` to include the new report coverage test.

## Tests Added Or Updated In Phase 10R

- Updated `src/tests/policy.test.mjs`, `src/tests/structured-intent-classifier.test.mjs`, `src/tests/langgraph-runner.test.mjs`, `src/tests/chat-ui-contract.test.mjs`, and `project/tests/test_fastapi_facade.py`.
- Focused Phase 10R proof passed: 36/36 local policy/classifier/LangGraph/UI tests.
- `npm run test:facade` passed with 32 tests and 2 expected live-gated skips.
- `npm run build` passed with the urgent handoff schema/build guard.
- `npm run test:local` passed with 157 tests total, 155 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.

## Code Changes Made In Phase 10S

- Added `src/concierge/ai2uiBlocks.mjs` with the `brainstyworkers.ai2ui.blocks.v1` typed block contract and safe unknown-block fallback normalization.
- Added `ai2ui_blocks` to LangGraph state after product-memory retain so the block payload includes real workflow, approval, worker, source-pointer, memory, handoff, safety, and next-step status.
- Returned `ai2uiBlocks` from `POST /api/chat`.
- Added `/mvp` mode controls for Chat, Split, Guided, and Bento. Switching modes updates presentation only and preserves the same session, messages, latest graph run, approvals, handoffs, source pointers, memory state, and operator proof link.
- Updated the build guard to require the AI2UI contract and the Phase 10S final-report wording.

## Tests Added Or Updated In Phase 10S

- Added `src/tests/ai2ui-blocks.test.mjs`.
- Updated `src/tests/langgraph-runner.test.mjs`, `src/tests/chat-ui-contract.test.mjs`, `package.json`, and `src/server/build-check.mjs`.
- Focused Phase 10S syntax checks passed for the new contract, LangGraph runner, MVP UI, and build guard.
- Focused Phase 10S proof passed: `node --test src/tests/ai2ui-blocks.test.mjs src/tests/chat-ui-contract.test.mjs src/tests/langgraph-runner.test.mjs` reported 24/24 tests passing.
- `npm run build` passed.
- `npm run test:facade` passed with 32 tests and 2 expected live-gated skips.
- `npm run test:local` passed with 159 tests total, 157 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- `/mvp` browser proof passed after restarting the Node server with refreshed code. Chat, Guided, Bento, and Split modes all rendered typed blocks, preserved the same session, and reported 0 console errors. Screenshot saved to `artifacts/phase10s-ai2ui-modes-browser-proof.png`.

## Next Recommended Phase

Phase 10U should address the next highest-risk remaining gaps:

1. Research knowledge-base PDF upload/extraction API and dashboard path (`C17`, `D13`, `D14`).
2. Research analytics endpoint/dashboard and budget/kill-switch hardening (`C26`, `C27`, `D19`).
3. Expanded review queues and broader journey/entity extraction after the PDF pipeline is proven.

## Phase 10T Research Scheduler Daemon Update

Code changes:
- Added `src/concierge/researchScheduler.mjs` with the `brainstyworkers` Phase 10T daemon contract.
- Added `research_scheduler_daemon_state` to the schema/migration path.
- Added Node routes `GET /api/research/scheduler/status` and `POST /api/research/scheduler/tick`.
- Added FastAPI facade proxies for both scheduler-daemon endpoints behind operator/admin RBAC.
- Added operator dashboard controls and cards for daemon process state, cadence, due counts, last tick, overlap skips, last actions, and safety.
- Added `src/tests/research-scheduler.test.mjs` and updated UI/facade/build contracts.

Verification:
- `node --check src/concierge/researchScheduler.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/research-scheduler.test.mjs src/tests/research-ops.test.mjs src/tests/chat-ui-contract.test.mjs` passed with 24/24 tests.
- `npm run build` passed.
- `npm run test:facade` passed with 32 tests and 2 expected live-gated skips.
- `npm run test:local` passed with 163 total, 161 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Browser proof on `/` passed: daemon status and daemon tick were visible, one due scheduled run was queued, approved-schedule-only safety was visible, and console error count was 0. Screenshot: `artifacts/phase10t-research-scheduler-daemon-browser-proof.png`.
- Graceful shutdown proof passed with `BRAINSTY_RESEARCH_SCHEDULER_ENABLED=1`: server received `SIGINT`, stopped services, exited with code 0, and `lsof -nP -iTCP:4173 -sTCP:LISTEN` returned no listener.

## Phase 11 Postgres Storage Deployment Profile Update

Code changes:
- Added a Postgres service to `compose.yaml` with health check, persistent volume, configurable host port, and init SQL.
- Added `project/db/postgres-init/001_storage_readiness.sql`.
- Added `src/concierge/storageReadiness.mjs` and `scripts/storage-contract.mjs`.
- Added `src/tests/deployment-storage.test.mjs` and included storage proof in `npm run test:docker:contract`.
- Extended the connector proof dashboard/API with `postgres_storage_profile`, `database_storage`, and `database_product_ready_architecture`.

Verification:
- `npm run storage:contract` passed.
- `npm run storage:postgres:smoke` passed against live Docker Postgres.
- `npm run test:docker:contract` passed with 6/6 tests.
- `npm run build` passed.
- `npm run test:local` passed with 202 total, 200 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Connector proof reported `storage.status=postgres_live_ready_sqlite_runtime`, `database_product_ready_architecture=85 / 100`, `appRuntimeMigratedToPostgres=false`, and `migrationPending=true`.

Remaining gap:
- The project now has a live Postgres deployment target, but app-state storage is not fully migrated to Postgres. A future phase must add the Postgres runtime adapter, migration parity tests, transactional worker leases, backup/restore proof, and secret-manager profile before this score can reach `100 / 100`.

## Phase 11 Postgres Runtime Adapter Parity Update

Code changes:
- Added `pg` and the `src/concierge/postgresStore.mjs` adapter.
- Added `src/concierge/databaseFactory.mjs` so `BRAINSTY_DB_DRIVER=postgres` selects Postgres explicitly while SQLite remains the default.
- Added `scripts/postgres-runtime-smoke.mjs`.
- Added `src/tests/postgres-store-contract.test.mjs` and included it in `npm run test:db:safety`.
- Updated storage readiness, compose contract, storage contract, server health, and connector proof scoring.

Verification:
- `npm run test:db:postgres` passed.
- `npm run test:db:safety` passed.
- `npm run storage:postgres:runtime-smoke` passed against live Docker Postgres.
- `npm audit --audit-level=moderate` passed with 0 vulnerabilities after dependency audit fix.
- `npm run test:docker:contract` passed with 7/7 tests.
- `npm run build` passed.
- `npm run test:local` passed with 200 tests passing and 2 expected live-gated OpenClaw skips.
- A temporary server booted with `BRAINSTY_DB_DRIVER=postgres` and `/api/health` reported `databaseDriver=postgres`, `storage.status=postgres_runtime_selected_parity_smoked`, and `score=90`.
- `/api/proof/runs/postgres-runtime-adapter` reported `database_product_ready_architecture=90 / 100` with `fullMigrationReady=false` and `migrationPending=true`.
- Rebuilt Docker Compose reported healthy Node, FastAPI, mobile PWA, Postgres, and FalkorDB services.
- Compose Node health on `http://127.0.0.1:4273/api/health` reported default `databaseDriver=sqlite`, storage status `postgres_adapter_parity_ready_sqlite_default`, runtime smoke ready, and score 90.
- `BRAINSTY_COMPOSE_NODE_PORT=4273 BRAINSTY_COMPOSE_API_PORT=8100 BRAINSTY_EXPECT_GRAPHITI_READY=1 npm run docker:memory:smoke` passed with Graphiti schema-ready product memory.
- Browser proof at `http://127.0.0.1:4273/?phase=postgres-runtime-adapter` showed the `database_product_ready_architecture` score at `90 / 100`, the adapter parity status, and runtime migration-pending state. Screenshot: `artifacts/phase11-postgres-runtime-adapter-dashboard-proof.png`.

Remaining gap:
- Postgres is now a real selectable app-state runtime for core operations, but not yet the default production database. Remaining work includes endpoint-wide query compatibility, database-level worker leases, migration replay/rollback, backup/restore proof, and secret-manager profile.

## Phase 11 Postgres Operational Readiness Update

Code changes:
- Added `worker_leases` to the schema and table registry.
- Added `src/concierge/workerLeases.mjs`.
- Added `scripts/postgres-production-readiness-smoke.mjs`.
- Added `src/tests/worker-leases.test.mjs`.
- Added `src/tests/postgres-production-readiness-contract.test.mjs`.
- Updated storage readiness, compose/storage contracts, Docker env, package scripts, build guard, and connector proof fields.

Verification:
- `npm run test:db:postgres` passed with 9/9 tests.
- `npm run test:db:safety` passed with 13/13 tests.
- `npm run storage:contract` passed.
- `npm run test:docker:contract` passed with 8/8 tests.
- `npm run build` passed.
- `npm run storage:postgres:production-smoke` passed against live Docker Postgres.
- The production smoke proved endpoint-state parity, approval/audit/checkpoint writes, worker lease exclusion, and logical backup/restore into a fresh database.
- Backup/restore compared 17 non-empty tables with no count mismatches and restored user/session/checkpoint/approval/audit/worker-lease rows.
- A temporary server booted with `BRAINSTY_DB_DRIVER=postgres` and operational DB gate flags. `/api/health` reported score `95`, status `postgres_runtime_selected_operational_gates_ready_secret_profile_pending`, and `secretProfileReady=false`.
- Browser proof showed `database_product_ready_architecture=95 / 100` and the secret-profile-pending status. Screenshot: `artifacts/phase11-postgres-operational-readiness-dashboard-proof.png`.

Score:
- Database product-ready architecture can now report `95 / 100` when operational Postgres gates are enabled.
- `100 / 100` remains blocked until a real managed-secret or equivalent production secret profile is proven and Postgres runtime rollout/defaulting is complete.

## Phase 11 Postgres Default Rollout And Secret Profile Update

Code changes:
- Added `src/concierge/databaseSecretProfile.mjs` for secret-backed Postgres URL resolution, redacted URL proof, and hash-only secret metadata.
- Updated the Postgres runtime factory and live smoke scripts to use the same secret-aware URL path.
- Added `scripts/postgres-default-rollout-smoke.mjs`.
- Added package script `storage:postgres:default-rollout-smoke`.
- Updated storage readiness, compose/storage contracts, Docker env, build guard, server proof payload, and Postgres readiness tests.

Verification:
- `npm run test:db:postgres` passed with 11/11 tests.
- `npm run test:db:safety` passed with 15/15 tests.
- `npm run storage:contract` passed.
- `npm run test:docker:contract` passed with 8/8 tests.
- `npm run storage:postgres:default-rollout-smoke` passed against live Docker Postgres.
- `npm run storage:postgres:production-smoke` passed after the secret-aware URL resolution change.
- `npm run build` passed.
- `npm run test:local` passed with 210 total tests, 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- A temporary server booted with `BRAINSTY_DB_DRIVER=postgres`, a temporary secret-file database URL, all operational DB gates enabled, and `BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY=1`.
- `/api/health` reported `databaseDriver=postgres`, `storage.status=postgres_production_ready`, `score=100`, `fullMigrationReady=true`, `migrationPending=false`, `secretProfileReady=true`, and `defaultRolloutReady=true`.
- `/api/proof/runs/postgres-default-rollout` reported `database_product_ready_architecture=100 / 100` with all production gates true.
- Browser proof showed `database_product_ready_architecture=100 / 100 · postgres_production_ready` with 0 console errors. Screenshot: `artifacts/phase11-postgres-default-rollout-dashboard-proof.png`.

Score:
- Database product-ready architecture can now report `100 / 100` in an isolated Postgres runtime proof when the secret-profile and default-rollout gates are both true.
- Compose still defaults to SQLite for local developer safety; production rollout should supply a real Docker secret or managed secret source before flipping defaults broadly.

## Phase 11 Postgres Docker-Secret Runtime Profile Update

Code changes:
- Added `compose.postgres.yaml` for the deployment profile `docker compose -f compose.yaml -f compose.postgres.yaml`.
- Added `scripts/postgres-production-profile-contract.mjs` and `npm run storage:postgres:profile-contract`.
- Added ignored deployment secret placeholders under `project/deployment/secrets/`.
- Added dashboard/API proof fields `postgres_production_profile` and `database_deployment_profile`.

Safety:
- Base compose remains SQLite by default.
- The Postgres override uses `BRAINSTY_DATABASE_URL_FILE=/run/secrets/brainsty_database_url` and `BRAINSTY_DATABASE_SECRET_SOURCE=docker_secret`.
- Readiness flags remain proof-controlled with `:-0` defaults rather than being hardcoded to pass.

Verification:
- `npm run storage:postgres:profile-contract` passed.
- `node scripts/postgres-production-profile-contract.mjs` passed with merged Docker Compose config validation.
- `npm run test:docker:contract` passed with 10/10 tests.
- `npm run storage:contract` passed.
- `npm run build` passed.
- `npm run test:db:postgres` passed with 11/11 tests.
- `npm run test:db:safety` passed with 15/15 tests.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Browser proof at `http://127.0.0.1:4196/?phase=postgres-production-profile` showed `postgres_production_profile=postgres_docker_secret_runtime_profile_present`, `database_deployment_profile=100 / 100`, and 0 console errors. Screenshot: `artifacts/phase11-postgres-production-profile-dashboard-proof.jpg`.

## Phase 12 Postgres Profile Live Regression Update

Code changes:
- Added endpoint-wide Postgres regression smoke and live Docker-secret compose profile smoke commands.
- Added contract coverage for the new smokes in `npm run test:docker:contract`.
- Extended the dashboard/API proof payload with `postgres_endpoint_regression` and `postgres_profile_live_smoke`.
- Updated the Node Docker image context so `compose.postgres.yaml` and safe deployment secret docs are available inside proof surfaces while runtime secrets remain excluded.

Verification:
- `node --check` passed for the new smoke scripts, compose/storage contracts, server, and build guard.
- Focused contract tests passed with 7/7 tests.
- `npm run test:docker:contract` passed with 12/12 tests.
- `npm run storage:contract` passed.
- `npm run build` passed.
- `node --test src/tests/final-system-verification-report.test.mjs` passed with 2/2 tests.
- `npm run test:db:postgres` passed with 11/11 tests.
- `npm run test:db:safety` passed with 15/15 tests.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- `npm run storage:postgres:endpoint-regression-smoke` passed with Node running on Postgres, database score `100 / 100`, deployment profile score `100 / 100`, OpenClaw skill count `3`, auth/session creation, memory context, chat final response, and proposal-only skill-envelope validation.
- `BRAINSTY_PROFILE_SMOKE_KEEP_STACK=1 npm run storage:postgres:profile-live-smoke` passed with Node, FastAPI, PWA, Postgres, and FalkorDB running through `compose.yaml + compose.postgres.yaml` on isolated ports.
- The live profile smoke verified Node `/api/health`, dashboard proof, FastAPI `/api/v1/health`, and PWA `/`, with no raw database URL or raw secret-file path leakage.
- In-app browser visual verification passed for the dashboard and PWA with 0 console errors.
- Screenshot artifacts:
  - `artifacts/phase12-postgres-profile-live-dashboard-proof.png`
  - `artifacts/phase12-postgres-profile-live-pwa-proof.png`
- The temporary compose project was torn down, volumes removed, runtime secret files deleted, and all temporary ports verified clear.

Score:
- `database_product_ready_architecture` remains eligible for `100 / 100` when the Postgres runtime, operational gates, secret profile, and default rollout gates are all enabled by proof.
- `database_deployment_profile` is now live-profile verified at `100 / 100`, not only statically contracted.
- Remaining production work is hosted secret-manager selection, hosted backup scheduling/restore runbooks, and the broader hosted remote-browser/mobile proof beyond the local CDP adapter.

## Phase 13 Postgres Hosted Backup Runbook Update

Code changes:
- Added `docs/POSTGRES_BACKUP_RESTORE_RUNBOOK.md`.
- Added `scripts/postgres-backup-runbook-smoke.mjs` and package script `storage:postgres:backup-runbook-smoke`.
- Added `src/tests/postgres-backup-runbook-contract.test.mjs` and included it in `npm run test:docker:contract`.
- Added `BRAINSTY_POSTGRES_BACKUP_RUNBOOK_READY` to compose/Docker runtime env.
- Exposed `postgres_backup_runbook` and `database_backup_restore_runbook` through storage readiness and connector proof.

Verification:
- Syntax checks passed for the new smoke script, storage/compose contracts, storage readiness, server, and build guard.
- Focused backup/compose/storage contract tests passed with 7/7 tests.
- `npm run test:docker:contract` passed with 14/14 tests.
- `npm run storage:contract` passed.
- `npm run storage:postgres:backup-runbook-smoke` passed against live Docker Postgres.
- The smoke validated 11 runbook fragments, proved restore rehearsal, compared 17 tables, found no count mismatches, and restored user/session/checkpoint/approval/audit/worker-lease rows.
- API proof reported `postgres_backup_runbook=backup_restore_runbook_smoked` and `database_backup_restore_runbook=100 / 100`.
- Browser proof passed with required runbook strings present and 0 console errors.
- Screenshot artifact: `artifacts/phase13-postgres-backup-runbook-dashboard-proof.png`.

Score:
- `database_backup_restore_runbook` can now report `100 / 100` when the runbook smoke has passed and `BRAINSTY_POSTGRES_BACKUP_RUNBOOK_READY=1`.
- This is an operations/runbook score, not a claim that a hosted provider's final PITR policy is configured.
- Remaining production work is provider-specific backup/PITR setup, scheduled restore rehearsal in deployment operations, and hosted secret-manager integration.

## Phase 14 Postgres Provider Backup Policy Update

Implementation:
- Added `project/deployment/postgres-provider-backup-policy.example.json`.
- Added `scripts/postgres-provider-backup-policy-smoke.mjs` and package script `storage:postgres:provider-backup-policy-smoke`.
- Added `src/tests/postgres-provider-backup-policy-contract.test.mjs` and included it in `npm run test:docker:contract`.
- Exposed `postgres_provider_backup_policy` and `database_provider_backup_policy` through storage readiness and connector proof.

Verification:
- Focused syntax checks passed for the provider-policy smoke, storage/compose contracts, storage readiness, server, and build guard.
- Focused provider/compose/storage contract tests passed with 8/8 tests.
- `npm run storage:postgres:provider-backup-policy-smoke` passed.
- `npm run test:docker:contract` passed with 17/17 tests.
- `npm run build`, final-report coverage, storage contract, DB Postgres, DB safety, and full local regression passed.
- API proof reported `postgres_provider_backup_policy=provider_policy_contract_available` and `database_provider_backup_policy=0 / 100`.
- Browser proof passed with required provider-policy strings present and 0 console errors.
- Screenshot artifact: `artifacts/phase14-postgres-provider-backup-policy-dashboard-proof.png`.

Score decision:
- `database_provider_backup_policy` remains `0 / 100` until a non-example hosted provider policy file is configured and `BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_READY=1`.
- The example policy validates the contract and intentionally reports `provider_policy_contract_valid_not_hosted`.
- Remaining production work is selecting the hosted provider, configuring provider-native backup/PITR and secret management, then running the policy smoke against the private provider policy.

## Phase 15 Hosted Browser Sandbox Provider Update

Implementation:
- Added `project/deployment/browser-sandbox-provider.example.json`.
- Added `scripts/browser-sandbox-provider-contract.mjs` and package script `sandbox:browser:provider-contract`.
- Added `src/tests/browser-sandbox-provider-contract.test.mjs` and included it in `npm run test:docker:contract`.
- FastAPI now accepts the `hosted_remote` browser provider enum and fails closed until hosted provider configuration exists.
- Node and FastAPI proof payloads now expose `hosted_browser_sandbox_provider` and `hosted_remote_browser_sandbox`.

Verification:
- Focused JS syntax checks passed.
- Python compile checks passed.
- Focused browser-sandbox/compose contract tests passed with 3/3 tests.
- Focused FastAPI hosted-provider fail-closed test passed.
- `npm run sandbox:browser:provider-contract` passed.
- `npm run build` passed.
- Final-system verification report coverage passed with 2/2 tests.
- `npm run test:docker:contract` passed with 19/19 tests.
- FastAPI facade regression passed with 35 tests, including 2 expected skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- In-app browser proof loaded the dashboard at `http://127.0.0.1:4200/?phase=hosted-browser-sandbox-provider`, clicked `Load Connector Proof`, verified hosted sandbox proof strings, and found 0 console errors.
- Screenshot/proof artifacts:
  - `artifacts/phase15-hosted-browser-sandbox-provider-dashboard-proof.png`
  - `artifacts/phase15-hosted-browser-sandbox-provider-proof.json`
  - `artifacts/browser-sandbox-provider-contract-smoke.json`

Score decision:
- Existing `remote_browser_controls` remains `90 / 90` for the local-CDP live-frame path.
- `hosted_remote_browser_sandbox` remains `0 / 100` until a real hosted provider config is supplied and `WEFELLA_BROWSER_SANDBOX_PROVIDER_READY=1`.
- The example provider contract intentionally reports `hosted_browser_sandbox_contract_valid_not_configured`.

## Phase 16 Hosted Browser Sandbox Adapter Harness Update

Implementation:
- Added `project/deployment/browser-sandbox-provider.contract-harness.json`.
- Added `scripts/browser-sandbox-adapter-harness.mjs` and package script `sandbox:browser:adapter-harness`.
- Extended browser sandbox contract validation with explicit adapter modes.
- FastAPI `hosted_remote` now has a contract-harness lifecycle for session creation, safe SSE stream, takeover, sanitized input, and ending takeover.
- Node and FastAPI proof payloads now expose `hosted_browser_sandbox_adapter_harness`.

Focused verification:
- Focused JS syntax checks passed.
- Python compile checks passed.
- Focused browser-sandbox/compose contract tests passed with 4/4 tests.
- Focused FastAPI hosted-provider fail-closed and hosted harness lifecycle tests passed.
- `npm run sandbox:browser:provider-contract` passed.
- `npm run sandbox:browser:adapter-harness` passed.
- `npm run build` passed.
- Final-system verification report coverage passed with 2/2 tests.
- `npm run test:docker:contract` passed with 20/20 tests.
- FastAPI facade regression passed with 36 tests, including 2 expected skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Browser proof loaded the dashboard at `http://127.0.0.1:4201/?phase=hosted-browser-sandbox-adapter-harness`, clicked `Load Connector Proof`, verified adapter-harness proof strings, and saved the visual artifact.
- Screenshot/proof artifacts:
  - `artifacts/phase16-hosted-browser-sandbox-adapter-harness-dashboard-proof.png`
  - `artifacts/phase16-hosted-browser-sandbox-adapter-harness-proof.json`
  - `artifacts/browser-sandbox-adapter-harness-smoke.json`

Score decision:
- `hosted_browser_sandbox_adapter_harness` can reach `75 / 75` when the harness config and readiness env are selected.
- `hosted_remote_browser_sandbox` remains `0 / 100` until a real hosted provider config with `adapter.mode=hosted_provider` is supplied and live hosted proof passes.

## Phase 17 Hosted Browser Sandbox Provider Resolver Update

Implementation:
- Added a hosted-provider example config whose endpoint and auth token are env references, not committed values.
- Added `npm run sandbox:browser:provider-resolver`.
- Added resolver proof states for missing endpoint/secret, configured-unverified, and live-ready.
- Exposed `hosted_browser_sandbox_provider_resolver` as a separate FastAPI and dashboard score.

Focused verification:
- JS syntax checks passed for the hosted provider contract and resolver scripts.
- Python compile checks passed for FastAPI browser sandbox and facade code.
- Focused browser-sandbox/compose contract tests passed with 5/5 tests.
- Focused FastAPI resolver and harness tests passed with 3/3 tests.
- Resolver smoke passed in both missing-env and configured-unverified modes without leaking the fake endpoint or token.
- Full gate passed: provider contract smoke, adapter harness smoke, provider resolver smoke, `npm run build`, final-report coverage, `npm run test:docker:contract` with 21/21 tests, FastAPI facade regression with 38 tests and 2 expected skips, and `npm run test:local` with 210 total tests, 208 passed, 0 failed, and 2 expected skips.
- Headless Chrome dashboard proof passed with `hosted_browser_sandbox_provider_resolver`, `hosted_browser_sandbox_provider_configured_unverified`, and `hosted_remote_browser_sandbox` visible, and no fake endpoint/token leak.

Score decision:
- `hosted_browser_sandbox_provider_resolver` can reach `50 / 50` when endpoint and auth env refs resolve.
- `hosted_remote_browser_sandbox` remains `0 / 100` until a real provider adapter passes live stream, screenshot/OCR, takeover, input, teardown, and offsite-fail-closed proof.

## Phase 18 Hosted Browser Sandbox Provider Adapter Contract Update

Implementation:
- Added a hosted-provider adapter smoke that validates the create-session request and provider response envelope.
- Added `npm run sandbox:browser:provider-adapter`.
- Added a separate `hosted_browser_sandbox_provider_adapter` FastAPI and dashboard score.
- FastAPI still blocks real hosted session creation when only the adapter contract is ready.
- Hardened connector proof loading so startup auto-load and manual proof refresh cannot leave the dashboard stuck in a stale `Loading...` state.

Focused verification:
- JS and Python syntax checks passed.
- Focused browser-sandbox/compose contract tests passed with 6/6 tests.
- Focused FastAPI adapter/resolver tests passed with 2/2 tests.
- Adapter smoke passed with no provider network call, no raw endpoint, no raw token, no raw frame, no raw OCR text, no external action, and no credential-entry allowance.
- Full gate passed: provider contract smoke, adapter harness smoke, provider resolver smoke, provider adapter smoke, `npm run build`, final-report coverage, `npm run test:docker:contract` with 22/22 tests, FastAPI facade regression with 39 tests and 2 expected skips, and `npm run test:local` with 210 total tests, 208 passed, 0 failed, and 2 expected skips.
- Headless Chrome dashboard proof passed with `hosted_browser_sandbox_provider_adapter`, `hosted_browser_sandbox_provider_adapter_contract_ready`, and `hosted_remote_browser_sandbox` visible, and no fake endpoint/token leak.

Score decision:
- `hosted_browser_sandbox_provider_adapter` can reach `75 / 75` when resolver refs are configured and `WEFELLA_BROWSER_SANDBOX_PROVIDER_ADAPTER_CONTRACT_READY=1`.
- `hosted_remote_browser_sandbox` remains `0 / 100` until live provider proof passes.

## Phase 19 Hosted Browser Sandbox Provider HTTP Adapter Harness Update

Implementation:
- Added a provider-style HTTP adapter harness that performs a real local HTTP POST to `POST /browser/sessions`.
- Added `npm run sandbox:browser:provider-http-adapter`.
- Added a separate `hosted_browser_sandbox_provider_http_adapter` FastAPI and dashboard score.
- FastAPI still blocks real hosted session creation when only the HTTP adapter harness is ready.

Focused verification:
- JS and Python syntax checks passed.
- Focused browser-sandbox/compose contract tests passed with 7/7 tests.
- Focused FastAPI HTTP-adapter-harness and adapter-contract tests passed with 2/2 tests.
- HTTP adapter harness smoke passed with `providerNetworkCalled=true`, `localHarnessOnly=true`, no raw endpoint, no raw token, no raw frame, no raw OCR text, no external action, and no credential-entry allowance.
- Full gate passed: provider contract smoke, adapter harness smoke, provider resolver smoke, provider adapter smoke, provider HTTP adapter harness smoke, `npm run build`, final-report coverage, `npm run test:docker:contract` with 23/23 tests, FastAPI facade regression with 40 tests and 2 expected skips, and `npm run test:local` with 210 total tests, 208 passed, 0 failed, and 2 expected skips.
- Browser visual proof passed with `hosted_browser_sandbox_provider_http_adapter`, `hosted_browser_sandbox_provider_http_adapter_harness_ready`, and `hosted_remote_browser_sandbox` visible, and no fake provider endpoint/token leak.

Score decision:
- `hosted_browser_sandbox_provider_http_adapter` can reach `85 / 85` when resolver refs are configured, adapter contract is ready, and `WEFELLA_BROWSER_SANDBOX_PROVIDER_HTTP_ADAPTER_HARNESS_READY=1`.
- `hosted_remote_browser_sandbox` remains `0 / 100` until live provider proof passes.

## Phase 20 Hosted Browser Sandbox Provider Live Lifecycle Harness Update

Implementation:
- Added a provider-style live lifecycle harness that performs local provider-compatible calls for create session, stream frame event, screenshot ref, OCR/caption ref, approval-gated takeover, redacted approved input, offsite fail-closed navigation, and teardown.
- Added `npm run sandbox:browser:provider-live-lifecycle`.
- Added a separate `hosted_browser_sandbox_provider_live_lifecycle` FastAPI and dashboard score.
- FastAPI still blocks real hosted session creation when only the lifecycle harness is ready.

Focused verification:
- JS and Python syntax checks passed.
- Focused browser-sandbox/compose contract tests passed with 8/8 tests.
- Focused FastAPI lifecycle-harness and HTTP-adapter-harness tests passed with 2/2 tests.
- Lifecycle harness smoke passed with `providerNetworkCalled=true`, `localHarnessOnly=true`, no raw endpoint, no raw token, no raw frame, no raw OCR text, no raw input value, no external action, and no credential-entry allowance.
- Full gate passed: provider contract smoke, adapter harness smoke, provider resolver smoke, provider adapter smoke, provider HTTP adapter harness smoke, provider live lifecycle harness smoke, `npm run build`, final-report coverage, `npm run test:docker:contract` with 24/24 tests, FastAPI facade regression with 41 tests and 2 expected skips, and `npm run test:local` with 210 total tests, 208 passed, 0 failed, and 2 expected skips.
- In-app browser dashboard proof passed with `hosted_browser_sandbox_provider_live_lifecycle`, `hosted_browser_sandbox_provider_live_lifecycle_harness_ready`, `hosted_browser_sandbox_provider_http_adapter`, and `hosted_remote_browser_sandbox` visible, zero console issues, and no fake provider endpoint/token leak.

Score decision:
- `hosted_browser_sandbox_provider_live_lifecycle` can reach `95 / 95` when resolver refs are configured, adapter contract is ready, HTTP adapter harness is ready, and `WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_LIFECYCLE_HARNESS_READY=1`.
- `hosted_remote_browser_sandbox` remains `0 / 100` until a selected real hosted provider passes live stream, screenshot/OCR, takeover, input, teardown, offsite-fail-closed, and GUI/OCR visual proof.

## Phase 21 Hosted Browser Sandbox Provider Selection And Preflight Update

Implementation:
- Added a non-secret hosted browser provider-selection matrix with candidates for `custom_webrtc`, `browserbase`, and `vercel_sandbox`.
- Added `npm run sandbox:browser:provider-selection`.
- Added a separate `hosted_browser_sandbox_provider_selection` FastAPI and dashboard score.
- Selection preflight can pass without making a provider network call, storing provider endpoints/tokens, or enabling live hosted-browser readiness.
- `hosted_remote_browser_sandbox` remains blocked until real provider live proof passes.

Focused verification:
- JS and Python syntax checks passed.
- `npm run sandbox:browser:provider-selection` passed with `hosted_browser_sandbox_provider_selection_contract_ready`, `providerSelectionContractReady=true`, and `hostedProviderReady=false`.
- Focused browser-sandbox/compose contract tests passed with 10/10 tests.
- Focused FastAPI provider-selection proof test passed.
- Full gate passed: provider contract smoke, adapter harness smoke, provider resolver smoke, provider adapter smoke, provider HTTP adapter harness smoke, provider live lifecycle harness smoke, provider selection smoke, `npm run build`, `npm run test:docker:contract` with 26/26 tests, FastAPI facade regression with 42 tests and 2 expected skips, and `npm run test:local` with 210 total tests, 208 passed, 0 failed, and 2 expected skips.
- In-app browser dashboard proof passed with `hosted_browser_sandbox_provider_selection`, `hosted_browser_sandbox_provider_selection_preflight_ready`, and `hosted_remote_browser_sandbox` visible; the hosted remote browser score remained `0 / 100`; console issues were 0; fake provider endpoints/tokens were absent.

Score decision:
- `hosted_browser_sandbox_provider_selection` can reach `70 / 90` from the checked-in contract and `90 / 90` only when `WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER` is a known candidate and `WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY=1`.
- `hosted_remote_browser_sandbox` remains `0 / 100` until a selected real hosted provider passes live stream, screenshot/OCR, takeover, input, teardown, offsite-fail-closed, and GUI/OCR visual proof.

## Phase 22 Hosted Browser Sandbox Provider Live Preflight Update

Implementation:
- Added `npm run sandbox:browser:provider-live-preflight`.
- Added private provider runtime JSON ignore patterns and a non-secret live-preflight env example.
- Added a separate `hosted_browser_sandbox_provider_live_preflight` FastAPI and dashboard score.
- Live preflight depends on selected-provider preflight, hosted-provider endpoint/auth resolver readiness, and the explicit live-preflight gate.
- Optional provider health probing is env-gated and must return sanitized capability booleans only.
- `hosted_remote_browser_sandbox` remains blocked until real provider lifecycle and GUI/OCR proof pass.

Focused verification:
- JS and Python syntax checks passed.
- `npm run sandbox:browser:provider-live-preflight` passed in blocked/default mode without provider network calls or secret leakage.
- Focused browser-sandbox/compose contract tests passed with 12/12 tests.
- Focused FastAPI provider live-preflight proof test passed.
- Full sandbox smoke chain passed.
- `npm run build` passed.
- `npm run test:docker:contract` passed with 28/28 tests.
- `npm run test:facade` passed with 43 tests and 2 expected skips.
- `npm run test:local` passed with 208 passing tests and 2 expected skips.
- Dashboard browser proof passed with `hosted_browser_sandbox_provider_selection` at `90 / 90`, `hosted_browser_sandbox_provider_live_preflight` at `80 / 80`, `hosted_remote_browser_sandbox` still at `0 / 100`, and no endpoint/token leakage.
- Proof artifacts:
  - `artifacts/phase22-hosted-browser-sandbox-provider-live-preflight-dashboard-proof.png`
  - `artifacts/phase22-hosted-browser-sandbox-provider-live-preflight-visual-proof.json`
  - `artifacts/phase22-hosted-browser-sandbox-provider-live-preflight-proof.json`
  - `artifacts/browser-sandbox-provider-live-preflight-smoke.json`

Score decision:
- `hosted_browser_sandbox_provider_live_preflight` can reach `80 / 80` only when provider selection preflight is ready, hosted endpoint/auth refs resolve, and `WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY=1`.
- `hosted_remote_browser_sandbox` remains `0 / 100` until a selected real hosted provider passes create-session, stream, screenshot/OCR, takeover, input, teardown, offsite-fail-closed, and GUI/OCR visual proof.

## Phase 23 Hosted Browser Sandbox Provider Live Verification Update

Implementation:
- Added `npm run sandbox:browser:provider-live-verification`.
- Added a non-secret live-verification env template and kept real provider endpoint/token/config outside Git.
- Added a selected-provider live verification contract covering create session, stream attach, screenshot ref, OCR/caption ref, takeover, approved input relay, offsite fail-closed navigation, and teardown.
- Added FastAPI hosted-provider runtime support for selected-provider HTTPS create-session, provider-backed takeover/input, and sanitized SSE stream proxying.
- Added a separate `hosted_browser_sandbox_provider_live_verification` FastAPI and dashboard score.
- Strengthened hosted-provider readiness so `hosted_remote_browser_sandbox` remains blocked unless live verification is ready, live verified is explicitly set, and private provider config reports `adapter.providerLiveConnected=true`.

Focused verification:
- JS syntax checks passed for provider contract, live-verification smoke, compose contract, and Node server files.
- Python compile checks passed for `project`.
- `npm run sandbox:browser:provider-live-verification` passed in default blocked mode without provider calls or secret leakage.
- Focused browser-sandbox/compose contract tests passed with 14/14 tests.
- Focused FastAPI live-preflight/live-verification tests passed with 2/2 tests.

Full verification:
- Full sandbox smoke chain passed, including provider contract, selection, live preflight, live verification, adapter harness, resolver, adapter, HTTP adapter, and live lifecycle.
- `npm run build` passed.
- `npm run test:docker:contract` passed with 30/30 tests.
- `npm run test:facade` passed with 44 tests and 2 expected skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected skips.
- Browser dashboard proof at `http://127.0.0.1:4208/?phase=hosted-browser-sandbox-provider-live-verification` verified the live-verification score, live-preflight score, hosted remote score, and no fake endpoint/token leakage.
- Visual/API artifacts were saved at:
  - `artifacts/phase23-hosted-browser-sandbox-provider-live-verification-dashboard-proof.png`
  - `artifacts/phase23-hosted-browser-sandbox-provider-live-verification-visual-proof.json`
  - `artifacts/phase23-hosted-browser-sandbox-provider-live-verification-proof.json`
  - `artifacts/browser-sandbox-provider-live-verification-smoke.json`

Score decision:
- `hosted_browser_sandbox_provider_live_verification` can reach `100 / 100` only when the explicit live-verification gate and earlier provider-readiness gates pass.
- `hosted_remote_browser_sandbox` remains `0 / 100` until a real selected provider proves live connection from private config and passes GUI/OCR proof.

## Phase 24 Hosted Browser Sandbox Provider WebRTC Signaling Update

Implementation:
- Added `npm run sandbox:browser:provider-webrtc-signaling`.
- Added a non-secret WebRTC signaling env template and kept real provider endpoint/token/config outside Git.
- Added an opaque WebRTC signaling contract covering offer ref, answer ref metadata, and ICE candidate ref relay.
- Added FastAPI hosted-provider signaling support at `POST /api/v1/browser/sessions/{browser_session_id}/webrtc/offer`.
- Added a separate `hosted_browser_sandbox_provider_webrtc_signaling` FastAPI and dashboard score.
- Strengthened WebRTC-capable hosted-provider readiness so `webrtc` and `webrtc_or_sse_frames` transports require the explicit signaling gate.
- Preserved the human-only `interactive_takeover` approval scope and kept Codex credential entry disallowed.

Focused verification:
- JS syntax checks passed for provider contract, WebRTC signaling smoke, compose contract, and Node server files.
- Python compile checks passed for `project`.
- `npm run sandbox:browser:provider-webrtc-signaling` passed in default blocked mode without provider calls or secret leakage.
- Focused browser-sandbox/compose contract tests passed with 15/15 tests.
- FastAPI facade regression passed with 46 tests and 2 expected skips.

Full verification:
- `npm run build` passed.
- `npm run test:docker:contract` passed with 31/31 tests.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected skips.
- Browser dashboard proof at `http://127.0.0.1:4210/?phase=hosted-browser-sandbox-provider-webrtc-signaling` verified the WebRTC signaling score, live-verification score, hosted remote score, and no endpoint/token/raw SDP/raw ICE leakage.
- Visual/API artifacts were saved at:
  - `artifacts/phase24-hosted-browser-sandbox-provider-webrtc-signaling-dashboard-proof.png`
  - `artifacts/phase24-hosted-browser-sandbox-provider-webrtc-signaling-visual-proof.json`
  - `artifacts/phase24-hosted-browser-sandbox-provider-webrtc-signaling-proof.json`
  - `artifacts/browser-sandbox-provider-webrtc-signaling-smoke.json`

Score decision:
- `hosted_browser_sandbox_provider_webrtc_signaling` can reach `100 / 100` only when the explicit signaling gate and earlier provider-readiness gates pass.
- `hosted_remote_browser_sandbox` remains `0 / 100` until a real selected provider proves live connection from private config and passes GUI/OCR proof.

## Phase 25 Hosted Browser Sandbox Provider Visual/OCR Replay Update

Implementation:
- Added `npm run sandbox:browser:provider-visual-ocr-replay`.
- Added a non-secret visual/OCR replay env template and kept real proof manifests outside Git.
- Added a private visual/OCR proof-manifest validator for dashboard screenshot proof, mobile live-block proof, OCR/caption proof, stream frame proof, screenshot proof, takeover proof, approved-input proof, and teardown proof.
- Added a separate `hosted_browser_sandbox_provider_visual_ocr_replay` FastAPI and dashboard score.
- Strengthened final hosted-provider readiness so live verification and WebRTC signaling are insufficient without visual/OCR replay plus explicit real-provider live verification.
- Preserved the human-only `interactive_takeover` approval scope and kept Codex credential entry disallowed.

Focused verification:
- JS syntax checks passed for the provider contract.
- Python compile checks passed for `project/api/browser_sandbox.py` and `project/api/main.py`.
- `npm run sandbox:browser:provider-visual-ocr-replay` passed in default blocked mode without provider calls or secret leakage.
- Browser-sandbox provider contract regression passed with 17/17 tests.
- FastAPI facade regression passed with 47 tests and 2 expected skips.

Full verification:
- `npm run build` passed.
- `npm run test:docker:contract` passed with 34/34 tests.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected skips.
- Browser dashboard proof at `http://127.0.0.1:4211/?phase=hosted-browser-sandbox-provider-visual-ocr-replay` verified the visual/OCR replay score, WebRTC signaling score, live-verification score, hosted remote score, and no endpoint/token leakage.
- Visual/API artifacts were saved at:
  - `artifacts/phase25-hosted-provider-visual-ocr-replay-dashboard-proof.png`
  - `artifacts/phase25-hosted-provider-visual-ocr-replay-visual-proof.json`
  - `artifacts/phase25-hosted-provider-visual-ocr-replay-proof.json`
  - `artifacts/browser-sandbox-provider-visual-ocr-replay-smoke.json`

Score decision:
- `hosted_browser_sandbox_provider_visual_ocr_replay` can reach `100 / 100` only when the explicit replay gate, earlier provider-readiness gates, and a valid private proof manifest outside Git pass.
- `hosted_remote_browser_sandbox` remains `0 / 100` until a real selected provider proves live connection from private config, WebRTC signaling when required, visual/OCR replay proof, and explicit live verification.

## Phase 26 Hosted Browser Sandbox Provider Launch Readiness

What changed:
- Added `npm run sandbox:browser:provider-launch-readiness`.
- Added `project/deployment/browser-sandbox-provider.launch-readiness.example.env`.
- Added `docs/HOSTED_BROWSER_SANDBOX_PROVIDER_LAUNCH_RUNBOOK.md`.
- Exposed `hosted_browser_sandbox_provider_launch_readiness` through Node dashboard proof and FastAPI `/api/v1/proof`.
- Aggregated selected-provider selection, live preflight, live verification, WebRTC signaling, visual/OCR replay, private config placement, private proof placement, and final enablement into one sanitized operator proof.

Verification:
- `npm run sandbox:browser:provider-launch-readiness` passed in safe default mode and reported `hosted_browser_sandbox_provider_launch_runbook_ready`.
- Browser-sandbox provider contract tests passed with 19/19 tests.
- Focused FastAPI launch-readiness proof test passed.
- `npm run build` passed.
- `npm run test:docker:contract` passed with 36/36 tests.
- `.venv-facade/bin/python -m unittest project.tests.test_fastapi_facade` passed with 48 tests and 2 expected live-gated skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Browser dashboard/API proof verified `hosted_browser_sandbox_provider_launch_readiness=60 / 100`, `hosted_remote_browser_sandbox=0 / 100`, and no fake endpoint/token leak.

Current readiness:
- `hosted_browser_sandbox_provider_launch_readiness` reports runbook readiness in default local mode.
- `hosted_remote_browser_sandbox` remains `0 / 100` until a real provider supplies private live proof, WebRTC proof when required, visual/OCR replay, final live verified env, and private `adapter.providerLiveConnected=true`.

Remaining proof:
- Real provider launch readiness remains pending until operator-supplied private provider credentials and real visual/OCR artifacts are available outside Git.
