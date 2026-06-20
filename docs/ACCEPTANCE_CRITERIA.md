# Acceptance Criteria

Status: Phase 35 continuous-intelligence promotion gate.

Last updated: 2026-06-18

## Phase 35: PEMS Supervised Promotion Gates

Phase 35 is acceptable when:

- `pems_candidate_promotion_reviews` exists and is part of the table allowlist.
- Promotion reviews are written with bound-parameter store APIs and retain only rationale hashes plus sanitized previews.
- `pems_candidate_maturity` records supervised advisory state separately from production-driving state.
- A mature PEMS candidate cannot enter supervised advisory without at least two explicit human reviewer approvals.
- A mature PEMS candidate cannot enter supervised advisory without a validator/evaluator pass.
- A mature PEMS candidate cannot enter supervised advisory without citation/evidence sufficiency.
- Any safety incident or safety-review failure vetoes supervised advisory.
- `productionDrivingAllowed=false` remains true for every helper return, DB row, API proof check, and score object.
- `GET /api/continuous-intelligence/pems/promotion` returns the promotion proof.
- `POST /api/continuous-intelligence/pems/reviews` records a promotion review without storing raw rationale text.
- `GET /api/proof/runs/server-connector-next-mobile-mvp` includes `pems_supervised_promotion_gate`.
- The dashboard displays the updated proof through the existing connector-proof panel.
- Focused promotion tests, `npm run build`, `npm run test:local`, API proof, and visual proof pass.

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

## Phase 10U: Dynamic Skill Server

Phase 10U is acceptable when:

- Dynamic skill artifacts are editable files under `openclaw/skills/*/skill-server.json`.
- The system includes at least one insurance-specific sketch skill and one journey-specific sketch skill.
- The skill server validates schema, skill kind, generator edit ownership, answer contract, and allowlisted runtime mounts.
- Generated or edited skill files cannot introduce arbitrary SQL; only named database query mounts are accepted.
- LangGraph shared state includes `dynamic_skill_context`.
- A `skill_resolver` node runs after workflow routing and before workflow execution.
- The LLM orchestration payload includes dynamic skill hints so GPT can consider available insurance and journey skills.
- The resolver selects:
  - an insurance-specific skill for Aetna plan reasoning when relevant;
  - a journey-specific skill for claim-status questions when relevant;
  - `insurance_portal_browser` as the execution skill when account-specific portal evidence is needed.
- API proof exposes dynamic skills and resolution without worker execution:
  - `GET /api/dynamic-skills`;
  - `POST /api/dynamic-skills/resolve`.
- The resolver returns success estimates, data needed, dynamic runtime variables, required OpenClaw tasks, search engines, APIs, mounted query summaries, and `actionsTaken=[]`.
- Tests prove valid skill resolution, unsafe mount rejection, LangGraph proof propagation, and LLM payload inclusion.

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

Phase 8S proof status:

- Complete locally as of 2026-06-01.
- Coverage balances, claims, and prior authorizations still persist as structured rows.
- Section/document/ID/pharmacy/network/plan signals are stored in extraction review payloads as source-pointer-safe structured evidence.
- Sanitized captured-format fixtures cover the home/benefits and claims page shapes without depending on mutable local DB state.
- `npm run build` and `npm run test:local` passed.
- Document/PDF ingestion remains deferred to Phase 8U after Phase 8T candidate-specific approval.

Phase 8T narrow document candidate approval is acceptable when:

- Discovery document candidates can be presented as individual approval targets.
- Approval binds to one candidate, session, user, workflow, scope, expiration, and allowed action.
- Denied, expired, missing, or mismatched approvals create no worker action.
- Mixed form, submission, offsite, and irreversible document paths remain blocked unless separately approved for a future action-specific scope.

Phase 8T proof status:

- Complete locally as of 2026-06-01.
- Discovery candidates have stable `candidateId` values.
- Candidate proposals are stored in `agent_tasks` with `task_type=openclaw_document_candidate_proposal`.
- `read_only_document_observation` approval gates bind task, session, user, workflow, candidate ID, candidate URL, allowed action, and expiration.
- Blocked/offsite/mixed-form/submission candidates are rejected before approval.
- Focused candidate approval and continuation tests pass.

Phase 8U approved read-only document observation is acceptable when:

- It only runs after a Phase 8T candidate-specific approval.
- OpenClaw receives an envelope restricted to the approved candidate URL/source.
- The system stores document title/type, URL or source location, timestamp, hashes, extraction provenance, screenshot/OCR proof, and source pointers.
- DOM/accessibility plus OCR/vision fallback are available for rendered or scanned pages.
- User-facing answers cite document source pointers and do not dump raw document text.
- No broad document crawl, payer contact, external message, form submission, credential entry, medical advice, or account mutation occurs.

Phase 8U proof status:

- Implemented locally as of 2026-06-01 for one approved candidate URL through the official OpenClaw read-only observation path.
- The graph status `captured_official_openclaw_document_read_only_observation` is treated as source-pointer-backed evidence.
- Full PDF text extraction and document-specific structured parsing are deferred until live candidate proof identifies the needed official document shape.

Phase 8V MVP polish and operator/user split is acceptable when:

- `/mvp` can be used by a tester without reading raw JSON.
- `/` remains available as the proof dashboard.
- User-facing cards clearly distinguish proposal-only, pending approval, running worker, sourced result, partial result, and blocker states.
- Retry/resume actions do not bypass LangGraph approval or OpenClaw readiness gates.

Phase 8W full original MVP gate is acceptable when:

- `npm run build` passes.
- `npm run test:local` passes.
- `/mvp` and `/` can show the same session, graph trace, proposal task, approval state, worker continuation, source pointers, audit events, and memory status.
- Benefits question -> approval -> official OpenClaw read-only observation -> source pointers -> Discovery candidates -> one candidate approval -> one approved document observation -> sourced answer -> Graphiti retain completes when the authenticated portal is available.
- If the insurer portal is unavailable, the run fails closed with `blocked_no_authenticated_evidence` or an equivalent external portal blocker.
- Portal-unavailable runs must consume only the scoped approval, record the blocker, create no source pointers, create no document candidates, retain no sourced product-memory evidence, and perform no payer contact, credential entry, medical advice, form submission, external message, or account mutation.
- The user-facing final answer must say the live portal evidence step is blocked and must not say the worker was merely proposal-only or that evidence was captured.

Phase 8W proof status:

- Accepted as an external-blocker proof as of 2026-06-01 after user approval to proceed.
- Local build/test gate is green.
- `/mvp` and `/` same-session proof is green.
- Live Aetna proof is externally blocked because the portal was unavailable/no authenticated OpenClaw tab was present.
- The external blocker path was exercised with an approved official OpenClaw continuation and finalized safely with zero source pointers.

Phase 9A Wefella FastAPI facade is acceptable when:

- The facade is additive and does not replace the Node/LangGraph/OpenClaw runtime.
- Public `GET /api/health` reports facade status and Node runtime reachability.
- Protected `POST /api/chat` requires a bearer token and rejects user/JWT subject mismatches.
- Accepted chat requests produce a task id and can be checked through `GET /api/chat/status/{task_id}`.
- `GET /api/chat/stream/{task_id}` emits task events and a terminal result for consumers that want SSE-style updates.
- The facade delegates to the real Node `/api/chat` runtime, not a mock, when live proof is enabled.
- The facade has documented environment variables for Node URL, JWT secret, and allowed CORS origins.
- `npm run build`, `python3 -m compileall -q project`, `npm run test:facade`, and `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` pass with the Node runtime running.

Phase 9A proof status:

- Implemented locally as of 2026-06-01.
- Live delegation to the current Node runtime passed through the facade test gate.
- Production-grade auth provider, persisted async task storage, and deployed FastAPI hosting remain future phases.

Phase 9B MVP facade route is acceptable when:

- `/mvp` offers a visible backend route selector for direct Node or Wefella FastAPI facade.
- The FastAPI local MVP auth endpoint delegates to Node local auth and returns a bearer token bound to the resulting user id.
- `/mvp` can submit a Benefits question through FastAPI `POST /api/chat`.
- `/mvp` can consume `GET /api/chat/stream/{task_id}` with bearer auth and fall back to status polling.
- The facade task result renders in the existing Current Answer, Approval Gate, Sequence, and Runtime proof panels.
- Task status and stream reads reject a JWT subject that did not create the task.
- Approval tokens, worker continuation ids, official OpenClaw flags, live portal proof flags, and approved document candidate ids can pass through the facade chat contract.
- The direct Node path remains available for parity checks.

Phase 9B proof status:

- Implemented locally as of 2026-06-01.
- Browser proof at `/mvp` passed through the FastAPI facade with no console errors:
  - local facade auth created session `session_d0d7cb87-0d19-4856-8b27-3e142bc09f2d`,
  - FastAPI accepted task `task_759cb89f-3289-4082-85c8-092edaffdc1d`,
  - the stream completed,
  - the UI rendered the same LangGraph `eligibility_benefits_navigation` proposal and pending approval task.
- Phase 9C should proxy approval, worker continuation, document candidates, OpenClaw readiness, and runtime event surfaces through FastAPI so the frontend can become FastAPI-only.

Phase 9C FastAPI MVP action proxies are acceptable when:

- FastAPI exposes protected proxy endpoints for local approval, worker continuations, document candidates, OpenClaw official readiness, runtime event snapshots, and runtime event stream.
- The facade rejects query/body `userId` values that do not match the JWT subject.
- The facade injects the JWT subject as `userId` when a proxied MVP request omits it.
- `/mvp` uses FastAPI for those non-chat actions when Wefella mode is selected.
- `/mvp` still supports the direct Node route for parity checks.
- Browser proof in Wefella mode shows readiness, runtime events, Benefits task stream, document candidate load, and pending approval with no console errors.
- `npm run build`, `npm run test:facade`, `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade`, and `npm run test:local` pass.

Phase 9C proof status:

- Implemented locally as of 2026-06-01.
- Browser proof at `/mvp` passed through the FastAPI facade:
  - local auth created session `session_42876149-bcee-4045-b8d6-9091f5c6d0c5`,
  - OpenClaw readiness went through FastAPI and returned `auth_required`,
  - runtime events stream/snapshot went through FastAPI,
  - FastAPI accepted chat task `task_e62c8873-bbe8-4d1c-a14d-177af3d2348d`,
  - document candidate loading went through FastAPI,
  - UI rendered pending approval task `task_022350c2-e3ac-41a8-819e-050a7a13378c`,
  - browser console had 0 errors.
- Screenshot proof: `/tmp/workerprototype_phase9c_facade_mvp.png`.

Phase 9D FastAPI-first parity proof is acceptable when:

- `/mvp` defaults to the Wefella FastAPI facade route.
- The direct Node route remains selectable as an operator parity escape hatch.
- `/mvp` exposes a visible Node-direct versus FastAPI parity check for the Benefits prompt.
- The parity check creates separate temporary sessions and does not overwrite the active user chat session.
- The parity check compares stable graph-contract fields:
  - workflow,
  - intent,
  - approval state,
  - proposal status,
  - evidence status,
  - source-pointer count,
  - answer presence,
  - trace presence.
- The parity check stays proposal-only: no evidence observation approval, no live OpenClaw dispatch, no credential/2FA/password-manager action, no payer contact, no form submission, no external message, and no medical advice.
- Browser proof shows the FastAPI default, facade health, parity result, and no console errors.

Phase 9D proof status:

- Implemented locally as of 2026-06-01.
- Browser proof at `/mvp` passed:
  - backend default was `wefella`,
  - facade health returned `0.1.0-phase9d-fastapi-first-parity` and was connected to Node,
  - parity reported `Parity passed` for the proposal-only Benefits route,
  - Node and FastAPI matched workflow, intent, approval state, proposal status, evidence status, source-pointer count, answer presence, and trace presence,
  - no evidence observation or worker action was approved,
  - browser console had 0 errors.
- Screenshot proof: `/tmp/workerprototype_phase9d_fastapi_first_parity.png`.

Phase 9E provider-style JWT alignment is acceptable when:

- FastAPI local development auth remains the default local mode.
- `WEFELLA_AUTH_MODE=provider` enables stricter provider-claim validation.
- Provider mode requires configured issuer and audience.
- Protected endpoints reject tokens missing required issuer/audience claims.
- Protected endpoints reject tokens with the wrong audience.
- Protected endpoints accept tokens with matching subject, expiry, issuer, and audience.
- `POST /api/auth/local-session` is disabled by default in provider mode.
- `GET /api/health` reports safe auth metadata without exposing secrets.
- `/mvp` remains FastAPI-first in local mode.
- The Node/LangGraph/OpenClaw runtime remains the orchestration source of truth.

Phase 9E proof status:

- Implemented locally as of 2026-06-01.
- `python3 -m compileall -q project` passed.
- `npm run test:facade` passed with 13 tests, 12 passed and 1 expected live-gated skip.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 13 tests against the running Node runtime.
- `node --check src/app/mvp.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 8 tests.
- `npm run build` passed.
- `npm run test:local` passed with 123 tests total, 121 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.

Phase 9F FastAPI-first approved loop proof is acceptable when:

- `/mvp` runs the Benefits journey through the FastAPI facade by default.
- The user can start local auth, check live worker readiness, run Benefits, approve read-only observation, and resume through FastAPI.
- The approved resume forwards approval token, approval task id, worker continuation id, official OpenClaw flags, current-tab preference, multi-page preference, approval scope, and allowed action to the Node/LangGraph runtime.
- The approved loop returns either verified source pointers or a precise blocker.
- Product-memory retain status is visible in the user-facing proof.
- `/mvp` links to the operator dashboard for the same session.
- `/` can load that linked session from query parameters and show matching trace state.
- The approved loop does not enter credentials, use password managers, handle 2FA, submit forms, contact payers, send external messages, create false evidence, or make account changes.

Phase 9F proof status:

- Implemented locally as of 2026-06-01 with the precise-blocker branch verified.
- `npm run test:facade` passed with 15 tests, 13 passed and 2 expected live-gated skips.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 15 tests against the running Node runtime.
- `node --check src/app/mvp.js` passed.
- `node --check src/app/app.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 8 tests.
- `python3 -m compileall -q project` passed.
- `npm run build` passed.
- `npm run test:local` passed with 123 tests total, 121 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Browser proof at `/mvp` through FastAPI returned `blocked_no_authenticated_evidence` with the precise blocker `No current OpenClaw browser tab is available. The user must manually sign in and leave the member portal tab open.`
- Browser operator proof at `/` loaded the same session from the `/mvp` proof link.
- Screenshot proof:
  - `/tmp/workerprototype_phase9f_fastapi_approved_blocker.png`,
  - `/tmp/workerprototype_phase9f_operator_linked_session.png`.
- The sourced-result branch remains externally gated by user-controlled authenticated member portal state in the dedicated OpenClaw profile.

Phase 9G production API facade hardening is acceptable when:

- FastAPI responses include an `x-request-id`.
- FastAPI error responses use a stable envelope with `detail`, `error.code`, `error.message`, `error.request_id`, and structured `error.details`.
- Protected facade routes are rate limited by user/scope, and unauthenticated public routes are rate limited by client IP/scope.
- Rate limits are configurable through environment variables.
- CORS uses explicit methods and headers and avoids local default origins in provider-auth mode unless deployment origins are configured.
- Health reports safe auth, CORS, task-registry, rate-limit, and source-grounding metadata without secrets.
- The async task registry can persist local task state when `WEFELLA_TASK_REGISTRY_PATH` is configured.
- Chat results include `facade.sourceGrounding` metadata summarizing source-pointer count, workflow, evidence status, approval/proposal state, and blocker status.
- Optional source-grounding enforcement can fail ungrounded healthcare answers without source pointers or a precise blocker.
- `/mvp` renders FastAPI error envelopes as readable user-facing errors.
- Existing Node/LangGraph/OpenClaw orchestration tests continue passing.

Phase 9G proof status:

- Implemented locally as of 2026-06-01.
- `python3 -m compileall -q project` passed.
- `python3 -m unittest project.tests.test_fastapi_facade -v` passed with 18 tests, 16 passed and 2 expected live-gated skips.
- `npm run test:facade` passed with 18 tests, 16 passed and 2 expected live-gated skips.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 18 tests against the running Node runtime.
- `node --check src/app/mvp.js` passed.
- `node --check src/app/app.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 8 tests.
- `npm run build` passed.
- `npm run test:local` passed with 123 tests total, 121 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Browser proof at `/mvp` showed FastAPI `0.1.0-phase9g-facade-hardening` connected to Node with 0 console errors.
- Screenshot proof: `/tmp/workerprototype_phase9g_mvp_facade_health.png`.

Phase 9H deployment and observability readiness is acceptable when:

- `GET /api/readiness` reports error-severity deployment checks for Node runtime, auth, CORS, task registry, rate limits, source grounding, and observability.
- Readiness returns `ready` when error-severity checks pass and `degraded` when an error-severity dependency fails.
- Health reports safe observability metadata without secrets.
- Optional JSONL observability export writes safe task lifecycle events without raw user ids, raw user messages, raw portal text, credentials, SSNs, passwords, screenshots, or document dumps.
- Validation errors do not echo raw submitted payload values.
- `.env.example` documents local, provider-auth, hardening, smoke, and observability settings.
- A runbook explains local startup, smoke checks, deployment posture, live OpenClaw gates, CI-friendly gates, and remaining deployment gaps.
- `npm run smoke:facade` verifies a running FastAPI facade with health, readiness, and unauthorized error-envelope checks.

Phase 9H proof status:

- Implemented locally as of 2026-06-01.
- `python3 -m compileall -q project` passed.
- `npm run test:facade` passed with 22 tests, 20 passed and 2 expected live-gated skips.
- `npm run smoke:facade` passed against the restarted Phase 9H FastAPI facade.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 22 tests against the running Node runtime.
- `node --check src/app/mvp.js` passed.
- `node --check src/app/app.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 8 tests.
- `npm run build` passed.
- `npm run test:local` passed with 123 tests total, 121 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Browser proof at `/mvp` showed Phase 9H and FastAPI `0.1.0-phase9h-deployment-observability` connected to Node with 0 console errors.
- Screenshot proof: `/tmp/workerprototype_phase9h_mvp_facade_health.png`.

Phase 10A user document upload and local extraction is acceptable when:

- `POST /api/uploads` requires bearer auth.
- Upload ownership is bound to the JWT subject.
- Unsupported file types are rejected.
- Oversized files are rejected.
- Allowed files are stored under a git-ignored local upload store.
- The API returns `upload_id`, status, filename, content type, byte size, and SHA-256 hash.
- The extraction result returns status, method, fields, confidence, blockers, source snippets, and a redacted safe preview.
- Text extraction works without a mock.
- PDF extraction uses a real PDF parser when available and fails closed with a blocker when unavailable.
- Image extraction uses real OCR when available and fails closed with a blocker when unavailable.
- Direct identifiers such as email, SSN, phone, and full member/subscriber identifiers do not appear in the safe preview.
- `GET /api/uploads/{upload_id}/extraction` returns only to the owning user.
- `/mvp` exposes file selection, document kind, upload action, extraction status, structured fields, and redacted preview.
- Health and readiness expose safe upload-store metadata without document contents.

Phase 10A proof status:

- Implemented locally as of 2026-06-01.
- `python3 -m compileall -q project` passed.
- `node --check src/app/mvp.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 8 tests.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 26 tests, 24 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 123 tests total, 121 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 26 tests against the running Node runtime.
- `npm run smoke:facade` passed after restarting FastAPI with version `0.1.0-phase10a-document-upload-extraction`.
- Browser proof at `/mvp` showed upload controls, working facade health, working local sign-in, and 0 console errors.
- Screenshot proof: `/tmp/workerprototype_phase10a_mvp_upload_ui.png`.
- Live API proof uploaded a real text benefits sample, extracted structured insurance fields, redacted email and SSN, and retrieved the extraction by upload id.

Phase 10B uploaded document grounded chat is acceptable when:

- `POST /api/chat` accepts `uploaded_document_ids`.
- Uploaded ids are resolved only for the authenticated owner.
- The Node/LangGraph runtime receives only safe extraction packets, not base64 bodies or raw full document dumps.
- LangGraph can use an uploaded extraction as read-only evidence without dispatching OpenClaw.
- The graph records uploaded-document context, evidence status, runtime/audit proof, and source pointers.
- The final answer cites the uploaded extraction source pointer and summarizes structured extracted fields.
- The answer does not claim payer contact, portal observation, credential handling, form submission, medical advice, or any OpenClaw worker action.
- `/mvp` exposes a clear user action to ask about the latest uploaded document.

Phase 10B proof status:

- Implemented locally as of 2026-06-01.
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `node --check src/app/mvp.js` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/uploaded-document-chat.test.mjs` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 8 tests.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 27 tests, 25 passed and 2 expected live-gated skips.
- `node --check src/server/server.mjs` passed.
- `npm run build` passed.
- `npm run test:local` passed with 124 tests total, 122 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 27 tests against the restarted Node runtime.
- `npm run smoke:facade` passed against FastAPI version `0.1.0-phase10b-uploaded-document-grounded-chat`.
- Live API proof uploaded a text benefits sample, chatted with `uploaded_document_ids`, completed `eligibility_benefits_navigation`, created one source pointer, and limited actions to `read_uploaded_document_extraction`.
- Browser proof at `/mvp` showed Phase 10B, upload controls, `Ask About Upload`, FastAPI-first sign-in, and a completed FastAPI/LangGraph chat run.
- Screenshot proof: `/tmp/workerprototype-openclaw-phase10b-mvp-proof.png`.

Phase 10C uploaded document citations and Graphiti recall is acceptable when:

- Uploaded-document source pointers include a stable source kind, display label, extraction metadata, structured evidence fields, and source spans.
- `/mvp` renders citation/source detail cards for the latest sourced answer.
- `/mvp` renders product-memory recall/retain status and recalled facts when present.
- Product-memory safe episodes sanitize uploaded-document fields and snippets before Graphiti retain.
- Product-memory safe episodes continue to handle portal evidence pointers whose `evidenceFields` are object-shaped.
- Real Graphiti retain/recall proves a document-grounded answer can be recalled across sessions.

Phase 10C proof status:

- Implemented locally as of 2026-06-01.
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `node --check src/concierge/productMemory.mjs` passed.
- `node --check src/app/mvp.js` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/uploaded-document-chat.test.mjs` passed.
- `node --test src/tests/product-memory-contract.test.mjs` passed with 4 tests.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 8 tests.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 27 tests, 25 passed and 2 expected live-gated skips.
- `npm run test:memory:graphiti` passed with 2 real Graphiti/FalkorDB tests.
- `npm run build` passed.
- `npm run test:local` passed with 125 tests total, 123 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 27 tests against the restarted Node runtime.
- `npm run smoke:facade` passed against FastAPI version `0.1.0-phase10c-citations-memory-recall`.
- Live HTTP proof uploaded a text benefits sample, chatted with `uploaded_document_ids`, created an uploaded-document source pointer with fields/spans, and retained the answer in Graphiti with recall facts present.
- Browser proof at `/mvp` showed Phase 10C, `Source + Memory Loop`, upload controls, `Ask About Upload`, FastAPI-first sign-in, and 0 console errors.
- Screenshot proof: `/tmp/workerprototype-openclaw-phase10c-mvp-source-memory.png`.

Phase 10D session history, feedback, and export is acceptable when:

- `GET /api/sessions/{session_id}` returns only the authenticated user's session history, latest state, source pointers, and feedback records.
- `POST /api/feedback` persists feedback linked to the session, optional message id, optional task id, answer hash, rating, and source-pointer count.
- `GET /api/sessions/{session_id}/export` returns a Markdown answer/checklist export with date, session id, latest answer, and stored source-pointer context.
- Cross-user session history and feedback attempts are rejected.
- Feedback comments and export content mask direct identifiers before persistence/return.
- `/mvp` exposes Load History, Feedback, and Export controls through the FastAPI-first route.
- Operator trace includes feedback items for the same session.
- `npm run test:local` includes the continuity test file.

Phase 10D proof status:

- Implemented locally as of 2026-06-01.
- `node --check src/concierge/sessionContinuity.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/mvp.js` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/session-continuity.test.mjs` passed with 2 tests.
- `node --test src/tests/uploaded-document-chat.test.mjs` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 8 tests.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 29 tests, 27 passed and 2 expected live-gated skips.
- `npm run build` passed.
- Updated `npm run test:local` passed with 127 tests total, 125 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 29 tests against the restarted Node runtime.
- `npm run smoke:facade` passed against FastAPI version `0.1.0-phase10d-session-feedback-export`.
- Live HTTP proof created a session, uploaded a benefits document, chatted with `uploaded_document_ids`, loaded history with 2 messages and 1 source pointer, recorded useful feedback, and exported Markdown with latest answer/checklist.
- Browser proof at `/mvp` showed Phase 10D continuity controls, completed FastAPI-first sign-in/chat, loaded history, recorded feedback, exported the answer, and produced 0 console errors.
- Screenshot proof: `/tmp/workerprototype-openclaw-phase10d-continuity.png`.

Phase 10E operator research API and dashboard foundation is acceptable when:

- `research_runs` and `research_run_events` exist in the local schema.
- `knowledge_sources` supports operator proposal, review, priority, metadata, and last-run status fields.
- Node exposes research endpoints for KPIs, sources, source proposal/review/update, runs, run detail/events, cancel, and retry.
- FastAPI exposes protected proxy routes for the same research operations.
- FastAPI binds `actorUserId` to the JWT subject and rejects actor mismatch.
- Manual research runs create real queue/event/audit records rather than canned output.
- Rejected or pending sources cannot be run.
- Retry records link back to the original run.
- `/` exposes the operator research console and can start a manual run without bypassing LangGraph/OpenClaw product runtime rules.

Phase 10E proof status:

- Implemented locally as of 2026-06-01.
- `node --check src/concierge/researchOps.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/research-ops.test.mjs` passed with 2 tests.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 9 tests.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 31 tests, 29 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 130 tests total, 128 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 31 tests against the running Node runtime.
- `npm run smoke:facade` passed against FastAPI version `0.1.0-phase10e-operator-research-api`.
- Live HTTP proof through FastAPI proposed and approved a unique source, queued a run, read events, cancelled the run, and retried it with `retryOfRunId`.
- Browser proof at `/` loaded Phase 10E source cards and created a queued manual research run with event detail.
- Screenshot proof:
  - `/tmp/workerprototype-openclaw-phase10e-operator-research.png`
  - `/tmp/workerprototype-openclaw-phase10e-research-run-detail.png`

Phase 10F operator/admin RBAC for research facade routes is acceptable when:

- FastAPI JWT principals include normalized roles from common provider claims: `roles`, `role`, `groups`, `permissions`, `scope`, and `scp`.
- Local-session tokens default to user role only.
- All FastAPI `/api/research/*` routes require `operator` or `admin`.
- User-facing facade routes remain accessible to normal authenticated users.
- Health metadata reports RBAC support without exposing secrets.
- Plain user tokens receive 403 on research routes.
- Operator tokens can access research routes and still have `actorUserId` bound to the JWT subject.
- Admin tokens can access research routes.
- Actor mismatch still fails after role authorization.

Phase 10F proof status:

- Implemented locally as of 2026-06-01.
- `python3 -m compileall -q project` passed.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 31 tests, 29 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 130 tests total, 128 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 31 tests against the running Node runtime.
- `npm run smoke:facade` passed against FastAPI version `0.1.0-phase10f-rbac-operator-routes`.
- Live HTTP RBAC proof against `http://127.0.0.1:8000/api/research/kpis` passed:
  - plain user token: 403 `Operator role required.`
  - operator token: 200
  - admin scope token: 200

Phase 10G approved research run execution and worker status is acceptable when:

- `research_artifacts` stores execution artifacts with run/source pointers, artifact type, source URL, title, content hash, extraction hash, safe preview, citation status, and metadata.
- Deterministic fetch execution works only for approved/active HTTP(S) sources.
- Deterministic fetch stores a raw artifact file under the configured git-ignored artifact directory.
- Event timeline records execution started/completed/failed states.
- Audit records execution lifecycle without raw source text or raw identifiers.
- Safe previews redact direct identifiers.
- MockWorker mode is visible, explicit, untrusted, and terminal.
- OpenClaw and Hermes research modes are visible as future feature-gated modes, not silently implied.
- FastAPI protects worker-status and execute routes with operator/admin RBAC.
- `/` operator dashboard exposes worker status, execute fetch, MockWorker, and artifact proof.

Phase 10G proof status:

- Implemented locally as of 2026-06-01.
- `node --check src/concierge/researchOps.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/research-ops.test.mjs` passed with 4 tests.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 9 tests.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 31 tests, 29 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 132 tests total, 130 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Restarted local Node and FastAPI services in tmux session `workerprototype_openclaw_phase10g`.
- FastAPI health reported version `0.1.0-phase10g-research-execution`.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 31 tests against the running Node runtime.
- `npm run smoke:facade` passed against FastAPI version `0.1.0-phase10g-research-execution`.
- Live HTTP proof through FastAPI passed:
  - worker status returned `deterministic_fetch` default and MockWorker enabled,
  - source proposal and approval succeeded,
  - manual run queued,
  - deterministic execution completed,
  - one `deterministic_fetch_text` artifact returned with `extracted_pending_review` citation status and redacted safe preview.
- Browser proof at `/` rendered the Phase 10G Operator Research Console and Worker Status panel with 0 console errors.
- Screenshot proof:
  - `/tmp/workerprototype-openclaw-phase10g-research-worker-status.png`

Phase 10H research citation review and trusted evidence search is acceptable when:

- Fetched deterministic artifacts remain `extracted_pending_review` until operator review.
- A reviewed artifact can become `trusted_retrieval_approved`.
- A rejected or unsuitable artifact can become `quarantined`.
- `mock_worker_untrusted` artifacts cannot be approved for trusted retrieval.
- Default evidence search returns only `trusted_retrieval_approved` artifacts.
- Search clearly reports when matching artifacts exist only in pending review.
- Review events are visible in the run timeline.
- Review audit rows are written without raw source text.
- FastAPI protects artifact list, review, search, and evidence routes with operator/admin RBAC.
- `/` operator dashboard exposes artifact review and trusted evidence search without turning pending artifacts into trusted user evidence.

Phase 10H proof status:

- Implemented locally as of 2026-06-01.
- `node --check src/concierge/researchOps.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/research-ops.test.mjs` passed with 5 tests.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 9 tests.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 31 tests, 29 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 133 tests total, 131 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 31 tests.
- `npm run smoke:facade` passed against FastAPI version `0.1.0-phase10h-citation-review`.
- Live HTTP proof confirmed pending artifacts are not trusted before review and become searchable only after approval.
- Browser proof confirmed `/` exposes Search Evidence and Review Artifacts controls with 0 console errors.

Phase 10I trusted research evidence in user answers is acceptable when:

- User-facing LangGraph chat searches reviewed research evidence only after deterministic policy gates pass.
- Only `trusted_retrieval_approved` artifacts become source pointers in user answers.
- Pending-review artifacts are reported as unavailable/blocked and their content is not quoted.
- Missing trusted evidence produces a grounded refusal/escalation response rather than an unsourced healthcare answer.
- Source pointers identify `research_artifacts/{artifactId}` and include source URL, content hash, extraction hash, citation status, confidence, score, and reviewed snippet.
- FastAPI `/api/chat` can return `captured_trusted_research_evidence` with a final answer grounded in reviewed artifacts.
- `/mvp` displays the answer, source pointer cards, FastAPI task/trace proof, and no raw fixture email.
- `/` keeps the operator research review/search controls visible for the same evidence pipeline.

Phase 10I proof status:

- Implemented locally as of 2026-06-01.
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/langgraph-runner.test.mjs` passed with 12 tests.
- Focused runtime/UI/document suites passed.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 31 tests, 29 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 135 tests total, 133 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- After UI label refresh, `node --test src/tests/chat-ui-contract.test.mjs` passed with 9 tests and `npm run build` passed.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 31 tests.
- `npm run smoke:facade` passed against FastAPI version `0.1.0-phase10i-research-grounded-answers`.
- Live HTTP proof confirmed a reviewed fixture artifact was used by `/api/chat` as trusted research evidence.
- Browser proof confirmed `/mvp` renders Phase 10I, `Trusted Research Answers`, citation/source pointer cards, and 0 console errors.
- Browser proof confirmed `/` renders the Phase 10I operator research console controls and 0 console errors.

Phase 10J operator natural-language proposal gate is acceptable when:

- Operator assistant tools are registered in a fixed allowlist.
- Read-only requests execute directly only through registered read tools.
- Write/action requests create `operator_tool_proposals` and do not mutate target tables before approval.
- Proposal records include actor, tool key, risk level, expected effect, argument hash, message hash/preview, status, approval requirement, and execution count.
- Rejections produce no target mutation and keep `actionsTaken: []`.
- Approvals execute exactly once using the stored tool and stored arguments.
- Re-approving or re-deciding an executed/rejected proposal fails closed.
- Unsupported arbitrary execution requests are refused.
- FastAPI operator routes require operator/admin RBAC and bind `actorUserId` to the authenticated subject.
- `/` exposes assistant tools, free-text request, proposal list, proposal approve/reject controls, and visible action status.

Phase 10J proof status:

- Implemented locally as of 2026-06-01.
- `node --check src/concierge/operatorAssistant.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `node --test src/tests/operator-assistant.test.mjs` passed with 5 tests.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 9 tests.
- `node --test src/tests/database.test.mjs` passed.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 140 tests total, 138 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Browser proof confirmed `/` renders Phase 10J assistant controls, loads 7 read tools and 9 gated write tools, executes read-only `research.searchEvidence`, and renders a pending proposal card with approve/reject controls.

Phase 10K scheduled research automation is acceptable when:

- Research schedules are persisted in `research_schedules`.
- Schedule records include actor, approved source binding when present, workflow/topic/query, worker mode, interval, status, approval status, next run, last run, run count, and metadata.
- Due ticks process only active approved schedules.
- Due ticks queue `scheduled_research_run` records by default and do not silently execute worker actions.
- Schedule creation/pause/resume/run-due can be reached through the fixed operator tool registry and remains proposal-gated when driven by natural language.
- Missing approved sources fail closed with blocked schedule audit proof.
- Node and FastAPI expose schedule list and due-tick routes.
- FastAPI schedule routes require operator/admin RBAC and actor binding.
- `/` shows schedule counts, schedule cards, and due-tick proof.

Phase 10K proof status:

- Implemented locally as of 2026-06-01.
- `node --check src/concierge/researchOps.mjs` passed.
- `node --check src/concierge/operatorAssistant.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `node --test src/tests/research-ops.test.mjs` passed with 6 tests.
- `node --test src/tests/operator-assistant.test.mjs` passed with 6 tests.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 9 tests.
- `node --test src/tests/database.test.mjs` passed.
- `python3 -m compileall -q project` passed.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run test:facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 142 tests total, 140 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Browser proof confirmed `/` renders Phase 10K controls, loads approved schedules, and queues one scheduled research run from Run Due.

Phase 10L audit log API and dashboard is acceptable when:

- `GET /api/audit` returns audit events without raw `details`.
- Returned audit events include event id, session id, event type, action kind, created timestamp, event hash, previous event hash, details hash, chain version, and a redacted/truncated details preview.
- The response reports event-type counts, pagination, safety metadata, and visible-chain verification.
- Direct identifiers in stored audit details are redacted from details previews.
- FastAPI protects `GET /api/audit` with operator/admin RBAC and binds the authenticated actor in the proxied request.
- `/` exposes Audit Log controls and renders chain status plus event cards.

Phase 10L proof status:

- Implemented locally as of 2026-06-01.
- `node --check src/concierge/audit.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/audit-integrity.test.mjs` passed with 2 tests.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 9 tests.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run test:facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 143 tests total, 141 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Browser proof confirmed `/` renders Phase 10L, loads redacted research audit events through Audit Log, and shows `chain valid`, `raw details hidden`, event hashes, and details hashes.

Phase 10M embedding route and reindexing is acceptable when:

- An embedding route is persisted with provider, model, dimensions, status, selector, timestamp, and metadata.
- The default local route works without external credentials.
- Optional OpenAI route selection is explicit and fails safely when the required API key is absent.
- Reindexing creates a job record with status, artifact count, indexed count, skipped count, failure reason, metadata, and audit proof.
- Only `trusted_retrieval_approved` artifacts are indexed.
- Pending, quarantined, rejected, and MockWorker artifacts do not enter the trusted embedding index.
- Dimension mismatch blocks reindex safely and does not silently delete or replace prior active index rows.
- Existing active rows are superseded only after a successful reindex.
- Trusted evidence search reports embedding route status plus lexical and embedding scores.
- FastAPI protects embedding status/route/reindex routes with operator/admin RBAC and actor binding.
- Operator assistant exposes embedding status as a read tool and route/reindex as approval-gated write tools.
- `/` shows embedding status, route controls, reindex controls, and embedding proof in search results.

Phase 10M proof status:

- Implemented locally as of 2026-06-01.
- `node --check src/concierge/researchOps.mjs` passed.
- `node --check src/concierge/operatorAssistant.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `node --test src/tests/research-ops.test.mjs` passed with 8 tests.
- `node --test src/tests/operator-assistant.test.mjs` passed with 7 tests.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 9 tests.
- `node --test src/tests/research-ops.test.mjs src/tests/chat-ui-contract.test.mjs` passed with 17 tests.
- `npm run test:facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 146 tests total, 144 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Browser proof confirmed `/` renders Phase 10M, loads the local embedding route, reindexes 3 trusted artifacts, shows 0 stale trusted artifacts after reindex, and displays `approved evidence only`.

Phase 10N adaptive research worker dispatch is acceptable when:

- `/api/research/worker-status` shows deterministic fetch, MockWorker, OpenClaw, and Hermes modes.
- OpenClaw and Hermes modes are disabled by default and name their required feature flags.
- OpenClaw and Hermes dispatch requires:
  - approved source,
  - queued/running research run,
  - explicit `approvedWorkerDispatch=true`,
  - selected worker feature flag enabled.
- OpenClaw and Hermes receive a typed `brainstyworkers.research_worker_task.v1` envelope.
- The envelope constrains the worker to approved-source, read-only research and records disallowed credential/auth-bypass/form-submit/payer-contact/external-message/record-change/medical-advice actions.
- Unstructured worker output fails closed with a failed run and audit proof.
- Structured worker output creates a `*_research_worker_result` artifact with citation status `extracted_pending_review`.
- Adaptive worker artifacts do not appear in trusted retrieval or embedding indexes until the existing artifact review gate approves them.
- Dispatch request and run completion/failure events are audit-logged without raw source text.
- FastAPI proxies the execute route behind operator/admin RBAC and forwards the authenticated actor plus the explicit dispatch approval flag.
- `/` shows OpenClaw/Hermes controls only as operator actions; the frontend still never calls workers directly.

Phase 10N proof status:

- Implemented locally as of 2026-06-01.
- Focused syntax checks passed for researchOps, operatorAssistant, server, and app.
- Focused research tests passed with 9 tests, including adaptive worker approval and pending-review artifact behavior.
- Focused operator/UI tests passed with 16 tests.
- FastAPI facade tests passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run test:facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 147 tests total, 145 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- API proof for `GET /api/research/worker-status` returned the Phase 10N version, OpenClaw/Hermes adapters, typed envelope, approval gate, and review-required status.
- Browser proof confirmed `/` renders Phase 10N, Worker Status shows bounded feature-gated OpenClaw/Hermes modes, and queued run cards show OpenClaw/Hermes buttons.

Phase 10O research evidence graph is acceptable when:

- The local schema includes `research_graph_builds`.
- Node exposes:
  - `GET /api/research/graph`,
  - `POST /api/research/graph/build`.
- FastAPI proxies both graph endpoints behind operator/admin RBAC and binds `actorUserId` to the authenticated operator.
- `GET /api/research/graph` returns a safe graph object with:
  - `nodes`,
  - `edges`,
  - summary counts,
  - latest build metadata,
  - safety flags.
- The graph includes relationships across sources, runs, artifacts, workflows, schedules, and embedding routes when those records exist.
- The graph response does not return raw artifact text, artifact file contents, raw portal dumps, or raw safe text previews.
- Graph source URL metadata is limited to host/hash style metadata inside the graph, not raw private/portal dumps.
- `POST /api/research/graph/build` persists a build row with actor, status, node count, edge count, graph hash, safety JSON, and audit event id.
- Graph builds write hash-chained audit events.
- Operator assistant exposes `research.getGraph` as read-only and `research.buildGraph` as proposal-gated write action.
- `/` shows Phase 10O graph controls and renders node/edge counts plus metadata-only safety state.

Phase 10O proof status:

- Implemented locally on 2026-06-01.
- Focused syntax checks passed for researchOps, operatorAssistant, server, app, and build-check.
- Focused test gate passed:
  - `node --test src/tests/research-ops.test.mjs src/tests/operator-assistant.test.mjs src/tests/chat-ui-contract.test.mjs` with 27/27 tests.
  - `npm run test:facade` with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 149 tests total, 147 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- API graph proof passed:
  - latest graph status `ready`,
  - 34 nodes,
  - 54 edges,
  - 3 trusted artifacts,
  - 1 pending artifact,
  - metadata-only safety flags true/false as expected,
  - completed build/audit row persisted.
- Browser proof at `/` passed:
  - graph controls render,
  - node/edge counts render,
  - latest build status renders as completed,
  - safety JSON renders without raw artifact text,
  - `Build Graph` creates a completed audited build.

Phase 10P claim-level citation closure is acceptable when:

- The local schema includes `research_claim_evaluations`.
- Node exposes:
  - `GET /api/research/citation-closure`,
  - `POST /api/research/citation-closure/evaluate`.
- FastAPI proxies both citation-closure endpoints behind operator/admin RBAC and binds `actorUserId` to the authenticated operator.
- The evaluator extracts factual/domain claims from a safe answer preview.
- The evaluator compares claims only against `trusted_retrieval_approved` research artifacts.
- Each claim receives a label:
  - `supported`,
  - `low_confidence`,
  - `unsupported`.
- Supported claims include metadata-only citation pointers to reviewed artifacts.
- Unsupported or low-confidence claims make the answer fail citation closure.
- Pending-review artifacts cannot support a trusted answer.
- The evaluator does not create research artifacts, approve artifacts, index artifacts, or invent factual evidence.
- Audit events contain hashes/counts and do not expose raw unsupported claim text.
- Operator assistant exposes `research.listCitationClosure` as read-only and `research.evaluateCitationClosure` as proposal-gated.
- `/` shows Phase 10P citation-closure controls, latest evaluation status, claim labels, counts, safety flags, actions taken, and citation pointer ids.

Phase 10P proof status:

- Implemented locally on 2026-06-01.
- Focused syntax checks passed for researchOps, operatorAssistant, server, app, and build-check.
- Focused test gate passed with 29/29 tests for research ops, operator assistant, and chat UI contract.
- `npm run build` passed.
- `npm run test:facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run test:local` passed with 151 tests total, 149 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- API citation-closure proof passed:
  - latest status `citation_closure_failed`,
  - verdict `unsupported_claims_found`,
  - 2 claims,
  - 1 supported,
  - 1 unsupported,
  - audit event `audit_a190bf89-86a1-4752-9d4e-eb5f61ef6d4a`,
  - labels-only safety flags.
- Browser proof at `/` passed:
  - Phase 10P rendered,
  - `Judge Citations` created a claim evaluation,
  - Claim Citation Closure rendered supported and unsupported claim labels,
  - citation artifact ids rendered for the supported claim,
  - safety and action proof rendered.
- Browser proof saved at `artifacts/phase10p-citation-closure-browser-proof.png`.

Phase 10Q final-system verification matrix is acceptable when:

- `docs/FINAL_SYSTEM_VERIFICATION_REPORT.md` exists.
- Every explicit `A*` through `G*` requirement id from `docs/goal_final_system.md` has one report row.
- Minimum gate items `H1` through `H24` have report rows.
- Report statuses use only:
  - `PASSING`,
  - `IMPLEMENTED DURING THIS RUN`,
  - `BLOCKED BY EXTERNAL DEPENDENCY`,
  - `FAILING / NEEDS FIX`.
- The report includes both remaining failures and external blockers instead of pretending the final goal is complete.
- The report identifies the next highest-priority phase.
- `npm run build` requires the report to exist and contain the main failing/blocker categories.

Phase 10Q proof status:

- Implemented locally on 2026-06-01.
- Added `docs/FINAL_SYSTEM_VERIFICATION_REPORT.md`.
- Added `src/tests/final-system-verification-report.test.mjs`.
- Updated `npm run test:local` to include the new report coverage test.
- Updated `npm run build` guard to require the report and important blocker/failure fragments.
- The focused report test passed with 2/2 tests.
- `npm run build` passed with the Phase 10Q report guard.
- `npm run test:facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run test:local` passed with 153 tests total, 151 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- The report currently shows:
  - 112 `PASSING`,
  - 0 `IMPLEMENTED DURING THIS RUN` requirement rows,
  - 2 `BLOCKED BY EXTERNAL DEPENDENCY`,
  - 18 `FAILING / NEEDS FIX`.

## Phase 10R Urgent/Emergency Human Handoff Acceptance

Phase 10R is acceptable when:

- Urgent/emergency prompts are detected by deterministic input policy before normal workflow execution.
- Structured intent returns `urgent_emergency_escalation` and routes to `human_approval_escalation`.
- LangGraph creates a durable `human_handoff_items` row and an `urgent_human_handoff` task.
- The run records `human_handoff_created` in the hash-chained audit log.
- The user receives immediate emergency-safe guidance.
- OpenClaw proposal/dispatch, browser evidence observation, payer contact, external messaging, credential entry, form submission, and GPT calls are skipped for the urgent run.
- `/api/handoffs`, FastAPI facade proxying, session continuity, `traceForSession`, `/mvp`, and `/` expose the handoff state.
- Urgent/safety prompts are not retained verbatim as reusable prompt-recall memory.

Phase 10R proof status:

- Implemented locally on 2026-06-01.
- `node --test src/tests/policy.test.mjs src/tests/structured-intent-classifier.test.mjs src/tests/langgraph-runner.test.mjs src/tests/chat-ui-contract.test.mjs` passed with 36/36 tests.
- `node --test src/tests/database.test.mjs src/tests/session-continuity.test.mjs src/tests/final-system-verification-report.test.mjs` passed with 5/5 tests.
- `npm run test:facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run build` passed with the urgent handoff build guard.
- `npm run test:local` passed with 157 tests total, 155 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Final verification report now records:
  - 115 `PASSING`,
  - 0 `IMPLEMENTED DURING THIS RUN` requirement rows,
  - 2 `BLOCKED BY EXTERNAL DEPENDENCY`,
  - 15 `FAILING / NEEDS FIX`.

## Phase 10S AI2UI Blocks And MVP Modes Acceptance

Phase 10S is acceptable when:

- LangGraph returns backend-provided typed AI2UI blocks using contract `brainstyworkers.ai2ui.blocks.v1`.
- Blocks cover answer, workflow, approval gate, worker status, source citations, product memory, human handoff, safety notice, and next steps.
- Unknown or future block types render as visible safe fallback cards rather than breaking or disappearing.
- `/mvp` exposes Chat, Split, Guided, and Bento mode controls.
- Switching modes preserves the same user, session, conversation history, latest graph run, approval state, worker state, source pointers, handoff state, memory state, and operator proof link.
- Switching modes does not call auth-start, rerun chat, consume approval tokens, create worker continuations, dispatch OpenClaw/Hermes, or retain memory.
- The final verification report moves A6 and A7 to `PASSING`.

Phase 10S proof status:

- Implemented locally on 2026-06-01.
- `node --check src/concierge/ai2uiBlocks.mjs` passed.
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `node --check src/app/mvp.js` passed.
- `node --check src/server/build-check.mjs` passed.
- `node --test src/tests/ai2ui-blocks.test.mjs src/tests/chat-ui-contract.test.mjs src/tests/langgraph-runner.test.mjs` passed with 24/24 tests.
- `npm run build` passed.
- `npm run test:facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run test:local` passed with 159 tests total, 157 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- `/mvp` browser proof passed with Chat, Guided, Bento, and Split modes preserving session `session_cc33e568-4612-4b88-bd35-29d06e8220d5`, rendering typed blocks, and producing 0 console errors.

## Phase 10T Research Scheduler Daemon Acceptance

Phase 10T is acceptable when:

- `research_scheduler_daemon_state` persists daemon status, enabled flag, interval, tick limit, last tick, last success/failure, last actions, tick count, and overlap skips.
- The Node server creates the daemon at startup and auto-starts it only when `BRAINSTY_RESEARCH_SCHEDULER_ENABLED=1`.
- The daemon processes schedules only through `runDueResearchSchedules`.
- Only active approved schedules with approved/active sources are queued.
- Default daemon behavior queues `scheduled_research_run` records and does not silently execute worker dispatch.
- Adaptive OpenClaw/Hermes dispatch remains feature-flagged and requires explicit `approvedWorkerDispatch=true`.
- Daemon start/tick/failure/overlap events are visible through `runtime_events`.
- Daemon tick completion/failure/overlap is hash-chain audit visible.
- Overlapping ticks are skipped with no duplicate due-run queueing.
- Node exposes `GET /api/research/scheduler/status` and `POST /api/research/scheduler/tick`.
- FastAPI proxies both routes behind operator/admin RBAC and actor binding.
- `/` shows scheduler daemon status, cadence, due schedule counts, last tick, last actions, overlap count, and approved-schedule safety.

Phase 10T proof status:

- Verified locally on 2026-06-01:
  - `node --check src/concierge/researchScheduler.mjs` passed.
  - `node --check src/server/server.mjs` passed.
  - `node --check src/app/app.js` passed.
  - `python3 -m compileall -q project` passed.
  - `node --test src/tests/research-scheduler.test.mjs src/tests/research-ops.test.mjs src/tests/chat-ui-contract.test.mjs` passed with 24/24 tests.
  - `npm run build` passed.
  - `npm run test:facade` passed with 32 tests and 2 expected live-gated skips.
  - `npm run test:local` passed with 163 total, 161 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
  - Browser/API proof on `/` passed with scheduler daemon status, one daemon-queued scheduled run, approved-schedule-only safety, and 0 console errors. Screenshot: `artifacts/phase10t-research-scheduler-daemon-browser-proof.png`.

## Phase 10V Dynamic Skill UI Exposure Acceptance

Phase 10V is acceptable when:

- `/mvp` shows dynamic skill resolution after a workflow run.
- `/mvp` includes a visible sequence step for skill resolution.
- `/mvp` renders selected insurance skill, selected journey skill, selected execution skill, success estimate, missing data, required OpenClaw tasks, required search, and required APIs.
- `/` operator dashboard renders the same dynamic skill proof in workflow/operator proof.
- The OpenClaw envelope validation panel renders dynamic skill proof beside proposal-only validation.
- `POST /api/openclaw/skills/insurance_portal_browser/validate-envelope` returns `dynamicSkillContext`.
- UI contract tests prove the dynamic skill proof surface remains present.
- Dynamic skill server tests continue to prove resolver output comes from LangGraph state and skill artifacts.

Phase 10V proof status:

- Verified locally on 2026-06-03:
  - `node --check src/app/app.js` passed.
  - `node --check src/app/mvp.js` passed.
  - `node --check src/server/server.mjs` passed.
  - `node --test src/tests/chat-ui-contract.test.mjs src/tests/dynamic-skill-server.test.mjs` passed with 15/15 tests.
  - `node --test src/tests/openclaw-api.test.mjs` passed with 1/1 test.
  - `npm run build` passed.
  - Browser proof on `/mvp` showed `insurance_plan_aetna_temporary`, `claim_journey_temporary`, `insurance_portal_browser`, success estimate, missing data, and worker tasks.
  - Browser proof on `/` after `Validate Envelope` showed the dynamic skill card and proposal status.
- Final verification report now records:
  - 117 `PASSING`,
  - 0 `IMPLEMENTED DURING THIS RUN` requirement rows,
  - 2 `BLOCKED BY EXTERNAL DEPENDENCY`,
  - 13 `FAILING / NEEDS FIX`.

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

## Server Connector + Next Mobile MVP Acceptance

This cycle is acceptable when:

- FastAPI exposes `/api/v1/sessions`, `/api/v1/tasks`, `/api/v1/tasks/{task_id}`, `/api/v1/tasks/{task_id}/events`, `/api/v1/tasks/{task_id}/approvals`, `/api/v1/documents`, `/api/v1/openclaw/readiness`, `/api/v1/browser/sessions`, `/api/v1/browser/sessions/{browser_session_id}/stream`, `/api/v1/browser/sessions/{browser_session_id}/input`, `/api/v1/browser/sessions/{browser_session_id}/takeover`, and `/api/v1/proof/runs/{run_id}`.
- The v1 connector normalizes task status into `queued`, `running`, `approval_pending`, `evidence_blocked`, `completed`, `refused`, or `failed`.
- The v1 task status returns connector-safe answer, proposal, source pointer, AI2UI block, event, and error fields.
- Browser session creation goes through a sandbox provider contract and stores user/session ownership before streaming or input relay.
- Browser takeover/input remains human-approved and cannot be used across bearer-token users.
- The Next.js mobile app scaffold calls only `/api/v1` endpoints and contains no direct Node `/api/chat`, `/api/runtime/browser`, database, OpenClaw, or memory calls.
- The operator dashboard renders connector goals, checks, scores, visual gates, and safety boundaries.
- Visual success requires screenshots for `/`, `/mvp`, and the mobile PWA, including proof that the PWA live worker block renders a browser frame through `/api/v1`.

Current proof status:

- Syntax checks passed for `project`, `src/server/server.mjs`, and `src/app/app.js`.
- UI contract tests passed for the dashboard connector panel and Next.js connector-only client.
- FastAPI facade tests passed with v1 session/task/proof/browser/approval coverage.
- `npm run build` in `apps/mobile-next` passed.
- `npm audit --audit-level=moderate` in `apps/mobile-next` found 0 vulnerabilities.
- `npm run build` passed.
- `npm run test:local` passed with 202 total tests, 200 passed, 0 failed, and 2 expected live-gated OpenClaw skips.
- Browser proof passed for `/` and `/mvp` on a fresh local server at `http://127.0.0.1:4174`.
- Browser proof passed for the Next.js PWA at `http://127.0.0.1:3000/` with Session, Ask, Worker, and Live actions; the task completed; the live worker block rendered a `data:image/jpeg` frame; console errors were 0.
- Latest mobile screenshot: `/private/tmp/workerprototype-openclaw-mobile-pwa-visual/15-mobile-pwa-final-clean-live-frame.png`.

## Production Connector Docker Acceptance

This slice is acceptable when:

- `compose.yaml` defines separate services for Node runtime, FastAPI connector, Next.js mobile PWA, and FalkorDB.
- Dockerfiles exist for Node, FastAPI, and the mobile PWA.
- `.dockerignore` excludes secrets, local databases, build artifacts, `node_modules`, `.next`, `.venv-graphiti`, and local proof artifacts.
- The Node runtime container binds `HOST=0.0.0.0`, persists app data under `/app/data`, exposes `/api/health`, and includes the deployment proof files used by the dashboard.
- The FastAPI container talks to Node through `WEFELLA_NODE_RUNTIME_URL=http://node-runtime:4173` and exposes `/api/v1/health`.
- The mobile PWA container uses the FastAPI service boundary, not Node internals.
- Host ports can be overridden with `BRAINSTY_COMPOSE_NODE_PORT`, `BRAINSTY_COMPOSE_API_PORT`, `BRAINSTY_COMPOSE_MOBILE_PORT`, `BRAINSTY_COMPOSE_FALKORDB_PORT`, and `BRAINSTY_COMPOSE_FALKORDB_UI_PORT`.
- `npm run test:docker:contract`, `npm run docker:contract`, `docker compose build`, and a live compose health smoke pass.
- Visual proof shows the PWA can start a session and task through `/api/v1`, and the Live block shows either a browser frame or a clear remote-browser readiness blocker.
- The operator dashboard proof panel reports `compose_contract_present` and a passing deployment contract score.

Current proof status:

- Verified on 2026-06-15 with alternate host ports `4273`, `8100`, `3100`, `6480`, and `3101`.
- Node, FastAPI, and PWA containers reported healthy.
- FastAPI `/api/v1/health` returned `node_runtime_ok=true`.
- PWA visual flow passed with Session, Ask, Worker, and Live. Live correctly reported `official_openclaw_profile_not_ready` instead of hanging.
- Dashboard visual proof reported `docker_compose_contract=compose_contract_present` and `deployment_contract=75 / 75`.

## Product Memory Container Runtime Acceptance

This slice is acceptable when:

- The Node runtime image installs Python, creates `/app/.venv-graphiti`, and installs the project-local official Graphiti package from `vendor/getzep-graphiti` with FalkorDB extras.
- The Docker image verifies `graphiti_core` and the FalkorDB driver during build.
- `compose.yaml` passes OpenAI/Graphiti model env vars only through runtime environment and does not copy `.env` or `.env.local` into the image.
- `GRAPHITI_STORE_RAW_EPISODES` remains `"0"` in compose.
- `scripts/compose-memory-smoke.mjs` can run in disabled-safe mode or in required-ready mode.
- Required-ready mode proves Node health, FastAPI-to-Node health, Graphiti schema readiness, FalkorDB backend, raw episode storage disabled, and a safe retain/recall probe.
- Dashboard proof distinguishes disabled-safe memory from live `graphiti_schema_ready` memory and scores product-memory deployment at `100 / 100` only when schema readiness is true.

Current proof status:

- Verified on 2026-06-15 with the same alternate compose ports `4273`, `8100`, `3100`, `6480`, and `3101`.
- `npm run test:docker:contract` passed with the Graphiti compose contract included.
- `npm run docker:contract` passed.
- `docker compose up -d --build` rebuilt the Node runtime image with the Graphiti Python runtime.
- `BRAINSTY_EXPECT_GRAPHITI_READY=1 BRAINSTY_RUN_GRAPHITI_PROBE=1 npm run docker:memory:smoke` passed.
- The smoke reported `adapter=graphiti`, `schemaReady=true`, `backend=falkordb`, `rawEpisodeStorage=false`, replay queue empty, one retained episode, one recalled fact, and `cortexProductMemory=false`.
- Dashboard visual proof was saved to `artifacts/phase11-graphiti-container-dashboard-proof.png` and showed `product_memory_deployment=100 / 100`.

## Postgres Storage Deployment Profile Acceptance

This slice is acceptable when:

- `compose.yaml` defines a Postgres service with a health check, persistent data volume, configurable host port, and initialization SQL mount.
- The Node runtime container receives a redacted/reportable database profile: `BRAINSTY_DB_DRIVER`, `BRAINSTY_DATABASE_TARGET`, `BRAINSTY_DATABASE_URL`, and `BRAINSTY_POSTGRES_LIVE_READY`.
- The application runtime still defaults to the existing bound-parameter SQLite store until a Postgres adapter and migration tests are implemented.
- The dashboard/API storage readiness contract reports runtime driver, Postgres target, compose readiness, live smoke readiness, redacted database URL, and migration-pending state.
- `npm run storage:contract` passes.
- `npm run storage:postgres:smoke` passes against the running compose stack by writing and reading `brainsty_storage_readiness`.
- `npm run test:docker:contract`, `npm run build`, and `npm run test:local` remain green.

Current proof status:

- Verified on 2026-06-15 with alternate compose ports `4273`, `8100`, `3100`, `6480`, `3101`, and Postgres host port `55432`.
- `docker compose ps` showed Postgres, Node, FastAPI, PWA, and FalkorDB running, with Postgres, Node, FastAPI, and PWA healthy.
- `npm run storage:postgres:smoke` returned `brainstyworkers-postgres-live-smoke`, contract version `2026-06-15.postgres-storage-profile.v1`, and service `postgres`.
- The connector proof reported `storage.status=postgres_live_ready_sqlite_runtime`, `score=85`, `targetScore=100`, `appRuntimeMigratedToPostgres=false`, and `migrationPending=true`.
- Browser proof showed the Postgres storage goal, database storage check, database architecture score, live-ready status, and migration-pending state with 0 console errors. Screenshot: `artifacts/phase11-postgres-storage-dashboard-proof.png`.

## Postgres Runtime Adapter Parity Acceptance

This slice is acceptable when:

- The repository contains a real `pg`-based Postgres store adapter rather than shelling out to `psql`.
- SQLite remains the default runtime unless `BRAINSTY_DB_DRIVER=postgres` is explicitly set.
- The Postgres adapter supports schema initialization, bound parameters, high-level CRUD helpers, counts, and explicit transactions.
- Runtime smoke proves enrollment, session checkpointing, audit write, registry seed, and transaction rollback against live Docker Postgres.
- The dashboard/API storage readiness contract reports Postgres adapter version, runtime smoke readiness, and migration-pending state without claiming full production migration.
- `npm run test:db:postgres`, `npm run test:db:safety`, `npm run storage:postgres:runtime-smoke`, `npm audit --audit-level=moderate`, `npm run build`, and `npm run test:local` pass.

Current proof status:

- Verified on 2026-06-16 against live Docker Postgres on host port `55432`.
- `npm run storage:postgres:runtime-smoke` returned `driver=postgres`, adapter `2026-06-16.pg-bound-store-parity.v1`, 54 tables, registry seed rows, session checkpoint state version 2, hash-chain audit event, and `rollbackProved=true`.
- A temporary server booted on `http://127.0.0.1:4193` with `BRAINSTY_DB_DRIVER=postgres`.
- That server's `/api/health` reported `databaseDriver=postgres`, `storage.status=postgres_runtime_selected_parity_smoked`, `score=90`, `appRuntimeMigratedToPostgres=true`, `fullMigrationReady=false`, and `migrationPending=true`.
- The proof endpoint reported `database_product_ready_architecture=90 / 100` with status `postgres_adapter_parity_ready_runtime_migration_pending`.
- Docker Compose rebuilt successfully and reported healthy Node, FastAPI, mobile PWA, Postgres, and FalkorDB services.
- Compose Node health on `http://127.0.0.1:4273/api/health` reported `databaseDriver=sqlite`, storage status `postgres_adapter_parity_ready_sqlite_default`, `score=90`, `postgres.runtimeSmokeReady=true`, and `migrationPending=true`.
- `BRAINSTY_COMPOSE_NODE_PORT=4273 BRAINSTY_COMPOSE_API_PORT=8100 BRAINSTY_EXPECT_GRAPHITI_READY=1 npm run docker:memory:smoke` passed with Graphiti schema-ready product memory.
- Browser proof at `http://127.0.0.1:4273/?phase=postgres-runtime-adapter` displayed the database architecture score, `90 / 100`, Postgres adapter parity status, runtime smoke proof, and migration-pending state with 0 console errors. Screenshot: `artifacts/phase11-postgres-runtime-adapter-dashboard-proof.png`.

## Postgres Operational Readiness Acceptance

This slice is acceptable when:

- The database schema includes a `worker_leases` table.
- Worker lease helpers can atomically acquire, block competing active claimants, heartbeat, release, transfer after release, and sweep expired leases.
- Live Postgres production smoke proves endpoint-state parity, approval/audit/checkpoint writes, worker lease exclusion, and logical backup/restore into a fresh database.
- Storage readiness reports production smoke, worker lease, backup/restore, endpoint parity, and secret-profile gates separately.
- Database architecture score reaches `95 / 100` when operational gates pass but the managed-secret/default rollout gate remains pending.
- Database architecture score reaches `100 / 100` only when Postgres is selected as runtime and the secret profile gate is also proven.
- `npm run test:db:postgres`, `npm run test:db:safety`, `npm run storage:postgres:production-smoke`, `npm run storage:contract`, `npm run test:docker:contract`, and `npm run build` pass.

Current proof status:

- Verified on 2026-06-16 against live Docker Postgres on host port `55432`.
- `npm run storage:postgres:production-smoke` returned `ok=true`, adapter `2026-06-16.pg-bound-store-parity.v1`, lease version `2026-06-16.worker-leases.v1`, endpoint parity `ok=true`, worker lease `ok=true`, and backup/restore `ok=true`.
- The smoke created temporary source and restore databases, proved first worker acquire, second worker block while active, heartbeat, release, second acquire after release, and restored user/session/checkpoint/approval/audit/worker-lease rows.
- Backup/restore compared 17 non-empty tables, found no count mismatches, and wrote smoke-only artifact `artifacts/postgres-production-readiness-smoke.json`.
- Current database readiness is expected to report `95 / 100` with `secretProfileReady=false`; it must not report `100 / 100` until the managed-secret profile is proven.
- A temporary server booted on `http://127.0.0.1:4194` with `BRAINSTY_DB_DRIVER=postgres` and operational gate flags enabled but `BRAINSTY_DATABASE_SECRET_PROFILE_READY=0`.
- That server's `/api/health` reported `storage.status=postgres_runtime_selected_operational_gates_ready_secret_profile_pending`, `score=95`, `fullMigrationReady=false`, and `secretProfileReady=false`.
- Browser proof showed `database_product_ready_architecture=95 / 100` and the secret-profile-pending status with 0 console errors. Screenshot: `artifacts/phase11-postgres-operational-readiness-dashboard-proof.png`.

## Postgres Default Rollout And Secret Profile Acceptance

This slice is acceptable when:

- Runtime Postgres URL resolution supports a secret-backed profile through `BRAINSTY_DATABASE_URL_FILE` or an explicit managed-env source.
- Health/proof/dashboard surfaces never expose the raw database URL, raw password, or raw secret-file path.
- Direct `BRAINSTY_DATABASE_URL` without `BRAINSTY_DATABASE_SECRET_SOURCE=managed_env` does not satisfy the secret-profile gate.
- Storage readiness reports secret-profile and default-rollout gates separately.
- Database architecture score remains below `100 / 100` when operational gates and secret profile pass but the default rollout smoke is not rehearsed.
- Database architecture score reaches `100 / 100` only when:
  - `BRAINSTY_DB_DRIVER=postgres`,
  - operational Postgres gates are ready,
  - the database URL is secret-backed,
  - `BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY=1`.
- `npm run storage:postgres:default-rollout-smoke` passes against live Docker Postgres.
- A temporary server booted with the secret-file backed Postgres runtime reports `storage.status=postgres_production_ready`, `score=100`, `fullMigrationReady=true`, and `migrationPending=false`.
- Browser proof shows `database_product_ready_architecture=100 / 100`, `secretProfileReady=true`, and `defaultRolloutReady=true`.

Current proof status:

- Verified on 2026-06-16 against live Docker Postgres on host port `55432`.
- `npm run test:db:postgres` passed with 11/11 tests.
- `npm run test:db:safety` passed with 15/15 tests.
- `npm run storage:postgres:default-rollout-smoke` returned `storage.status=postgres_production_ready`, `score=100`, `fullMigrationReady=true`, `migrationPending=false`, `secretProfileReady=true`, and `defaultRolloutReady=true`.
- `npm run storage:postgres:production-smoke` still passed after the secret-aware URL resolution change.
- `npm run build` passed.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- A temporary server booted on `http://127.0.0.1:4195` with a secret-file backed Postgres URL and all DB gates enabled.
- The server's `/api/health` and `/api/proof/runs/postgres-default-rollout` reported `database_product_ready_architecture=100 / 100`.
- Browser proof showed the 100/100 database score with 0 console errors. Screenshot: `artifacts/phase11-postgres-default-rollout-dashboard-proof.png`.

## Postgres Docker-Secret Runtime Profile Acceptance

This slice is acceptable when:

- `compose.postgres.yaml` exists as a dedicated override and base `compose.yaml` still defaults to SQLite.
- The override selects `BRAINSTY_DB_DRIVER=postgres`, clears direct `BRAINSTY_DATABASE_URL`, and uses `BRAINSTY_DATABASE_URL_FILE=/run/secrets/brainsty_database_url`.
- The override marks `BRAINSTY_DATABASE_SECRET_SOURCE=docker_secret`.
- Real database secret files are ignored by Git and excluded from Docker build contexts.
- The override does not hardcode proof gates to `1`; readiness flags remain environment-controlled and smoke-gated.
- `npm run storage:postgres:profile-contract` passes.
- `node scripts/postgres-production-profile-contract.mjs` passes and validates the merged Docker Compose config when Docker is available.
- `npm run test:docker:contract` includes the production-profile contract tests.
- The dashboard/API proof includes `postgres_production_profile` and `database_deployment_profile`.

Current proof status:

- `npm run storage:postgres:profile-contract` passed.
- `node scripts/postgres-production-profile-contract.mjs` passed with `dockerConfig.ok=true`.
- Focused contract tests passed with 7/7 tests.
- `npm run test:docker:contract` passed with 10/10 tests.
- `npm run storage:contract`, `npm run build`, `npm run test:db:postgres`, `npm run test:db:safety`, and `npm run test:local` passed.
- Browser proof passed at `http://127.0.0.1:4196/?phase=postgres-production-profile` with 0 console errors.
- Dashboard proof showed `postgres_production_profile=postgres_docker_secret_runtime_profile_present` and `database_deployment_profile=100 / 100`.
- Screenshot: `artifacts/phase11-postgres-production-profile-dashboard-proof.jpg`.

## Postgres Profile Live Regression Acceptance

This slice is acceptable when:

- The repo contains endpoint-wide and live compose-profile smoke commands for the Postgres Docker-secret runtime profile.
- The endpoint regression smoke starts Node with Postgres selected and proves health, dashboard proof, OpenClaw skills, auth/session creation, memory context, chat, and skill-envelope validation without unapproved external/write actions.
- The live profile smoke starts `compose.yaml + compose.postgres.yaml` with a Docker-secret database URL and verifies Node, FastAPI, PWA, Postgres, and dashboard proof readiness.
- Health/proof artifacts do not write raw database URLs or raw secret-file paths.
- The operator dashboard shows the endpoint regression gate, live profile smoke gate, Postgres production-ready storage, and `database_deployment_profile=100 / 100`.
- The mobile PWA loads from the live profile stack and shows the regular-user journey/worker/evidence/answer surface.
- The temporary compose project and runtime secret directory are removed after visual proof.

Current proof status:

- `npm run storage:postgres:endpoint-regression-smoke` passed against live Docker Postgres.
- `BRAINSTY_PROFILE_SMOKE_KEEP_STACK=1 npm run storage:postgres:profile-live-smoke` passed with a temporary compose project using ports `4296`, `8296`, `3296`, `65432`, `6580`, and `3297`.
- The live smoke reported `databaseDriver=postgres`, `storage.status=postgres_production_ready`, `database_product_ready_architecture=100 / 100`, `database_deployment_profile=100 / 100`, FastAPI `nodeRuntimeOk=true`, PWA `/` status `200`, and no raw secret leakage.
- In-app browser verification passed for the dashboard at `http://127.0.0.1:4296/?phase=postgres-profile-live`; required proof strings were present and console error count was `0`.
- In-app browser verification passed for the PWA at `http://127.0.0.1:3296/`; regular-user Session, Journey, Worker, Evidence, and Answer surfaces were present and console error count was `0`.
- Screenshot artifacts:
  - `artifacts/phase12-postgres-profile-live-dashboard-proof.png`
  - `artifacts/phase12-postgres-profile-live-pwa-proof.png`
- The temporary compose project was torn down with volumes removed, `project/deployment/secrets/.runtime` was deleted, and ports `4296`, `8296`, `3296`, `65432`, `6580`, and `3297` were verified clear.

## Postgres Hosted Backup Runbook Acceptance

This slice is acceptable when:

- A provider-neutral backup/restore runbook exists for hosted Postgres operations.
- The runbook includes required inputs, backup schedule, RPO/RTO targets, restore rehearsal, incident restore, migration rollback, acceptance gate, and safety notes.
- `npm run storage:postgres:backup-runbook-smoke` validates the runbook and runs a restore rehearsal through temporary Postgres databases.
- The smoke artifact reports no raw database URL, no raw secret-file path, no external actions, no PHI seed, and no destructive production restore.
- Storage readiness exposes `postgres.backupRunbookReady` and `postgres.backupRunbookCommand`.
- Connector proof exposes `postgres_backup_runbook` and `database_backup_restore_runbook`.

Current proof status:

- Focused syntax checks passed for the runbook smoke, storage/compose contracts, storage readiness, server, and build guard.
- Focused contract tests passed with 7/7 tests.
- `npm run test:docker:contract` passed with 14/14 tests.
- `npm run storage:contract` passed and reported `backupRunbookCommand`.
- `npm run storage:postgres:backup-runbook-smoke` passed against live Docker Postgres.
- The smoke compared 17 tables, found no count mismatches, restored user/session/checkpoint/approval/audit/worker-lease rows, and wrote:
  - `artifacts/postgres-backup-runbook-smoke.json`;
  - `artifacts/postgres-backup-runbook-production-smoke.json`.
- API proof at `/api/proof/runs/postgres-backup-runbook` reported:
  - `postgres_backup_runbook=backup_restore_runbook_smoked`;
  - `database_backup_restore_runbook=100 / 100`.
- Browser verification passed with required runbook proof strings present and 0 console errors.
- Screenshot artifacts:
  - `artifacts/phase13-postgres-backup-runbook-dashboard-proof.png`;
  - `artifacts/phase13-postgres-backup-runbook-connector-proof.png`.

## Postgres Provider Backup Policy Acceptance

This slice is acceptable when:

- A provider backup/PITR policy example exists without storing credentials or raw database URLs.
- `npm run storage:postgres:provider-backup-policy-smoke` validates:
  - provider allowlist;
  - staging/production environment;
  - managed or file-backed secret source;
  - no raw database URL in `databaseUrlRef`;
  - backup/PITR or WAL-backed daily backup;
  - at least 7 days retention;
  - RPO at or below 24 hours;
  - RTO at or below 4 hours;
  - encrypted-at-rest backups;
  - restore rehearsal every 30 days or less;
  - isolated restore targets;
  - endpoint regression and backup-runbook smoke requirements;
  - operator approval for promotion;
  - destructive production restore disabled;
  - audit redaction for database URLs and secret paths.
- The smoke writes a sanitized artifact and reports no raw database URL, no raw secret path, no PHI seed, no external action, and no destructive production restore.
- Storage readiness exposes `postgres.providerBackupPolicyReady` and `postgres.providerBackupPolicyCommand`.
- Connector proof exposes `postgres_provider_backup_policy` and `database_provider_backup_policy`.
- The example policy remains `provider_policy_contract_valid_not_hosted` and cannot make the hosted-provider score pass by itself.

Current proof status:

- Focused syntax checks passed for the provider-policy smoke, storage/compose contracts, storage readiness, server, and build guard.
- Focused contract tests passed with 8/8 tests.
- `npm run storage:postgres:provider-backup-policy-smoke` passed.
- The smoke reported:
  - `status=provider_policy_contract_valid_not_hosted`;
  - `hostedProviderReady=false`;
  - `rawDatabaseUrlWritten=false`;
  - `rawSecretFilePathWritten=false`;
  - `destructiveProductionRestore=false`;
  - `externalActions=false`;
  - `phiSeeded=false`.
- API proof at `/api/proof/runs/postgres-provider-backup-policy` reported:
  - `postgres_provider_backup_policy=provider_policy_contract_available`;
  - `database_provider_backup_policy=0 / 100`;
  - `configure_hosted_provider_policy`.
- Browser verification passed with required provider-policy proof strings present and 0 console errors.
- Screenshot and proof artifacts:
  - `artifacts/phase14-postgres-provider-backup-policy-dashboard-proof.png`;
  - `artifacts/phase14-postgres-provider-backup-policy-proof.json`;
  - `artifacts/postgres-provider-backup-policy-smoke.json`.

## Hosted Browser Sandbox Provider Acceptance

This slice is acceptable when:

- A hosted browser sandbox provider example exists without storing provider endpoints, credentials, screenshots, OCR text, or PHI.
- `npm run sandbox:browser:provider-contract` validates:
  - provider allowlist;
  - staging/production environment;
  - endpoint reference is not a raw URL;
  - managed or file-backed secret source;
  - WebRTC or SSE-frame stream transport;
  - approval-gated human-only input relay;
  - screenshot and OCR/caption contract;
  - user-scoped and session-scoped ephemeral browser sessions;
  - max session and idle timeout limits;
  - frame recording disabled;
  - raw OCR persistence disabled;
  - read-only approval required;
  - human takeover approval required;
  - agent credential entry blocked;
  - external write actions blocked;
  - network allowlist, offsite fail-closed, and credential pages user-only;
  - lifecycle/takeover audit events and redaction.
- FastAPI accepts `provider=hosted_remote` at the schema level but fails closed until the hosted provider config is non-example and readiness is explicitly set.
- Connector proof exposes `hosted_browser_sandbox_provider` and `hosted_remote_browser_sandbox`.
- The local CDP adapter remains the default working provider.

Current proof status:

- Focused JS syntax checks passed.
- Python compile checks passed.
- Focused browser-sandbox/compose contract tests passed with 3/3 tests.
- Focused FastAPI fail-closed hosted provider test passed.
- `npm run sandbox:browser:provider-contract` passed.
- `npm run build` passed.
- Final-system verification report coverage passed with 2/2 tests.
- `npm run test:docker:contract` passed with 19/19 tests.
- FastAPI facade regression passed with 35 tests, including 2 expected skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- The smoke reported:
  - `status=hosted_browser_sandbox_contract_valid_not_configured`;
  - `hostedProviderReady=false`;
  - `rawEndpointUrlWritten=false`;
  - `rawSecretFilePathWritten=false`;
  - `rawOcrTextReturned=false`;
  - `frameRecordingEnabled=false`;
  - `externalActions=false`;
  - `phiSeeded=false`;
  - `agentCredentialEntryAllowed=false`.
- API proof at `/api/proof/runs/hosted-browser-sandbox-provider` reported `hosted_browser_sandbox_provider=hosted_browser_sandbox_contract_valid_not_configured`, `hosted_remote_browser_sandbox=0 / 100`, and `remote_browser_controls=90 / 90`.
- In-app browser verification passed with required hosted-browser-sandbox proof strings present in the dashboard DOM and 0 console errors.
- Visual/proof artifacts were saved at `artifacts/phase15-hosted-browser-sandbox-provider-dashboard-proof.png`, `artifacts/phase15-hosted-browser-sandbox-provider-proof.json`, and `artifacts/browser-sandbox-provider-contract-smoke.json`.

## Hosted Browser Sandbox Adapter Harness Acceptance

This slice is acceptable when:

- A non-secret hosted browser sandbox harness config exists for staging/contract tests.
- The provider contract validates adapter modes and prevents the harness from claiming live provider readiness.
- `npm run sandbox:browser:adapter-harness` writes a sanitized artifact with:
  - `status=hosted_browser_sandbox_adapter_harness_ready`;
  - `adapterHarnessReady=true`;
  - `hostedProviderReady=false`;
  - no raw endpoint URL;
  - no raw secret path;
  - no raw OCR text;
  - no frame recording;
  - no external action;
  - no PHI seed;
  - no agent credential entry.
- FastAPI proves the hosted harness lifecycle through `/api/v1/browser/*`:
  - session creation;
  - SSE stream event;
  - takeover request;
  - takeover grant;
  - sanitized input relay;
  - takeover end.
- Connector proof exposes `hosted_browser_sandbox_adapter_harness` separately from `hosted_remote_browser_sandbox`.
- The real hosted-provider score stays blocked until a real provider config is supplied.

Current proof status:

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
- API proof at `/api/proof/runs/hosted-browser-sandbox-adapter-harness` reported `hosted_browser_sandbox_adapter_harness=75 / 75`, `hosted_remote_browser_sandbox=0 / 100`, and `remote_browser_controls=90 / 90`.
- Browser verification passed with the adapter harness rows visible in the dashboard proof and 0 console errors in the proof artifact.
- Visual/proof artifacts were saved at `artifacts/phase16-hosted-browser-sandbox-adapter-harness-dashboard-proof.png`, `artifacts/phase16-hosted-browser-sandbox-adapter-harness-proof.json`, and `artifacts/browser-sandbox-adapter-harness-smoke.json`.

## Hosted Browser Sandbox Provider Resolver Acceptance

This slice is acceptable when:

- A hosted-provider example config exists with endpoint and auth token env references, not raw URLs or committed secrets.
- The contract validator rejects hosted-provider configs that use raw endpoint URLs or non-env auth token refs.
- `npm run sandbox:browser:provider-resolver` writes a sanitized artifact with:
  - `hostedProviderReady=false`;
  - endpoint/auth resolution booleans only;
  - no raw endpoint URL;
  - no raw token;
  - no raw OCR text;
  - no frame recording;
  - no external action;
  - no PHI seed;
  - no agent credential entry.
- FastAPI proves both fail-closed resolver states:
  - missing endpoint or secret;
  - configured endpoint and secret but no live provider verification.
- Connector proof exposes `hosted_browser_sandbox_provider_resolver` separately from `hosted_remote_browser_sandbox`.
- The real hosted-provider score stays blocked until live hosted proof passes.

Current proof status:

- Focused JS syntax checks passed.
- Python compile checks passed.
- Focused browser-sandbox/compose contract tests passed with 5/5 tests.
- Focused FastAPI hosted resolver and hosted harness tests passed.
- Resolver smoke passed in missing-env mode and configured-unverified mode without leaking the fake endpoint or token.

Full proof status:

- `npm run sandbox:browser:provider-contract` passed.
- `npm run sandbox:browser:adapter-harness` passed.
- `npm run sandbox:browser:provider-resolver` passed.
- `npm run build` passed.
- Final-system verification report coverage passed with 2/2 tests.
- `npm run test:docker:contract` passed with 21/21 tests.
- FastAPI facade regression passed with 38 tests, including 2 expected live-gated skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Headless Chrome dashboard proof at `http://127.0.0.1:4202/?phase=hosted-browser-sandbox-provider-resolver` verified `hosted_browser_sandbox_provider_resolver`, `hosted_browser_sandbox_provider_configured_unverified`, `hosted_remote_browser_sandbox`, and no fake endpoint/token leak.
- Visual/proof artifacts were saved at `artifacts/phase17-hosted-browser-sandbox-provider-resolver-dashboard-proof.png`, `artifacts/phase17-hosted-browser-sandbox-provider-resolver-proof.json`, and `artifacts/browser-sandbox-provider-resolver-smoke.json`.

## Hosted Browser Sandbox Provider Adapter Contract Acceptance

This slice is acceptable when:

- A hosted-provider adapter smoke command exists and validates the provider create-session request/response shape.
- The adapter request contains only redacted authorization and an approved target URL reference, not raw provider endpoint, raw token, or raw portal URL.
- The adapter response contains only opaque provider refs for session, stream, screenshot, and OCR/caption.
- The adapter response validator fails closed if the response claims live connection, returns raw frame/OCR text, allows credential entry, allows external writes, or records actions.
- FastAPI proves the adapter-ready state still cannot create real hosted sessions.
- Connector proof exposes `hosted_browser_sandbox_provider_adapter` separately from resolver readiness and live hosted provider readiness.

Current proof status:

- Focused JS and Python syntax checks passed.
- Focused browser-sandbox/compose contract tests passed with 6/6 tests.
- Focused FastAPI adapter/resolver tests passed with 2/2 tests.
- Adapter smoke passed with `hosted_browser_sandbox_provider_adapter_contract_ready`, `hostedProviderAdapterReady=true`, `hostedProviderReady=false`, `providerNetworkCalled=false`, and no fake endpoint/token leak.

Full proof status:

- `npm run sandbox:browser:provider-contract` passed.
- `npm run sandbox:browser:adapter-harness` passed.
- `npm run sandbox:browser:provider-resolver` passed.
- `npm run sandbox:browser:provider-adapter` passed.
- `npm run build` passed.
- Final-system verification report coverage passed with 2/2 tests.
- `npm run test:docker:contract` passed with 22/22 tests.
- FastAPI facade regression passed with 39 tests, including 2 expected live-gated skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- During visual proof, a duplicate-click race in the connector proof panel was found and fixed with a shared in-flight request and visible error recovery.
- Fresh headless Chrome dashboard proof at `http://127.0.0.1:4203/?phase=hosted-browser-sandbox-provider-adapter` verified `hosted_browser_sandbox_provider_adapter`, `hosted_browser_sandbox_provider_adapter_contract_ready`, `hosted_remote_browser_sandbox`, and no fake endpoint/token leak.
- Visual/proof artifacts were saved at `artifacts/phase18-hosted-browser-sandbox-provider-adapter-dashboard-proof.png`, `artifacts/phase18-hosted-browser-sandbox-provider-adapter-proof.json`, and `artifacts/browser-sandbox-provider-adapter-smoke.json`.

## Hosted Browser Sandbox Provider HTTP Adapter Harness Acceptance

This slice is acceptable when:

- A hosted-provider HTTP adapter harness smoke command exists and makes a real HTTP POST to a local provider-compatible harness.
- The HTTP adapter request path proves authorization, contract version, target URL reference, and safety contracts without writing the raw endpoint or token to artifacts.
- The provider response validator still rejects raw frames, raw OCR text, credential entry, external writes, actions taken, raw URLs, and raw secrets.
- FastAPI proves the HTTP-adapter-harness-ready state still cannot create real hosted sessions.
- Connector proof exposes `hosted_browser_sandbox_provider_http_adapter` separately from adapter-envelope readiness and live hosted provider readiness.

Current proof status:

- JS and Python syntax checks passed.
- Focused browser-sandbox/compose contract tests passed with 7/7 tests.
- Focused FastAPI HTTP-adapter-harness and adapter-contract tests passed with 2/2 tests.
- HTTP adapter harness smoke passed with `hosted_browser_sandbox_provider_http_adapter_harness_ready`, `hostedProviderHttpAdapterReady=true`, `providerNetworkCalled=true`, `localHarnessOnly=true`, `hostedProviderReady=false`, and no local harness endpoint/token or fake provider endpoint/token leak.

Full proof status:

- `npm run sandbox:browser:provider-contract` passed.
- `npm run sandbox:browser:adapter-harness` passed.
- `npm run sandbox:browser:provider-resolver` passed.
- `npm run sandbox:browser:provider-adapter` passed.
- `npm run sandbox:browser:provider-http-adapter` passed.
- `npm run build` passed.
- Final-system verification report coverage passed with 2/2 tests.
- `npm run test:docker:contract` passed with 23/23 tests.
- FastAPI facade regression passed with 40 tests, including 2 expected live-gated skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- In-app browser DOM proof at `http://127.0.0.1:4204/?phase=hosted-browser-sandbox-provider-http-adapter` verified the HTTP adapter score/status, `hosted_remote_browser_sandbox`, and no fake provider endpoint/token leak.
- Fresh headless Chrome dashboard proof saved the visual artifact after clicking `Load Connector Proof`.
- Visual/proof artifacts were saved at `artifacts/phase19-hosted-browser-sandbox-provider-http-adapter-harness-dashboard-proof.png`, `artifacts/phase19-hosted-browser-sandbox-provider-http-adapter-harness-proof.json`, and `artifacts/browser-sandbox-provider-http-adapter-harness-smoke.json`.

## Hosted Browser Sandbox Provider Live Lifecycle Harness Acceptance

This slice is acceptable when:

- A hosted-provider live lifecycle harness smoke command exists and exercises provider-style lifecycle calls against a local provider-compatible harness.
- The lifecycle harness proves create session, stream frame event, screenshot ref, OCR/caption ref, approval-gated takeover, redacted input relay, offsite fail-closed behavior, and teardown.
- The lifecycle harness request and response artifacts do not write raw provider endpoints, local harness endpoints, tokens, raw frames, raw OCR text, raw input values, or raw portal/private data.
- FastAPI proves the lifecycle-harness-ready state still cannot create real hosted sessions.
- Connector proof exposes `hosted_browser_sandbox_provider_live_lifecycle` separately from HTTP adapter readiness and live hosted provider readiness.

Current proof status:

- JS and Python syntax checks passed.
- Focused browser-sandbox/compose contract tests passed with 8/8 tests.
- Focused FastAPI lifecycle-harness and HTTP-adapter-harness tests passed with 2/2 tests.
- Lifecycle harness smoke passed with `hosted_browser_sandbox_provider_live_lifecycle_harness_ready`, `hostedProviderLiveLifecycleHarnessReady=true`, `hostedProviderHttpAdapterReady=true`, `providerNetworkCalled=true`, `localHarnessOnly=true`, `hostedProviderReady=false`, and no local/fake endpoint or token leak.

Full proof status:

- `npm run sandbox:browser:provider-contract` passed.
- `npm run sandbox:browser:adapter-harness` passed.
- `npm run sandbox:browser:provider-resolver` passed.
- `npm run sandbox:browser:provider-adapter` passed.
- `npm run sandbox:browser:provider-http-adapter` passed.
- `npm run sandbox:browser:provider-live-lifecycle` passed.
- `npm run build` passed.
- Final-system verification report coverage passed with 2/2 tests.
- `npm run test:docker:contract` passed with 24/24 tests.
- FastAPI facade regression passed with 41 tests, including 2 expected live-gated skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- In-app browser dashboard proof at `http://127.0.0.1:4205/?phase=hosted-browser-sandbox-provider-live-lifecycle` verified the lifecycle score/status, HTTP adapter score/status, `hosted_remote_browser_sandbox`, zero console issues, and no fake provider endpoint/token leak.
- Visual/proof artifacts were saved at `artifacts/phase20-hosted-browser-sandbox-provider-live-lifecycle-harness-dashboard-proof.png`, `artifacts/phase20-hosted-browser-sandbox-provider-live-lifecycle-harness-proof.json`, and `artifacts/browser-sandbox-provider-live-lifecycle-harness-smoke.json`.

## Hosted Browser Sandbox Provider Live Verification Acceptance

This slice is acceptable when:

- A selected-provider live verification smoke command exists and is safe-blocked by default.
- The live verification path can exercise create session, stream, screenshot, OCR/caption, takeover, approved input relay, offsite fail-closed navigation, and teardown through a provider-compatible transport.
- FastAPI can use a private hosted-provider config for HTTPS provider session creation and sanitized provider stream proxying.
- Provider-backed input relay requires the human-only `interactive_takeover` approval scope.
- Proof artifacts and dashboard text do not contain provider endpoints, bearer tokens, raw frame data, raw OCR text, raw input values, credentials, or private provider config.
- Connector proof exposes `hosted_browser_sandbox_provider_live_verification` separately from `hosted_remote_browser_sandbox`.
- `hosted_remote_browser_sandbox` remains `0 / 100` until real selected-provider private config reports `adapter.providerLiveConnected=true`, live verification is explicitly marked verified, and GUI/OCR evidence exists.

Current proof status:

- JS and Python syntax checks passed.
- `npm run sandbox:browser:provider-live-verification` passed in default blocked mode without provider network calls or secret leakage.
- Focused browser-sandbox/compose contract tests passed with 14/14 tests.
- Focused FastAPI live-verification tests passed with 2/2 tests.

Full proof status:

- Full sandbox smoke chain passed, including provider contract, selection, live preflight, live verification, adapter harness, resolver, adapter, HTTP adapter, and live lifecycle.
- `npm run build` passed.
- `npm run test:docker:contract` passed with 30/30 tests.
- `npm run test:facade` passed with 44 tests, including 2 expected live-gated skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Browser dashboard proof at `http://127.0.0.1:4208/?phase=hosted-browser-sandbox-provider-live-verification` verified `hosted_browser_sandbox_provider_live_verification`, `hosted_browser_sandbox_provider_live_preflight`, `hosted_remote_browser_sandbox`, and no fake provider endpoint/token leak.
- Visual/proof artifacts were saved at `artifacts/phase23-hosted-browser-sandbox-provider-live-verification-dashboard-proof.png`, `artifacts/phase23-hosted-browser-sandbox-provider-live-verification-visual-proof.json`, `artifacts/phase23-hosted-browser-sandbox-provider-live-verification-proof.json`, and `artifacts/browser-sandbox-provider-live-verification-smoke.json`.

## Hosted Browser Sandbox Provider WebRTC Signaling Acceptance

This slice is acceptable when:

- A hosted-provider WebRTC signaling smoke command exists and is safe-blocked by default.
- The signaling path can exchange an opaque offer reference, opaque answer metadata, and opaque ICE candidate references through the selected provider.
- FastAPI exposes an opaque public connector route for hosted provider WebRTC signaling without returning raw SDP, raw ICE candidates, TURN/STUN credential material, endpoint URLs, bearer tokens, raw frame data, raw OCR text, credentials, or private provider config.
- WebRTC-capable hosted-provider configs require an explicit signaling readiness gate before provider readiness can pass.
- Connector proof exposes `hosted_browser_sandbox_provider_webrtc_signaling` separately from `hosted_remote_browser_sandbox`.
- `hosted_remote_browser_sandbox` remains `0 / 100` until real selected-provider private config reports `adapter.providerLiveConnected=true`, live verification is explicitly marked verified, WebRTC signaling is ready when required, and GUI/OCR evidence exists.

Current proof status:

- JS and Python syntax checks passed.
- `npm run sandbox:browser:provider-webrtc-signaling` passed in default blocked mode without provider network calls or secret leakage.
- Focused browser-sandbox/compose contract tests passed with 15/15 tests.
- FastAPI facade regression passed with 46 tests, including 2 expected live-gated skips.

Full proof status:

- `npm run build` passed.
- `npm run test:docker:contract` passed with 31/31 tests.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Browser dashboard proof at `http://127.0.0.1:4210/?phase=hosted-browser-sandbox-provider-webrtc-signaling` verified `hosted_browser_sandbox_provider_webrtc_signaling`, `hosted_browser_sandbox_provider_live_verification`, `hosted_remote_browser_sandbox`, and no endpoint/token/raw SDP/raw ICE leak.
- Visual/proof artifacts were saved at `artifacts/phase24-hosted-browser-sandbox-provider-webrtc-signaling-dashboard-proof.png`, `artifacts/phase24-hosted-browser-sandbox-provider-webrtc-signaling-visual-proof.json`, `artifacts/phase24-hosted-browser-sandbox-provider-webrtc-signaling-proof.json`, and `artifacts/browser-sandbox-provider-webrtc-signaling-smoke.json`.

## Hosted Browser Sandbox Provider Visual/OCR Replay Acceptance

This slice is acceptable when:

- A hosted-provider visual/OCR replay smoke command exists and is safe-blocked by default.
- A private proof manifest outside Git can prove dashboard screenshot, mobile live-block screenshot, OCR/caption ref, stream frame ref, screenshot ref, takeover approval, approved-input relay, and teardown using only opaque refs and sanitized booleans.
- The replay validator rejects raw screenshots, `data:image`, raw OCR text, portal/member text, endpoint URLs, bearer tokens, raw SDP, raw ICE candidates, local paths, credentials, and raw input values.
- Connector proof exposes `hosted_browser_sandbox_provider_visual_ocr_replay` separately from `hosted_remote_browser_sandbox`.
- `hosted_remote_browser_sandbox` remains `0 / 100` until real selected-provider private config reports `adapter.providerLiveConnected=true`, live verification is explicitly marked verified, WebRTC signaling is ready when required, and visual/OCR replay proof passes.

Current proof status:

- JS and Python syntax checks passed.
- `npm run sandbox:browser:provider-visual-ocr-replay` passed in default blocked mode without provider calls or secret leakage.
- Browser-sandbox provider contract tests passed with 17/17 tests.
- FastAPI facade regression passed with 47 tests, including 2 expected live-gated skips.

Full proof status:

- `npm run build` passed.
- `npm run test:docker:contract` passed with 34/34 tests.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Browser dashboard proof at `http://127.0.0.1:4211/?phase=hosted-browser-sandbox-provider-visual-ocr-replay` verified visual/OCR replay, WebRTC signaling, live verification, final hosted remote score, and no endpoint/token leak.
- Visual/proof artifacts were saved at `artifacts/phase25-hosted-provider-visual-ocr-replay-dashboard-proof.png`, `artifacts/phase25-hosted-provider-visual-ocr-replay-visual-proof.json`, `artifacts/phase25-hosted-provider-visual-ocr-replay-proof.json`, and `artifacts/browser-sandbox-provider-visual-ocr-replay-smoke.json`.

## Hosted Browser Sandbox Provider Launch Readiness Acceptance

This slice is acceptable when:

- A hosted-provider launch-readiness smoke command exists and is safe in default local mode.
- A non-secret launch env template and launch runbook exist for private selected-provider operation.
- The aggregate proof lists runbook readiness, private proof-chain readiness, final enablement allowance, and missing private requirements.
- A private proof-chain harness can reach `hosted_browser_sandbox_provider_launch_waiting_final_enablement` while `hostedProviderReady=false`.
- Connector proof exposes `hosted_browser_sandbox_provider_launch_readiness` separately from `hosted_remote_browser_sandbox`.
- `hosted_remote_browser_sandbox` remains `0 / 100` until real selected-provider private config reports `adapter.providerLiveConnected=true`, live verification is explicitly marked verified, WebRTC signaling is ready when required, visual/OCR replay proof passes, and final human enablement is approved.
- Proof artifacts and dashboard text do not contain provider endpoints, bearer tokens, raw screenshots, raw OCR text, raw SDP, raw ICE candidates, local private paths, credentials, or raw input values.

Current proof status:

- JS and Python syntax checks passed.
- `npm run sandbox:browser:provider-launch-readiness` reported `hosted_browser_sandbox_provider_launch_runbook_ready`.
- `npm run sandbox:browser:provider-visual-ocr-replay` remained safe-blocked by default.
- Browser-sandbox provider contract tests passed with 19/19 tests.
- Deployment compose contract test passed after linking the temp worktree to the existing local Graphiti vendor checkout.
- Focused FastAPI launch-readiness and visual/OCR replay tests passed with 2/2 tests.

Full proof status:

- `npm run build` passed.
- `npm run test:docker:contract` passed with 36/36 tests.
- `.venv-facade/bin/python -m unittest project.tests.test_fastapi_facade` passed with 48 tests and 2 expected live-gated skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Browser dashboard/API proof at `http://127.0.0.1:4212/?phase=hosted-browser-sandbox-provider-launch-readiness` verified launch readiness, final hosted remote score, and no fake endpoint/token leak.
- Visual/proof artifacts were saved at `artifacts/phase26-hosted-provider-launch-readiness-dashboard-proof.png`, `artifacts/phase26-hosted-provider-launch-readiness-visual-proof.json`, `artifacts/phase26-hosted-provider-launch-readiness-proof.json`, and `artifacts/browser-sandbox-provider-launch-readiness-smoke.json`.

## Hosted Browser Sandbox Provider Private Launch Execution Acceptance

This slice is acceptable when:

- A hosted-provider private launch execution smoke command exists and is safe in default local mode.
- A non-secret private execution env template exists for operator-owned private execution.
- The private execution proof lists execution gate, final human review, private proof-chain readiness, final enablement allowance, and missing requirements.
- Connector proof exposes `hosted_browser_sandbox_provider_private_launch_execution` separately from `hosted_browser_sandbox_provider_launch_readiness` and `hosted_remote_browser_sandbox`.
- `hosted_remote_browser_sandbox` remains `0 / 100` unless private launch execution and final human review pass in addition to real selected-provider private config, live verification, WebRTC when required, visual/OCR replay, `WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=1`, and private `adapter.providerLiveConnected=true`.
- Public proof artifacts and dashboard text do not contain private config paths, visual/OCR proof paths, provider endpoints, bearer tokens, raw screenshots, raw OCR text, raw SDP, raw ICE candidates, credentials, or raw input values.

Current proof status:

- JS and Python syntax checks passed.
- `npm run sandbox:browser:provider-private-launch-execution` reported `hosted_browser_sandbox_provider_private_launch_execution_not_enabled` in default safe mode.
- Browser-sandbox provider and deployment compose contract tests passed with 22/22 tests.
- Focused FastAPI private launch execution and launch-readiness tests passed with 2/2 tests.

Full proof status:

- `npm run build` passed.
- `npm run test:docker:contract` passed with 38/38 tests.
- `.venv-facade/bin/python -m unittest project.tests.test_fastapi_facade` passed with 49 tests and 2 expected live-gated skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated OpenClaw skips.
- Browser dashboard/API proof at `http://127.0.0.1:4213/?phase=hosted-browser-sandbox-provider-private-launch-execution` verified private launch execution, launch readiness, final hosted remote score, and no fake endpoint/token/provider-config-path leak.
- Visual/proof artifacts were saved at `artifacts/phase27-hosted-provider-private-launch-execution-dashboard-proof.png`, `artifacts/phase27-hosted-provider-private-launch-execution-visual-proof.json`, and `artifacts/browser-sandbox-provider-private-launch-execution-smoke.json`.

## Steel Self-Host Operations Hardening Acceptance

This slice is acceptable when:

- A Steel operations smoke command exists and is safe in default local mode.
- A non-secret Steel operations policy exists for concurrency, TTL, idle timeout, teardown, stale-session cleanup, retention, loopback networking, image pinning, monitoring, and approval boundaries.
- Steel browser log storage is disabled by default.
- The validator rejects public CDP exposure, browser log retention, frame/OCR persistence, raw endpoint literals, secret literals, unpinned images, missing teardown, and unsafe approval policy.
- Connector proof exposes `hosted_browser_sandbox_provider_steel_operations` separately from `hosted_browser_sandbox_provider_steel_self_host` and `hosted_remote_browser_sandbox`.
- `hosted_remote_browser_sandbox` remains `0 / 100` unless private launch execution and final human review pass in addition to real selected-provider private config, live verification, WebRTC when required, visual/OCR replay, `WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=1`, and private `adapter.providerLiveConnected=true`.
- Public proof artifacts and dashboard text do not contain Steel endpoint URLs, tokens, raw screenshots, raw OCR text, raw frames, credentials, or input values.

Current proof status:

- JS and Python syntax checks passed.
- `npm run sandbox:browser:steel-operations` passed in default static mode with `85 / 100` and `hostedProviderReady=false`.
- Browser-sandbox provider contract tests passed with 25/25 tests.
- Deployment compose contract test passed.
- Focused FastAPI Steel operations tests passed with 2/2 tests.
- `npm run build` passed.
- `npm run test:docker:contract` passed with 42/42 tests.
- `.venv-facade/bin/python -m unittest project.tests.test_fastapi_facade` passed with 51 tests and 2 expected live-gated skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated OpenClaw skips.
- Browser dashboard/API proof at `http://127.0.0.1:4214/?phase=steel-self-host-operations-hardening` verified Steel operations `85 / 100`, final hosted remote browser `0 / 100`, and no local endpoint/token leak.
- Visual/proof artifacts were saved at `artifacts/phase29-steel-operations-dashboard-proof.png`, `artifacts/phase29-steel-operations-visual-proof.json`, and `artifacts/browser-sandbox-provider-steel-operations-smoke.json`.

## Steel Remote Hardening Acceptance

This slice is acceptable in static mode when:

- Remote Steel compose pins API/UI images by digest and contains no `latest` tags.
- Steel API and CDP bind only to loopback on the remote host.
- The reverse proxy terminates TLS, restricts inbound access by backend egress allowlist, exposes only required Steel routes, and does not proxy CDP.
- Firewall and WireGuard runbooks document private debugger access, host-level inbound/outbound allowlists, default drop policy, and no committed secrets.
- Recovery script waits for health, creates one non-PHI session, releases it, and emits a recovery event.
- Dashboard/API proof exposes `contract readiness`, `local-host readiness`, and `remote-host readiness` as separate gates.
- `hosted_remote_browser_sandbox` remains `0 / 100` unless the Phase 30 remote-host lifecycle artifact proves 10/10.

Live acceptance requires:

- Session create returns websocket and viewer refs.
- CDP connects through the private tunnel.
- Live stream ref is reachable over TLS.
- Screenshot and local OCR/caption refs are produced without raw image/OCR persistence.
- Synthetic approved input relay passes without credentials.
- Human takeover event is recorded.
- Teardown removes the session.
- Offsite navigation is blocked by adapter policy and host firewall.
- Redaction holds for input values and frame content.
- The accepted artifact is saved under `artifacts/phase30/steel-remote-live-lifecycle-<ISO8601>.json`.

Current proof status:

- Static implementation is present.
- Live remote acceptance is not complete because no owned remote Steel host/TLS/tunnel was available in this session.

Phase 30 closure update:

- Live remote acceptance later completed against an owned AWS EC2 Steel host in `us-east-1`.
- Accepted artifact: `artifacts/phase30/steel-remote-live-lifecycle-2026-06-18T22-29-22-865Z.json`.
- The artifact reports `steel_remote_host_lifecycle_verified`, `10 / 10` remote checks, `20 / 20` deployment checks, `100 / 100` score, and no raw endpoint, secret, frame, image, OCR text, or input return.

## Steel Remote Ops Drills Acceptance

This slice is acceptable when:

- A Phase 31 ops-drill smoke command exists and is safe in default local mode.
- The ops-drill contract requires the accepted Phase 30 remote lifecycle artifact before scoring.
- Patching cadence requires weekly Steel/Chrome digest review, critical CVE review within 24 hours, no `latest` tags, digest rollback, and post-patch smoke commands.
- Backup/restore drill has a dry-run-safe script, excludes raw visual artifacts, emits a ref-only drill event, and can invoke recovery smoke.
- Health alerting covers TLS health, local health, session-create latency, TLS expiry, WireGuard/CDP tunnel, container restarts, and recovery-event failures.
- On-call handoff requires latest lifecycle artifact, PHI/raw-content exposure status, human takeover boundary status, agent credential entry status, external/write action status, and rollback status.
- Connector proof exposes `hosted_browser_sandbox_provider_steel_ops_drills` separately from remote-host readiness and final hosted readiness.
- Concurrency fan-out remains explicitly deferred.

Current proof status:

- `npm run sandbox:browser:steel-ops-drills` passed with `steel_remote_ops_drills_ready`, `16 / 16` checks, and `100 / 100`.
- `node --test src/tests/browser-sandbox-provider-contract.test.mjs` passed with 28/28 tests.
- `npm run build` passed.
- `npm run test:docker:contract` passed with 45/45 tests.
## Phase 32: Canonical Goal-Tied Phase Execution

Acceptance criteria:
- `docs/PROJECT_OPERATING_SYSTEM.md` defines the source-of-truth order, durable objective, RALPH loop, role model, and Phase 33 candidate.
- `docs/PHASE_SCOREBOARD.md` lists active maturity gates and makes incomplete intelligence/channel/database gaps visible.
- `docs/NON_MOCKED_PROOF_RULES.md` defines allowed proof types, forbidden claims, required labels, live LLM proof requirements, and visual proof requirements.
- `GET /api/proof/runs/server-connector-next-mobile-mvp` includes:
  - goal key `canonical_goal_tied_phase_execution`;
  - check key `canonical_phase_operating_system`;
  - score key `canonical_goal_tied_phase_execution`.
- The operator dashboard can render those keys through the existing connector proof panel.
- Tests fail if the operating-system docs or proof keys are removed.
- The phase is not marked done until the worker branch and Cortex memory branch are pushed and PRs are opened.

Focused proof:
- `node --test src/tests/chat-ui-contract.test.mjs`
- `npm run build`
- `npm run test:local`

## Phase 33: Continuous Intelligence Runtime Shadow Slice

Acceptance criteria:
- `CaseState` is typed as `brainstyworkers.case_state.v1`, hashes the raw user input, and does not expose raw source URL paths.
- LangGraph topology includes `case_state_shadow` after `observe_evidence` and before `compose_response`.
- Universal gates G0-G8 are present in order and evaluate intake, policy, context, workflow, skill/rule match, approval, scenario reconstruction, validation, and decision/escalation readiness.
- PEMS schema `brainstyworkers.pems.v1` blocks immature candidates and vetoes candidates with safety incidents.
- Phase 33 readiness proof is labeled `shadow_only`, keeps `productionDrivingAllowed=false`, and does not mark PEMS trusted.
- Connector proof includes goal/check/score entries for continuous procedural memory shadow scaffolding.
- Build/test proof confirms this is a deterministic scaffold and not a mocked LLM, browser, or product-memory proof.

Focused proof:
- `node --test src/tests/continuous-intelligence.test.mjs src/tests/graph-topology.test.mjs src/tests/chat-ui-contract.test.mjs`
- `npm run build`
- `npm run test:local`
- Browser/API proof for `continuous_intelligence_shadow`

## Phase 34: Continuous Intelligence Shadow Persistence

Acceptance criteria:
- Database schema includes `continuous_intelligence_shadow_runs` and `pems_candidate_maturity`.
- A real `runLangGraphOrchestration` call persists one final shadow row after final response and product-memory retain.
- PEMS maturity accumulates across repeated shadow runs by candidate id.
- Persisted rows expose only hashes, refs, counts, safe status fields, and PEMS metadata.
- Raw user input, raw source URL paths, raw screenshots, raw OCR text, raw frames, and Cortex-as-product-memory claims are not persisted or returned.
- Connector proof includes `continuous_intelligence_shadow_persistence`.
- The `continuous_procedural_memory` score can advance only to the Phase 34 persistence target while `productionDrivingAllowed=false`.
- PEMS candidates remain untrusted without reviewer approvals and zero-safety-incident history.

Focused proof:
- `node --test src/tests/continuous-intelligence.test.mjs src/tests/continuous-intelligence-persistence.test.mjs src/tests/chat-ui-contract.test.mjs`
- `npm run build`
- `npm run test:local`
- Browser/API proof for `continuous_intelligence_shadow_persistence`

## Phase 36: PEMS Reviewer/Evaluator Workbench

Acceptance criteria:
- Database schema includes `pems_candidate_evaluator_drafts`.
- Evaluator drafts are created through a bounded API/helper and are labeled advisory-only.
- Draft payloads store hashes, safe previews, and consistency trace refs only.
- Raw advisory notes, raw consistency traces, raw source text, raw screenshots, raw OCR text, raw frames, credentials, and secrets are not persisted or returned.
- Drafts do not alter promotion state, healthcare routing, final answers, approval state, browser actions, OpenClaw dispatch, payer contact, external messages, or writes.
- An evaluator draft becomes part of the promotion evidence only when an explicit `pems_candidate_promotion_reviews` row links to the draft id.
- Connector proof includes `pems_reviewer_evaluator_workbench`.
- The `continuous_procedural_memory` score can advance only to the Phase 36 reviewer-workbench target while `productionDrivingAllowed=false`.
- Tests prove sanitized draft storage, advisory-only behavior, explicit review linkage, and proof visibility.

Focused proof:
- `node --test src/tests/pems-reviewer-workbench.test.mjs src/tests/pems-promotion-gates.test.mjs src/tests/chat-ui-contract.test.mjs`
- `npm run build`
- `npm run test:local`
- Browser/API proof for `pems_reviewer_evaluator_workbench`

## Phase 37: PEMS Reviewer UI

Acceptance criteria:
- Dashboard includes a visible `PEMS Reviewer Workbench` panel.
- The panel loads the real `/api/continuous-intelligence/pems/workbench` response.
- The panel displays candidate, draft, evaluator mode, suggested review, deterministic validator status, consistency trace ref, sanitized advisory preview, sanitized trace preview, and safety flags.
- Approve, reject, and block buttons write explicit review rows through `/api/continuous-intelligence/pems/reviews`.
- UI review payloads include `advisoryDraftId`, `actorUserId`, `reviewType`, `decision`, safe rationale, and metadata flags.
- UI review payloads do not include raw advisory note, raw consistency trace, raw OCR, raw frames, credentials, or secrets.
- Connector proof includes `pems_reviewer_ui`.
- The `continuous_procedural_memory` score can advance only to the Phase 37 reviewer-UI target while `productionDrivingAllowed=false`.

Focused proof:
- `node --test src/tests/chat-ui-contract.test.mjs src/tests/pems-reviewer-workbench.test.mjs`
- `npm run build`
- `npm run test:local`
- Browser/API proof for `pems_reviewer_ui`

## Phase 38: PEMS Reviewer Comparison And Provenance

Acceptance criteria:
- Workbench responses include a `reviewerComparison` object.
- `reviewerComparison` includes deterministic-vs-advisory rows for validator decision, promotion gate, cited evidence refs, and production boundary.
- `reviewerComparison` includes source-pointer chips from advisory metadata without raw source content.
- `reviewerComparison` includes evaluator provenance refs for evaluator mode, model ref, provider ref, and egress ref when present.
- Raw prompts, raw completions, raw advisory notes, raw consistency traces, raw OCR, raw frames, credentials, and secrets are not returned.
- Mocked LLM output does not count as live LLM proof.
- Connector proof includes `pems_reviewer_comparison_provenance`.
- The `continuous_procedural_memory` score can advance only to the Phase 38 reviewer-comparison target while `productionDrivingAllowed=false`.

Focused proof:
- `node --test src/tests/chat-ui-contract.test.mjs src/tests/pems-reviewer-workbench.test.mjs`
- `npm run build`
- `npm run test:local`
- Browser/API proof for `pems_reviewer_comparison_provenance`
