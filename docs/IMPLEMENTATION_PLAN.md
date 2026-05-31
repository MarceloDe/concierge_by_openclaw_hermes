# Implementation Plan

Status: MVP hardening Phases 1-8N are implemented locally. Phase 7D adds mandatory visual OCR evidence to the official OpenClaw read-only worker path. Phase 7E corrects the OpenClaw skill layering so `insurance-portal-browser` is the healthcare safety envelope, `browser-automation` is the browser-control substrate, and `ocr-local` is the local visual evidence substrate. Phase 7F verifies LangGraph-owned worker cycle management from proposal through single-use approval, result ingest, audit, and no-action token reuse. Phase 7G expands the OpenClaw worker contract so the worker can create subtasks, choose tool paths, use worker memory, and report progress every 30 seconds inside the assigned LangGraph task. Phase 8M enriches the project OpenClaw insurance-browser skill and worker prompt with portal search, DOM/accessibility extraction, visual OCR, read-only document/PDF handling, structured insurance data fields, quality bars, and user-only auth recovery. Phase 8N applies that contract to the auth-plus-chat MVP loop with a clearer latest Current Answer, Graphiti retain repair/status, and source-pointer-safe claims/prior-authorization extraction.

Source of truth:
- `docs/CODEX_START_PROMPT.md`
- `AGENTS.md`
- `brainstyworkers_ai_concierge_prompt.md`

Last updated: 2026-05-27

## 2026-05-27 MVP Hardening Reset

The controlling next-cycle direction is now `docs/CODEX_MVP_HARDENING_PLAYBOOK.md`.

The project must pause breadth expansion. The next slice is not a new workflow, persona, UI panel, or OpenClaw profile initialization. The next slice is to make one real healthcare journey work through one product runtime:

**Read-only authenticated insurance benefits evidence capture plus one sourced answer plus safe product-memory retain.**

Hard constraints for the next implementation cycle:

- Cortex is project memory only, not product memory.
- Product memory must use Hindsight, Zen, LangMem, Mem0, Zep/Graphiti, or an explicit equivalent retain/recall adapter.
- LangGraph must own the healthcare workflow path.
- `/api/chat`, `/api/langgraph/run`, and orchestrator endpoints must not remain divergent product runtimes.
- OpenClaw remains the adaptive worker/tool/channel arm and must not choose workflows, bypass gates, retain product memory, enter credentials, submit forms, contact payers, or perform irreversible actions.
- No new workflows or UI panels should be added until the MVP hardening phases pass.

Immediate sequence:

1. Phase 1: collapse to one LangGraph product runtime.
2. Phase 2: add structured intent classification that works without literal keywords.
3. Phase 3: convert proposal-only approval into approval/resume.
4. Phase 4: prove real authenticated evidence capture or fail loudly.
5. Phase 5: add real product-memory retain/recall separate from Cortex.
6. Phase 6: harden PHI screening, audit integrity, and concurrent state.

## Prompt Audit Summary

The source prompt is strong as an architecture and product vision. It clearly names the target system as a Brainstyworkers healthcare insurance concierge built around LangGraph, Hindsight-style temporal memory, OpenClaw channels/tools, Vercel AI Gateway, and layered guardrails.

It is not yet detailed enough for reliable implementation of business behavior. The first local demo shape can be inferred from Milestone 1, but several product and safety decisions still need confirmation before coding.

## What The Prompt Clearly Defines

- Core architecture: channel adapter, input policy, memory recall, LangGraph workflow router, subagent nodes, memory retain, output policy.
- Long-term architecture: web chat, WhatsApp, email, voice, admin dashboard, Telegram.
- Initial milestone direction: single web chat channel, no memory, core graph, intent classifier, plan node, eligibility, general RAG, and human escalation.
- Safety model: input policy, state allowlist, tool authorization, human approval, output redaction, audit logging.
- Deferred production pieces: Hindsight memory, OpenClaw channel adapters, real payer tools, Vercel Sandbox, LangSmith evals, persistent database, Redis checkpoints, vector store.

## Critical Unknowns

- The user must perform or approve login/authentication in Chrome; Codex must not enter passwords, SSNs, passkeys, or 2FA.
- Vercel database connection details are not configured. Current Vercel guidance routes new Postgres through Marketplace providers such as Neon.
- Browser automation tool availability must be verified in the implementation turn.
- The exact line between safe navigation/extraction and irreversible submission/change still needs per-action product gating.

## Tentative MVP

The approved smallest useful MVP is:

Build a local web chat and local application database for Marcelo Felix. The system enrolls the user, creates the first user/session/portal/audit records, attaches to a user-authenticated Chrome session through a remote-debugger/browser automation boundary, navigates the logged-in insurance website for eligibility/benefits information, extracts approved data, and records a full trace. No payer API communication, external message sending, medical advice, or irreversible website action is allowed without an explicit approval gate.

## Tentative Vertical Slices

1. Slice 1: real-user enrollment and portal depuration
   - Single user: Marcelo Felix.
   - Single channel: local web chat.
   - Workflow: enrollment, local database creation, logged Chrome attachment, insurance portal navigation, eligibility/benefits extraction, trace/audit proof.
   - Data: user-approved enrollment data plus user-approved PHI/insurance data from the logged portal.
   - Boundaries: user controls credentials; no payer API; no medical advice; no external messages; no irreversible portal action without per-action approval.

2. Slice 2: persistence and Vercel-ready database hardening
   - Move from local storage to a Vercel-compatible Postgres integration when credentials are provided.
   - Add migrations, encryption/redaction policy, and PHI field approvals.
   - Preserve session, audit, and portal extraction traceability.

3. Slice 3: LangGraph persistence integration
   - Local state/checkpoint contract is now implemented.
   - Runtime adapter compatibility is now implemented for LangChain config/messages and LangGraph-style agent state.
   - Workflow architecture registry is now implemented so the future graph can route from user profile completeness, memory context, prior journey events, database pointers, and tool readiness.
   - Next: wire actual LangGraph runtime/checkpointer behavior when package/API use is approved.
   - Use user/session/thread IDs consistently across chat, browser run, memory packet, and audit trace.

4. Slice 4: memory harness and Hindsight adapter
   - Local hook-style recall/retain harness is now implemented.
   - Context packets inject current session, prior sessions, retained memories, open tasks, scheduled jobs, and database pointers.
   - Prompt contracts are now injected into context packets for orchestrator and OpenClaw arm usage.
   - Runtime adapter compatibility is now implemented for future Hindsight retain candidates, without calling a real Hindsight runtime.
   - Memory payloads now include ISO-8601 UTC temporal fields for occurred, valid-from, valid-until, and last-verified times, plus workflow route context for future Hindsight retain/reflect use.
   - Next: add real Hindsight vector/temporal recall only after runtime/API approval and final memory-retention policy.

5. Slice 5: OpenClaw heartbeat and Vercel production adapters
   - Local OpenClaw dedicated arm state, heartbeat planner, scheduled jobs, and approval-gated outbox are now implemented.
   - Runtime adapter compatibility is now implemented for OpenClaw channel task envelopes and heartbeat envelopes.
   - OpenClaw skill catalog is now implemented with the insurance portal browser skill, insurance knowledge research skill, and heartbeat follow-up planner skill.
   - The repo now includes a concrete `insurance_portal_browser` OpenClaw skill artifact and validation API, but real OpenClaw worker execution remains gated.
   - The local OpenClaw envelope validator/proposal gate is now implemented for `insurance_portal_browser`.
   - The UI and API can validate a prepared browser task, record a pending approval task/audit event, and show approval gates, fallback path, stop conditions, and actions taken without executing a worker.
   - Replace simulated browser/channel/model boundaries with real OpenClaw and Vercel AI Gateway integrations.
   - Add provider routing, budgets, and observability.
   - Add deployment only after PHI persistence and access controls are explicitly approved.

6. Slice 6: live graph and skill execution
   - Real `@langchain/langgraph` runtime is now installed and connected for local graph execution.
   - The graph maps registry route candidates into graph nodes and prepares OpenClaw envelopes.
   - OpenAI model invocation is wired through `@langchain/openai` and `OPENAI_API_KEY`.
   - The default live LLM payload allows insurance, portal, and clinical PHI after patient approval, while masking patient name, email, SSN, member ID, subscriber ID, and subscription number into database pointers.
   - The real repo-scoped OpenClaw skill directory now exists for insurance portal browsing with fallback access paths:
     - remote debugger against user-authenticated Chrome.
     - Chrome extension bridge.
     - MCP browser adapter.
     - manual user export when automation is blocked.
   - OpenClaw browser skill execution now has a proposal-only validation gate and must stay behind explicit approval before a real worker adapter runs.
   - LangGraph now prepares deterministic OpenClaw worker job contracts with job ids, correlation ids, target profile/agent/workspace, expected result schema, fan-out/fan-in rules, and controls preventing workers from choosing workflows or creating subtasks.
   - Next: connect a real OpenClaw worker/adapter only after explicit execution approval and a safe install path are confirmed.
   - Add Hindsight recall/retain/reflect only after the memory retention policy and API/runtime credentials are approved.

## Implementation Constraints

- Do not implement payer API communication without explicit user approval.
- Do not enter credentials, SSNs, passkeys, or 2FA on the user's behalf.
- Do not store PHI, screenshots, or portal extracts outside approved local storage until persistence rules are approved.
- Do not send messages, submit forms, change records, or take irreversible portal actions without per-action approval.
- Do not provide medical advice.
- Implement one slice at a time and verify after each slice.
- Record proof and risks in `docs/PROGRESS.md` after every implementation loop.

## Test Strategy

- Unit tests for enrollment, state creation, policy boundaries, approval gates, and audit event generation.
- Integration tests for the local chat/API workflow and database writes.
- Browser automation verification against the logged Chrome/remote-debugger boundary.
- Redaction tests for trace output and screenshots.
- Regression cases for credential requests, medical advice, external-message attempts, and irreversible action attempts.

## Deferred Features

- Real Hindsight/vector database memory retention.
- Real payer API communication.
- Real OpenClaw WhatsApp, Telegram, email, or voice channels.
- Production PHI storage on Vercel.
- HIPAA compliance hardening.
- Production audit immutability.
- Vercel deployment and AI Gateway enforcement.
- LangSmith evaluation suite.

## Previous Next Step Now Deferred

The project-scoped real OpenClaw runtime adapter path is chosen and documented in `docs/OPENCLAW_RUNTIME_ALIGNMENT.md`, but profile initialization is no longer the next implementation slice. It is deferred until the single LangGraph product runtime, approval/resume gate, and real evidence capture path are coherent.

Use the already installed official OpenClaw CLI with a dedicated profile:

- Command prefix: `openclaw --profile brainstyworkers`
- Profile state/config: `~/.openclaw-brainstyworkers`
- Config file: `~/.openclaw-brainstyworkers/openclaw.json`
- Recommended agent id: `brainstyworkers-insurance-browser`
- Recommended workspace: `~/.openclaw-brainstyworkers/workspace-brainstyworkers`
- Skill source: `openclaw/skills/insurance-portal-browser`
- Skill install target: the dedicated workspace `skills/` directory.

Do not use the user's default personal `~/.openclaw` profile, personal skills, personal channels, or personal memory for this project.

Any later implementation that connects a real worker still requires explicit approval of:

- project-specific OpenClaw profile initialization.
- dedicated agent/workspace creation.
- local skill install into the dedicated workspace.
- confirmation that the LangGraph-owned worker job/result contract is the only dispatch interface.
- browser profile/remote-debugger boundary.
- adapter command and environment variables.
- exact read-only task scope.
- approval gate for any future action beyond observation.

## Current Status

Phase 1 from `docs/CODEX_MVP_HARDENING_PLAYBOOK.md` is implemented:

- `/api/chat` now routes through the same LangGraph product path as `/api/langgraph/run`.
- Read-only browser/evidence observation now runs as a LangGraph node.
- Final answer, conversation persistence, audit, checkpointing, memory retain, and source-pointer behavior now happen through the graph path.
- A route-level regression test proves public chat endpoints cannot bypass the healthcare journey graph.

## Current Status

Phase 2 from `docs/CODEX_MVP_HARDENING_PLAYBOOK.md` is implemented:

- Added a strict structured healthcare intent classifier before workflow routing.
- The classifier returns intent, workflow, confidence, required evidence, missing evidence, refusal/escalation flag, and rationale.
- LangGraph routes from classifier output rather than literal keyword scoring alone.
- Deterministic safety refusals still run before workflow execution.
- Paraphrase tests cover prior authorization, claim status, denial appeal, eligibility/benefits, and credential-entry refusal.

## Current Status

Phase 3 from `docs/CODEX_MVP_HARDENING_PLAYBOOK.md` is implemented:

- Added `POST /api/orchestrator/approve`.
- Approval binds to task ID, session ID, user ID, workflow, scope, expiration, and allowed action.
- The graph consumes the approval token before browser/evidence observation.
- Only `read_only_observation` can be approved in this MVP.
- Missing, expired, mismatched, or consumed approvals keep `actionsTaken=[]` and do not create evidence.

## Current Status

Phase 4 from `docs/CODEX_MVP_HARDENING_PLAYBOOK.md` is implemented locally:

- Added authenticated portal evidence verification.
- Added source pointer hashes: URL, title, page kind, timestamp, DOM hash, extraction hash, and evidence fields.
- Added `npm run test:live:portal`.
- Live proof requires `BRAINSTY_PORTAL_LIVE=1`.
- Public payer marketing pages are blocked without creating eligibility snapshots.
- Verified authenticated member evidence can create the sourced evidence path after approval.

`npm run test:live:portal` is intentionally not part of local CI. It should be run only when Chrome is already authenticated to the member portal through the user-controlled login boundary.

## Current Status

Phase 5 from `docs/CODEX_MVP_HARDENING_PLAYBOOK.md` is implemented locally with Zep Graphiti:

- Official Graphiti repo cloned into `vendor/getzep-graphiti`.
- Project-local Python runtime created at `.venv-graphiti`.
- FalkorDB local backend runs through Docker/Colima on host port `6380`.
- Official runtime requirements were verified against the repo/docs: Python `>=3.10,<4`, supported graph backend, and OpenAI-compatible LLM/embedding configuration.
- LangGraph recalls Graphiti product memory before orchestration.
- LangGraph retains safe workflow/source-pointer summaries after graph completion.
- Product memory is separate from Cortex and OpenClaw.
- Product memory UI/API proof is available through `/api/product-memory/status`, `/api/product-memory/probe`, and the Product Memory panel.
- `npm run test:memory:graphiti` proves real Graphiti schema, retain, recall, and LangGraph integration.

## Current Next Step

Phase 6A-lite is implemented:

- OpenAI outbound ChatOpenAI message payloads are captured before send.
- Graphiti memory-bound payloads are captured before send.
- Audit events record exact serialized payloads, hashes, destinations, payload types, policy modes, and observe-only labels.
- The chat proof UI displays payload audit summaries.
- This is observe-only and does not yet block or redact payloads.

Phase 6B is implemented:

- OpenAI and Graphiti outbound payload policy is enforced by default.
- Direct identifiers and raw portal text are blocked before external send.
- Required source-pointer contracts can fail closed when missing.
- Blocked outbound payloads create audit proof.
- New audit events are hash chained.
- Local same-process concurrent checkpoints are serialized per session.
- Phase 6B tests cover blocked payloads, audit tamper detection, and concurrent state versioning.

## Current Next Step

Phase 7A/7B is implemented:

- The installed official OpenClaw CLI is reused only through the dedicated `brainstyworkers` profile.
- The project workspace is `~/.openclaw-brainstyworkers/workspace-brainstyworkers`.
- The project agent is `brainstyworkers-insurance-browser`.
- The repo-scoped `insurance-portal-browser` skill is installed as a workspace skill and reports ready with `browser-automation`.
- Personal OpenClaw skills remain excluded from the project agent.
- LangGraph can dispatch a real official OpenClaw read-only browser observation only after consuming a valid approval token.
- The official worker path starts the dedicated OpenClaw browser, opens the approved URL, captures an accessibility snapshot, and returns the result to LangGraph.
- LangGraph verifies the observed page before creating any eligibility evidence.
- Public Aetna marketing content is blocked with no eligibility snapshot and no source pointer.
- The UI/API expose official OpenClaw readiness and the chat path can opt into the official worker.

Phase 7C is implemented:

- The user manually authenticated in the dedicated OpenClaw browser.
- LangGraph created a proposal and consumed a read-only approval token.
- Official OpenClaw captured a loaded authenticated Aetna member portal snapshot.
- LangGraph verified authenticated member-page and insurance evidence signals.
- The graph created an eligibility snapshot pointer and a verified source-pointer artifact with DOM/extraction hashes.
- Graphiti product memory retain audited safe source-pointer summaries with no direct identifiers and no raw portal text.
- The final response cited the stored source pointers.

Phase 7D is implemented:

- The dedicated OpenClaw project agent now has exactly the required visual evidence skills ready:
  - `browser-automation`
  - `insurance-portal-browser`
  - `ocr-local`
- Official OpenClaw observations now require both:
  - DOM/accessibility snapshot.
  - screenshot plus local OCR.
- OCR is local through the project workspace `ocr-local` skill and does not use an external OCR API.
- Screenshot capture uses the dedicated OpenClaw browser CDP endpoint to avoid changing the global OpenClaw install.
- Evidence creation fails closed if OCR or screenshot capture fails.
- Authenticated portal proof has passed with visual OCR confidence recorded.

Phase 7E is implemented:

- The repo/workspace `insurance-portal-browser` skill no longer presents itself as a replacement for `browser-automation`.
- The skill manifest declares `browser-automation` and `ocr-local` as required companion skills.
- The manifest declares a browser-control policy for status/profile/tab checks, read-before-click snapshots, fresh refs, stale-ref recovery, and manual blocker reporting.
- Artifact validation now enforces the companion-skill boundary.

Phase 7F is implemented:

- A lifecycle regression verifies the LangGraph proof order from policy, memory recall, classifier, router, executor, evidence observation, response composition, model stage, proposal recording, and product-memory retain.
- Worker jobs remain owned by LangGraph and cannot choose workflow.
- Approval tokens are bound to task/session/user/workflow/scope, consumed once, and rejected as `approval_already_consumed` on reuse.
- Reused approval tokens create no source pointer and no additional eligibility snapshot.

Phase 7G is implemented:

- OpenClaw worker jobs may decompose the assigned task into subtasks, run task-scoped status subagents, choose tool paths, open additional browser instances, try public web/scrape/configured read-only API paths, create task-scoped helper skills/scripts, use local OS automation inside scope, and update worker heartbeat memory.
- The task packet now carries product-memory recall and prior sessions into the OpenClaw envelope.
- Progress protocol requires a status subagent, 30-second reports to LangGraph, and no silent failure.
- Terminal outcomes are explicit: sourced result, missing user data, insurance/portal block, policy/approval block, long-running follow-up, or partial result with blockers.
- LangGraph still owns workflow selection, approval gates, final response, and product-memory ingest.
- Credentials, passkeys, 2FA, SSNs, payer contact, external messages, form submissions, record changes, medical advice, and irreversible actions remain gated or forbidden as applicable.

Next implementation:

- Turn the 7C proof into a smoother in-app chat flow: user sees a login-needed state, manually signs in, clicks/answers ready, approves read-only observation, and receives the sourced result in chat.
- Add a dedicated regression for the loading-state wait so the official worker does not snapshot portal skeleton/loading screens.
- Improve structured extraction for the authenticated Aetna home page by reconciling DOM/accessibility text plus visual OCR text so deductible/out-of-pocket values become structured coverage balance rows, not only visible source evidence.
- Keep all non-read-only actions out of scope.

## Phase 8 Status

Phase 8A is implemented:

- LangGraph now contains a GPT-backed orchestration decision node after deterministic safety/structured classification and before workflow routing.
- GPT returns strict JSON for workflow, intent, confidence, required evidence, missing evidence, approval requirement, worker goal, response strategy, and next user question.
- A valid and confident GPT decision can causally route the workflow.
- Deterministic safety refusals and approval gates still override GPT.
- The app records and displays whether GPT was invoked, whether the router used it, the workflow, confidence, and rationale.
- Runtime event infrastructure now persists graph lifecycle events, exposes an SSE stream, supports in-process code hooks, and records outbound webhook subscriptions in dry-run mode unless explicitly enabled.
- Context-packet growth uncovered by live multi-flow testing was hardened by compacting repeated task/job payloads and streaming SQLite write batches through stdin.

Phase 8B is the next implementation:

Phase 8B is implemented:

- The user-facing chat now requires local planned-user sign-in before workflow execution.
- Workflow buttons act as chat shortcuts into the same LangGraph runtime.
- Chat shows a guided state strip for Local Auth, GPT Route, Approval, OpenClaw, and Memory.
- Chat includes a `Portal Ready` control that marks manual user portal readiness and enables live portal/official worker toggles without entering credentials or executing the worker.
- Chat renders a runtime event timeline from `/api/runtime/events` and the SSE stream.
- Browser proof showed Benefits routing through live GPT with `openai_chatopenai_invoked`, `used by router`, `pending_approval`, `actions none`, and seven graph lifecycle events.

Phase 8C is the next implementation:

Phase 8C is implemented:

- `POST /api/orchestrator/approve` publishes `approval.recorded`.
- Approved graph resume publishes `approval.consumed`.
- Evidence observation publishes `worker.status.updated` events for approval wait, official worker dispatch, fail-closed blockers, and sourced success.
- Chat timeline renders approval and worker status events.
- Chat renders a worker-result card with terminal outcome, evidence status, actions, source pointers, structured benefits, and blocker text.

Phase 8D is implemented:

- Improve authenticated portal success quality:
  - structured deductible and out-of-pocket rows are parsed from DOM/accessibility/OCR-style text,
  - persisted `coverage_balances` rows are included as source pointers,
  - chat Worker Result cards show total/spent/remaining rows and evidence channels,
  - official OpenClaw accessibility-tree and local OCR evidence channels can be surfaced in the LangGraph result contract,
  - source-pointer-only memory/model behavior is preserved,
  - fail-closed worker blockers are rendered with friendly user-facing copy.

Phase 8C browser proof is complete:

- Auth plus chat runs through the same LangGraph runtime.
- Approval/resume emits `approval.recorded`, `approval.consumed`, and `worker.status.updated`.
- The post-approval chat renders a `Worker Result` card.
- Missing authenticated portal state fails closed with `blocked_no_authenticated_evidence`.
- `npm run test:local` passes with 85 passing tests and 1 intentionally skipped live official OpenClaw dispatch proof.

Phase 8D browser and test proof is complete:

- Verified portal proof can return two structured benefit rows plus `coverage_balances` source pointers.
- Runtime events include `structuredBenefitCount`.
- The browser fail-closed card uses friendly authenticated-browser guidance and hides the raw Chrome command from the Worker Result card.
- `npm run test:local` passes with 87 passing tests and 1 intentionally skipped live official OpenClaw dispatch proof.

Phase 8E is implemented:

- Added async-follow-up state for longer worker tasks after the synchronous approval/resume loop.
- Persisted worker continuation records bound to session id, user id, task id, scheduled job id, approval scope, correlation id, and last progress event.
- Added worker continuation API controls for create, continue-status, cancel, and list.
- Rendered continue/cancel/status controls in chat without adding new healthcare workflows.
- Published `worker.followup.scheduled`, `worker.followup.continue_requested`, and `worker.followup.cancelled` runtime events.
- Preserved read-only observation boundaries, source-pointer memory, approval gates, and `actionsTaken: []` for continuation controls.

Phase 8E browser and test proof is complete:

- `npm run test:local` passes with 91 passing tests and 1 intentionally skipped live official OpenClaw dispatch proof.
- Browser proof showed live GPT benefits routing, async follow-up scheduling, continue-request, cancel, timeline events, read-only scope, and actions taken none.
- The terminal cancelled card now closes the controls and does not offer an active continue button.

Phase 8F is implemented:

- Turned the continuation record into the official OpenClaw status/observation bridge:
  - validates a pending continuation before approval is consumed,
  - requires the dedicated official OpenClaw read-only worker for continuation dispatch,
  - consumes the continuation only from a fresh approved graph run,
  - dispatches only the bound read-only status/observation action,
  - finalizes the continuation as completed or blocked after official worker result ingest,
  - publishes `worker.followup.dispatching`, `worker.followup.completed`, `worker.followup.blocked`, and `worker.followup.expired`,
  - keeps manual continue/cancel as user controls,
  - keeps all external/irreversible actions outside this MVP scope.

Phase 8F browser and test proof is complete:

- Focused tests prove continuation validation, approved dispatch consumption, completion finalization, and pre-approval block when the official worker flag is missing.
- Browser proof shows the auth-plus-chat flow can schedule a continuation, render `Approve + Run Official Read-Only`, keep the read-only scope visible, and emit scheduled/continue events with actions none before official dispatch.
- The live official OpenClaw continuation-dispatch test is wired but remains intentionally gated behind `BRAINSTY_OPENCLAW_OFFICIAL_LIVE=1`.

Phase 8G is implemented as a live-gated proof path:

- The official OpenClaw runtime can now use the already-authenticated current tab in the dedicated project browser profile instead of forcing navigation back to a public payer URL.
- The auth-plus-chat UI exposes `Use current OpenClaw tab` next to the existing live portal proof and official worker toggles.
- `Portal Ready` now enables live proof, official worker dispatch, and current-tab mode together.
- LangGraph passes `officialOpenClawUseCurrentTab` into the official worker observation node.
- Official OpenClaw current-tab observation:
  - starts the dedicated project browser profile,
  - requires an existing current tab,
  - focuses that tab when possible,
  - captures accessibility-tree evidence,
  - captures a screenshot through CDP,
  - runs local OCR,
  - verifies authenticated member-portal evidence,
  - finalizes the continuation as completed or blocked.
- Added `npm run test:live:openclaw-auth`, which runs only the authenticated current-tab live proof and requires:
  - `BRAINSTY_OPENCLAW_AUTHENTICATED_LIVE=1`
  - `BRAINSTY_OPENCLAW_OFFICIAL_LIVE=1`
  - `BRAINSTY_OPENCLAW_USE_CURRENT_TAB=1`
  - `BRAINSTY_PORTAL_LIVE=1`

Phase 8G live proof status:

- The dedicated official OpenClaw profile is ready and isolated.
- The first live authenticated proof attempt failed loudly because there was no open authenticated member-portal tab in the dedicated OpenClaw profile.
- After the user manually opened and logged into the dedicated profile, the authenticated current-tab proof passed:
  - `npm run test:live:openclaw-auth`
  - 1 test passed, 0 failed.
- The proof used the dedicated OpenClaw current tab, validated the continuation and approval path, captured source-pointer evidence, and completed the worker continuation.
- The same lane also passed from the user-facing chat UI after the app was restarted with live-proof flags:
  - Sign In -> Benefits -> Leave As Async Follow-Up -> Portal Ready -> Approve + Run Official Read-Only.
  - The Worker Result card showed `completed_with_sourced_result`, 4 source pointers, and 2 structured benefit rows.
  - The runtime timeline showed dispatch and completion events.

Phase 8H is implemented as the post-success chat loop hardening slice:

- Polish the successful post-proof chat loop rather than adding workflow breadth:
  - terminal completed continuation cards no longer show active continue/cancel/run controls,
  - existing continuation cards are replaced in place when a completed/blocked/cancelled/expired continuation returns,
  - missing-data prompts no longer re-ask for portal evidence after source pointers or captured evidence exist,
  - successful evidence answers are compact, cite stored source pointers, and avoid raw portal text,
  - login/sign-in/credential-gate pages are blocked before evidence creation,
  - official OpenClaw accessibility-tree evidence is parsed into structured benefits/claims/prior-authorization rows when visible,
  - transient local SQLite shared-DB locks wait longer instead of failing the proof harness,
  - operator trace/debug dashboard should remain available for audit proof.

Phase 8I is implemented as the repeatable MVP harness slice:

- Turn the hardened proof into a repeatable MVP test harness:
  - the chat has `Reset MVP Journey` and `Replay Benefits MVP` controls,
  - reset clears the local journey surface, closes the runtime event stream, clears active session selection, and leaves existing local audit/database records intact,
  - replay starts a real planned-user local auth session and sends the benefits question through `/api/chat`,
  - the answer panel foregrounds the current answer, workflow, source pointers, worker result/actions, structured benefits, GPT routing mode, and graph trace,
  - approval and async-follow-up controls can be launched from the answer panel when source evidence is still pending,
  - workflow proof, worker result, source pointers, payload audits, and runtime timeline remain available as expandable operator proof.

Phase 8J is implemented as the multi-page read-only worker navigation slice:

- Deepens the OpenClaw worker navigation proof without adding new healthcare workflows:
  - the official worker can build a same-origin read-only navigation plan from real authenticated portal links,
  - selected page goals include benefits, spending, claims, and prior authorizations,
  - forbidden paths include logout/signout, profile, messages, forms, uploads, credential gates, public/legal pages, and irreversible-action paths,
  - each observed page captures DOM/accessibility, CDP screenshot, and local OCR evidence,
  - LangGraph verifies each page before source-pointer creation,
  - the evidence observation includes page counts, verified/blocked page counts, navigation plan, page blockers, source pointers, structured benefits, and worker actions,
  - the chat answer panel and Worker Result proof surface the multi-page worker outcome.

Phase 8K is implemented as the user-friendly live worker readiness and recovery slice:

- Turns the raw OpenClaw toggles into a guided live-worker readiness path:
  - classifies the dedicated official OpenClaw profile, browser, current tab, login/challenge pages, public marketing pages, and ready member-portal pages,
  - shows the user what must happen next before approving a live read-only run,
  - exposes the worker versatility that is allowed after LangGraph approval: same-site portal navigation, DOM/accessibility scrape, visual OCR confirmation, configured read-only API/public lookups, and manual-export fallback,
  - keeps blocked actions explicit: credential entry, password manager access, passkeys/2FA, SSN entry, payer contact, external messaging, form submission, record changes, and medical advice,
  - integrates `/api/openclaw/official/status` with `liveReadiness` so the UI and operator trace use the same contract,
  - keeps auth recovery user-controlled instead of attempting to bypass login or session challenges.

Phase 8L is implemented as the guided live app multi-page OpenClaw proof:

- Proved the Phase 8K readiness path with the dedicated project OpenClaw profile already authenticated:
  - `Check Live Worker` reported `ready_for_read_only_approval`,
  - `Portal Ready` enabled live portal proof, official worker dispatch, current-tab mode, and multi-page mode,
  - the Benefits MVP path produced the approval-needed answer with `actions none`,
  - approving read-only observation consumed the approval and dispatched the official OpenClaw worker,
  - the current answer became a sourced executed answer rather than proposal-only text,
  - evidence status was `captured_official_openclaw_multi_page_read_only_observation`,
  - worker terminal outcome was `completed_with_sourced_result`,
  - 2/2 pages were verified,
  - 3 source pointers were displayed,
  - live GPT routing was invoked and used.
- Code hardening from the proof:
  - known authenticated member portal hosts are accepted by readiness when they are not login/challenge/public pages,
  - multi-page official evidence is treated as captured evidence during response composition,
  - `partial_result_with_blockers` is a completed continuation outcome when sourced evidence exists,
  - final-answer tests now prevent sourced executions from being described as "not executed in this slice."

Phase 8M OpenClaw insurance skill playbook hardening is implemented:

- The repo-scoped and dedicated-workspace `insurance-portal-browser` skill now explicitly instructs the OpenClaw worker to:
  - restate the assigned insurance question,
  - use authenticated current-tab or approved portal navigation after user-controlled auth,
  - inspect DOM, accessibility tree, links, buttons, forms, tables, cards, and safe read-only page text,
  - run local visual OCR for rendered tables, cards, modals, images, canvas, and PDF viewers,
  - use portal search and likely portal sections such as Benefits, Coverage, Claims, Documents, Pharmacy, and Summary of Benefits and Coverage,
  - read needed official portal documents or PDFs only in read-only mode,
  - collect structured insurance fields such as deductible, out-of-pocket max, copays, coinsurance, pharmacy benefits, claims summaries, and documents found,
  - return JSON-compatible evidence, uncertainties, recommended next steps, source pointers, status updates, subtasks, actions taken, and terminal outcomes.
- The worker job contract and OpenClaw prompt contract now carry the same skill playbook so LangGraph delegation and OpenClaw execution receive one coherent contract.
- Credential entry, password manager access, passkeys, 2FA, captcha solving, SSN entry, payer contact, external messages, form submission, record changes, and medical advice remain blocked or user-only.

Phase 8N user-facing MVP result loop hardening is implemented:

- The Current Answer panel now names itself as the latest LangGraph result for the active session, so older pre-approval chat history is not mistaken for the current sourced result.
- Assistant messages from the newest graph run receive a current-answer style marker while operator proof remains expandable.
- The Current Answer and Worker Result now show structured benefits, structured claims/prior-authorization summaries, worker outcome/actions, source pointers, GPT routing, trace id, and product-memory retain/repair status.
- Graphiti product-memory retain now returns repair metadata:
  - retryable runtime failures are classified separately from payload-policy failures,
  - fast retryable failures attempt one repair retry unless disabled by `BRAINSTY_PRODUCT_MEMORY_RETAIN_RETRY=0`,
  - timeout failures are not doubled by an automatic retry and instead show the next repair action,
  - runtime events and UI proof expose retain attempts, repair status, next action, and whether the retry repaired the failure.
- LangGraph source pointers now include structured `claim_items` and `prior_authorizations` rows when the portal evidence contains them, while user-facing answers remain source-pointer based and do not expose raw portal text.

Next implementation:

- Phase 8O should run the enriched live worker playbook against the authenticated portal and verify whether portal-search/document/PDF branches are reachable:
  - keep the same eligibility/benefits journey,
  - use the dedicated OpenClaw current tab after user-controlled auth,
  - exercise same-site navigation plus portal search where available,
  - record whether official documents/SBC/PDFs are found or blocked,
  - keep Graphiti retain status visible in chat.

## Full Working Test Recommendation

- Phase 4 is the right phase to test the real authenticated portal evidence loop: approval -> read-only observation -> verified source pointer -> sourced answer.
- Phase 5 is the first suitable phase to test the full target MVP slice, because the target explicitly includes safe product-memory retain/recall.
- Phase 6 is the right phase for customer-facing readiness testing, because PHI payload assertions, transactional state, audit integrity, and concurrency hardening are still open.

## MVP User Interface Direction

The final MVP interface should be auth plus chat first:

- The user signs in through the local planned-user auth flow.
- The user asks a question or clicks a workflow button.
- Chat routes the request through LangGraph.
- Chat asks for missing information when workflow evidence is incomplete.
- Chat exposes approval cards for read-only observation.
- Chat receives OpenClaw proposal/result proof and source pointers.
- The proof dashboard remains available for operator/debug verification.

LangSmith is not required for the MVP. The app can render workflow proof from the local graph state, audit trace, OpenClaw proposal, approval state, evidence state, and source pointers. LangSmith can be added later for developer observability and evaluation.

## Pending Slice 1 Contract

See `docs/SLICE_1_PENDING_SPEC.md` for the revised implementation-ready slice.

## LangChain, LangGraph, Hindsight, And Vercel Scope Verification

- LangGraph short-term memory/session continuity is thread-scoped graph state persisted by checkpointers. This maps to slice 1 sessions and browser runs.
- LangGraph stores are for cross-thread user/application data. This maps to user profile, portal account metadata, and approved extracted facts.
- The local memory harness now provides hook-style recall/retain records, context packets, and database pointers. Real Hindsight remains the later vector/temporal adapter, not yet installed or called.
- OpenClaw heartbeat is local now: it plans tasks and approval-gated outbox records, but it does not send WhatsApp/email or execute external adapters yet.
- Prompt contracts now separate orchestrator identity/policy from the OpenClaw execution arm. Memory and portal data are marked as untrusted context, not instructions.
- Runtime adapter compatibility now maps one local context packet into LangChain config/messages, LangGraph-style state, OpenClaw task/heartbeat envelopes, and Hindsight retain candidates. This is local compatibility proof, not live runtime execution.
- Workflow architecture registry now maps planned user journeys to workflow definitions, required user data, required database pointers, required tools, authoritative sources, OpenClaw skills, route candidates, and journey events before live runtime execution.
- All new temporal fields use ISO-8601 UTC strings stored as SQLite `TEXT`, compatible with JavaScript `Date.toISOString()`, LangGraph JSON state, and Hindsight-style timestamp payloads.
- Vercel no longer offers new first-party Vercel Postgres. New Vercel-connected relational storage should use Marketplace Postgres providers such as Neon, Supabase, or Prisma Postgres, with environment variables injected into the project.
