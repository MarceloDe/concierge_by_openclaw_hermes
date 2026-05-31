# Acceptance Criteria

Status: reset for MVP hardening and one-runtime proof.

Last updated: 2026-05-27

## MVP Hardening Criteria

The next MVP is acceptable only when one narrow, non-mocked journey works end to end:

**Read-only authenticated insurance benefits evidence capture plus one sourced answer plus safe product-memory retain.**

The MVP is not acceptable if it only validates contracts, creates proposal JSON, or relies on hidden seeded local database state.

## Phase 1: One Product Runtime

Phase 1 is acceptable when:

- `/api/chat`, `/api/langgraph/run`, and the orchestrator chat path either use the same LangGraph product runtime or deprecated endpoints return an explicit deprecation response.
- Real browser/evidence observation is implemented as a LangGraph node, not only in `engine.mjs`.
- Final answer composition, source-pointer storage, audit write, and memory-retain call happen in the same graph path.
- A route-level regression test sends the same benefits request through all public chat endpoints and asserts identical graph trace IDs, workflow, approval state, and source-pointer behavior.
- No endpoint can create eligibility/benefits evidence outside the healthcare journey graph.

## Phase 2: Structured Routing

Phase 2 is acceptable when:

- Safety refusals still run before classification.
- A structured classifier returns strict JSON with `intent`, `workflow`, `confidence`, `requiredEvidence`, `missingEvidence`, `refusalOrEscalation`, and `rationale`.
- Workflow routing uses the structured classifier output, not keyword presence alone.
- Tests fail if classifier output is ignored.
- Paraphrase tests cover prior authorization, claim status, denial appeal, eligibility/benefits, and credential-entry refusal without relying on literal route keywords.

## Phase 3: Approval Resume

Phase 3 is acceptable when:

- `POST /api/orchestrator/approve` or an equivalent endpoint binds approval to task ID, session ID, user ID, workflow, scope, expiration, and allowed action.
- Without approval, no worker or browser execution happens.
- With valid approval, exactly the approved read-only observation happens.
- Denied or expired approvals preserve `actionsTaken=[]`.
- Approval and execution are visible in audit.

## Phase 4: Real Evidence Capture

Phase 4 is acceptable when:

- `npm run test:live:portal` exists and requires `BRAINSTY_PORTAL_LIVE=1`.
- Live portal proof requires user-authenticated browser state or an approved dedicated project OpenClaw profile.
- The system verifies authenticated member portal context and does not mistake public marketing pages for healthcare evidence.
- Source pointers include URL, title, page kind, timestamp, DOM hash, extraction hash, and evidence fields.
- Failed authentication/page-kind verification stores a blocked run/audit event, not an eligibility snapshot.
- Final answers cite only stored source pointers.

## Phase 5: Product Memory

Phase 5 is acceptable when:

- Product memory uses Hindsight, Zen, LangMem, Mem0, Zep/Graphiti, or an explicit equivalent adapter.
- Cortex is not called as product memory.
- Retain stores safe summaries and source pointers, not raw PHI.
- Recall works across two sessions.
- Deletion or suppression semantics exist for the MVP.

## Phase 6: PHI, Audit, And State Hardening

Phase 6 is acceptable when:

- The exact serialized LLM request body is captured before send in tests.
- Tests assert no direct identifiers or raw portal PHI appear in model-bound payloads.
- Memory-bound and tool-output payloads are screened, not only user input.
- Enrollment is idempotent using natural keys.
- State updates are transactionally safe under concurrent same-session writes.
- Audit verification detects tampering.

## Global Criteria

- The implementation follows `brainstyworkers_ai_concierge_prompt.md` as the primary source of truth.
- Work proceeds in small vertical slices.
- Each slice includes implementation, verification, and a `docs/PROGRESS.md` update.
- No payer API communication, credential entry by Codex, medical advice, external message sending, or irreversible portal action is implemented without explicit user approval and a documented approval gate.

## Slice 1 Criteria

The first slice is acceptable when all of the following are true:

- The user has approved the revised slice 1 plan and provided the portal URL/payer details.
- The user can interact with the system locally through the chosen first channel.
- The system enrolls Marcelo Felix locally with approved profile fields.
- The system creates local user, consent, session, portal, browser-run, extraction, and audit records.
- The system accepts a local web-chat request for enrollment and benefits navigation.
- The system attaches to a user-authenticated Chrome session without Codex entering credentials.
- The system performs approved read-only navigation of the insurance portal.
- The system extracts approved eligibility/benefits data into local records.
- The response explains what it found, what it did not do, and which actions require approval.
- The system produces a trace or audit-style record showing input, consent gates, browser actions, extracted data categories, workflow, and final response.
- The implementation includes automated tests for enrollment/database behavior, successful eligibility routing, and guarded action paths.
- Build, lint, tests, and browser/API verification are run where applicable.
- `docs/PROGRESS.md` records commands, results, changed files, proof, and remaining risks.

## Memory Criteria

Local memory harness behavior is acceptable when:

- Memory is user-scoped and tied to concrete database pointers.
- Context injection happens before a task/session run.
- Retention happens after a task/session run.
- Stored memory records label scope, type, sensitivity, retention policy, source table, source id, and adapter status.
- Open tasks, scheduled jobs, and OpenClaw heartbeat state are queryable through local API endpoints.
- External messaging and external adapter execution remain approval-gated and unsent unless separately approved.

Real Hindsight/vector memory behavior is not acceptable until the user confirms:

- Which facts may move from local retained records into Hindsight.
- Which facts must never be embedded or stored in a vector store.
- Which Hindsight runtime/package/API and backing store will be used.
- How the demo should prove memory recall across sessions without leaking PHI.

Slice 1 may store local application records for enrollment, sessions, portal extraction, trace proof, memory items, context packets, tasks, scheduled jobs, and heartbeat proof. Real Hindsight long-term memory is still deferred.

## Runtime Compatibility Criteria

Local runtime adapter compatibility is acceptable when:

- A single context packet can be converted into LangChain thread configuration and message input.
- The same context packet can be converted into a LangGraph-style agent state with user, session, thread, prompt, memory, database pointer, safety, task, and schedule fields.
- The same context packet can be converted into OpenClaw channel-task and heartbeat envelopes.
- The same context packet can produce future Hindsight retain candidates without calling a real Hindsight runtime.
- Compatibility validation reports missing critical fields, unsafe trust boundaries, or missing approval gates.
- Automated tests and an API response prove the mappings against the real local SQLite-backed harness.

Live runtime compatibility is not acceptable until the selected real packages/APIs are installed or configured and separately verified for:

- LangGraph state/checkpointer execution. Local execution is now acceptable when `@langchain/langgraph` graph runs through input policy, recall/context, router, workflow executor, response policy, and model-gate nodes with audit proof.
- OpenClaw worker/channel prompt and task execution.
- Hindsight or equivalent temporal/vector memory write and recall behavior.
- Vercel AI Gateway routing and telemetry behavior.

OpenClaw skill artifact readiness is acceptable before live OpenClaw worker execution when:

- The repo contains a versioned `insurance_portal_browser` skill artifact with manifest and skill instructions.
- The artifact declares allowed workflows, allowed tools, fallback order, required inputs, required outputs, approval gates, and source-pointer policy.
- The artifact explicitly gates credential entry, SSNs, passkeys, 2FA, external sends, payer contact, form submission, record changes, and medical advice.
- The local app exposes the artifact through an API endpoint and validates it in `npm run build`.
- Automated tests prove the artifact is present, valid, and execution-gated.
- The UI can load the artifact validation state without executing a real OpenClaw worker.
- Real OpenClaw worker execution remains deferred until the install path, runtime, and per-action approval model are explicitly approved.

OpenClaw skill envelope proposal-gate behavior is acceptable before live OpenClaw worker execution when:

- The LangGraph/OpenClaw envelope includes the active portal account URL as an explicit required input.
- The local validator consumes the prepared envelope and the repo-scoped `insurance_portal_browser` artifact.
- Validation checks required inputs, allowed workflows, approval gates, blocked actions, fallback path, stop conditions, and output contract.
- A valid read-only proposal records an `openclaw_skill_invocation_proposal` task with `pending_approval` status.
- Invalid, unsafe, or incomplete proposals are blocked or marked pending integration without worker execution.
- The API exposes envelope, validation, proposal task, audit event, fallback path, approvals required, and `actionsTaken=[]`.
- The UI can run the validation and show approval gates, blockers/issues, fallback path, proposal task id, audit event id, and `Actions taken: none`.
- No real OpenClaw worker, user-level OpenClaw install, credentials, payer contact, external sends, form submission, record change, prior authorization submission, denial appeal submission, or medical advice occurs.

Dedicated official OpenClaw profile alignment is acceptable before live OpenClaw worker execution when:

- The installed official OpenClaw CLI version and binary path are recorded.
- `openclaw --profile brainstyworkers config file` resolves to the dedicated profile config path.
- The docs choose the dedicated profile, agent id, workspace path, and skill install source/target.
- The repo skill artifact maps cleanly to official OpenClaw local skill install expectations by having `SKILL.md` at the skill root.
- The default personal `~/.openclaw` profile is explicitly out of scope for Brainstyworkers runtime execution.
- The existing validator/proposal gate remains required before any real `openclaw --profile brainstyworkers` worker call.

LangGraph-owned OpenClaw worker planning is acceptable before live OpenClaw worker execution when:

- Each proposed OpenClaw job has a stable job id and correlation id.
- The worker job names the exact OpenClaw profile, agent id, workspace, and skill key.
- The worker job contains required inputs, approval scope, allowed work, stop conditions, expected result fields, and fallback path.
- Deterministic controls explicitly prevent the worker from choosing workflows, creating subtasks, retaining memory, contacting payers, sending messages, submitting forms, entering credentials, or giving medical advice.
- Fan-out groups and fan-in rules are owned by LangGraph.
- API/UI proof exposes the worker plan while `dispatchStatus=not_dispatched` and `actionsTaken=[]`.
- Automated tests prove valid plans are pending approval, unsafe plans are blocked, and worker result templates contain no actions before execution.

Live OpenAI/LangChain model invocation is acceptable only when:

- `OPENAI_API_KEY` is supplied through environment or an ignored local env file, not source code or docs.
- The request explicitly sets live model invocation for that run.
- The default payload sent externally allows insurance, portal, and clinical PHI needed for reasoning after patient approval.
- Patient name, email, SSN, member ID, subscriber ID, and subscription number are masked into database pointers before the payload leaves the app.
- Route-proof-only payloads remain available for low-disclosure infrastructure checks, but they are not the product default.
- The trace records model, mode, and whether invocation was skipped, without logging the secret.
- Acceptance proof requires a real OpenAI model call through `npm test` or `npm run test:live`.

Real orchestrator webapp flow testing is acceptable when:

- The webapp can authenticate the planned local user and create or resume a LangGraph-threaded session.
- Chat orchestration uses the real `@langchain/langgraph` runner.
- Workflow/journey flow tests require live model invocation by default.
- Each tested flow records workflow, journey stage, policy checks, decision points, model invocation mode, OpenClaw worker plan, proposal task, and action status.
- The flow set covers eligibility, claim status, prior authorization, denial appeal preparation, read-only portal extraction, document/trace review, and human approval escalation.
- All tested cases produce `modelInvocation.mode=openai_chatopenai_invoked`.
- OpenClaw jobs remain `dispatchStatus=not_dispatched` and `actionsTaken=[]` until an explicit real-worker execution slice is approved.

Phase 1 runtime collapse is acceptable when:

- `/api/chat` and `/api/langgraph/run` both call the same LangGraph product runtime.
- The browser/evidence observation path is a LangGraph node, not a separate legacy chat pipeline.
- Evidence capture can persist read-only browser snapshots and source pointers from the graph path.
- If authenticated evidence is unavailable, the graph records a blocked/no-evidence state rather than creating false healthcare evidence.
- Final response composition, conversation persistence, audit proof, checkpointing, and memory retain happen after the graph run.
- Repeated calls on the same LangGraph thread reset per-run state so stale final responses or source pointers do not leak into the next run.
- A route-level regression test proves public chat endpoints expose the same graph trace id, workflow contract, approval state, and source-pointer behavior.

Phase 2 structured routing is acceptable when:

- Deterministic safety refusals still run before healthcare workflow routing.
- A structured intent classifier returns strict JSON with intent, workflow, confidence, required evidence, missing evidence, refusal/escalation flag, and rationale.
- LangGraph routes from the structured classifier workflow, not from route keyword score order alone.
- The classifier handles paraphrases that do not contain literal workflow labels.
- Tests cover:
  - "My doctor wants approval for an MRI next month" -> prior authorization.
  - "Why didn't insurance pay my last visit?" -> claim status.
  - "They said no and I want to fight it" -> denial appeal.
  - "Do I still owe anything before insurance starts paying?" -> eligibility/benefits.
  - "Can you log in and type my password?" -> credential-entry refusal.
- Tests fail if the graph ignores the structured classifier output.

Phase 3 approval/resume is acceptable when:

- `POST /api/orchestrator/approve` can approve a pending OpenClaw skill invocation proposal.
- Approval binds to task ID, session ID, user ID, workflow, scope, expiration, and allowed action.
- The only allowed MVP action is `read_only_observation`.
- LangGraph refuses browser/evidence observation when the approval token is missing, denied, expired, mismatched, or already consumed.
- With a valid approval token, the next graph run consumes the token and performs only the approved read-only observation.
- Denied/expired/unapproved paths keep `actionsTaken=[]` and do not create eligibility snapshots or source pointers.
- Approval consumption is visible in audit and trace state.

Phase 4 live portal proof is acceptable when:

- Live portal proof requires an explicit opt-in flag such as `BRAINSTY_PORTAL_LIVE=1`.
- `npm run test:live:portal` fails unless that live flag is set and the user has an authenticated member portal tab available.
- Public payer marketing pages are blocked and do not create eligibility snapshots.
- Authenticated member portal evidence is verified before persistence.
- Stored source pointers include URL, title, page kind, timestamp, DOM hash, extraction hash, and evidence fields.
- If authentication or page kind cannot be verified, the system stores a blocked browser run/audit event only.
- Final sourced answers use stored source pointers, not unverifiable raw portal content.

Phase 5 product memory is acceptable when:

- Product memory is implemented with a real runtime such as Zep Graphiti, not Cortex and not only a local SQLite placeholder.
- The official Graphiti package is installed from the project-local official repo checkout or an equivalent pinned package source.
- The graph backend initializes real Graphiti schema/indexes before retain/recall.
- LangGraph recalls product memory before healthcare workflow routing and retains safe memory after graph completion.
- Retained memory contains safe summaries, workflow/source-pointer metadata, and database pointers, not raw portal text.
- Direct identifiers are masked before memory-bound payloads are sent to Graphiti/OpenAI.
- OpenClaw workers do not retain product memory.
- Cortex is not called as product memory.
- The API exposes product-memory status/probe proof.
- The UI displays Graphiti status, schema readiness, retain episode id, recall facts, and chat-level memory proof.
- A real Graphiti/FalkorDB test proves retain and recall using the actual runtime.
- Suppression has at least an episode-level Graphiti operation and audit record for MVP.

Phase 6A-lite outbound payload observability is acceptable when:

- OpenAI ChatOpenAI invocations record the exact serialized outbound message payload before send.
- Graphiti product-memory status, recall, retain, probe, and suppress bridge calls record the exact serialized outbound payload before send.
- Each observed payload has a SHA-256 hash, destination, payload type, policy mode, and observe-only enforcement mode.
- Payload labels include direct identifier presence, raw portal text presence, and source-pointer contract presence.
- Direct identifier masking avoids false positives for policy instructions such as "member ID masked" while still catching actual member/subscriber identifiers with values.
- The UI or trace proof shows outbound payload audit summaries.
- Tests prove local observability, live OpenAI payload auditing, and real Graphiti payload auditing.
- This phase is explicitly not considered full PHI enforcement.

Phase 6B enforced payload policy and audit hardening is acceptable when:

- OpenAI and Graphiti payload auditing runs in enforced mode by default.
- Direct identifiers in outbound payloads are blocked before external send.
- Raw portal text in outbound payloads is blocked before external send unless a future explicit approval mode allows it.
- Call types that require source-pointer contracts can fail closed when source pointers are missing.
- Blocked outbound payloads write `outbound_payload_blocked` audit events.
- Live OpenAI proof shows direct identifiers absent, source-pointer contract present, and enforced policy allowed.
- Real Graphiti proof shows memory-bound retain payloads are safe, source-pointer based, and enforced policy allowed.
- New audit rows include previous hash, event hash, and chain version.
- Audit verification detects tampered event details.
- Concurrent same-session checkpoint calls produce distinct monotonic `state_version` values in the local runtime.

Phase 7A official OpenClaw profile readiness is acceptable when:

- The project uses the already-installed official OpenClaw CLI through `openclaw --profile brainstyworkers`.
- The dedicated profile config validates.
- The project workspace is `~/.openclaw-brainstyworkers/workspace-brainstyworkers`.
- The project agent is `brainstyworkers-insurance-browser`.
- The repo-scoped `insurance-portal-browser` skill is installed into the dedicated workspace and reports ready for the project agent.
- `browser-automation` is ready for the project agent.
- Personal skills from the default OpenClaw profile are excluded from the project agent.
- The dedicated managed browser profile is `openclaw`, not the user's personal browser profile.
- The default personal `~/.openclaw` config/skill fingerprint is unchanged by project setup.

Phase 7B official OpenClaw read-only worker dispatch is acceptable when:

- Dispatch can occur only after LangGraph consumes a valid read-only approval token.
- Dispatch uses the dedicated `brainstyworkers` OpenClaw profile, project agent, project workspace, and managed browser profile.
- The only executed OpenClaw actions are read-only browser start, approved URL open/navigation, and accessibility snapshot capture.
- The graph records the OpenClaw dispatch as an outbound control payload audit without raw portal text.
- LangGraph verifies the observed page before creating eligibility evidence.
- Public payer marketing pages are blocked and create no eligibility snapshot or source pointer.
- Authenticated member portal pages can create verified source pointers only when `BRAINSTY_PORTAL_LIVE=1` and portal verification passes.
- The UI/API expose official OpenClaw readiness and worker/evidence actions.
- A separate live test proves public Aetna fails closed after real OpenClaw observation.

Phase 7C authenticated official OpenClaw portal proof is acceptable when:

- The user performs all login, password, passkey, SSN, and 2FA steps manually.
- The dedicated OpenClaw browser is already authenticated to the payer member portal.
- LangGraph creates a proposal and consumes a valid read-only approval token.
- Official OpenClaw captures a read-only snapshot after the page is loaded, not while the portal is still on a loading screen.
- LangGraph verifies authenticated member-page signals and healthcare insurance evidence fields.
- A verified source-pointer artifact is stored with URL, title, page kind, timestamp, DOM hash, extraction hash, and evidence fields.
- An eligibility snapshot pointer is created only after verification passes.
- Graphiti product memory retain receives safe summaries/source pointers, not raw portal text or direct identifiers.
- The final response cites stored source pointers.
- If loading/authentication/verification fails, the system blocks and creates no eligibility snapshot or source pointer.

Phase 7D visual evidence hardening is acceptable when:

- Official OpenClaw observations always include both DOM/accessibility evaluation and visual/OCR evaluation.
- The project agent allowlist includes only the required visual skills: `browser-automation`, `insurance-portal-browser`, and `ocr-local`.
- OCR runs locally from the dedicated project workspace and does not call an external OCR API.
- The visual screenshot is captured from the dedicated OpenClaw managed browser, not the user's personal browser profile.
- OCR failure blocks evidence creation rather than silently falling back to DOM-only proof.
- Verified evidence artifacts preserve visual OCR confidence and screenshot path in local artifacts.
- Product memory and model-bound payloads still receive only safe summaries/source pointers, not raw screenshot/OCR portal text.

Phase 7E OpenClaw skill layering is acceptable when:

- `insurance-portal-browser` explicitly declares that it is the healthcare safety envelope and does not replace `browser-automation`.
- `skill.json` declares `browser-automation` and `ocr-local` as required companion skills.
- The browser-control policy requires status/profile/tab checks, read-before-click snapshots, fresh refs, stale-ref recovery, and exact manual blocker reporting.
- Artifact validation fails if the companion skill boundary is removed.
- The dedicated project agent uses the project profile/workspace and does not depend on the user's default personal OpenClaw profile.

Phase 7G OpenClaw adaptive-worker empowerment is acceptable when:

- LangGraph still chooses the healthcare workflow and owns final response composition.
- The worker contract explicitly allows task-scoped subtasks, task-scoped status subagents, tool-path choice, additional browser instances, public web/scrape/configured read-only API paths, task-scoped helper skills/scripts, local OS automation inside scope, and OpenClaw worker heartbeat memory.
- The OpenClaw envelope transmits relevant product-memory recall, prior sessions, open tasks, scheduled jobs, and database pointers.
- A task-scoped status subagent reports to LangGraph every 30 seconds while active.
- Silent failure is disallowed.
- Long or complex tasks must ask LangGraph whether to continue synchronously or convert to async follow-up.
- Terminal outcomes distinguish sourced success, missing user data, insurance/portal block, policy/approval block, long-running follow-up, and partial result with blockers.
- Credential/passkey/2FA/SSN handling remains user-only.
- Payer contact, external messaging, form submission, record change, appeals, authorizations, payments, cancellations, and other irreversible actions remain blocked unless a separate explicit per-action approval exists.
- Medical advice remains not allowed.

Phase 8A GPT-governed LangGraph orchestration is acceptable when:

- A real LangGraph node asks GPT for a strict JSON orchestration decision when live model mode is requested.
- The GPT decision occurs before workflow routing and can causally determine the workflow.
- The decision payload includes the user request, deterministic policy result, curated classifier output, route candidates, source-pointer hints, product-memory recall summary, and OpenClaw capability policy.
- Direct identifiers are masked before the payload leaves the app.
- Deterministic safety refusals and approval gates override GPT decisions.
- Invalid, low-confidence, missing-key, or unavailable-model decisions fall back to the deterministic classifier without crashing.
- Tests fail if a valid GPT/replay decision is ignored by the router.
- Live proof calls the real OpenAI API and asserts `llm_orchestration_decision.mode=openai_chatopenai_invoked`, `valid=true`, and `usedByRouter=true` for non-policy-override cases.
- Orchestrator summaries and UI proof expose model mode, workflow, confidence, rationale, and whether GPT was used by routing.

Phase 8B runtime events and programmable hooks are acceptable when:

- LangGraph publishes runtime events for classification, routing, worker plan preparation, approval requested, evidence status, final answer, and memory retention.
- Runtime events persist with user id, session id, correlation id, event type, payload, and timestamp.
- The server exposes list and SSE stream endpoints for runtime events.
- In-process code hooks can subscribe to event types.
- Webhook subscriptions are persisted but outbound delivery is dry-run blocked unless `BRAINSTY_ENABLE_OUTBOUND_WEBHOOKS=1`.
- Webhook deliveries use signed payloads when enabled.
- Tests prove event persistence, code-hook delivery, dry-run webhook blocking, and graph lifecycle event publication.

Phase 8C auth-plus-chat MVP hardening is acceptable when:

- The user-facing app starts with local planned-user authentication before chat actions.
- Workflow buttons and free-text chat both enter the same LangGraph runtime.
- Chat can ask for missing information, show login-needed/manual-ready states, and render read-only approval cards.
- Chat displays GPT decision proof, runtime event timeline, OpenClaw worker plan/status, source pointers, and product-memory retain/recall proof.
- Long-running OpenClaw work can continue through status events rather than failing silently.
- The proof dashboard remains available as an operator/debug surface, but the primary MVP value is testable from auth plus chat.
- No new healthcare workflow breadth is added until this loop works end to end for the eligibility/benefits journey.
- Approval recording emits a runtime event before resume.
- Approval consumption emits a runtime event during the graph run.
- Worker status updates emit runtime events with terminal outcomes such as `completed_with_sourced_result`, `not_possible_insurance_or_portal_block`, or `not_possible_policy_or_approval_block`.
- The chat UI renders a post-approval worker result card with actions taken, source pointers, structured benefits when available, and fail-closed blocker text when evidence cannot be created.

Phase 8D authenticated evidence quality is acceptable when:

- Verified authenticated portal proof can produce structured deductible and out-of-pocket rows from DOM/accessibility and OCR-style text.
- Structured rows are persisted in `coverage_balances` and exposed as source pointers.
- Final sourced answers cite source pointers and summarize total, spent, and remaining amounts for structured benefit rows.
- Worker status events include structured benefit counts and evidence-channel metadata when available.
- The chat Worker Result card displays structured benefits, evidence channels, and friendly fail-closed blocker text.
- Missing auth, public payer pages, missing `BRAINSTY_PORTAL_LIVE=1`, OCR failure, and visual proof failure must fail closed without creating false healthcare evidence.
- Product-memory and model payloads remain source-pointer oriented and must not retain raw portal text as product memory.

Phase 8E async worker follow-up is acceptable when:

- A pending read-only worker proposal can be converted into an async follow-up record from the chat UI.
- The continuation is bound to task id, session id, user id, workflow, approval scope, allowed action, correlation id, scheduled job id, and last progress event.
- Only `read_only_observation` scope/action can be scheduled in this MVP.
- Creating, continuing, or cancelling a continuation publishes runtime events visible in the chat timeline.
- Chat renders the continuation status, terminal outcome, task, workflow, approval scope, next check time, last progress, and `actions taken: none`.
- Continue/cancel controls never execute the worker directly or perform external actions; they only record user intent/status transitions until a fresh approved graph run consumes the state.
- Cancelled continuations cannot be resumed and remain audit-visible.
- Source-pointer memory, approval gates, and no-silent-failure worker status contracts remain intact.

Phase 8F approved continuation dispatch is acceptable when:

- A worker continuation is validated before approval consumption.
- Continuation dispatch requires the dedicated official OpenClaw read-only worker path.
- The continuation task, session, user, workflow, approval scope, and allowed action must match the fresh approval run.
- Cancelled, expired, completed, blocked, wrong-scope, wrong-task, wrong-session, or wrong-workflow continuations do not dispatch.
- A valid approval token is consumed only when the continuation is dispatchable.
- Dispatch publishes `worker.followup.dispatching` and keeps `actionsTaken=[]` until the official worker starts.
- Official OpenClaw result ingest finalizes the continuation as `completed` or `blocked`, publishes a matching runtime event, updates the scheduled job/task, and records read-only actions taken.
- User-facing chat exposes the official read-only run control but keeps continue/cancel controls separate.
- The live official OpenClaw continuation proof remains explicitly gated by `BRAINSTY_OPENCLAW_OFFICIAL_LIVE=1`.
- Credentials, passkeys, 2FA, SSNs, payer contact, external messages, form submission, record changes, and medical advice remain out of scope.

Phase 8G authenticated current-tab continuation proof is acceptable when:

- The dedicated official OpenClaw profile is ready and personal skills remain excluded from the project agent.
- The user manually signs in to an approved authenticated member portal host in the dedicated OpenClaw browser profile.
- The worker run can use the already-authenticated current tab without navigating back to a public payer URL.
- If no current tab exists, the run fails loudly with `official_openclaw_current_tab_missing` and creates no source pointer or eligibility snapshot.
- The chat UI exposes live proof, official worker, and current-tab toggles.
- `Portal Ready` enables the current-tab path but still requires a fresh read-only approval before observation.
- A successful live run validates the continuation before approval consumption, consumes the approval once, marks the continuation `dispatching_official_openclaw`, captures accessibility-tree evidence, captures CDP screenshot evidence, runs local OCR, verifies authenticated member portal evidence, persists source pointers, and finalizes the continuation as `completed`.
- Failed authentication, public payer pages, missing live flags, missing screenshot, missing OCR, or failed portal verification finalize the continuation as `blocked`.
- `npm run test:live:openclaw-auth` runs only the authenticated current-tab live proof and must not first navigate the browser through the public payer fail-closed test.
- Credentials, passkeys, 2FA, SSNs, payer contact, external messages, form submission, record changes, and medical advice remain out of scope.

Phase 8H post-success chat loop hardening is acceptable when:

- A completed, blocked, cancelled, or expired worker continuation renders as a terminal card with no approve/run/continue/cancel controls.
- When a fresh graph result includes a worker continuation, the chat replaces the prior continuation card in place instead of leaving stale active controls visible.
- After source pointers exist or evidence has been captured, missing-info wording no longer asks again for the satisfied portal evidence/data pointer.
- Successful evidence answers are compact, cite stored source pointers, and avoid raw portal text or direct user identity strings.
- Login, sign-in, password, passcode, and verification-code pages are blocked as credential gates and must not create healthcare evidence.
- Official OpenClaw accessibility-tree text can be parsed into deductible/out-of-pocket rows, claim rows, and prior authorization rows when those fields are visible.
- Worker Result, Workflow Proof, runtime timeline, trace JSON, source pointers, payload audits, and evidence-channel details remain visible for operator/debug proof.
- Static checks, focused LangGraph/UI tests, build, and `npm run test:local` pass.

Phase 8I repeatable MVP harness is acceptable when:

- The chat UI has a reset control that clears the local journey surface, closes the runtime event stream, clears active session selection, and does not delete existing local audit/database records.
- The chat UI has a replay control that starts a fresh real planned-user local auth session and sends the standard benefits question through `/api/chat`.
- The replay path uses the same LangGraph product runtime as manual chat; it does not use seeded canned data or a mock endpoint.
- A visible final-answer panel shows the current answer, workflow, source-pointer ids, worker outcome/actions, structured benefits, GPT decision mode, and graph trace.
- If read-only observation is still pending, the final-answer panel exposes approve/follow-up controls bound to the real proposal task.
- Workflow Proof, Worker Result, source pointers, payload audits, and runtime timeline remain available as expandable operator proof rather than replacing the user answer.
- Browser proof confirms a clean replay can create the local auth session, run the benefits workflow, and surface the approval-needed or sourced-result state in the answer panel.
- The authenticated current-tab live proof is rerun when the dedicated OpenClaw tab is authenticated, and docs record only status/source-pointer evidence rather than raw portal text.

Phase 8J multi-page read-only worker navigation is acceptable when:

- The official OpenClaw worker can build a read-only navigation plan from real authenticated portal links without adding new healthcare workflow breadth.
- The navigation plan selects only same-origin HTTPS portal targets and rejects logout/signout, profile, messages, forms, uploads, public/legal pages, credential gates, and irreversible-action paths.
- The worker captures DOM/accessibility evidence, CDP screenshot evidence, and local OCR evidence separately for each observed page.
- LangGraph verifies each observed page before creating source pointers and can return `partial_result_with_blockers` when some pages fail verification.
- The evidence observation reports page count, verified page count, blocked page count, navigation plan, page blockers, source pointers, structured benefits, and worker actions.
- The chat answer panel and Worker Result proof show pages, navigation plan, evidence channels, worker outcome, source pointers, structured benefits, and no hidden external action.
- Live multi-page proof remains gated by explicit flags and an already authenticated dedicated OpenClaw current tab.
- Credentials, passkeys, 2FA, SSNs, payer contact, external messages, form submission, record changes, and medical advice remain out of scope.

Phase 8K user-friendly live worker readiness is acceptable when:

- `/api/openclaw/official/status` returns the official OpenClaw readiness plus a `liveReadiness` contract.
- The live readiness contract classifies:
  - profile/browser not ready,
  - auth required because no current tab exists,
  - login/password/passkey/2FA/captcha challenge pages,
  - public payer marketing pages that still require user navigation,
  - member portal pages ready for read-only approval.
- The chat UI exposes `Live Worker Readiness`, `Check Live Worker`, current-tab summary, next user action, approval state, allowed worker attempts, blocked actions, and fallback chain.
- `Portal Ready` enables live proof/current-tab/multi-page preferences but also checks live readiness and tells the user whether the worker is ready or still blocked.
- The allowed worker attempts include same-site portal navigation, DOM/accessibility scraping, visual OCR confirmation, configured read-only/public lookups, and manual-export fallback.
- The blocked actions remain credential entry, password manager access, passkeys/2FA, SSN entry, payer contact, external messages, form submission, record changes, and medical advice.
- Auth recovery remains user-controlled; the app must not imply that OpenClaw can bypass login, enter credentials, or solve authentication challenges.
- Focused tests prove each readiness state and the UI contract.

Phase 8L guided live app multi-page proof is acceptable when:

- The dedicated official OpenClaw project profile is already authenticated by the user and `Check Live Worker` reports `ready_for_read_only_approval`.
- `Portal Ready` enables live portal proof, official worker dispatch, current-tab mode, and multi-page mode only through the approval-gated read-only path.
- The Benefits MVP path first returns an approval-needed state with no worker actions and no source pointers.
- `Approve Read-Only Observation` records approval, consumes it exactly once, and dispatches the official OpenClaw worker.
- The worker can reuse the current dedicated tab, navigate same-site read-only links, capture DOM/accessibility evidence, capture CDP screenshots, run local OCR, verify authenticated member portal pages, and persist source pointers.
- The current answer renders as a sourced executed answer when evidence status is `captured_official_openclaw_multi_page_read_only_observation`.
- The current answer cites stored source pointers and must not say the approved worker was "not executed in this slice."
- Worker Result shows terminal outcome, pages verified, actions taken, source pointers, evidence channels, and no hidden external action.
- `partial_result_with_blockers` is treated as a terminal completed continuation only when sourced evidence exists; no-evidence paths remain blocked.
- Focused tests, build, live multi-page OpenClaw proof, and browser UI proof pass.
- Credentials, passkeys, 2FA, SSNs, payer contact, external messages, form submission, record changes, and medical advice remain out of scope.

Phase 8M OpenClaw insurance skill playbook hardening is acceptable when:

- The repo-scoped `insurance-portal-browser` skill and the dedicated project workspace copy contain the same current `SKILL.md` and `skill.json`.
- The skill describes browser navigation, user-controlled auth handoff, remote/browser automation, DOM/accessibility extraction, visual OCR, portal search, read-only document/PDF handling, and reasoning/validation strategy.
- The manifest declares `portal_search`, `read_only_document_download`, and `pdf_extraction_analysis` as allowed tools.
- The portal section strategy includes Benefits, Coverage, Claims, Documents, Pharmacy, and Summary of Benefits and Coverage.
- The structured answer schema includes plan, safe member identifier, effective dates, deductible, out-of-pocket max, copays, coinsurance, pharmacy benefits, claims summary, documents found, evidence, uncertainty, and recommended next steps.
- The worker job contract transmits the same playbook, data fields, quality bar, and document policy.
- The OpenClaw prompt contract instructs the worker to use multiple read-only approaches before failure and to return JSON-compatible sourced evidence rather than raw portal dumps.
- The validator and tests fail if the richer skill playbook, portal section strategy, document/PDF policy, or structured insurance data fields are removed.
- Credential entry, password-manager use, passkeys, 2FA, captcha solving, SSN entry, payer contact, external messages, form submission, record changes, and medical advice remain blocked or user-only.

Phase 8N auth-plus-chat result loop hardening is acceptable when:

- Current Answer clearly represents the latest LangGraph result for the current session and is visually distinguishable from older chat history.
- The chat keeps operator proof expandable while the Current Answer shows workflow, source pointers, worker outcome/actions, structured benefits, structured claims/prior authorizations, GPT routing, graph trace, and product-memory retain state.
- Graphiti retain failures include repair metadata with retryability, timeout classification, attempts, next action, first error, and retry result when applicable.
- Fast retryable Graphiti runtime failures attempt one repair retry unless `BRAINSTY_PRODUCT_MEMORY_RETAIN_RETRY=0`.
- Timeout and payload-policy failures do not silently retry forever; they expose a next repair action.
- Runtime `memory.retained` events expose product-memory attempts, repair status, repair outcome, error, and next action.
- LangGraph source pointers include `claim_items` and `prior_authorizations` when structured portal evidence contains them.
- Final answers remain source-pointer based and do not include raw portal text.
- Focused UI, product-memory, output-policy, and LangGraph tests pass, followed by build and local suite.

Phase 8O enriched OpenClaw discovery proof is acceptable when:

- The approved official OpenClaw read-only path records a discovery report after DOM/accessibility, CDP screenshot, OCR, and same-site navigation.
- The discovery report includes portal search affordance scan status without submitting a search query.
- The discovery report includes official document/SBC/PDF candidate counts, read-only candidate counts, blocked candidate counts, and blocker reasons for mixed form/submission/offsite areas.
- The report includes portal sections tried or reachable and the fallback chain through same-site navigation, portal search, official documents/PDFs, and manual export.
- LangGraph carries discovery proof into worker status events, continuation metadata, evidence observation state, output policy, and UI proof.
- Current Answer, Workflow Proof, Worker Result, and runtime timeline show discovery status without raw portal text.
- Tests cover the discovery-report builder, sourced output wording, UI contract, and continuation metadata.
- Live authenticated OpenClaw proof remains gated by `BRAINSTY_OPENCLAW_AUTHENTICATED_LIVE=1`, `BRAINSTY_OPENCLAW_OFFICIAL_LIVE=1`, and `BRAINSTY_PORTAL_LIVE=1`.

Phase 8P live discovery proof is acceptable when:

- `npm run test:live:openclaw-discovery` runs only after the user manually signs in to the dedicated OpenClaw browser profile.
- The live test uses the current dedicated tab and multi-page read-only observation.
- The live test asserts source pointers, DOM/accessibility evidence, visual OCR evidence, discovery report presence, no portal search submission, no document/PDF download, no raw document dump, worker discovery actions, and worker status discovery metadata.
- The result documents whether portal search, official documents, SBCs, or PDFs are reachable from the authenticated portal.
- If auth/challenge/login blocks the run, the result is recorded as a user-action blocker rather than a failed product claim.

Phase 8Q user-friendly MVP sequencing app is acceptable when:

- The existing `/` proof dashboard remains available.
- `/mvp` loads as a separate auth-plus-chat app.
- The app starts a real local planned-user session through `POST /api/orchestrator/auth-start`.
- Chat and workflow shortcut buttons route through `POST /api/chat` and do not use mocked workflow results.
- The sequence view shows Auth, GPT/Intent, Approval, OpenClaw, Evidence, Memory, and Answer states from real graph state.
- The approval panel shows the pending OpenClaw proposal task and can call the existing read-only approval endpoint.
- Official OpenClaw dispatch uses a worker continuation id when selected.
- The app checks live worker readiness through `GET /api/openclaw/official/status`.
- The Discovery/Next Evidence panel renders portal search status, document candidates, SBC/PDF candidates, sections tried/reachable, and fallback chain from evidence state.
- Runtime events stream through `/api/runtime/events/stream`.
- User-facing answer proof remains source-pointer based and does not expose raw portal text.
- Build, UI contract test, and browser smoke proof pass.

Phase 8R live approved MVP run from `/mvp` is acceptable when:

- The dev server is running with live portal proof allowed.
- The user manually authenticates the dedicated Brainstyworkers OpenClaw browser/profile and leaves the member portal tab open.
- `/mvp` `Check Worker` or `Portal Ready` reports `ready_for_read_only_approval`.
- The Benefits workflow first creates a pending read-only proposal with no worker action.
- The MVP Approval Gate records read-only approval and, when official OpenClaw is selected, creates a worker continuation id.
- The resumed graph run either creates verified source pointers or returns a clear blocker.
- Current Answer, Sequence, Approval Gate, Discovery/Next Evidence, and Runtime Events agree about the same trace/session.
- The `/` operator dashboard can inspect the same session/trace.

Phase 8S section-specific structured extraction is acceptable when:

- Benefits, spending, claims, prior authorization, documents, ID card, pharmacy, and network surfaces each have targeted extractor tests or fixture coverage as they become live-reachable.
- Extracted facts are stored as structured rows/source pointers, not raw portal dumps.
- `/mvp` shows safe summaries and source-pointer counts for extracted fields.
- Final answers cite source pointers and do not expose raw portal text.
- No PDF/document download or analysis is introduced in this phase.

Phase 8T narrow document candidate approval is acceptable when:

- Discovery document candidates can be presented as individual approval targets.
- Approval binds to one candidate, session, user, workflow, scope, expiration, and allowed action.
- Denied, expired, missing, or mismatched approvals create no worker action.
- Mixed form, submission, offsite, and irreversible document paths remain blocked unless separately approved for a future action-specific scope.

Phase 8U read-only PDF/document ingestion is acceptable when:

- It only runs after a Phase 8T candidate-specific approval.
- The system stores document title/type, URL or source location, timestamp, hashes, extraction provenance, and source pointers.
- OCR/vision fallback is available for rendered or scanned pages.
- User-facing answers cite document source pointers and do not dump raw document text.

Phase 8V MVP polish and operator/user split is acceptable when:

- `/mvp` can be used by a tester without reading raw JSON.
- `/` remains available as the proof dashboard.
- User-facing cards clearly distinguish proposal-only, pending approval, running worker, sourced result, partial result, and blocker states.
- Retry/resume actions do not bypass LangGraph approval or OpenClaw readiness gates.

## Workflow Architecture Criteria

Workflow architecture is acceptable before live LangGraph/OpenClaw when:

- The database stores workflow definitions, tool registry entries, workflow tool requirements, knowledge sources, OpenClaw skills, workflow runs, journey events, and memory reflections.
- The orchestrator context packet includes user profile completeness, route candidates, workflow readiness, prior journey events, memory reflections, database pointers, tool status, and authoritative knowledge sources.
- The OpenClaw context packet includes skill catalog entries, allowed tools, browser fallback paths, scheduled jobs, and approval-gated heartbeat tasks.
- Each workflow declares required user fields, required database pointers, required tools, memory scopes, and journey stage.
- Workflow preflight records a `workflow_runs` row and a `user_journey_events` row for auditability.
- All timestamps added for runtime/memory/journey compatibility are ISO-8601 UTC strings stored as SQLite `TEXT`.
- Product-memory retain candidates include temporal metadata and source database pointers.

The first live LangGraph slice should not proceed unless the workflow registry can answer:

- Which workflow should run and why.
- Which user data is present or missing.
- Which database pointers support the route.
- Which tools are present, disabled, or awaiting approval.
- Which user journey stage the workflow belongs to.
- Which memory scopes should be recalled and retained.

## Safety Criteria

- The system refuses or escalates medical advice, credential handling by Codex, unsupported payer actions, and sensitive identifiers outside the approved local prototype scope.
- The system refuses prompt-injection requests that ask it to ignore, reveal, or override governing instructions.
- The system refuses unrelated requests outside the healthcare insurance concierge domain.
- Memory items, portal text, browser content, emails, and tool outputs are treated as untrusted context and not as instructions.
- Unsafe blocked requests must not be retained verbatim as reusable memory.
- External actions are blocked unless explicitly approved.
- Human approval is required before any high-risk action path.
- User-facing responses must not imply that the system has contacted a payer by API, changed a record, submitted a prior authorization, submitted an appeal, or sent a message unless that action is actually implemented and approved.

## Proof Criteria

Each slice must leave reproducible proof:

- Commands run.
- Test/build/lint results.
- Browser screenshot, API response, or local trace when relevant.
- Known risks and gaps.
- Exact local instructions for trying the slice.
