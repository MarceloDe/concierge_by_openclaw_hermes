/goal

Verify, complete, and test the final Wefella system across:
1. User Concierge Dashboard
2. Operator / Research Dashboard
3. Public and internal APIs
4. Background automation and worker adapters

Use this as the acceptance contract. Do not mark the goal complete until every applicable item is either:
- passing,
- implemented and passing,
- or explicitly marked blocked by missing credentials/external services.

GENERAL RULES
- Acceptance criteria must be clear, measurable, and testable.
- Prefer automated tests for every API and backend behavior.
- Add UI tests for critical user flows on both dashboards.
- Every write action must be authenticated, authorized, schema-validated, and audit-logged.
- Insurance-domain answers must be grounded in retrieval context and citations; no unsupported facts.
- Low-confidence retrieval must refuse or escalate, not hallucinate.
- No raw PHI in logs or audit payloads.
- Operator assistant may use only registry-bound tools.
- Write/destructive operator actions require proposal + human approval.
- Frontend must never call OpenClaw/Hermes directly.
- System must function with MockWorker when real workers are unavailable.
- Use SSE for one-way streaming responses, with status polling fallback for recovery and reconnect scenarios.

DELIVERABLES REQUIRED
- Implement missing functionality.
- Add or update tests.
- Produce a final verification report:
  - PASSING
  - IMPLEMENTED DURING THIS RUN
  - BLOCKED BY EXTERNAL DEPENDENCY
  - FAILING / NEEDS FIX

==================================================
A. USER CONCIERGE DASHBOARD
==================================================

A1. Open concierge dashboard
System should:
- Load the user-facing Wefella dashboard.
- Show main input area and at least one suggested action/chip.
Success criteria:
- HTTP 200.
- No frontend runtime or console errors.
- Responsive on mobile and desktop.

A2. Start new concierge session
System should:
- Create a new isolated session when the user starts a conversation.
Success criteria:
- New session_id created.
- First message linked to that session.
- No prior unrelated conversation appears.

A3. Resume existing session
System should:
- Restore session history and context.
Success criteria:
- Existing session_id loads prior context.
- Follow-up questions use previous turns correctly.
- Works after backend restart if persistence is enabled.

A4. Send free-text message
System should:
- Accept a natural-language healthcare/insurance question.
- Classify intent.
- Run retrieval when domain-specific.
- Return an answer as text and/or structured AI2UI block.
Success criteria:
- Message accepted and processed.
- Response rendered without refresh.
- Domain answers grounded in retrieved context.
- Off-topic and unsafe content handled safely.

A5. Use guided chips / quick actions
System should:
- Convert chip clicks into structured intents.
Success criteria:
- Each chip triggers the expected backend action.
- UI moves to the correct next state.
- No dead or broken chips.

A6. Switch UI modes
System should:
- Preserve the same conversation in Chat / Split / Guided / Bento modes.
Success criteria:
- Switching mode does not reset state.
- No duplicate backend calls.
- Same answer data renders in all supported layouts.

A7. Render AI2UI structured blocks
System should:
- Support structured blocks such as checklist, comparison, cards, citations, next-step actions, warnings.
Success criteria:
- Backend returns typed block payloads.
- Frontend renders correct component.
- Unknown block types fail safely or fall back gracefully.

A8. Answer plan and benefit questions
System should:
- Explain plan rules such as deductible, copay, coinsurance, out-of-pocket max, coverage terms.
Success criteria:
- Uses grounded plan data.
- Includes citations or source references.
- If data is missing, clearly says information is unverified.

A9. Answer cost and comparison questions
System should:
- Compare plans, providers, or options and explain tradeoffs.
Success criteria:
- Output includes comparison UI when appropriate.
- Estimates include assumptions.
- No fabricated exact prices.

A10. Answer claims questions
System should:
- Help explain bills, EOBs, denials, or claims issues.
Success criteria:
- Requests missing info when needed.
- Provides next-step checklist when possible.
- Escalates ambiguous or high-risk cases.

A11. Answer prescription questions
System should:
- Explain coverage/navigation issues for medications.
Success criteria:
- Uses available formulary/coverage data when present.
- Avoids clinical medication advice.
- Escalates or advises verification when uncertain.

A12. Answer procedure-prep questions
System should:
- Provide administrative and plan-aware preparation guidance.
Success criteria:
- Checklist-style response where appropriate.
- Separates insurance/admin guidance from clinical advice.
- Escalates urgent medical content.

A13. Answer provider/network questions
System should:
- Show provider/facility options when data exists.
Success criteria:
- Returns option cards/list/table.
- Shows confidence/source.
- Does not promise in-network status without verified data.

A14. Upload user document
System should:
- Accept PDF/image/EOB/bill/plan documents.
Success criteria:
- Allowed file types only.
- File size/type validated.
- Upload status shown.
- Processing result visible.
Phase 10A status:
- Implemented through authenticated `POST /api/uploads` in the FastAPI facade and visible in `/mvp`.
- Current storage is local and git-ignored by default.

A15. Extract information from uploaded document
System should:
- OCR/parse and extract fields/entities from uploaded documents.
Success criteria:
- Structured extracted fields displayed.
- Low-confidence fields flagged.
- Source page/span linked where possible.
Phase 10C status:
- Implemented local text extraction, optional PDF extraction through `pypdf`, optional image OCR through Tesseract, safe redacted previews, structured fields, confidence, blockers, and source snippets.
- Wired into LangGraph chat answers through FastAPI `uploaded_document_ids`.
- Uploaded-document source pointers now include citation metadata, structured fields, source spans, extraction method/hash, and safe provenance.
- Real Graphiti retain/recall proof passed across two sessions for an uploaded-document source pointer.

A16. Ask follow-up questions with context
System should:
- Resolve references like “what about coinsurance?”
Success criteria:
- Prior context is correctly used.
- No session leakage.
- Retrieval reruns when needed.

A17. View citations
System should:
- Show source details for grounded answers.
Success criteria:
- Insurance-specific factual claims map to retrieved sources.
- Missing citation causes refusal, warning, or escalation.
Phase 10C status:
- `/mvp` renders citation/source detail cards for uploaded-document grounded answers.
- Portal/OpenClaw source pointers remain visible in `/mvp` and the deeper `/` operator proof dashboard.
- Broader citation closure for all future research/operator evidence remains a later requirement.

A18. Handle off-topic prompts
System should:
- Redirect unrelated requests politely.
Success criteria:
- No full domain workflow triggered unnecessarily.
- Response is brief and in scope.

A19. Handle urgent or unsafe prompts
System should:
- Detect emergency or safety-critical content.
Success criteria:
- Immediate safe response.
- Bypass normal flow.
- Escalation/audit recorded.

A20. Request human handoff
System should:
- Create escalation/handoff item.
Success criteria:
- Handoff record created.
- Summary generated.
- Visible in operator dashboard.

A21. Submit feedback
System should:
- Accept thumbs up/down or equivalent.
Success criteria:
- Feedback persisted with session/message reference.
- Visible in operator review queue.

A22. Export/save checklist or plan
System should:
- Allow export of useful outputs.
Success criteria:
- Download works.
- Export matches on-screen content.
- Includes date and source context where applicable.
- Avoids unnecessary PHI.

==================================================
B. USER-CONCIERGE API CONTRACT
==================================================

B1. Health endpoint
- GET /api/health
Success criteria:
- Returns 200 with status metadata.

B2. Start chat
- POST /api/chat
Success criteria:
- Valid request returns session_id and task_id quickly.
- Invalid payload returns 4xx.
- Unauthorized request returns 401 when auth is required.

B3. Stream response
- GET /api/chat/stream/{task_id}
Success criteria:
- Uses text/event-stream.
- First event/token arrives quickly.
- Stream ends cleanly with done event.
- Browser reconnect behavior is supported by SSE semantics.
- Frontend can recover via polling if stream drops.

B4. Poll task status
- GET /api/chat/status/{task_id}
Success criteria:
- Returns queued/running/done/error.
- Returns final result when complete.
- Safe error shape; no stack trace leakage.

B5. Session history
- GET /api/sessions/{session_id}
Success criteria:
- Returns ordered history for authorized user only.
- Missing session returns 404.

B6. Upload document
- POST /api/uploads or equivalent
Success criteria:
- Validates file type and size.
- Returns upload_id and status.
Phase 10A status:
- Implemented as authenticated FastAPI `POST /api/uploads`.

B7. Get extraction result
- GET /api/uploads/{upload_id}/extraction or equivalent
Success criteria:
- Returns extracted fields, confidence, and provenance.
Phase 10A status:
- Implemented as authenticated, user-bound FastAPI `GET /api/uploads/{upload_id}/extraction`.

B8. Submit feedback
- POST /api/feedback
Success criteria:
- Persists feedback linked to session/message/answer.

==================================================
C. OPERATOR / RESEARCH DASHBOARD
==================================================

C1. Open operator dashboard
System should:
- Load research/operator UI with clickable panels.
Success criteria:
- HTTP 200.
- No frontend runtime errors.
- All main panels visible and interactive.

C2. View KPIs
System should:
- Show live system counts and health indicators.
Success criteria:
- Values come from backend data, not hardcoded mocks.
- Refresh updates values correctly.

C3. List research runs
Success criteria:
- Run list loads with status, time, summary.
- Supports filters where implemented.

C4. Open single run
Success criteria:
- Shows run metadata, findings, artifacts, failures.

C5. View run events
Success criteria:
- Ordered event timeline with stage/status/timestamp/error summary.

C6. Start manual run
Success criteria:
- Creates queued/running run.
- Appears in dashboard.
- Audit log records actor.

C7. Cancel run
Success criteria:
- Run ends safely as cancelled.
- No corrupt partial state.
- Audit logged.

C8. Retry failed run
Success criteria:
- Creates a new attempt or retry event.
- Prevents duplicate writes.
- Preserves history.

C9. View source registry
Success criteria:
- Lists sources with status/health/last run metadata.

C10. Propose new source
Success criteria:
- New source stored as pending by default.
- URL validated.
- Audit logged.

C11. Approve or reject source
Success criteria:
- Status changes correctly.
- Actor and reason captured.
- Scheduler respects status.

C12. Disable source
Success criteria:
- Disabled source skipped in future runs.
- Historical evidence preserved.
- Audit logged.

C13. Prioritize sources/topics
Success criteria:
- Priority persists.
- Scheduler uses updated ordering.

C14. Add or edit research arguments
Success criteria:
- Queries/topics/filters validate and persist.
- Used on next run.
- Audit logged.

C15. Schedule nightly run
Success criteria:
- Schedule persists.
- Next run time visible.
- Scheduler triggers correctly.

C16. Pause/resume nightly automation
Success criteria:
- Paused state respected.
- Resume restores automation without losing configuration.

C17. Upload manual PDF to knowledge base
Success criteria:
- Upload succeeds.
- Same pipeline used: OCR/text extraction -> scrub -> entities -> evidence.
- Audit logged.

C18. Search evidence / claims / documents
Success criteria:
- Relevant results returned.
- Filters and source metadata visible.
- Clear empty state.
Phase 10H status:
- Implemented operator research evidence search for reviewed artifacts through `GET /api/research/search`.
- Default search returns only `trusted_retrieval_approved` artifacts and reports pending-review matches as unavailable to trusted retrieval.
- Claims/document specialized search and embeddings remain future work.

C19. Test retrieval for a question
Success criteria:
- Shows retrieved chunks and scores.
- Low-confidence retrieval visibly flagged.
Phase 10H status:
- Implemented deterministic score/snippet proof over safe artifact previews, titles, and source URLs.
- Low-confidence/no-trusted evidence states are explicit.
- Semantic/vector retrieval tests remain future work.

C20. View citation closure / groundedness
Success criteria:
- Supported claims linked to citations.
- Unsupported claims quarantined/rejected.
- Uncited claims unavailable to trusted retrieval.
Phase 10H status:
- Implemented artifact citation lifecycle: pending review, trusted approved, quarantined, and mock untrusted.
- Default trusted search excludes pending, quarantined, and MockWorker artifacts.

C21. View review queue
Success criteria:
- Low-confidence, downvoted, escalated, or uncited items are filterable.
Phase 10H status:
- Implemented pending artifact review queue in `/` and `GET /api/research/artifacts`.
- Downvoted/escalated/user-answer review queues remain future work.

C22. Operator natural-language console
Success criteria:
- Read-only asks map to allowed read tools.
- Tool calls/results visible.
- No hidden arbitrary execution.

C23. Propose operator write action
Success criteria:
- NL request becomes structured proposal.
- Includes tool, args, risk, expected effect.
- No direct write execution without approval.

C24. Approve/reject proposal
Success criteria:
- Approval executes exactly once after validation.
- Rejection causes no mutation.
- Full lifecycle audit recorded.

C25. View tool registry
Success criteria:
- Shows available tools, schemas, permissions, risk levels.

C26. View analytics
Success criteria:
- Read-only metrics/charts/tables from real data.
- No state mutation.
- Matches backend values.

C27. Set budget / kill-switch
Success criteria:
- Limits persist.
- Running jobs respect limits.
- State visible in UI.
- Audit logged.

C28. Choose embedding route
Success criteria:
- Provider setting persists.
- Pipeline uses chosen route.
- Dimension mismatch handled safely.

C29. Reindex embeddings
Success criteria:
- Reindex job completes or fails safely.
- Retrieval works afterward.
- Prior data/index not silently destroyed.

C30. View worker status
Success criteria:
- Shows mock/openclaw/hermes mode.
- Shows health and last error.
- System remains functional in mock mode.

C31. Review worker skill proposals
Success criteria:
- Proposal visible.
- Never auto-applied in production.
- Approval/rejection logged.

C32. View audit log
Success criteria:
- All write actions have audit rows.
- Filter/search works.
- No raw PHI exposed in logs.

==================================================
D. OPERATOR / RESEARCH API CONTRACT
==================================================

D1. GET /api/research/kpis
- Returns live KPI values for authorized operator.

D2. GET /api/research/runs
- Returns paginated/filterable run list.

D3. GET /api/research/runs/{run_id}
- Returns run detail.

D4. GET /api/research/runs/{run_id}/events
- Returns ordered event timeline.

D5. POST /api/research/runs
- Starts manual run.
- Audit logged.

D6. POST /api/research/runs/{run_id}/cancel
- Safely cancels run.
- Audit logged.

D7. POST /api/research/runs/{run_id}/retry
- Retries safely without duplicate evidence writes.

D8. GET /api/research/sources
- Lists source registry.

D9. POST /api/research/sources/propose
- Creates pending source.
- Audit logged.

D10. POST /api/research/sources/{id}/approve
D11. POST /api/research/sources/{id}/reject
- Changes source status correctly.
- Records actor and reason.

D12. PATCH /api/research/sources/{id}
- Updates metadata/priority/flags safely.
- Audit logged.

D13. POST /api/research/uploads/pdf or equivalent
- Uploads manual document.
- Creates extraction pipeline job.

D14. GET /api/research/documents/{id}/extraction
- Returns extracted text/entities/confidence.

D15. GET /api/research/search
- Searches documents/entities/claims with source metadata.
Phase 10H status:
- Implemented reviewed-artifact search with source metadata and score/snippet fields.

D16. GET /api/research/claims and/or /api/research/evidence
- Returns evidence with citation status.
Phase 10H status:
- Implemented `GET /api/research/evidence` as an alias to reviewed-artifact evidence search.
- Claims-specific endpoint remains future work.

D17. GET /api/research/graph
- Returns nodes/edges safely, including empty graph state.

D18. POST /api/research/graph/build
- Starts graph build job.
- Audit logged.

D19. GET /api/research/analytics
- Returns read-only analytics.

D20. POST /api/operator/assistant
- Converts NL requests into read-only answer or proposal.
- Write actions must not auto-execute.

D21. POST /api/operator/proposals/{id}/approve
D22. POST /api/operator/proposals/{id}/reject
- Approval executes once with validation.
- Rejection prevents mutation.
- Full lifecycle audit logged.

D23. GET /api/operator/tools
- Returns allowed tool registry and schemas.

D24. GET /api/audit
- Returns filterable audit events for authorized roles only.

==================================================
E. BACKGROUND / AUTOMATION / EVIDENCE PIPELINE
==================================================

E1. Nightly run
Success criteria:
- Runs on configured schedule.
- Approved sources only.
- Honors priority order.
- Logs run and events.
- Phase 10T implements local MVP proof through an env-gated research scheduler daemon that scans approved due schedules, queues due research runs, emits runtime events, writes audit proof, and prevents overlapping ticks.

E2. Deterministic fetch path
Success criteria:
- Crawl/fetch uses approved non-LLM fetch path.
- Raw artifact saved.
- Failures logged.

E3. Text extraction and OCR
Success criteria:
- Documents parsed/OCRed.
- Failures visible and quarantined when needed.

E4. PII/PHI scrub
Success criteria:
- Sensitive content handled per policy before indexing/logging.
- Pipeline blocks or redacts when required.

E5. Entity extraction
Success criteria:
- Entities linked to source, page/span, confidence.
- Low-confidence entities marked.

E6. Deduplication
Success criteria:
- Retries and duplicates do not create duplicate evidence records.

E7. Append-only evidence spine
Success criteria:
- Evidence writes are append-only.
- Provenance includes source, run, document, method, timestamp.

E8. Citation closure
Success criteria:
- Unsupported/un-cited claims are rejected/quarantined.
- Trusted retrieval uses only approved/cited evidence.
Phase 10H status:
- Implemented the artifact-level approval/quarantine gate and trusted-only research search.
- Full claim-level groundedness and user-answer citation closure remain future work.

E9. Embedding/indexing
Success criteria:
- Selected embedding backend used correctly.
- Only approved evidence enters trusted retrieval index.
- Retrieval works after ingest and reindex.

E10. Quality judge
Success criteria:
- Judge writes scores/labels only.
- Judge never invents factual evidence.

E11. Health/readiness monitoring
Success criteria:
- Health endpoint alive.
- Readiness reflects DB/vectorstore dependencies where applicable.
- Dashboard shows degraded state gracefully.

==================================================
F. WORKER ADAPTERS
==================================================

F1. MockWorker mode
Success criteria:
- System works end-to-end with mock worker.
- Mock mode clearly visible in status UI/API.

F2. OpenClaw worker mode
Success criteria:
- Feature-flagged enablement required.
- Typed task envelope used.
- Structured validated result returned.
- Failures do not crash API.

F3. Hermes worker mode
Success criteria:
- Same bounded adapter contract as OpenClaw.
- Structured validated result returned.

F4. Worker skill proposal
Success criteria:
- Proposal stored for review.
- Never auto-applied in production behavior.

==================================================
G. SECURITY / COMPLIANCE / SAFETY
==================================================

G1. Authentication
Success criteria:
- Protected endpoints require valid auth.
- Unauthorized requests rejected.

G2. Authorization / RBAC
Success criteria:
- Roles clearly separated, e.g. user / operator / admin / assistant principal.
- Least-privilege enforcement.
- Users cannot access operator routes.
- Assistant principal cannot self-escalate.

G3. Rate limits
Success criteria:
- Excess requests receive 429.
- Normal usage remains functional.

G4. CORS / origin control
Success criteria:
- Production allows only approved frontend origins.
- Wildcard CORS not used in production.

G5. Logging safety
Success criteria:
- No raw PHI in application logs or audit payloads.
- Audit stores hashes/summaries where appropriate.

G6. Grounding gate
Success criteria:
- Insurance-domain answers without verified retrieval/citation are blocked, downgraded, or escalated.

G7. Safe error handling
Success criteria:
- User-facing APIs return safe errors.
- Internal logs retain actionable detail.
- No stack trace leakage to client.

==================================================
H. MINIMUM “SYSTEM IS REAL” GATE
==================================================

Do not mark the system complete unless at least these checks pass end-to-end:

1. User dashboard loads.
2. Operator dashboard loads.
3. Health endpoint returns 200.
4. Auth protects private routes.
5. Chat request creates session/task.
6. SSE stream returns assistant output.
7. Polling fallback returns final task state.
8. Multi-turn context works.
9. Off-topic guard works.
10. Urgent escalation works.
11. Insurance answer uses retrieval context.
12. Missing retrieval context causes refusal/escalation.
13. Citation block/source view works.
14. Document upload works.
15. Uploaded document can be queried/explained.
16. Source registry loads real data.
17. Manual run creates a research job.
18. Run detail shows event timeline.
19. Operator NL request creates a proposal for write actions.
20. Approved write action executes once and is audit-logged.
21. Rejected proposal causes no mutation.
22. Audit log shows all write actions.
23. MockWorker mode works.
24. Real worker mode remains feature-flagged and bounded.

FINAL OUTPUT REQUIRED
At the end of the run, produce:
1. A checklist with PASS / FAIL / BLOCKED for every item above.
2. A list of code changes made.
3. A list of tests added or updated.
4. A short list of remaining blockers, if any.
# Goal Final System

This file is the active end-state contract for `workerprototype_openclaw`. It is derived from:

- `brainstyworkers_ai_concierge_prompt.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`
- `docs/wefella-mvp-engineering-prompt.html`

The final system is not complete until every requirement below is implemented and verified against current runtime evidence.

## Product Goal

Build a user-friendly healthcare insurance concierge MVP where a planned user can sign in, ask an insurance benefits question, approve read-only evidence observation, receive a sourced answer grounded in verified source pointers, and retain safe product memory across sessions.

The MVP must prove the value loop through:

- `/mvp`: user-facing auth plus chat plus approval plus worker result flow.
- `/`: operator/debug dashboard for trace, audit, source pointers, worker state, runtime events, and memory.
- FastAPI/Wefella facade as the public API path.
- Node/LangGraph/OpenClaw/Zep Graphiti runtime as the current orchestration source of truth until parity proves a deeper migration.

## Architecture Laws

- FastAPI is the intended public production API entrypoint.
- LangGraph owns healthcare workflow routing, graph state, approval consumption, final answer composition, audit, and memory ingest.
- OpenClaw is the adaptive worker/tool arm. It may solve assigned tasks inside the approved scope, but it must not choose healthcare workflows or bypass approval gates.
- Product memory is Zep Graphiti/Hindsight-style runtime memory, not Cortex.
- Cortex is project memory only.
- User authentication, passwords, passkeys, 2FA, captcha, and SSN entry remain user-controlled.
- Read-only observation is the only approved live worker action in the current MVP.
- Payer contact, external messages, form submission, record changes, payments, appeals, prior-auth submission, credential entry, and medical advice are out of scope unless a later explicit approval gate is implemented.
- User-facing answers must be grounded in stored source pointers and must not dump raw portal text.

## Current Implemented Baseline

- Node `/api/chat` routes through the LangGraph product runtime.
- `/mvp` is a user-facing auth plus chat app.
- `/` remains the operator proof dashboard.
- Official OpenClaw read-only worker dispatch is available behind a LangGraph approval token and a dedicated project profile.
- Multi-page authenticated portal discovery, source pointers, document candidates, DOM/accessibility evidence, visual OCR evidence, and Graphiti safe retain are implemented.
- Candidate-specific document approval and approved single-candidate read-only observation are implemented.
- FastAPI facade phases 9A-9H are implemented:
  - public health,
  - protected chat task submission,
  - task status,
  - SSE task stream,
  - local MVP bearer-token auth,
  - protected proxies for `/mvp` actions,
  - `/mvp` FastAPI-first default,
  - visible Node-direct versus FastAPI parity proof,
  - provider-style JWT claim validation mode,
  - approved-loop proof through FastAPI with source pointers or precise blocker,
  - request IDs,
  - standardized error envelopes,
  - rate limiting,
  - explicit CORS metadata/defaults,
  - optional local task persistence,
  - source-grounding metadata and optional enforcement,
  - deployment readiness checks,
  - safe observability metadata,
  - optional JSONL task lifecycle export,
  - running-service smoke command,
  - deployment/observability runbook.

## Remaining MVP Requirements

### Public API And Auth

- FastAPI must remain the public `/mvp` API path.
- Direct Node mode may exist only as an operator/debug parity path.
- Auth must support production provider-style JWT validation, not only local dev HS256 tokens.
- Auth must validate token subject, expiry, issuer, and audience when provider mode is configured.
- Local MVP auth must be clearly development-only and disable-able through environment.
- CORS must come from environment and be production-domain ready.

### User-Facing Value Loop

- A non-engineer should be able to use `/mvp` to:
  - sign in,
  - ask or click the Benefits workflow,
  - see missing-info or approval prompts,
  - approve only read-only observation,
  - see worker progress/result/blocker,
  - see source pointers and memory status,
  - understand what to do when auth/portal state blocks execution.

### OpenClaw Worker

- The worker should be versatile inside an approved task:
  - same-site read-only portal navigation,
  - DOM/accessibility extraction,
  - screenshot/OCR validation,
  - portal search affordance scanning without unapproved submission,
  - read-only document candidate observation only after candidate-specific approval,
  - status updates and long-running follow-up recommendations.
- The worker must return structured result envelopes with actions taken, source pointers, blockers, uncertainties, recommended next steps, and worker memory updates for LangGraph to decide whether to ingest.

### Memory

- Product memory must retain only safe summaries and source pointers.
- Raw portal text, secrets, credentials, raw SSNs, and unrelated private data must not be retained.
- Cross-session recall must be demonstrable from the user-facing workflow.

### Evidence And Audit

- Verified evidence must include URL, title, page kind, timestamp, DOM hash, extraction hash, source pointer id, and safe structured fields.
- Every approval, worker dispatch, worker result, LLM/model payload observation, memory retain, and final answer must be auditable.
- New audit events must remain hash-chained and tamper-verifiable.

### Backend Evolution

- The current FastAPI facade must not replace working Node/LangGraph/OpenClaw behavior with mocks.
- Deeper Python orchestration migration is allowed only after parity tests prove behavior, approval, audit, source-pointer, worker, and memory equivalence.

## Next Phases

### Phase 9E - Production JWT Provider Alignment

Add provider-style JWT verification to the FastAPI facade while preserving local MVP auth for development.

Status:

- Implemented locally on 2026-06-01.
- Verified with FastAPI facade tests, live Node facade tests, build, chat UI contract tests, and the full local Node/LangGraph/OpenClaw gate.

Acceptance:

- Existing local facade tests still pass.
- Provider-mode tests prove issuer/audience/expiry/subject validation.
- Local dev tokens are rejected when provider mode requires issuer/audience claims.
- Health reports safe auth configuration metadata without exposing secrets.
- `/mvp` remains FastAPI-first and the parity proof still works in local mode.

### Phase 9F - FastAPI-First Approved Live Loop

Use `/mvp` through FastAPI-first mode to run the complete user-facing value loop:

- local sign-in,
- Benefits question,
- pending approval,
- read-only approval,
- OpenClaw official worker continuation,
- source-pointer result or precise blocker,
- Graphiti retain status,
- matching operator proof on `/`.

Status:

- Implemented locally on 2026-06-01 for the precise-blocker branch.
- `/mvp` drove the loop through FastAPI from local auth to Benefits, read-only approval, official OpenClaw continuation, precise blocker, product-memory status, and operator proof link.
- `/` loaded the same session from the linked proof URL.
- The sourced-result branch remains externally gated by a user-authenticated member portal tab in the dedicated OpenClaw profile.

### Phase 9G - Production API Hardening

Add rate limiting, safer error envelopes, production CORS defaults, task registry persistence plan, and source-grounding checks suitable for deployment.

Status:

- Implemented locally on 2026-06-01.
- FastAPI facade version is `0.1.0-phase9g-facade-hardening`.
- The facade now exposes request IDs, standard error envelopes, configurable rate limiting, production-aware CORS metadata/defaults, optional JSON task persistence, source-grounding metadata, and optional source-grounding enforcement.
- `/mvp` can read the new error-envelope shape and its visible phase label is now Phase 9G.
- Verified with facade unit tests, live Node facade tests, build, chat UI contract tests, full local Node/LangGraph/OpenClaw gate, FastAPI health proof, and `/mvp` browser proof.

### Phase 9H - Deployment/Observability Readiness

Add environment examples, deployment notes, optional LangSmith/LangGraph trace export, and CI-friendly smoke gates.

Status:

- Implemented locally on 2026-06-01.
- FastAPI facade version is `0.1.0-phase9h-deployment-observability`.
- `GET /api/readiness` reports safe deployment checks for Node runtime, auth, CORS, task registry, rate limit, source grounding, and observability.
- `GET /api/health` includes safe observability metadata.
- `WEFELLA_OBSERVABILITY_EVENTS_PATH` can export safe JSONL task lifecycle events with user/session hashes, message hashes, and source-grounding status, not raw user ids, raw messages, or raw portal text.
- `npm run smoke:facade` checks a running facade for health, readiness, and unauthorized error-envelope behavior.
- `.env.example` and `docs/DEPLOYMENT_OBSERVABILITY.md` document deployment knobs and local/CI proof commands.
- Verified with compileall, facade unit tests, live Node facade tests, smoke gate, frontend checks, build, full local Node/LangGraph/OpenClaw gate, and `/mvp` browser proof.

### Phase 10A - User Document Upload And Local Extraction

Build the first user-facing document ingest slice for insurance documents.

Status:

- Implemented locally on 2026-06-01.
- FastAPI exposes authenticated `POST /api/uploads` and `GET /api/uploads/{upload_id}/extraction`.
- Uploads are owner-bound to the JWT subject and stored in the local git-ignored upload store.
- Text extraction works directly; PDF and image extraction use real runtimes when available and fail closed with blockers when unavailable.
- `/mvp` shows upload controls, document kind, extraction status, structured fields, and redacted preview.
- Verified with compileall, facade tests, live Node facade tests, smoke gate, UI contract tests, build, full local gate, browser proof, and live API upload/extraction proof.

### Phase 10B - Uploaded Document Grounded Chat

Connect uploaded document evidence into the chat/orchestration path.

Status:

- Implemented locally on 2026-06-01.
- FastAPI chat accepts `uploaded_document_ids` and resolves only uploads owned by the authenticated user.
- FastAPI sends safe extraction packets to Node/LangGraph without base64 document bodies or raw full document dumps.
- LangGraph records uploaded-document context, creates `uploaded_document_extractions` source pointers, audits `uploaded_document_extraction_observed`, publishes evidence status events, and composes a sourced answer.
- OpenClaw is not dispatched for uploaded-document grounding; this is local read-only evidence.
- `/mvp` exposes `Ask About Upload` and remains FastAPI-first.
- Verified with focused unit/UI/facade tests, live Node facade tests, smoke gate, build, full local gate, live API upload-plus-chat proof, and `/mvp` browser proof.

Next likely phase:

- Phase 10C should make source/citation details for uploaded documents easier to inspect in `/mvp` and prove Graphiti safe retain/recall from a document-grounded chat across sessions.

### Phase 10C - Uploaded Document Citations And Graphiti Recall

Make uploaded-document source grounding visible and prove safe cross-session product memory.

Status:

- Implemented locally on 2026-06-01.
- FastAPI facade version is `0.1.0-phase10c-citations-memory-recall`.
- Uploaded-document source pointers now carry `uploaded_document_extraction` kind, display label, extraction metadata, structured evidence fields, source spans, and citation metadata.
- `/mvp` renders citation/source detail cards and Graphiti retain/recall proof.
- Product-memory safe episodes sanitize uploaded-document fields/snippets and continue to support object-shaped portal evidence fields.
- Real Graphiti/FalkorDB proof passed for uploaded-document retain in one session and recall in a later session.
- Verified with focused tests, live Graphiti test, build, full local gate, live Node facade tests, smoke gate, live HTTP upload/chat proof, and `/mvp` browser proof.

Next likely phase:

- Phase 10D should target the next uncovered final-system gate. The largest remaining gaps are user session history/feedback/export, operator/research dashboard APIs, MockWorker/Hermes modes, RBAC, and the final PASS/FAIL/BLOCKED report.

### Phase 10D - Session History, Feedback, And Export

Add user-facing continuity to the current FastAPI plus Node/LangGraph/OpenClaw runtime.

Status:

- Implemented locally on 2026-06-01.
- FastAPI facade version is `0.1.0-phase10d-session-feedback-export`.
- Node exposes protected session history, Markdown export, and feedback persistence endpoints.
- FastAPI exposes protected facade routes for `GET /api/sessions/{session_id}`, `GET /api/sessions/{session_id}/export`, and `POST /api/feedback`.
- `/mvp` has controls for loading history, submitting useful/follow-up feedback, and exporting the latest answer/checklist.
- Feedback comments and exports mask direct identifiers before persistence/return.
- Operator trace includes `feedbackItems`.
- Verified with focused Node continuity, UI contract, facade, syntax, build, full local gate, live Node facade, smoke, live HTTP continuity proof, and `/mvp` browser proof.

Next likely phase:

- Choose the next uncovered final-system gate. Strong candidates are operator/research dashboard APIs, RBAC/roles, MockWorker/Hermes mode, and the final PASS/FAIL/BLOCKED report.

### Phase 10E - Operator Research API And Dashboard Foundation

Build the first operator/research control plane over the current runtime.

Status:

- Implemented locally on 2026-06-01.
- FastAPI facade version is `0.1.0-phase10e-operator-research-api`.
- The local schema now includes `research_runs` and `research_run_events`.
- `knowledge_sources` now stores proposal/review/run metadata.
- Node exposes research KPIs, source list/propose/approve/reject/update, manual run queueing, run detail/events, cancel, and retry.
- FastAPI exposes JWT-protected proxies for those routes and binds `actorUserId` to the authenticated subject.
- `/` exposes a Phase 10E Operator Research Console.
- Browser proof loaded source cards and started a real queued research run with event detail.
- Verified with syntax checks, facade tests, build, full local gate, live facade gate, smoke gate, live HTTP research lifecycle proof, and browser proof.

Current limits:

- Research execution is not wired yet. Runs are queued/audited control records only.
- FastAPI research route RBAC is handled in Phase 10F; direct Node research routes remain local operator/runtime routes only.
- Direct Node research routes are local runtime/operator routes, not the production auth boundary.

Next likely phase:

- Phase 10F became the RBAC/roles gate below. After that, Phase 10G should choose real research-run execution, MockWorker/Hermes mode, or the final PASS/FAIL/BLOCKED report.

### Phase 10F - Operator/Admin RBAC For Research Facade Routes

Add role separation for the FastAPI public research/operator boundary.

Status:

- Implemented locally on 2026-06-01.
- FastAPI facade version is `0.1.0-phase10f-rbac-operator-routes`.
- JWT principals now normalize roles from `roles`, `role`, `groups`, `permissions`, `scope`, and `scp`.
- Local-session tokens remain user-scoped by default.
- All FastAPI `/api/research/*` routes require `operator` or `admin`.
- Actor binding remains enforced after the role check.
- `/api/health` reports RBAC support and supported role claims without exposing secrets.
- Verified with facade tests, build, full local gate, live facade gate, smoke gate, and live HTTP RBAC proof.

Current limits:

- Research execution is wired in Phase 10G for deterministic fetch and explicit MockWorker fallback, but not yet for trusted retrieval closure, OpenClaw research execution, or Hermes execution.
- Production identity-provider role mapping still needs deployment-specific issuer/audience/claim configuration.
- Direct Node research routes remain local runtime/operator routes, not the production auth boundary.

Next likely phase:

- Phase 10G became the approved research execution gate below. After that, Phase 10H should choose trusted evidence search/citation closure, operator write-action proposals, or scheduled automation.

### Phase 10G - Approved Research Run Execution And Worker Status

Execute approved research runs through a bounded deterministic adapter and expose worker-mode status.

Status:

- Implemented locally on 2026-06-01.
- FastAPI facade version is `0.1.0-phase10g-research-execution`.
- The local schema now includes `research_artifacts`.
- Node exposes `GET /api/research/worker-status` and `POST /api/research/runs/{run_id}/execute`.
- FastAPI proxies those endpoints behind operator/admin RBAC.
- Deterministic fetch execution is implemented for approved HTTP(S) sources.
- Execution stores raw artifact files under a git-ignored artifact directory and stores artifact metadata, hashes, redacted safe preview, and citation status in SQLite.
- Execution writes start/completion/failure events and audit rows without raw source text.
- MockWorker mode is implemented as a visible untrusted fallback mode.
- OpenClaw and Hermes research worker modes are visible but feature-gated.
- `/` exposes Worker Status, Execute Fetch, MockWorker, and artifact proof controls.
- Verified with syntax checks, focused research/UI/facade tests, build, full local gate, live facade gate, smoke gate, live HTTP execution proof, and browser proof.

Current limits:

- Phase 10H now implements artifact citation review and trusted search, but user-facing answers are not yet wired to the research evidence store.
- MockWorker artifacts remain explicitly untrusted and not suitable for user healthcare answers.
- No embeddings, nightly automation, OpenClaw research dispatch, or Hermes dispatch is implemented yet.

Next likely phase:

- Phase 10H became the trusted artifact review/search gate below. After that, Phase 10I should choose user-facing grounded answer integration, operator natural-language proposal/write gates, or nightly/scheduled research automation.

### Phase 10H - Research Citation Review And Trusted Evidence Search

Add citation closure over research artifacts before allowing research output into trusted retrieval.

Status:

- Implemented locally on 2026-06-01.
- FastAPI facade version is `0.1.0-phase10h-citation-review`.
- Research operations version is `2026-06-01.phase10h-citation-review.v1`.
- Node exposes:
  - `GET /api/research/artifacts`,
  - `POST /api/research/artifacts/{artifact_id}/review`,
  - `GET /api/research/search`,
  - `GET /api/research/evidence`.
- FastAPI proxies those endpoints behind operator/admin RBAC and actor binding.
- Artifact citation statuses now include pending review, trusted retrieval approved, quarantined, and mock-worker untrusted.
- Default evidence search returns only `trusted_retrieval_approved` artifacts.
- Pending-review matches are reported as low-confidence/unavailable to trusted retrieval.
- MockWorker artifacts cannot be approved for trusted retrieval.
- `/` exposes Review Artifacts, Search Evidence, Approve Citation, Quarantine, and trusted evidence result cards.
- Verified with syntax checks, focused research/UI/facade tests, build, full local gate, live facade gate, smoke gate, live HTTP review/search proof, and browser proof.

Current limits:

- Search is deterministic over reviewed safe previews, titles, and source URLs; no embeddings or semantic vector retrieval yet.
- User-facing healthcare answers do not yet consume the reviewed research evidence store.
- Claims-specific research endpoint, graph endpoint, scheduled automation, operator natural-language write proposals, OpenClaw research dispatch, and Hermes dispatch remain future work.

Next likely phase:

- Phase 10I should choose one narrow final-system gap:
  - connect reviewed research evidence to grounded user answers,
  - add operator natural-language proposal/write gates,
  - or add scheduled research automation over approved sources.

### Phase 10I - Trusted Research Evidence In User Answers

Connect reviewed research evidence to the user-facing chat answer path.

Status:

- Implemented locally on 2026-06-01.
- FastAPI facade version is `0.1.0-phase10i-research-grounded-answers`.
- LangGraph runner version is `2026-06-01.langgraph-runner.phase10i-trusted-research-grounding.v1`.
- LangGraph now searches reviewed research evidence for domain workflow questions when no approved portal/document observation is available in the current run.
- Only `trusted_retrieval_approved` research artifacts become `trusted_research_artifact` source pointers.
- Pending-review artifacts are counted as unavailable evidence and are not quoted.
- Missing trusted evidence creates a refusal/escalation answer instead of an unsourced healthcare answer.
- User-facing answers disclose operator-reviewed research grounding and list `research_artifacts/{artifactId}` source pointers.
- `/mvp` displays Phase 10I, `Trusted Research Answers`, citation cards, FastAPI task/trace proof, and evidence status.
- `/` displays Phase 10I operator research controls for source review/search proof.
- Verified with syntax checks, focused LangGraph/runtime/document/UI/facade tests, build, full local gate, live facade gate, smoke gate, live HTTP proof, and browser proof.

Current limits:

- Retrieval is deterministic over reviewed safe previews, titles, and URLs; no embeddings or semantic reindexing yet.
- Claims-specific research endpoint, graph endpoint, scheduled automation, operator natural-language write proposals, OpenClaw research dispatch, and Hermes dispatch remain future work.
- Broad queries can rank multiple older trusted artifacts; exact/unique evidence queries return the intended artifact first.

Next likely phase:

- Phase 10J should choose one remaining final-system gate:
  - operator natural-language proposal/write gates,
  - scheduled research automation over approved sources,
  - or semantic embeddings/reindexing over reviewed artifacts.

### Phase 10J - Operator Natural-Language Proposal Gate

Add a flexible operator assistant while keeping write actions approval-bound.

Status:

- Implemented locally on 2026-06-01.
- FastAPI facade version is `0.1.0-phase10j-operator-proposal-gate`.
- Operator assistant version is `2026-06-01.phase10j-operator-nl-proposal-gate.v1`.
- The local schema now includes `operator_tool_proposals`.
- Node exposes:
  - `GET /api/operator/tools`,
  - `GET /api/operator/proposals`,
  - `POST /api/operator/assistant`,
  - `POST /api/operator/proposals/{proposal_id}/approve`,
  - `POST /api/operator/proposals/{proposal_id}/reject`.
- FastAPI proxies those endpoints behind operator/admin RBAC and actor binding.
- Read-only operator assistant requests execute only through the registered research read tools.
- Write/action requests create proposal-only records with expected effect, risk level, message/args hashes, `pending_approval`, and `actionsTaken: []`.
- Approved proposals execute exactly once from stored args.
- Rejected proposals perform no target mutation.
- `/` displays Phase 10J assistant tools, free-text request, read-result proof, proposal cards, and approve/reject controls.
- Verified with syntax checks, focused operator/UI/database/facade tests, build, full local gate, and browser proof.

Current limits:

- The assistant parser is deterministic and curated; it is not yet an LLM planner.
- The proposal gate wraps current research control-plane actions. OpenClaw/Hermes research dispatch remains feature-gated.
- No scheduled automation, embeddings/reindexing, or production provider-auth deployment proof is included in this phase.

Next likely phase:

- Phase 10K should choose one remaining final-system gate:
  - scheduled research automation over approved sources,
  - semantic embeddings/reindexing over reviewed artifacts,
  - or OpenClaw/Hermes research-worker dispatch behind proposal/audit controls.

### Phase 10K - Scheduled Research Automation

Add approved research schedules and explicit due ticks.

Status:

- Implemented locally on 2026-06-01.
- FastAPI facade version is `0.1.0-phase10k-scheduled-research`.
- Research operations version is `2026-06-01.phase10k-scheduled-research.v1`.
- The local schema now includes `research_schedules`.
- Node exposes:
  - `GET /api/research/schedules`,
  - `POST /api/research/schedules/tick`.
- FastAPI proxies those endpoints behind operator/admin RBAC and actor binding.
- Operator assistant exposes:
  - read tool `research.listSchedules`,
  - gated write tools `research.createSchedule`, `research.pauseSchedule`, `research.resumeSchedule`, and `research.runDueSchedules`.
- Due ticks queue `scheduled_research_run` records by default and do not silently execute worker actions.
- `/` displays schedule counts, schedule cards, and scheduled tick proof.
- Verified with syntax checks, focused scheduler/operator/UI/database/facade tests, build, full local gate, FastAPI facade gate, and browser proof.

Current limits:

- Phase 10T adds an env-gated local always-on daemon proof around the explicit tick contract. Production deployment still needs the selected host scheduler/process manager to set `BRAINSTY_RESEARCH_SCHEDULER_ENABLED=1`.
- OpenClaw/Hermes scheduled dispatch remains feature-gated.
- Embeddings/semantic reindexing remains future work.

Next likely phase:

- Phase 10L became the audit log API/dashboard below because `GET /api/audit` remained an explicit final-system API gap.

### Phase 10L - Audit Log API And Operator Dashboard

Expose the hash-chained audit trail through a safe operator API and dashboard.

Status:

- Implemented locally on 2026-06-01.
- FastAPI facade version is `0.1.0-phase10l-audit-log-api`.
- Audit log API version is `2026-06-01.phase10l-audit-log-api.v1`.
- Node exposes `GET /api/audit`.
- FastAPI proxies `GET /api/audit` behind operator/admin RBAC and actor binding.
- Audit log responses include event ids, session ids, event types, action kinds, created timestamps, event hashes, previous hashes, details hashes, chain versions, redacted/truncated details previews, event-type counts, pagination, and visible-chain verification.
- Raw audit details are not returned.
- `/` displays Phase 10L Audit Log controls, chain status, event type counts, and event cards.
- Verified with syntax checks, audit integrity tests, UI contract tests, FastAPI facade tests, `npm run test:facade`, build, full local gate, and browser proof.

Current limits:

- The audit API is a safe operator listing surface, not a raw audit export.
- Full historical chain verification remains available through audit utilities; the dashboard verifies visible/sampled chains for the current page.
- No embeddings/reindexing or OpenClaw/Hermes research dispatch is added in this phase.

Next likely phase:

- Phase 10M should choose between semantic embeddings/reindexing over reviewed artifacts and OpenClaw/Hermes research-worker dispatch behind proposal/schedule/audit controls.

### Phase 10M - Embedding Route And Trusted Evidence Reindex

Persist embedding route selection and safely reindex reviewed research evidence.

Status:

- Implemented locally on 2026-06-01.
- FastAPI facade version is `0.1.0-phase10m-embedding-route-reindex`.
- Research operations version is `2026-06-01.phase10m-embedding-route-reindex.v1`.
- Operator assistant version is `2026-06-01.phase10m-embedding-route-proposals.v1`.
- The local schema now includes:
  - `research_embedding_routes`,
  - `research_embedding_jobs`,
  - `research_embedding_index`.
- Node exposes:
  - `GET /api/research/embeddings/status`,
  - `POST /api/research/embeddings/route`,
  - `POST /api/research/embeddings/reindex`.
- FastAPI proxies those endpoints behind operator/admin RBAC and actor binding.
- The default route is `local_tfidf` with `local-tfidf-v1` vectors so local tests do not need external credentials.
- Optional `openai` route selection is explicit and fails safely if `OPENAI_API_KEY` is absent.
- Reindexing indexes only `trusted_retrieval_approved` artifacts.
- Pending, quarantined, rejected, and MockWorker artifacts stay out of trusted retrieval.
- Dimension mismatch blocks reindex without silently deleting active index rows.
- Successful reindex supersedes old rows only after new vectors are written.
- Trusted evidence search reports embedding route status, lexical score, embedding score, and combined score.
- `/` displays Phase 10M embedding status, route selection, reindex controls, and embedding proof.
- Verified with syntax checks, focused research/operator/UI/facade tests, `npm run test:facade`, `npm run build`, full local gate, and browser proof.

Current limits:

- The local default is deterministic lexical-vector retrieval, not a deep semantic embedding model.
- Live OpenAI embeddings require credentials and should be tested only after selecting `openai` intentionally.
- Reindexing is an explicit operator/API action, not a background daemon.
- OpenClaw/Hermes research-worker dispatch remains feature-gated.

Next likely phase:

- Phase 10N should implement OpenClaw/Hermes research-worker dispatch behind the existing approval, schedule, audit, artifact review, and embedding/retrieval contracts.

### Phase 10N - Adaptive Research Worker Dispatch

Attach OpenClaw and Hermes research worker modes to approved research runs without bypassing governance.

Status:

- Implemented locally on 2026-06-01.
- FastAPI facade version is `0.1.0-phase10n-adaptive-worker-dispatch`.
- Research operations version is `2026-06-01.phase10n-adaptive-worker-dispatch.v1`.
- Operator assistant version is `2026-06-01.phase10n-adaptive-worker-proposals.v1`.
- `openclaw` and `hermes` worker modes now exist in `executeResearchRun`.
- Both adaptive modes are disabled by default and require:
  - approved source,
  - queued/running research run,
  - `approvedWorkerDispatch=true`,
  - feature flag `BRAINSTY_RESEARCH_OPENCLAW_ENABLED=1` or `BRAINSTY_RESEARCH_HERMES_ENABLED=1`.
- Both adapters receive typed envelope `brainstyworkers.research_worker_task.v1`.
- OpenClaw dispatch uses the official project profile through `openclaw --profile brainstyworkers agent --local ... --json`.
- Hermes dispatch uses `hermes --oneshot`.
- Worker output must be structured JSON; invalid output fails closed with run failure/audit proof.
- Successful adaptive worker output creates pending-review artifacts:
  - `openclaw_research_worker_result`,
  - `hermes_research_worker_result`.
- Adaptive worker artifacts are unavailable to trusted retrieval and embedding indexes until artifact review approves them.
- `/api/research/worker-status` reports adapter, typed envelope, approval gate, feature flag, and review-required metadata.
- `/` exposes OpenClaw and Hermes buttons on queued research runs; the frontend sends only API requests and never calls workers directly.
- Verified with syntax checks, focused research/operator/UI/facade tests, `npm run test:facade`, `npm run build`, full local gate, API proof, and browser proof.

Current limits:

- Focused tests use injected command runners so local proof does not require live OpenClaw/Hermes credentials.
- Live adaptive research-worker proof still requires enabling the worker flag and configuring the underlying worker model/tool environment.
- The worker output lifecycle is pending review by design; this phase does not auto-trust adaptive worker evidence.

Next likely phase:

- After full 10N gate proof, choose between a research graph endpoint, quality judge/claim-level citation closure, production queue/backoff for worker dispatch, or the final PASS/FAIL/BLOCKED report over this file.

### Phase 10O - Research Evidence Graph API

Close D17/D18 with a safe metadata graph over the operator research system.

Status:

- Implemented locally on 2026-06-01.
- FastAPI facade version is `0.1.0-phase10o-research-graph`.
- Research operations version is `2026-06-01.phase10o-research-graph.v1`.
- Operator assistant version is `2026-06-01.phase10o-research-graph-proposals.v1`.
- The local schema now includes `research_graph_builds`.
- Node exposes:
  - `GET /api/research/graph`,
  - `POST /api/research/graph/build`.
- FastAPI proxies both graph endpoints behind operator/admin RBAC and actor binding.
- The graph is built from existing research metadata:
  - sources,
  - workflows,
  - runs,
  - artifacts,
  - embedding routes/jobs/indexes,
  - schedules.
- The graph returns node/edge lists plus summary counts and latest build metadata.
- The graph does not return raw artifact text, artifact file contents, raw portal dumps, or raw safe-text preview fields.
- Source URL details inside graph nodes are limited to host/hash metadata.
- `POST /api/research/graph/build` persists node count, edge count, graph hash, graph JSON, safety JSON, actor id, status, and audit event id.
- Graph builds are hash-chain audit visible through `research_graph_build_completed`.
- Operator assistant exposes:
  - read-only `research.getGraph`,
  - proposal-gated `research.buildGraph`.
- `/` exposes Phase 10O graph controls, graph summary, node types, edge samples, latest build, and metadata-only safety proof.
- Verified with syntax checks, focused research/operator/UI/facade tests, facade gate, `npm run build`, full local gate, API graph proof, and browser proof.

Current limits:

- This is a local graph contract, not production Neo4j/Graphiti storage.
- It is not yet a quality judge and does not perform claim-level answer citation closure.
- Graph builds are synchronous in the local MVP; production can later run the same contract through a queue/worker.

Next likely phase:

- Phase 10P should add quality judge/claim-level citation closure unless the next full gate reveals an operational queue/backoff blocker.

### Phase 10P - Claim-Level Citation Closure Judge

Close C20/E8/E10 by making answer claims pass through a labels-only citation closure check before they are treated as trusted.

Status:

- Implemented locally on 2026-06-01.
- FastAPI facade version is `0.1.0-phase10p-claim-citation-closure`.
- Research operations version is `2026-06-01.phase10p-claim-citation-closure.v1`.
- Operator assistant version is `2026-06-01.phase10p-claim-citation-closure-proposals.v1`.
- The local schema now includes `research_claim_evaluations`.
- Node exposes:
  - `GET /api/research/citation-closure`,
  - `POST /api/research/citation-closure/evaluate`.
- FastAPI proxies both citation-closure endpoints behind operator/admin RBAC and actor binding.
- The evaluator:
  - extracts factual/domain claims from a redacted safe answer preview,
  - searches only `trusted_retrieval_approved` research artifacts,
  - labels each claim as `supported`, `low_confidence`, or `unsupported`,
  - returns metadata-only citation pointers for matching reviewed artifacts,
  - fails citation closure when any claim lacks sufficient support,
  - writes hash-chained audit proof through `research_claim_citation_closure_evaluated`.
- The evaluator does not:
  - create evidence,
  - promote evidence,
  - use pending-review artifacts as trusted support,
  - return raw artifact bodies,
  - return raw private URLs,
  - invent missing facts.
- Operator assistant exposes:
  - read-only `research.listCitationClosure`,
  - proposal-gated `research.evaluateCitationClosure`.
- `/` exposes Phase 10P citation-closure controls, latest evaluation status, claim labels, counts, safety flags, actions taken, and citation pointer ids.
- Verified with syntax checks, focused research/operator/UI tests, facade gate, build, full local gate, API proof, and `/` browser proof.
- Browser proof saved at `artifacts/phase10p-citation-closure-browser-proof.png`.

Current limits:

- This is a deterministic local judge, not a production LLM/embedding entailment service.
- It marks low-confidence and unsupported claims but does not yet rewrite answers automatically.
- It relies on the existing trusted artifact review boundary; if no trusted evidence exists, claims fail citation closure.

Next likely phase:

- After Phase 10P closeout, produce a final PASS/FAIL/BLOCKED matrix over this goal file and then choose production queue/backoff or broader real-source/operator UX hardening.

### Phase 10Q - Final-System Verification Matrix

Turn this goal file into a maintained completion-audit report.

Status:

- Implemented locally on 2026-06-01.
- Added `docs/FINAL_SYSTEM_VERIFICATION_REPORT.md`.
- Added `src/tests/final-system-verification-report.test.mjs`.
- Updated `npm run test:local` to include the report coverage test.
- Updated `npm run build` to require the final report, the goal file, and visible failure/blocker categories.
- The report maps all explicit A-G requirements and H1-H24 minimum gate items to allowed statuses.
- Current report counts:
  - 112 `PASSING`,
  - 0 `IMPLEMENTED DURING THIS RUN` requirement rows,
  - 2 `BLOCKED BY EXTERNAL DEPENDENCY`,
  - 18 `FAILING / NEEDS FIX`.
- Focused report coverage test passed with 2/2 tests.
- `npm run build` passed with the Phase 10Q report guard.
- `npm run test:facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run test:local` passed with 153 tests total, 151 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.

Current limits after Phase 10Q:

- The active goal is not complete.
- The report shows the next highest-priority failing gap is urgent/emergency safe escalation plus durable human handoff records.
- Live OpenClaw and Hermes worker proof remain externally gated.

Next likely phase:

- Phase 10R should implement urgent/emergency safe escalation and durable human handoff records, then harden user UI modes and typed AI2UI blocks.

### Phase 10R - Urgent/Emergency Safe Handoff

Phase 10R closes the top user-facing safety gap from the final verification matrix:

- Deterministic policy detects emergency/safety-critical language such as 911, chest pain, breathing difficulty, stroke-like signals, self-harm, overdose, severe bleeding, or life-threatening pain.
- Structured intent routes these messages to `human_approval_escalation` with `urgent_emergency_escalation` rather than normal benefits/claims/prior-auth workflows.
- LangGraph creates a durable `human_handoff_items` row and an `urgent_human_handoff` `agent_tasks` row, records hash-chained `human_handoff_created` audit proof, and returns immediate emergency-safe guidance.
- Urgent runs bypass OpenClaw proposal/dispatch, browser/evidence observation, payer contact, external messages, credential entry, form submission, and GPT model calls.
- `/api/handoffs`, session continuity, `traceForSession`, `/mvp`, and `/` now expose handoff status, task id, summary, and queue visibility.
- Urgent/safety prompts are not retained verbatim as reusable prompt-recall memory; local memory stores a blocked/escalated policy event pointer instead.

Phase 10R verification:

- `node --test src/tests/policy.test.mjs src/tests/structured-intent-classifier.test.mjs src/tests/langgraph-runner.test.mjs src/tests/chat-ui-contract.test.mjs` passed with 36/36 tests.
- `node --test src/tests/database.test.mjs src/tests/session-continuity.test.mjs src/tests/final-system-verification-report.test.mjs` passed with 5/5 tests.
- `npm run test:facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run build` passed with the urgent handoff schema/build guard.
- `npm run test:local` passed with 157 tests total, 155 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- `docs/FINAL_SYSTEM_VERIFICATION_REPORT.md` now records:
  - 115 `PASSING`,
  - 0 `IMPLEMENTED DURING THIS RUN` requirement rows,
  - 2 `BLOCKED BY EXTERNAL DEPENDENCY`,
  - 15 `FAILING / NEEDS FIX`.

Current limits after Phase 10R:

- The active goal is still not complete.
- Next highest-priority local gaps are Chat/Split/Guided/Bento state-preserving UI modes, typed AI2UI block/fallback rendering, production scheduled-worker execution, research PDF ingestion, and analytics/budget kill-switch hardening.
- Live OpenClaw and Hermes worker proof remain externally gated.

Next likely phase:

- Phase 10S should implement the typed AI2UI block contract and state-preserving Chat/Split/Guided/Bento MVP modes before broader domain journey expansion.

### Phase 10S - Typed AI2UI Blocks And State-Preserving MVP Modes

Phase 10S closes A6 and A7 from the final verification matrix:

- Added `brainstyworkers.ai2ui.blocks.v1` as the backend typed block contract for user-facing AI response rendering.
- LangGraph now attaches typed blocks after product-memory retain so the returned payload reflects real workflow, approval, worker, source-pointer, memory, handoff, safety, and next-step state.
- `POST /api/chat` returns `ai2uiBlocks` at the top level and inside `graphRun.state.ai2ui_blocks`.
- `/mvp` now supports Chat, Split, Guided, and Bento presentation modes.
- Mode switching stores the selected mode in localStorage and re-renders the current response only; it does not reset the app, create a new session, rerun LangGraph, consume approvals, or modify worker state.
- The client renderer includes a safe unknown-block fallback card, so future backend block types degrade visibly instead of silently failing.
- Split mode preserves the earlier detailed citation and product-memory proof panels for continuity while typed cards become the shared rendering contract.

Phase 10S verification:

- `node --check src/concierge/ai2uiBlocks.mjs` passed.
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `node --check src/app/mvp.js` passed.
- `node --check src/server/build-check.mjs` passed.
- `node --test src/tests/ai2ui-blocks.test.mjs src/tests/chat-ui-contract.test.mjs src/tests/langgraph-runner.test.mjs` passed with 24/24 tests.
- `npm run build` passed.
- `npm run test:facade` passed with 32 tests and 2 expected live-gated skips.
- `npm run test:local` passed with 159 total, 157 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- `/mvp` browser proof passed with Chat, Guided, Bento, and Split modes preserving the same session and rendering typed blocks with 0 console errors. Screenshot: `artifacts/phase10s-ai2ui-modes-browser-proof.png`.
- `docs/FINAL_SYSTEM_VERIFICATION_REPORT.md` now records:
  - 117 `PASSING`,
  - 0 `IMPLEMENTED DURING THIS RUN` requirement rows,
  - 2 `BLOCKED BY EXTERNAL DEPENDENCY`,
  - 13 `FAILING / NEEDS FIX`.

Current limits after Phase 10S:

- The active goal is still not complete.
- Remaining high-priority local gaps are production scheduled-worker/cron execution, research PDF ingestion, analytics, budget/kill-switch enforcement, review-queue expansion, and broader domain journey polish.
- Live OpenClaw and Hermes worker proof remain externally gated.

Next likely phase:

- Phase 10T should close the production scheduler/cron worker gap for approved schedules (`E1`) or, if the user prefers user-facing breadth, start the research PDF upload/extraction path (`C17`, `D13`, `D14`).

### Phase 10T - Research Scheduler Daemon Proof

Phase 10T closes E1 for the local MVP scope:

- Added `src/concierge/researchScheduler.mjs` as the daemon wrapper around the existing approved-schedule due-tick contract.
- Added persisted `research_scheduler_daemon_state` with daemon key, enabled flag, interval, tick limit, last tick, last success/failure, processed/blocked counts, last actions, tick count, and overlap skipped count.
- The Node server creates the daemon at startup and auto-starts only when `BRAINSTY_RESEARCH_SCHEDULER_ENABLED=1`.
- Daemon ticks call the existing `runDueResearchSchedules` contract, so only active approved schedules with approved/active sources are processed.
- Default daemon behavior queues `scheduled_research_run` records; execution remains explicit and adaptive OpenClaw/Hermes dispatch still requires feature flags plus `approvedWorkerDispatch=true`.
- Daemon ticks emit runtime events:
  - `research.scheduler.daemon.started`,
  - `research.scheduler.daemon.tick_started`,
  - `research.scheduler.daemon.tick_completed`,
  - `research.scheduler.daemon.tick_skipped_overlap`,
  - `research.scheduler.daemon.tick_failed`,
  - `research.scheduler.daemon.stopped`.
- Daemon ticks write hash-chain audit events including `research_scheduler_daemon_tick_completed`.
- Node exposes `GET /api/research/scheduler/status` and `POST /api/research/scheduler/tick`.
- FastAPI proxies both daemon endpoints behind operator/admin RBAC and actor binding.
- `/` shows daemon process status, cadence, due schedules, last tick, tick count, overlap count, actions, and safety.

Phase 10T verification:

- `node --check src/concierge/researchScheduler.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/research-scheduler.test.mjs src/tests/research-ops.test.mjs src/tests/chat-ui-contract.test.mjs` passed with 24/24 tests.
- `npm run build` passed.
- `npm run test:facade` passed with 32 tests and 2 expected live-gated skips.
- `npm run test:local` passed with 163 total, 161 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Browser/API proof on `/` passed with daemon status, daemon tick, one queued scheduled run, approved-schedule-only safety, 0 console errors, and screenshot `artifacts/phase10t-research-scheduler-daemon-browser-proof.png`.
- Graceful shutdown proof passed with the scheduler daemon enabled: `SIGINT` stopped services cleanly, exited with code 0, and left no listener on port 4173.

Current limits after Phase 10T:

- The active goal is still not complete.
- Remaining high-priority local gaps are research PDF upload/extraction, research analytics and budget/kill-switch controls, expanded review queues, broader journey/entity extraction, and live external OpenClaw/Hermes proof.
- The local daemon uses an in-process overlap guard and SQLite proof table. Production should run it under the selected host scheduler/process manager and move concurrency to Postgres or a durable queue before high-volume use.

Next likely phase:

- Phase 10U should implement research knowledge-base PDF upload/extraction endpoints and dashboard path (`C17`, `D13`, `D14`) unless the user prioritizes analytics/budget kill-switch controls first.

## Completion Evidence Required

The final system is complete only when current evidence proves:

- `npm run build` passes.
- `npm run test:local` passes.
- `npm run test:facade` passes.
- FastAPI provider-auth tests pass.
- `/mvp` browser proof passes through FastAPI-first mode.
- `/` operator dashboard agrees with the same session.
- A live authenticated OpenClaw proof either creates verified source pointers or fails closed with a precise external blocker.
- Product memory retain/recall is proven with safe source-pointer summaries.
- No hidden worker action, credential entry, payer contact, form submission, raw portal dump, external message, or medical advice occurs.
