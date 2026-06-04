# Implementation Plan

Status: MVP hardening Phases 1-8U are implemented locally, and Wefella/FastAPI facade Phases 9A-9F are implemented locally through the approved-loop precise-blocker proof. Phase 7D adds mandatory visual OCR evidence to the official OpenClaw read-only worker path. Phase 7E corrects the OpenClaw skill layering so `insurance-portal-browser` is the healthcare safety envelope, `browser-automation` is the browser-control substrate, and `ocr-local` is the local visual evidence substrate. Phase 7F verifies LangGraph-owned worker cycle management from proposal through single-use approval, result ingest, audit, and no-action token reuse. Phase 7G expands the OpenClaw worker contract so the worker can create subtasks, choose tool paths, use worker memory, and report progress every 30 seconds inside the assigned LangGraph task. Phase 8M enriches the project OpenClaw insurance-browser skill and worker prompt with portal search, DOM/accessibility extraction, visual OCR, read-only document/PDF handling, structured insurance data fields, quality bars, and user-only auth recovery. Phase 8N applies that contract to the auth-plus-chat MVP loop with a clearer latest Current Answer, Graphiti retain repair/status, and source-pointer-safe claims/prior-authorization extraction. Phase 8O makes the official OpenClaw live worker path record portal-search, document discovery, SBC/PDF candidate, and section reachability proof from the same approved read-only observation. Phase 8P proved the live discovery harness against an authenticated portal. Phase 8Q added a separate user-friendly `/mvp` auth-plus-chat sequencing app while preserving `/` as the operator proof dashboard. Phase 8R proved the live approved Benefits path from `/mvp` through user auth, LangGraph proposal, approval consumption, official OpenClaw multi-page read-only observation, source-pointer persistence, final answer, and Graphiti retain. Phase 8S added section-specific structured extraction and replaced mutable local real-Aetna DB assumptions with sanitized captured-format fixtures. Phase 8T adds candidate-specific document approval. Phase 8U adds approved single-candidate read-only document observation through the official OpenClaw worker path. Phase 9F proves `/mvp` can run the approved loop through FastAPI and return either source pointers or a precise external blocker with matching operator proof. Phases 10E-10L add the operator research control plane, RBAC, deterministic research execution, artifact review, trusted research grounding in user answers, operator proposal gates, scheduled research automation, and the redacted audit log API/dashboard. Phase 10U adds a LangGraph-compatible dynamic skill server with editable temporary Aetna insurance and claim journey skills.

Source of truth:
- `docs/CODEX_START_PROMPT.md`
- `AGENTS.md`
- `brainstyworkers_ai_concierge_prompt.md`

Last updated: 2026-06-01

## Phase 10U - Dynamic Skill Server For Insurance And Journey Skills

Goal:
- Add a structured, editable skill server that lets LangGraph reason over two skill categories: insurance-specific skills and journey-specific skills.
- Keep OpenClaw as the execution skill for read-only portal/browser work, not as the healthcare workflow selector.

Implementation plan:
- Add `src/concierge/dynamicSkillServer.mjs`.
- Add editable sketch artifacts:
  - `openclaw/skills/insurance-plan-aetna-temporary/skill-server.json`
  - `openclaw/skills/claim-journey-temporary/skill-server.json`
- Add `dynamic_skill_context` to LangGraph shared state.
- Add `skill_resolver` node after `workflow_router` and before `workflow_executor`.
- Add pre-LLM skill hints during `recall_context` so GPT can consider available skills before advising a route.
- Add API proof:
  - `GET /api/dynamic-skills`
  - `POST /api/dynamic-skills/resolve`
- Keep runtime mounts safe:
  - skill files declare named memory/session/database needs;
  - the server executes only allowlisted database query keys;
  - skill artifacts cannot introduce raw SQL, credentials, medical advice, or unapproved external actions.

LangGraph compatibility rules:
- Nodes update shared state through normal partial state returns.
- The dynamic skill server returns graph-visible `dynamic_skill_context`; it does not mutate hidden worker state.
- The context includes thread/session/user identifiers so it can run under the existing `configurable.thread_id` checkpoint pattern.
- The resolver is a deterministic graph node, not an OpenClaw worker decision.

Acceptance:
- The temporary Aetna skill resolves as `insurance_specific`.
- The temporary claim skill resolves as `journey_specific`.
- Account-specific evidence still routes execution to `insurance_portal_browser`.
- The LLM orchestration decision payload includes dynamic skill hints.
- LangGraph proof contains a `skill_resolver` step.
- `npm run build` fails if the temporary skills or dynamic resolver contract break.

## Current Restart Point - Phase 9F Implemented

The project currently has two local web surfaces on the same Node server:

- `/` is the existing operator/debug proof dashboard. Keep it for deep state inspection, raw trace JSON, skill validation, proof panels, and regression debugging.
- `/mvp` is the new user-facing MVP sequencing app. It is the primary surface to test whether a user can understand and operate the real system path.

What `/mvp` is expected to do right now:

- Start a local planned-user session through `POST /api/orchestrator/auth-start`.
- Accept chat messages and workflow shortcut buttons, then route them through `POST /api/chat`.
- Show the current LangGraph answer, workflow, GPT/intent decision state, approval state, OpenClaw worker outcome, source-pointer count, product-memory retain state, and trace id.
- Show a sequence rail for Auth -> GPT/Intent -> Approval -> OpenClaw -> Evidence -> Memory -> Answer.
- Check official OpenClaw readiness through `GET /api/openclaw/official/status`.
- Create and consume read-only approvals through `POST /api/orchestrator/approve`.
- Create a worker continuation through `POST /api/worker-continuations` when official OpenClaw dispatch is selected.
- Render Discovery/Next Evidence from source-pointer-safe state: portal search status, document candidate counts, SBC/PDF counts, sections tried/reachable, and fallback chain.
- Present Discovery document candidates as individual selectable items with stable `candidateId` values.
- Prepare a candidate-specific proposal through `POST /api/document-candidates/propose`.
- Approve exactly one candidate through `read_only_document_observation` scope and resume the graph so official OpenClaw observes only that candidate URL.

Expected current behavior in a non-live replay:

- `Start Session` creates a real local session.
- `Benefits` routes to `eligibility_benefits_navigation`.
- The answer explains that the OpenClaw task envelope is prepared and pending approval.
- The Approval Gate shows a pending read-only proposal task.
- Discovery/Next Evidence remains empty until an approved worker run actually produces evidence.
- No payer API, external message, credential entry, form submission, account change, or medical advice occurs.

Expected current behavior in a live approved replay:

- The dedicated Brainstyworkers OpenClaw browser/profile must already be authenticated by the user.
- The server must allow live portal proof with `BRAINSTY_PORTAL_LIVE=1` before official OpenClaw evidence can create healthcare source pointers.
- The user clicks `Portal Ready` or `Check Worker` and should see `ready_for_read_only_approval` when the authenticated member portal tab is usable.
- The user runs the Benefits workflow and approves only read-only observation.
- If official OpenClaw is selected, the UI creates a worker continuation id, records approval, resumes `/api/chat` with the approval token and continuation id, and displays the resulting source pointers or blockers.
- If auth, portal verification, live flag, or page verification blocks the run, the system should report the blocker and create no false healthcare evidence.

The local implementation proof for Phase 8Q is commit `05e0799 feat: add user-facing MVP sequencing app`. Focused static checks, `npm run build`, browser proof at `/mvp`, and `npm run test:local` passed.

Phase 8R live proof passed on 2026-05-31 local / 2026-06-01 UTC:

- `/api/openclaw/official/status` reported `ready_for_read_only_approval` on an authenticated dedicated Aetna member portal tab.
- `/mvp` ran Benefits, requested approval, consumed the approval, dispatched the official OpenClaw worker, captured 8 source pointers from 4 verified pages, retained product memory through Graphiti, and displayed the final sourced answer.
- The live run remained read-only and did not perform payer contact, credential entry, password manager use, form submission, account modification, external messaging, or medical advice.
- The proof UI was tightened so completed approvals, reachable sections, and product-memory retain are displayed clearly.

Phase 8S is now complete:

- `structuredExtraction.mjs` extracts safe section/document/ID/pharmacy/network/plan signals in addition to coverage balances, claims, and prior authorizations.
- `outputPolicy.mjs` can include a source-pointer-safe section evidence line in the final answer.
- Sanitized captured-format Aetna fixtures now cover home/benefits and claims pages without depending on mutable local DB rows or exposing raw real portal text in test fixtures.
- The previous local-data fragility in `real-aetna-structured.test.mjs` and `portal-scan-real.test.mjs` has been removed from `npm run test:local`.
- `npm run test:local` passed with 116 tests total, 114 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.

Phase 8T/8U implementation status:

- Discovery candidates now carry stable IDs derived from URL/type/label/source.
- The server exposes `GET /api/document-candidates` and `POST /api/document-candidates/propose`.
- Candidate proposals reuse `agent_tasks.metadata_json` with task type `openclaw_document_candidate_proposal`; no new table was added.
- Candidate approvals bind user, session, workflow, task, candidate ID, candidate URL, allowed action, scope, expiration, and single-use token.
- Mixed-form, submission, offsite, missing URL, and irreversible candidates are blocked before proposal/approval.
- LangGraph can consume `read_only_document_observation`, create a candidate-scoped continuation, dispatch official OpenClaw to the approved candidate URL only, and return a source-pointer-based document observation result.
- `/mvp` and `/` both render candidate cards and approval controls while preserving the operator proof dashboard.

The next implementation phase is Phase 8V/8W: polish the MVP user/operator split and then run the full original MVP gate, including a live authenticated OpenClaw document-candidate proof when the user has the dedicated profile logged into the portal.

### Phase 8W - Full Original MVP Gate - In Progress / External Portal Blocked

Goal:
- Prove the complete user value loop through `/mvp` and `/` before the backend architecture pivot.

Current proof:
- Local build and full local tests are green.
- `/mvp` and `/` can point at the same real session, proposal task, approval gate, and trace.
- A real approved official OpenClaw continuation can fail closed when the insurer portal is unavailable.

External blocker observed on 2026-06-01:
- Aetna/member portal was unavailable during the live proof window.
- Official OpenClaw readiness returned `auth_required` with no current authenticated member portal tab.
- The approved worker continuation finalized as `blocked` with terminal outcome `not_possible_insurance_or_portal_block`.
- No source pointers or document candidates were created.

Hardening completed:
- `blocked_no_authenticated_evidence` now renders as a clear user-facing final answer instead of reusing old proposal-only language.
- The blocked answer reports the blocker, approval state, scoped worker actions attempted, absence of source pointers/document candidates, and the next user action.
- `src/tests/langgraph-runner.test.mjs` includes the approved-but-unavailable portal regression.

Resume instructions:
- When Aetna is available again, start from `/mvp`.
- Use the same Benefits journey.
- Check `Portal Ready` after the user manually signs in through the dedicated OpenClaw browser profile.
- Approve read-only portal observation.
- Confirm source pointers and Discovery candidates.
- Approve one document candidate and run the approved read-only document observation.
- Verify `/mvp` and `/` agree on graph trace, audit, approval, worker continuation, source pointers, and Graphiti retain.

Backend architecture note:
- `docs/wefella-mvp-engineering-prompt.html` remains a support document for the later complementary Wefella/FastAPI facade.
- Do not begin that pivot until the original MVP live source-pointer/document-candidate gate completes or the user explicitly changes the priority.

## Next Phases From Here

### Phase 8R - Live Approved MVP Run From `/mvp` - Complete

Goal:
- Prove the full user-facing loop from the new MVP view, not only from tests or the operator dashboard.

Tasks:
- Start the dev server with the live portal proof environment enabled.
- Ask the user to authenticate the dedicated OpenClaw browser profile and leave the member portal tab open.
- Open `/mvp`, click `Portal Ready`, and confirm `ready_for_read_only_approval`.
- Run Benefits from the workflow button.
- Approve read-only observation from the MVP Approval Gate.
- Confirm Current Answer, Sequence, Discovery/Next Evidence, runtime events, and Approval Gate all update from the same graph run.
- Record screenshots/browser proof and update `docs/PROGRESS.md`.

Acceptance:
- `/mvp` shows a sourced answer or a clear blocker.
- Source pointers are present only when LangGraph verifies authenticated portal evidence.
- Discovery/Next Evidence shows portal-search/document/section metadata after worker execution.
- The proof dashboard `/` still works and agrees with the MVP route's session/trace.

Proof:
- Passed in browser with the dedicated project OpenClaw profile and user-authenticated Aetna member portal.
- See `docs/PROGRESS.md` Phase 8R entry for exact commands, events, and residual risks.

### Phase 8S - Section-Specific Structured Extraction - Complete

Goal:
- Convert the live-reachable portal surfaces into better structured evidence before adding PDF ingestion.

Tasks:
- Improve extraction for benefits, spending, claims, prior authorizations, documents, ID card, pharmacy, and network surfaces.
- Keep source-pointer-safe answer composition.
- Add tests using stored/sanitized portal page fixtures for each section.
- Show extracted structured facts in `/mvp` only as safe summaries and source pointers.

Acceptance:
- More fields are populated from real observed pages without raw portal dumps.
- Current Answer can cite which section supplied which safe field.
- No document/PDF download happens in this phase.

Proof:
- `node --check src/concierge/structuredExtraction.mjs` passed.
- `node --check src/concierge/outputPolicy.mjs` passed.
- Focused extraction/portal-scan tests passed.
- `npm run build` passed.
- `npm run test:local` passed with 116 tests total, 114 passed, 0 failed, and 2 expected live-gated skips.
- `/mvp` browser smoke loaded with title `Brainstyworkers Concierge MVP`, visible sequence controls, and 0 console errors.

### Phase 8T - Narrow Document Candidate Approval - Complete

Goal:
- Add a second, narrower approval scope for opening or downloading a specific read-only document candidate.

Tasks:
- Reuse Discovery document candidates as selectable proof items.
- Add approval scope such as `read_only_document_observation`.
- Bind approval to a specific candidate/source pointer, session, user, workflow, expiration, and allowed action.
- Block mixed form/submission/offsite candidates unless the user gives a separate action-specific approval.

Acceptance:
- `/mvp` can ask for approval for one document candidate without granting broad PDF/document access.
- Denied/expired approval takes no worker action.
- Approved document observation records a source pointer or a precise blocker.

Proof:
- Stable candidate IDs, blocked candidate rejection, candidate approval binding/mismatch/expiry behavior, continuation scope, output policy, UI contract, and build checks pass locally.
- `npm run test:local` passed with 123 tests total, 121 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- This phase still does not download, parse, or dump documents.

### Phase 8U - Approved Read-Only Document Observation - Implemented

Goal:
- Only after Phase 8T, observe an approved official document/PDF candidate in read-only mode.

Tasks:
- Use official OpenClaw to open exactly the approved candidate URL.
- Capture DOM/accessibility and local screenshot OCR using the same verified worker evidence path.
- Record document source pointers, hashes, document title/type, and extraction provenance.
- Keep final answer source-pointer based.

Acceptance:
- The system can answer a benefits question from an approved official document and cite the document pointer.
- No broad document crawl, raw document dump, external message, payer contact, or form submission occurs.

Current scope note:
- The implemented 8U path observes one candidate page/document URL and verifies/stores source pointers. Full PDF text extraction or document-specific structured field parsing remains deferred until the live proof shows which official document surfaces need it.

### Phase 8V - MVP Polish And Operator/User Split

Goal:
- Make `/mvp` suitable for repeated user testing while `/` remains the operator console.

Tasks:
- Reduce confusing proposal-only wording in the user view when a newer approved result exists.
- Add clearer blocker cards and retry/resume actions.
- Add a compact session selector or resume latest flow.
- Keep all proof available through links or expandable sections, not hidden.

Acceptance:
- A tester can run the benefits journey without reading raw JSON.
- An engineer can still inspect trace, runtime events, approval, worker continuation, source pointers, and memory state.

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

Phase 8O enriched live worker discovery proof is implemented:

- The official OpenClaw runtime now creates a source-pointer-safe discovery report during the same approved read-only observation:
  - portal search affordance scan from visible DOM controls, buttons, inputs, links, and text signals without submitting a query,
  - official document/SBC/PDF candidate discovery from same-site links without downloading documents,
  - read-only/mixed-form/offsite blocker classification for document candidates,
  - portal sections tried and reachable from same-site navigation and visible page signals,
  - fallback chain from same-site navigation to portal search, official documents/PDFs when needed, and manual user export.
- LangGraph carries that discovery report into evidence observations, worker status events, continuation metadata, proof output, and sourced answer composition.
- The auth-plus-chat UI now shows Discovery in Current Answer, Workflow Proof, Worker Result, and runtime event summaries.
- User-facing answers still cite stored source pointers and do not expose raw portal text.

Next implementation:

- Phase 8P should perform a fresh live authenticated run with the dedicated OpenClaw profile and inspect the discovery report against the real portal:
  - confirm whether the current portal exposes usable search controls,
  - confirm which official document/SBC/PDF candidates are visible, blocked, or need a separate read-only document approval,
  - decide whether the next slice should add actual read-only PDF/document ingestion or first improve page-specific extraction for the discovered sections,
  - keep Graphiti retain status visible in chat.

Phase 8P live discovery proof harness is prepared:

- `npm run test:live:openclaw-discovery` now runs the authenticated current-tab multi-page official OpenClaw proof with live portal proof enabled.
- The live proof now asserts:
  - the sourced answer includes the OpenClaw discovery proof line,
  - the discovery report scanned portal search affordances without submitting a query,
  - document/SBC/PDF discovery ran without download or PDF analysis side effects,
  - raw document dumps remain disallowed,
  - worker actions include `openclaw_portal_search_affordance_scan` and `openclaw_document_candidate_discovery`,
  - worker status events carry discovery metadata and SBC/PDF counts.
- The actual live proof still requires the user to manually sign in to the dedicated OpenClaw browser and leave the authenticated member portal tab open.

Phase 8P live discovery proof passed:

- `npm run test:live:openclaw-discovery` passed with the dedicated OpenClaw browser authenticated.
- The worker used the current member-portal tab, navigated same-site read-only pages, captured DOM/accessibility evidence, CDP screenshots, and local OCR, verified 4/4 pages, and created 8 source pointers.
- The discovery report found portal search affordances but did not submit a query.
- The discovery report found document candidates for document center, ID card, plan document, and EOB surfaces.
- One mixed document/form candidate was blocked for user-confirmation safety.
- No SBC/PDF candidates were surfaced from the observed pages.

Next implementation:

- Phase 8Q should convert the live discovery proof into a better user-facing MVP loop:
  - show Discovery/Next Evidence metadata in chat without raw portal text,
  - enrich page-specific structured extraction for the sections actually reachable from the live portal,
  - add a narrower read-only document approval path before any future PDF/document ingestion,
  - keep direct PDF ingestion deferred until a visible document candidate requires it and has its own approval scope.

## Phase 8Q - User-Friendly MVP Sequencing App

Goal:
- Add a sibling user-facing `/mvp` app that tests the full system sequence without replacing the current proof dashboard.

Implementation plan:
- Keep `/` as the operator/debug proof dashboard.
- Add `/mvp` as the user-friendly auth-plus-chat app served by the existing Node/static server.
- Wire `/mvp` only to real existing APIs:
  - `POST /api/orchestrator/auth-start`,
  - `POST /api/chat`,
  - `GET /api/openclaw/official/status`,
  - `POST /api/orchestrator/approve`,
  - `POST /api/worker-continuations`,
  - `GET /api/runtime/events`,
  - `GET /api/runtime/events/stream`.
- Show the real sequence states: Auth, GPT/Intent, Approval, OpenClaw, Evidence, Memory, Answer.
- Let workflow buttons fill and submit chat messages, not bypass LangGraph.
- Let the user approve only read-only observation, with official OpenClaw dispatch using the existing worker continuation requirement.
- Render Current Answer and Discovery/Next Evidence using source-pointer-safe state only.
- Defer Next.js migration; the current UI need is sequencing proof, not a new deployment architecture.

Acceptance proof:
- Static checks for `src/app/mvp.js` and `src/server/server.mjs`.
- UI contract test proves `/mvp` uses real endpoints and exposes sequence, approval, worker, discovery, and source-pointer fields.
- `npm run build` passes.
- Browser verification loads `http://127.0.0.1:4173/mvp` and proves Start Session can create a real local session.

## Full Working Test Recommendation

- Phase 4 is the right phase to test the real authenticated portal evidence loop: approval -> read-only observation -> verified source pointer -> sourced answer.
- Phase 5 is the first suitable phase to test the full target MVP slice, because the target explicitly includes safe product-memory retain/recall.
- Phase 6 is the right phase for customer-facing readiness testing, because PHI payload assertions, transactional state, audit integrity, and concurrency hardening are still open.

## Phase 9A - Wefella FastAPI Facade Over The Proven Runtime

Goal:
- Start the complementary Wefella backend alignment without rewriting or bypassing the working Node/LangGraph/OpenClaw runtime.

Implementation plan:
- Keep Node/LangGraph/OpenClaw/Zep Graphiti as the current product runtime and source of truth.
- Add a small FastAPI facade under `project/api/` that exposes the future public API shape.
- Protect chat entrypoints with a local HS256 bearer token contract for development.
- Delegate `POST /api/chat` from FastAPI to the existing Node `/api/chat` runtime.
- Return an accepted task id immediately in the production server path, with task status and SSE-style stream endpoints for polling.
- Keep `/api/health` public and have it report whether the Node runtime is reachable.
- Add tests that prove auth rejection, user-subject binding, health reporting, and live Node delegation when explicitly enabled.

Acceptance proof:
- `python3 -m compileall -q project` passes.
- `npm run test:facade` passes with the live delegation test skipped by default.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passes when the Node runtime is running.
- `npm run build` verifies the facade files are present.
- This phase must not replace the existing `/mvp` or `/` proof surfaces.

Next implementation after 9A:
- Phase 9B should connect the existing `/mvp` UI to the FastAPI facade as an optional API path while preserving the current Node API path for side-by-side parity.
- Phase 9C should proxy the remaining MVP actions through FastAPI: approval, worker continuation, document-candidate proposal, OpenClaw readiness, and runtime event status.
- Phase 9D should make `/mvp` FastAPI-first by default and keep the Node-direct path as an operator parity escape hatch.
- Phase 9E should add production-grade auth/JWT provider integration only after the facade parity tests are stable.

## Phase 9B - MVP Facade Route And Task Stream Proof

Goal:
- Let the current `/mvp` user-facing app exercise the Wefella FastAPI contract without losing the existing Node proof path.

Implementation plan:
- Add an API route selector to `/mvp`:
  - direct Node/LangGraph runtime,
  - Wefella FastAPI facade.
- Add FastAPI local MVP auth at `POST /api/auth/local-session`:
  - delegates local planned-user auth-start to Node,
  - returns the same enrollment plus a local bearer token bound to the Node user id.
- Keep protected FastAPI chat/status/stream endpoints behind JWT.
- Bind facade task status/stream reads to the JWT subject that created the task.
- Extend facade chat payloads so approval tokens, worker continuation ids, live portal proof flags, official OpenClaw flags, and document candidate ids can pass through to the existing Node graph.
- In `/mvp`, submit chat through FastAPI when selected:
  - `POST /api/chat`,
  - stream `GET /api/chat/stream/{task_id}` with bearer auth,
  - fall back to `GET /api/chat/status/{task_id}` polling if streaming fails.
- Keep approval, worker continuation, OpenClaw readiness, document candidates, and runtime event proof on the existing Node route until Phase 9C proxies them through FastAPI.

Acceptance proof:
- FastAPI unit tests cover local auth, protected chat, subject/task binding, stream terminal events, and live Node delegation.
- UI contract tests prove `/mvp` exposes the facade route and uses task stream/status code paths.
- Browser proof shows `/mvp` can run a Benefits question through the facade and render the same LangGraph proposal state.
- No OpenClaw worker execution, credential entry, payer contact, form submission, external message, or medical advice is introduced by this phase.

## Phase 9C - FastAPI Proxies For Remaining MVP Actions

Goal:
- Move all user-facing `/mvp` actions behind the FastAPI facade when Wefella mode is selected, while preserving Node as the internal orchestration runtime.

Implementation plan:
- Add FastAPI protected proxy endpoints for:
  - `POST /api/orchestrator/approve`,
  - `GET/POST /api/worker-continuations`,
  - `POST /api/worker-continuations/{id}/cancel`,
  - `POST /api/worker-continuations/{id}/continue`,
  - `GET /api/document-candidates`,
  - `POST /api/document-candidates/propose`,
  - `GET /api/openclaw/official/status`,
  - `GET /api/runtime/events`,
  - `GET /api/runtime/events/stream`.
- Enforce JWT subject binding:
  - query `userId` must match the token subject,
  - body `userId` must match the token subject,
  - when omitted, the facade injects `userId` from the token.
- Change `/mvp` to use the facade for runtime events, OpenClaw readiness, approval, worker continuation, and document-candidate actions when Wefella mode is selected.
- Keep direct Node mode available for parity testing.
- Keep `/` operator dashboard on Node during this phase.

Acceptance proof:
- FastAPI proxy unit tests cover protected delegation and user mismatch rejection.
- `/mvp` browser proof in Wefella mode shows local auth, OpenClaw readiness, runtime event stream/snapshot, Benefits chat stream, document candidate load, and pending approval through the facade.
- `npm run build` and `npm run test:local` pass.
- No new worker action occurs without the existing LangGraph approval gates.

Next implementation after 9C:
- Phase 9D should default `/mvp` to FastAPI mode, add a visible parity/run comparison between direct Node and FastAPI for the same Benefits prompt, and keep Node-direct as an operator fallback until parity is boring.

## Phase 9D - FastAPI-First MVP With Node Parity Proof

Goal:
- Make the user-facing `/mvp` app FastAPI-first while preserving direct Node as an operator/debug parity route.

Implementation plan:
- Default the `/mvp` backend selector to `Wefella FastAPI facade`.
- Keep the `Node / LangGraph runtime` route selectable as an operator escape hatch.
- Add a visible parity proof panel that runs the same Benefits prompt through:
  - direct Node `/api/orchestrator/auth-start` plus `/api/chat`,
  - FastAPI local auth plus protected async `/api/chat` and task stream/status.
- Run the parity check in separate temporary sessions so it does not mutate the active user chat.
- Compare stable graph-contract fields rather than exact response text:
  - workflow,
  - structured intent,
  - approval state,
  - proposal status,
  - evidence status,
  - source-pointer count,
  - final answer presence,
  - trace presence.
- Keep the parity run proposal-only: no live portal proof, no official OpenClaw dispatch, no evidence observation approval, no credential entry, no payer contact, no form submission, and no medical advice.

Acceptance proof:
- UI contract tests prove FastAPI is the default route and the parity controls/rendering exist.
- Browser proof at `/mvp` shows:
  - FastAPI facade selected by default,
  - facade health check succeeds,
  - parity run compares Node direct and FastAPI facade,
  - the same Benefits route reaches matching graph-contract state,
  - no worker action is taken by the parity check.
- `python3 -m compileall -q project`, `npm run test:facade`, `node --check src/app/mvp.js`, `node --test src/tests/chat-ui-contract.test.mjs`, `npm run build`, and `npm run test:local` pass.

Next implementation after 9D:
- Phase 9E should add production-grade auth/JWT provider integration only after the facade parity test stays stable.
- A deeper FastAPI orchestration migration remains deferred until parity tests prove equivalent behavior against the Node/LangGraph/OpenClaw runtime.

## Phase 9E - Provider-Style JWT Alignment For FastAPI

Goal:
- Move the FastAPI facade one step closer to production API behavior by supporting provider-style JWT validation while preserving local MVP auth for development.

Implementation plan:
- Keep local HS256 bearer tokens as the default development path.
- Add an explicit `WEFELLA_AUTH_MODE=provider` mode.
- In provider mode, require configured issuer and audience claims:
  - `WEFELLA_JWT_ISSUER`,
  - `WEFELLA_JWT_AUDIENCE`.
- Validate token subject, expiration, not-before, issuer, and audience before allowing protected routes.
- Disable `POST /api/auth/local-session` by default in provider mode unless explicitly re-enabled for local testing.
- Extend public health with safe auth metadata:
  - auth mode,
  - algorithm,
  - whether provider claims are required,
  - whether issuer/audience are configured,
  - whether local auth is enabled.
- Do not expose secrets in health responses or logs.

Acceptance proof:
- Existing local FastAPI facade tests still pass.
- Provider-mode tests prove:
  - missing issuer/audience claims are rejected,
  - wrong audience is rejected,
  - matching issuer/audience is accepted,
  - local MVP auth is disabled by default in provider mode,
  - health reports safe auth metadata without secrets.
- `python3 -m compileall -q project`, `npm run test:facade`, `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade`, `npm run build`, and `npm run test:local` pass.

Implementation status:
- Implemented locally on 2026-06-01.
- Full local proof passed with 123 tests total, 121 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.

Next implementation after 9E:
- Phase 9F should run the FastAPI-first approved live loop from `/mvp`: Benefits prompt, approval, official OpenClaw worker continuation, source pointers or precise blocker, Graphiti retain status, and matching operator proof.

## Phase 9F - FastAPI-First Approved Loop Proof

Goal:
- Prove the user-facing `/mvp` value loop through the FastAPI facade after read-only approval, and make the matching operator proof reachable from the same session.

Implementation plan:
- Keep `/mvp` FastAPI-first.
- Add a visible Phase 9F live-loop proof panel that summarizes approval, worker, evidence, source-pointer, memory, blocker, and trace state.
- Preserve the source-pointer success branch when an authenticated portal tab is available.
- Treat missing authenticated OpenClaw portal state as a first-class precise blocker.
- Link `/mvp` to `/` with the same `sessionId` and `userId`.
- Let `/` hydrate a linked operator proof session from query parameters.
- Add facade tests that prove the approved resume forwards approval and worker-continuation fields to the Node/LangGraph runtime.
- Add a live Node facade test that runs the approved loop and accepts either source pointers or a precise blocker.

Acceptance proof:
- `node --check src/app/mvp.js`, `node --check src/app/app.js`, `python3 -m compileall -q project`, `node --test src/tests/chat-ui-contract.test.mjs`, `npm run test:facade`, `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade`, `npm run build`, and `npm run test:local` pass.
- Browser proof at `/mvp` runs Benefits through FastAPI, records and consumes read-only approval, returns source pointers or a precise blocker, shows product-memory status, and exposes the operator proof link.
- Browser proof at `/` opens the same linked session and shows matching trace state.

Implementation status:
- Implemented locally on 2026-06-01.
- The current environment proved the precise-blocker branch: no authenticated OpenClaw member-portal tab was available, so the approved worker run returned `blocked_no_authenticated_evidence` and did not create false evidence.

Next implementation after 9F:
- Phase 9G should harden the production API facade: rate limiting, safer error envelopes, production CORS defaults, task registry persistence, and source-grounding checks.

## Phase 9G - Production API Facade Hardening

Goal:
- Make the FastAPI facade safer for deployment without replacing the proven Node/LangGraph/OpenClaw runtime.

Implementation plan:
- Add request-id propagation for every FastAPI response.
- Standardize FastAPI error responses around a stable envelope that remains readable by `/mvp`.
- Add configurable per-scope rate limiting:
  - `WEFELLA_RATE_LIMIT_PER_MINUTE`,
  - `WEFELLA_RATE_LIMIT_DISABLED`.
- Harden CORS defaults:
  - explicit `GET`, `POST`, `OPTIONS`,
  - explicit auth/content/request-id headers,
  - no implicit local origins in provider auth mode.
- Add optional local JSON task persistence behind `WEFELLA_TASK_REGISTRY_PATH`.
- Attach source-grounding metadata to completed facade chat task results.
- Add optional source-grounding enforcement through `WEFELLA_ENFORCE_SOURCE_GROUNDING=1`.
- Extend facade tests for:
  - standard error envelopes,
  - rate limiting,
  - task-registry persistence,
  - source-grounding metadata,
  - source-grounding enforcement.
- Keep Node/LangGraph/OpenClaw as the orchestration source of truth.

Acceptance proof:
- `python3 -m compileall -q project`, `npm run test:facade`, `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade`, `node --check src/app/mvp.js`, `node --check src/app/app.js`, `node --test src/tests/chat-ui-contract.test.mjs`, `npm run build`, and `npm run test:local` pass.
- Browser proof at `/mvp` shows the Phase 9G facade health connected to Node with no console errors.

Implementation status:
- Implemented locally on 2026-06-01.
- Full local proof passed with 123 tests total, 121 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- FastAPI facade live proof against Node passed with 18 tests.

Next implementation after 9G:
- Phase 9H should add deployment/observability readiness: environment examples, runbook, smoke commands, optional trace export hooks, and CI-friendly verification for the FastAPI plus Node/LangGraph/OpenClaw stack.

## Phase 9H - Deployment And Observability Readiness

Goal:
- Make the FastAPI-plus-Node deployment shape operable and smoke-testable without changing the product runtime.

Implementation plan:
- Add a safe readiness endpoint for deployment checks.
- Add observability metadata to health.
- Add optional JSONL event export for facade chat task lifecycle events.
- Ensure event export stores hashes/status only, not raw healthcare messages or portal text.
- Add a running-service smoke script:
  - health,
  - readiness,
  - unauthorized chat error envelope.
- Update `.env.example` for provider auth, CORS, rate limits, task persistence, source grounding, smoke URL, and observability.
- Add a deployment/observability runbook.
- Add tests for readiness, degraded state, validation-error safety, and observability export safety.

Acceptance proof:
- `python3 -m compileall -q project`, `npm run test:facade`, `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade`, `npm run smoke:facade`, `node --check src/app/mvp.js`, `node --check src/app/app.js`, `node --test src/tests/chat-ui-contract.test.mjs`, `npm run build`, and `npm run test:local` pass.
- Browser proof confirms `/mvp` still reaches the Phase 9H facade health with no console errors.

Implementation status:
- Implemented locally on 2026-06-01.
- Full verification passed in this run:
  - `python3 -m compileall -q project`,
  - `npm run test:facade`,
  - `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade`,
  - `npm run smoke:facade`,
  - `node --check src/app/mvp.js`,
  - `node --check src/app/app.js`,
  - `node --test src/tests/chat-ui-contract.test.mjs`,
  - `npm run build`,
  - `npm run test:local`.
- Browser proof at `/mvp` showed Phase 9H and FastAPI `0.1.0-phase9h-deployment-observability` connected to Node with no console errors.

Next implementation after 9H:
- Reassess `docs/goal_final_system.md` item by item. The broad final contract still requires document upload/extraction, operator/research APIs, automation/evidence pipeline, MockWorker/Hermes modes, RBAC, and final PASS/FAIL/BLOCKED report before the goal can be complete.

## Phase 10A - User Document Upload And Local Extraction

Goal:
- Build the first user-facing document ingest slice from the broad final-system contract without widening the healthcare workflows or creating a second orchestrator.

Implementation plan:
- Add authenticated FastAPI upload endpoints:
  - `POST /api/uploads`,
  - `GET /api/uploads/{upload_id}/extraction`.
- Keep uploads user-bound by JWT subject.
- Validate file type and size before storing.
- Store raw files only in a git-ignored local data path.
- Extract immediately using real local runtimes:
  - UTF-8 parser for text/markdown/CSV,
  - `pypdf` for PDF when installed,
  - Tesseract CLI for images when installed.
- Return fail-closed extraction blockers when a runtime is missing or produces no readable text.
- Return structured fields, safe redacted preview, source snippets, hashes, confidence, and blockers.
- Add upload controls to `/mvp` while keeping `/` as the operator proof dashboard.
- Expose upload readiness in health/readiness.
- Add tests for auth, content-type/size validation, extraction field detection, redaction, and ownership.

Acceptance proof:
- `python3 -m compileall -q project`, `node --check src/app/mvp.js`, `node --test src/tests/chat-ui-contract.test.mjs`, `npm run test:facade`, `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade`, `npm run smoke:facade`, `npm run build`, and `npm run test:local` pass.
- Browser proof confirms `/mvp` renders upload controls, reaches FastAPI, starts a session, and has 0 console errors.
- Live API proof uploads a real text benefits sample and retrieves a redacted extraction with structured insurance fields.

Implementation status:
- Implemented locally on 2026-06-01.
- Full verification passed in this run.

Next implementation after 10A:
- Phase 10B should connect uploaded extraction evidence to LangGraph chat answers and source pointers. The chat path should be able to answer a user question about an uploaded document using safe extracted fields and citations, then retain only a safe Graphiti memory summary.

## Phase 10B - Uploaded Document Grounded Chat

Goal:
- Let a user upload an insurance document and then ask the concierge about that uploaded document through the same FastAPI plus Node/LangGraph runtime.

Implementation plan:
- Extend the FastAPI chat contract with `uploaded_document_ids`.
- Resolve uploaded ids only for the authenticated user before sending anything to Node.
- Send safe extraction packets to Node/LangGraph:
  - no base64 document body,
  - no raw full document dump,
  - structured fields, source spans, blockers, hashes, and redacted preview only.
- Add a LangGraph uploaded-document evidence path that:
  - captures the attached extraction as evidence,
  - creates source pointers,
  - records audit/runtime events,
  - composes a sourced answer,
  - performs no OpenClaw worker/browser action.
- Add `/mvp` affordance for asking about the latest upload.
- Add tests for FastAPI ownership wiring, LangGraph source pointers, UI contract, and no hidden worker action.

Acceptance proof:
- `python3 -m compileall -q project`, `node --check src/concierge/langgraphRunner.mjs`, `node --check src/app/mvp.js`, `node --check src/server/server.mjs`, `node --test src/tests/uploaded-document-chat.test.mjs`, `node --test src/tests/chat-ui-contract.test.mjs`, `python3 -m unittest project.tests.test_fastapi_facade`, `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade`, `npm run smoke:facade`, `npm run build`, and `npm run test:local` pass.
- Live API proof creates a user session, uploads a text benefits sample, chats with `uploaded_document_ids`, and returns a completed answer with a source pointer.
- Browser proof confirms `/mvp` shows Phase 10B, upload controls, `Ask About Upload`, FastAPI-first sign-in, and a working chat run through the facade.

Implementation status:
- Implemented locally on 2026-06-01.
- Full verification passed in this run.

Next implementation after 10B:
- Phase 10C should make document citations and source details more user-visible, then prove Graphiti safe retain/recall for a document-grounded chat across sessions. This should remain within the current MVP runtime rather than starting the backend architecture pivot.

## Phase 10C - Uploaded Document Citations And Graphiti Recall

Goal:
- Make uploaded-document source grounding visible to a non-engineer in `/mvp` and prove that a document-grounded answer can be safely retained and recalled through real Graphiti product memory.

Implementation plan:
- Enrich uploaded-document source pointers with citation metadata:
  - kind,
  - display label,
  - extraction method/hash,
  - structured evidence fields,
  - source spans.
- Render source/citation detail cards in `/mvp`.
- Render Graphiti recall/retain proof in `/mvp`.
- Harden product-memory safe episode construction for both uploaded-document and portal source pointer shapes.
- Add a live Graphiti test that:
  - runs uploaded-document grounded chat in session A,
  - retains a safe source-pointer summary,
  - starts session B for the same user,
  - recalls the prior uploaded-document source pointer.

Acceptance proof:
- Focused checks pass for LangGraph uploaded-document source pointers, product-memory safety, UI contract, and FastAPI facade contract.
- `npm run test:memory:graphiti` passes with real Graphiti/FalkorDB.
- `npm run build`, `npm run test:local`, `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade`, and `npm run smoke:facade` pass.
- Live HTTP proof uploads a document, asks about it, returns citation metadata, and shows Graphiti retain/recall status.
- Browser proof confirms `/mvp` renders Phase 10C source/memory controls with no console errors.

Implementation status:
- Implemented locally on 2026-06-01.
- Full verification passed in this run.

Next implementation after 10C:
- Reassess `docs/goal_final_system.md` for the next missing minimum gate. Strong candidates are session history/feedback/export on the user side, or the first operator/research API slice for source registry and manual runs.

## Phase 10D - Session History, Feedback, And Export

Goal:
- Make the user-facing MVP continuous across sessions by letting the authenticated user reload session history, submit feedback on an answer, and export the latest answer/checklist with source-pointer context.

Implementation plan:
- Add a small continuity module behind the existing Node/LangGraph runtime:
  - load session history only for the owning user,
  - surface latest LangGraph state and source pointers,
  - persist answer/session feedback in a `feedback_items` table,
  - export a Markdown answer/checklist with source-pointer context.
- Add Node endpoints:
  - `GET /api/sessions/:sessionId`,
  - `GET /api/sessions/:sessionId/export`,
  - `POST /api/feedback`.
- Add FastAPI protected proxy endpoints:
  - `GET /api/sessions/{session_id}`,
  - `GET /api/sessions/{session_id}/export`,
  - `POST /api/feedback`.
- Add `/mvp` controls for:
  - protected history load,
  - useful/follow-up feedback,
  - Markdown export/download.
- Keep continuity in the current product runtime; do not introduce a second session store.

Acceptance proof:
- Focused Node continuity tests prove owned history, source pointers, feedback, export, and cross-user rejection.
- FastAPI tests prove protected proxy wiring and feedback validation.
- UI contract tests prove `/mvp` exposes continuity controls.
- `npm run build`, `npm run test:local`, `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade`, and `npm run smoke:facade` pass.
- Browser proof confirms `/mvp` can sign in, load history, submit feedback, and export the current answer through the FastAPI-first route.

Implementation status:
- Implemented locally on 2026-06-01.
- Full verification passed in this run.

Next implementation after 10D:
- Choose the next final-system gate after continuity proof is complete. Strong candidates are the first operator/research dashboard API slice, RBAC/roles, MockWorker/Hermes mode, or the final PASS/FAIL/BLOCKED report.

## Phase 10E - Operator Research API And Dashboard Foundation

Goal:
- Start the operator/research control plane without replacing the current Node/LangGraph/OpenClaw runtime or adding hidden mock research results.

Implementation plan:
- Add durable research queue tables:
  - `research_runs`,
  - `research_run_events`.
- Extend `knowledge_sources` with operator review and run metadata.
- Add a Node research-ops module for:
  - KPIs,
  - source proposal/review/update,
  - manual run queueing,
  - run detail/events,
  - cancel and retry.
- Add FastAPI JWT-protected proxy routes that bind `actorUserId` to the authenticated subject.
- Add a Phase 10E panel in `/` for source/run operation proof.
- Keep runs queued only until the next phase chooses and gates real execution.

Acceptance proof:
- `node --check src/concierge/researchOps.mjs`, `node --check src/server/server.mjs`, `node --check src/app/app.js`, and `python3 -m compileall -q project` pass.
- Node research tests prove source proposal, approval, update, run queueing, events, cancel, retry, audit proof, invalid URL rejection, and rejected-source run blocking.
- FastAPI tests prove auth required, actor mismatch rejection, route delegation, and PATCH support.
- UI contract tests prove the operator dashboard exposes research source/run controls.
- `npm run build`, `npm run test:local`, `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade`, and `npm run smoke:facade` pass.
- Browser proof shows the `/` operator console loading sources and starting a manual research run with event proof.

Implementation status:
- Implemented locally on 2026-06-01.
- Full verification passed in this run.

Next implementation after 10E:
- Phase 10F should choose the next uncovered final-system gate:
  - role/RBAC separation for user/operator/admin surfaces,
  - real research-run execution against deterministic fetch/scrape/OpenClaw workers,
  - MockWorker/Hermes mode for demos without live external systems,
  - or the final PASS/FAIL/BLOCKED report for the current MVP.

## Phase 10F - Operator/Admin RBAC For Research Facade Routes

Goal:
- Close the production-facing role gap on the FastAPI operator/research facade before wiring research runs to real execution.

Implementation plan:
- Parse common provider role claims from JWTs:
  - `roles`,
  - `role`,
  - `groups`,
  - `permissions`,
  - `scope`,
  - `scp`.
- Keep local-session tokens user-scoped by default.
- Require `operator` or `admin` role for all FastAPI `/api/research/*` routes.
- Keep user-facing routes on `require_user`.
- Expose RBAC metadata through `/api/health` without secrets.
- Prove that:
  - no bearer token gets 401,
  - plain user tokens get 403 on research routes,
  - operator and admin tokens can access research routes,
  - actor mismatch still fails even after role authorization.

Acceptance proof:
- `python3 -m compileall -q project` passes.
- `python3 -m unittest project.tests.test_fastapi_facade` passes.
- `npm run build` passes.
- `npm run test:local` passes.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passes.
- `npm run smoke:facade` passes against FastAPI version `0.1.0-phase10f-rbac-operator-routes`.
- Live HTTP proof confirms plain user 403 and operator/admin 200 on `/api/research/kpis`.

Implementation status:
- Implemented locally on 2026-06-01.
- Full verification passed in this run.

Next implementation after 10F:
- Phase 10G should choose the next uncovered final-system gate:
  - attach queued research runs to a real gated execution adapter,
  - add MockWorker/Hermes mode for demos without live external systems,
  - or build the final PASS/FAIL/BLOCKED report over the current MVP contract.

## Phase 10G - Approved Research Run Execution And Worker Status

Goal:
- Turn operator research runs from queued control records into bounded, auditable execution records without pretending OpenClaw or Hermes research workers are already wired.

Implementation plan:
- Add `research_artifacts` as the append-only artifact/provenance table for research executions.
- Add a deterministic execution adapter for approved sources:
  - HTTP(S) fetch only,
  - configured byte limit,
  - textual content only,
  - local extraction/safe preview,
  - raw artifact file stored under a git-ignored artifact directory,
  - hashes and citation status stored in the database.
- Add explicit `mock_worker` execution mode:
  - visible in API/UI,
  - marked untrusted,
  - not ready for trusted retrieval.
- Add worker status API proof for deterministic fetch, MockWorker, future OpenClaw, and future Hermes modes.
- Add FastAPI operator-protected proxy routes:
  - `GET /api/research/worker-status`,
  - `POST /api/research/runs/{run_id}/execute`.
- Extend `/` operator dashboard with Worker Status, Execute Fetch, MockWorker, and artifact cards.

Acceptance proof:
- `node --check src/concierge/researchOps.mjs`, `node --check src/server/server.mjs`, `node --check src/app/app.js`, and `python3 -m compileall -q project` pass.
- Research tests prove approved-source deterministic fetch, artifact storage, event timeline, audit proof, redacted safe preview, raw artifact file storage, terminal-state protection, and explicit MockWorker untrusted mode.
- FastAPI facade tests prove worker status and execute routes stay operator-protected and actor-bound.
- UI contract tests prove the operator dashboard exposes worker status and execution controls.
- `npm run build`, `npm run test:local`, `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade`, and `npm run smoke:facade` pass.
- Live HTTP proof through FastAPI runs source proposal -> approval -> queued run -> deterministic execution -> artifact detail.
- Browser proof shows the Phase 10G operator console and worker status panel.

Implementation status:
- Implemented locally on 2026-06-01.
- Full verification passed in this run.

Next implementation after 10G:
- Phase 10H should choose the next final-system gate:
  - trusted evidence search/citation closure over approved research artifacts,
  - operator natural-language proposal/write-action gate,
  - or nightly/scheduled research automation over approved sources.

## Phase 10H - Research Citation Review And Trusted Evidence Search

Goal:
- Convert fetched research artifacts into review-gated, citation-safe evidence without trusting raw fetch output by default.

Implementation plan:
- Keep `research_artifacts` as the existing provenance table and store review metadata in `metadata_json`.
- Add artifact review decisions:
  - approve -> `trusted_retrieval_approved`,
  - quarantine/reject -> `quarantined`,
  - needs_review -> `extracted_pending_review`.
- Block approval of `mock_worker_untrusted` artifacts.
- Add trusted evidence search over safe preview/title/source URL fields:
  - default to reviewed trusted artifacts only,
  - return pending-review counts as a visible low-confidence state,
  - avoid raw source text in API responses.
- Add Node routes:
  - `GET /api/research/artifacts`,
  - `POST /api/research/artifacts/{artifact_id}/review`,
  - `GET /api/research/search`,
  - `GET /api/research/evidence`.
- Add FastAPI operator/admin-protected proxy routes for the same contract.
- Extend `/` with Review Artifacts, Search Evidence, Approve Citation, and Quarantine controls.

Acceptance proof:
- `node --check src/concierge/researchOps.mjs`, `node --check src/server/server.mjs`, `node --check src/app/app.js`, and `python3 -m compileall -q project` pass.
- Research tests prove pending artifacts are not trusted, approval makes search return trusted evidence, quarantine removes trusted evidence, and MockWorker artifacts cannot be approved.
- FastAPI facade tests prove artifact/search/review routes stay operator-protected and actor-bound.
- UI contract tests prove the operator dashboard exposes review/search controls.
- `npm run build` and `npm run test:local` pass.
- Live FastAPI/browser proof shows source proposal -> approval -> run execution -> artifact pending -> review approval -> trusted evidence search.

Implementation status:
- Implemented locally on 2026-06-01.
- Static checks, focused tests, build, full local suite, live FastAPI facade tests, smoke facade, and browser proof passed.

Next implementation after 10H:
- Phase 10I should choose one narrow final-system gap:
  - connect reviewed research evidence to user-facing grounded answers with citation closure,
  - add operator natural-language proposal/write-action gate,
  - or add scheduled research automation over approved sources.

## Phase 10I - Trusted Research Evidence In User Answers

Goal:
- Let the user-facing chat answer from reviewed research evidence while refusing or escalating when no trusted citation exists.

Implementation plan:
- Keep Phase 10H artifact review as the trust boundary.
- In LangGraph evidence observation, search research evidence only when:
  - the request is a domain workflow,
  - policy did not refuse,
  - there is no explicit portal/document evidence observation result for this run,
  - the request did not explicitly disable trusted research evidence.
- Map only `trusted_retrieval_approved` artifacts into `trusted_research_artifact` source pointers.
- Preserve pending-review matches as a visible blocker state without quoting their content.
- Compose user answers from reviewed research snippets and source pointers, not from pending artifacts or MockWorker output.
- Record runtime events and audit proof without raw queries or raw source dumps.
- Update `/mvp` and `/` labels so the browser proof surfaces identify Phase 10I.

Acceptance proof:
- Static checks pass for LangGraph, server, and FastAPI.
- LangGraph tests prove:
  - a reviewed artifact can answer a user benefits question,
  - pending artifacts are refused until citation review approves them,
  - no raw identifiers from fixture content appear in audit proof.
- Runtime parity tests prove public chat endpoints still share the LangGraph product runtime contract.
- FastAPI facade tests, `npm run build`, and `npm run test:local` pass.
- Live FastAPI proof creates a reviewed fixture artifact and then answers a user chat with a `research_artifacts/{artifactId}` source pointer.
- Browser proof shows `/mvp` displaying the sourced answer/citation cards and `/` preserving operator research controls.

Implementation status:
- Implemented locally on 2026-06-01.
- Static checks, focused tests, build, full local suite, live FastAPI facade tests, smoke facade, live HTTP proof, and browser proof passed.

Next implementation after 10I:
- Phase 10J should choose one narrow remaining final-system gap:
  - operator natural-language proposal/write-action gate,
  - scheduled research automation over approved sources,
  - or semantic embeddings/reindexing over reviewed artifacts.

## Phase 10J - Operator Natural-Language Proposal Gate

Goal:
- Let an operator ask for research-control actions in plain English while keeping all writes behind an explicit approval gate.

Implementation plan:
- Add a fixed operator tool registry for research control-plane actions.
- Execute only read tools directly:
  - KPI/status reads,
  - source/run/artifact listing,
  - run detail,
  - trusted evidence search.
- Convert write/action requests into `operator_tool_proposals` with expected effect, risk level, hashed args/message, status, and audit proof.
- Add approval/rejection endpoints that decide a proposal exactly once.
- On approval, execute the registered write tool with the stored args only.
- On rejection, record the lifecycle and keep target tables unchanged.
- Proxy the operator assistant routes through FastAPI with operator/admin RBAC and actor binding.
- Extend `/` with an operator assistant console, proposal cards, and approve/reject controls.

Acceptance proof:
- `node --check src/concierge/operatorAssistant.mjs`, `node --check src/server/server.mjs`, and `node --check src/app/app.js` pass.
- Operator assistant tests prove:
  - read-only requests use registry-bound tools without proposals,
  - write requests create proposals only,
  - approval executes exactly once,
  - rejection performs no target mutation,
  - unsupported arbitrary execution is refused.
- FastAPI facade tests prove operator/admin protection and actor binding for assistant/proposal routes.
- UI contract tests prove `/` exposes the assistant and proposal controls.
- `npm run build` and `npm run test:local` pass.
- Browser proof shows tool loading, a read-only assistant result, and a pending proposal card with approve/reject controls.

Implementation status:
- Implemented locally on 2026-06-01.
- Static checks, focused operator/UI/database/facade tests, build, full local suite, and browser proof passed.

Next implementation after 10J:
- Phase 10K should choose one final-system gate:
  - scheduled research automation over approved sources,
  - semantic embeddings/reindexing over reviewed artifacts,
  - or OpenClaw/Hermes research-worker dispatch using the same proposal/audit boundaries.

## Phase 10K - Scheduled Research Automation

Goal:
- Persist approved research refresh schedules and let the operator tick due work without adding a hidden daemon.

Implementation plan:
- Add a `research_schedules` contract table for approved schedule records.
- Support list/create/pause/resume/run-due operations in the Node research control plane.
- Keep schedule creation/pause/resume/run-due available through the Phase 10J registry-bound operator proposal gate.
- Add Node and FastAPI routes for `GET /api/research/schedules` and `POST /api/research/schedules/tick`.
- Queue `scheduled_research_run` records by default; execution remains a separate worker action.
- Surface schedule KPIs, schedule cards, and due-tick proof in `/`.

Acceptance proof:
- Schedule creation is bound to approved/active sources when a source is specified.
- Due ticks process only active approved schedules.
- Missing approved sources fail closed with blocked schedule audit proof.
- Pause/resume writes audit proof and does not leak raw operator reasons.
- FastAPI protects schedule routes with operator/admin RBAC and actor binding.
- `/` shows schedule counts and due-tick actions.

Implementation status:
- Implemented locally on 2026-06-01.
- Static checks, focused scheduler/operator/UI/database/facade tests, build, full local suite, FastAPI facade suite, and browser proof passed.

Next implementation after 10K:
- Phase 10L should add a first-class audit log API/dashboard before expanding worker modes, because it closes the explicit final-system `GET /api/audit` gap and makes existing proposal/scheduler/source actions inspectable.

## Phase 10L - Audit Log API And Operator Dashboard

Goal:
- Make the existing hash-chained audit trail visible to operators through a safe API and dashboard card.

Implementation plan:
- Add a redacted `listAuditEvents` contract over `audit_events`.
- Return event ids, event types, timestamps, action kind, event hashes, details hashes, redacted/truncated details preview, event-type counts, and visible-chain verification.
- Add Node `GET /api/audit`.
- Add FastAPI `GET /api/audit` behind operator/admin RBAC and actor binding.
- Add `/` operator dashboard controls for Audit Log with event-prefix and session filters.
- Keep raw audit details out of the operator response.

Acceptance proof:
- Audit listing verifies visible hash chains.
- Audit response includes `rawDetailsReturned: false`.
- Direct identifiers in audit details are redacted from previews.
- FastAPI operator route requires operator/admin role and forwards the authenticated actor.
- UI contract exposes the Phase 10L audit controls.

Implementation status:
- Implemented locally on 2026-06-01.
- Focused static checks, audit tests, UI contract tests, FastAPI facade tests, `npm run test:facade`, build, full local gate, and browser proof passed.

## Phase 10M - Embedding Route And Trusted Evidence Reindex

Goal:
- Persist the selected trusted-evidence embedding route and provide an explicit safe reindex loop over reviewed research artifacts.

Implementation plan:
- Add route/job/index tables for research embeddings.
- Default to a credential-free local deterministic embedding route so local proof is reproducible.
- Support explicit route selection for `local_tfidf` or `openai`.
- Add a reindex operation that indexes only `trusted_retrieval_approved` artifacts.
- Preserve existing active index rows until a new reindex succeeds.
- Fail closed on missing OpenAI key, unsupported provider, invalid dimensions, or dimension mismatch.
- Include route/index status in trusted evidence search and operator dashboard proof.
- Add Node and FastAPI routes:
  - `GET /api/research/embeddings/status`,
  - `POST /api/research/embeddings/route`,
  - `POST /api/research/embeddings/reindex`.
- Add operator assistant tools:
  - `research.getEmbeddingStatus`,
  - `research.chooseEmbeddingRoute`,
  - `research.reindexEmbeddings`.

Acceptance proof:
- Route selection persists provider/model/dimensions/status.
- Reindex job stores counts, result status, failure reason, and audit proof.
- Only approved trusted artifacts enter the index.
- Dimension mismatch does not destroy prior active index rows.
- Search shows embedding route use and scores after reindex.
- FastAPI route tests prove operator/admin protection and actor binding.
- UI contract and browser proof show embedding controls and reindex result.

Implementation status:
- Implemented locally on 2026-06-01.
- Static checks, focused research/operator/UI/facade tests, build, full local suite, and browser proof passed.

Next implementation after 10M:
- Phase 10N should attach OpenClaw/Hermes research-worker dispatch to the same source approval, operator proposal, schedule, audit, artifact review, and embedding/retrieval lifecycle.

## Phase 10N - Adaptive Research Worker Dispatch

Goal:
- Attach real OpenClaw and Hermes worker adapter modes to the approved research-run lifecycle without weakening source approval, operator approval, audit, artifact review, embedding, or trusted retrieval gates.

Implementation plan:
- Extend research worker modes from deterministic fetch and MockWorker to include `openclaw` and `hermes`.
- Keep both adaptive modes disabled by default through explicit feature flags.
- Require `approvedWorkerDispatch=true` before adaptive worker execution.
- Build one typed worker envelope for both adapters:
  - schema `brainstyworkers.research_worker_task.v1`,
  - approved source and query payload,
  - read-only allowed actions,
  - disallowed high-risk actions,
  - pending-review result lifecycle.
- Call real local adapter commands when enabled:
  - official OpenClaw CLI with the dedicated `brainstyworkers` profile,
  - local Hermes CLI in one-shot mode.
- Validate returned worker JSON before creating artifacts.
- Store worker output as pending-review research artifacts only.
- Record dispatch request events and audit rows.
- Expose worker mode status and adaptive execution controls in `/`.
- Keep FastAPI as the public protected proxy path; frontend must not call workers directly.

Acceptance proof:
- Focused tests prove:
  - adaptive dispatch cannot run without explicit approval,
  - adaptive worker status names feature flags and typed envelope,
  - injected OpenClaw/Hermes command results create pending-review artifacts,
  - pending adaptive artifacts are unavailable to trusted retrieval until review,
  - run events/audit rows record dispatch,
  - FastAPI forwards actor and dispatch approval.
- `npm run build`, `npm run test:facade`, and `npm run test:local` must pass.
- Browser proof on `/` must show Worker Status and OpenClaw/Hermes run buttons.

Implementation status:
- Implemented locally on 2026-06-01.
- Static checks, focused research/operator/UI/facade tests, `npm run build`, `npm run test:facade`, full local suite, API proof, and browser proof passed.

Next implementation after 10N:
- Choose the next remaining final-system gap: research graph endpoint, quality judge/claim-level citation closure, production queue/backoff for adaptive workers, or the final PASS/FAIL/BLOCKED completion matrix.

## Phase 10O - Research Evidence Graph API

Goal:
- Close the D17/D18 graph gap by exposing a safe metadata graph over the operator research system.

Implementation plan:
- Add `research_graph_builds` as the persisted graph-build proof table.
- Build graph nodes from:
  - approved/pending research sources,
  - manual/scheduled/adaptive research runs,
  - research artifacts and citation status,
  - embedding routes/jobs/index edges,
  - approved schedules.
- Build graph edges for:
  - source-to-run,
  - run-to-artifact,
  - artifact-to-embedding-route,
  - schedule-to-source,
  - run/source-to-workflow.
- Do not return artifact bodies or raw safe-text previews from graph responses.
- Return host/hash URL metadata instead of raw source URLs in graph nodes.
- Expose:
  - `GET /api/research/graph`,
  - `POST /api/research/graph/build`.
- Proxy both endpoints through FastAPI behind operator/admin RBAC and actor binding.
- Add operator assistant tools:
  - read tool `research.getGraph`,
  - proposal-gated write tool `research.buildGraph`.
- Render graph summary, node types, edge examples, safety state, and latest build in `/`.

Acceptance proof:
- Focused tests prove:
  - graph nodes and edges are created from real source/run/artifact/schedule/embedding metadata,
  - graph payloads do not include raw artifact text or safe text preview fields,
  - build jobs persist row counts, graph hash, actor, and audit event id,
  - operator assistant reads graph without a proposal,
  - graph builds stay proposal-gated when requested through natural language,
  - FastAPI proxies graph endpoints with actor binding.
- `npm run build`, `npm run test:facade`, and `npm run test:local` must pass.
- Browser proof on `/` must show Phase 10O, graph controls, metadata-only safety, node/edge counts, and build status.

Implementation status:
- Implemented locally on 2026-06-01.
- Focused syntax checks, research/operator/UI/facade tests passed.
- `npm run test:facade`, `npm run build`, `npm run test:local`, API graph proof, and `/` browser proof passed.
- Browser proof saved at `artifacts/phase10o-research-graph-browser-proof.png`.

Next implementation after 10O:
- Prefer Phase 10P quality judge/claim-level citation closure, unless the next test reveals a production queue/backoff gap for adaptive workers.

## Phase 10P - Claim-Level Citation Closure Judge

Goal:
- Close the next grounded-answer gap by evaluating answer claims against trusted reviewed research artifacts before the system treats an answer as citation-closed.

Implementation plan:
- Add `research_claim_evaluations` as the persisted proof table for citation-closure evaluations.
- Extract factual/domain answer claims from a redacted safe answer preview.
- Score each claim only against `trusted_retrieval_approved` research artifacts.
- Label each claim as:
  - `supported`,
  - `low_confidence`,
  - `unsupported`.
- Return metadata-only citation pointers for supporting artifacts:
  - artifact id,
  - run id,
  - source id,
  - title/type,
  - source host/hash,
  - content/extraction hash,
  - short reviewed snippet.
- Do not create, promote, or mutate research evidence during the judge pass.
- Do not use pending-review artifacts to support trusted answers.
- Persist status, verdict, counts, safety flags, and audit event id.
- Expose:
  - `GET /api/research/citation-closure`,
  - `POST /api/research/citation-closure/evaluate`.
- Proxy both endpoints through FastAPI behind operator/admin RBAC and actor binding.
- Add operator assistant tools:
  - read tool `research.listCitationClosure`,
  - proposal-gated write tool `research.evaluateCitationClosure`.
- Render claim labels, counts, safety flags, audit proof, and citation pointers in `/`.

Acceptance proof:
- Focused tests prove:
  - supported claims link to trusted reviewed artifact citations,
  - unsupported claims are reported and unavailable to trusted retrieval,
  - pending-review evidence cannot support a trusted claim,
  - the judge writes labels/scores only and does not create evidence,
  - operator assistant reads status without approval and gates evaluation writes,
  - FastAPI proxies citation-closure endpoints with actor binding.
- `npm run build`, `npm run test:facade`, and `npm run test:local` must pass.
- Browser proof on `/` must show Phase 10P, citation-closure controls, claim labels, safety flags, actions taken, and audit/source-pointer proof.

Implementation status:
- Implemented locally on 2026-06-01.
- Fresh syntax, focused research/operator/UI checks, `npm run build`, `npm run test:facade`, full local gate, API proof, and `/` browser proof passed after the stop-word scoring hardening.
- Browser proof saved at `artifacts/phase10p-citation-closure-browser-proof.png`.

Next implementation after 10P:
- If the full Phase 10P gate stays green, produce a final PASS/FAIL/BLOCKED matrix over `docs/goal_final_system.md`, then choose whether the next slice should be production queue/backoff for adaptive workers or broader real-source/operator UX hardening.

## Phase 10Q - Final-System Verification Matrix

Goal:
- Convert the broad final-system contract into a maintained PASS / FAIL / BLOCKED report so the project cannot be declared complete while unproven gaps remain.

Implementation plan:
- Add `docs/FINAL_SYSTEM_VERIFICATION_REPORT.md`.
- Cover every explicit requirement id from `docs/goal_final_system.md`:
  - A1-A22,
  - B1-B8,
  - C1-C32,
  - D1-D24,
  - E1-E11,
  - F1-F4,
  - G1-G7,
  - H1-H24.
- Use only the required final-report status labels:
  - `PASSING`,
  - `IMPLEMENTED DURING THIS RUN`,
  - `BLOCKED BY EXTERNAL DEPENDENCY`,
  - `FAILING / NEEDS FIX`.
- Keep live OpenClaw/Hermes/provider blockers explicit.
- Keep missing user-facing and operator/research features explicit.
- Add an automated test to ensure the report covers every explicit goal item and does not hide failures/blockers.
- Add the report/test to the build-check required-file guard.

Acceptance proof:
- `node --test src/tests/final-system-verification-report.test.mjs` must pass.
- `npm run build` must pass and require the final verification report.
- The report must name the next highest-priority fixes instead of marking the overall goal complete.

Implementation status:
- Implemented locally on 2026-06-01.
- The report currently records 112 passing items, 2 external blockers, and 18 failing/needs-fix items.
- The goal remains active because the report proves the final system is not complete.

Next implementation after 10Q:
- Phase 10R should address the top failing user-facing safety gap: urgent/emergency escalation and durable human handoff records, followed by UI mode/AI2UI hardening.

## Phase 10R - Urgent/Emergency Human Handoff

Status: Implemented locally on 2026-06-01.

Goal:
- Close A19, A20, and H10 by making urgent/emergency prompts bypass normal workflow execution and create a durable human handoff record.

Implementation:
- Add deterministic urgent/safety detection in input policy.
- Route urgent prompts to `human_approval_escalation` with `urgent_emergency_escalation` proof.
- Add `human_handoff_items` plus an `urgent_human_handoff` `agent_tasks` record.
- Audit `human_handoff_created` with hashes/pointers, not raw prompt replay.
- Skip OpenClaw, browser observation, payer contact, external messages, credential handling, form submission, and GPT calls for urgent runs.
- Expose handoffs through `/api/handoffs`, FastAPI facade proxying, session continuity, `traceForSession`, `/mvp`, and `/`.
- Prevent urgent/safety prompts from being retained verbatim as prompt-recall memory.

Acceptance proof:
- Focused policy/classifier/LangGraph/UI tests pass.
- Facade test passes and binds `GET /api/handoffs` to the JWT user.
- Build guard requires the human handoff module/table.
- Final verification report moves A19, A20, and H10 to `PASSING` and keeps the active goal incomplete.

Next implementation after 10R:
- Phase 10S should build typed AI2UI blocks and state-preserving Chat/Split/Guided/Bento MVP modes.

## Phase 10S - Typed AI2UI Blocks And MVP Modes

Status: Implemented locally on 2026-06-01.

Goal:
- Close A6 and A7 by making `/mvp` support state-preserving Chat/Split/Guided/Bento modes and by returning a typed backend block contract for UI rendering.

Implementation:
- Add `src/concierge/ai2uiBlocks.mjs` with `brainstyworkers.ai2ui.blocks.v1`.
- Attach `ai2ui_blocks` to LangGraph state after product-memory retain.
- Return `ai2uiBlocks` from `POST /api/chat`.
- Render typed answer, workflow, approval, worker, citation, memory, handoff, safety, and next-step blocks in `/mvp`.
- Add a safe unknown-block fallback card for future backend block types.
- Add top-bar mode controls for Chat, Split, Guided, and Bento.
- Preserve state across mode switches by re-rendering the current run only. Do not create a new session, rerun LangGraph, consume approval tokens, dispatch workers, or change memory.

Acceptance proof:
- AI2UI unit tests prove typed block output and unknown-block fallback.
- LangGraph runner tests prove real graph runs include typed blocks.
- UI contract tests prove the four mode controls, renderer, localStorage persistence, and fallback renderer exist.
- Final verification report moves A6 and A7 to `PASSING` and keeps the active goal incomplete.

Verification:
- `node --check src/concierge/ai2uiBlocks.mjs` passed.
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `node --check src/app/mvp.js` passed.
- `node --check src/server/build-check.mjs` passed.
- `node --test src/tests/ai2ui-blocks.test.mjs src/tests/chat-ui-contract.test.mjs src/tests/langgraph-runner.test.mjs` passed with 24/24 tests.
- `npm run build` passed.
- `npm run test:facade` passed with 32 tests and 2 expected live-gated skips.
- `npm run test:local` passed with 159 total, 157 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- `/mvp` browser proof passed with Chat, Guided, Bento, and Split modes preserving the same session and rendering typed blocks with 0 console errors.

Next implementation after 10S:
- Phase 10T should close the production scheduler/cron proof gap for approved schedules (`E1`) unless the user chooses to prioritize research PDF upload/extraction (`C17`, `D13`, `D14`).

## Phase 10T - Research Scheduler Daemon Proof

Status: Implemented and verified locally on 2026-06-01.

Goal:
- Close E1 by adding an env-gated always-on approved-schedule daemon around the existing scheduler due-tick contract.

Implementation:
- Add `src/concierge/researchScheduler.mjs`.
- Add `research_scheduler_daemon_state` to schema and local migration.
- Keep `runDueResearchSchedules` as the only business operation used by daemon ticks.
- Auto-start the daemon from the Node server only when `BRAINSTY_RESEARCH_SCHEDULER_ENABLED=1`.
- Default to queueing scheduled research runs, not executing worker dispatch.
- Emit runtime events and audit events for daemon start, tick start, tick completion, failures, and overlap skips.
- Add an in-process overlap guard to prevent duplicate same-process interval ticks.
- Add Node endpoints:
  - `GET /api/research/scheduler/status`,
  - `POST /api/research/scheduler/tick`.
- Add FastAPI proxies for both endpoints behind operator/admin RBAC.
- Add `/` operator dashboard controls and cards for daemon status/proof.

Acceptance proof:
- Unit tests prove daemon tick queues only due approved schedules, disabled status is visible with no hidden action, daemon startup can run a due scan, and the overlap guard prevents duplicate ticks.
- Facade tests prove operator/admin RBAC and actor binding for scheduler daemon routes.
- UI contract tests prove the operator dashboard exposes daemon controls and renderer.
- Final verification report moves E1 to `PASSING` while keeping the active final-system goal incomplete.

Verification commands:
- `node --check src/concierge/researchScheduler.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/research-scheduler.test.mjs src/tests/research-ops.test.mjs src/tests/chat-ui-contract.test.mjs` passed with 24/24 tests.
- `npm run build` passed.
- `npm run test:facade` passed with 32 tests and 2 expected live-gated skips.
- `npm run test:local` passed with 163 total, 161 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Browser/API proof on `/` passed. Screenshot: `artifacts/phase10t-research-scheduler-daemon-browser-proof.png`.

Next implementation after 10T:
- Phase 10U should implement research knowledge-base PDF upload/extraction endpoints and dashboard path (`C17`, `D13`, `D14`) unless analytics/budget kill-switch controls are prioritized first.

## Phase 10V - Dynamic Skill UI Exposure

Status: Implemented and verified locally on 2026-06-03.

Goal:
- Make the LangGraph dynamic skill resolver visible in the user-facing MVP and operator dashboard so testers can see which insurance skill, journey skill, execution skill, missing data, success estimate, and worker tasks were selected.

Implementation:
- Keep `dynamic_skill_context` as LangGraph state, not a separate UI-only inference.
- Surface the selected insurance, journey, and execution skills in `/mvp` Current Answer.
- Add a `/mvp` sequence step for skill resolution between route and approval.
- Render dynamic skill missing data, success estimate, required OpenClaw tasks, required search paths, and required APIs.
- Render the same dynamic skill proof in the `/` operator workflow proof.
- Add dynamic skill proof to the OpenClaw envelope validation panel.
- Expose `dynamicSkillContext` directly from the validation API proof endpoint.

Acceptance proof:
- `/mvp` shows `insurance_plan_aetna_temporary`, `claim_journey_temporary`, `insurance_portal_browser`, missing data, success estimate, and worker tasks after a claim workflow.
- `/` shows the same dynamic skill proof after `Validate Envelope`.
- UI contract tests cover both surfaces.
- The OpenClaw validate-envelope API returns `dynamicSkillContext`.

Verification commands:
- `node --check src/app/app.js` passed.
- `node --check src/app/mvp.js` passed.
- `node --check src/server/server.mjs` passed.
- `node --test src/tests/chat-ui-contract.test.mjs src/tests/dynamic-skill-server.test.mjs` passed with 15/15 tests.
- `node --test src/tests/openclaw-api.test.mjs` passed with 1/1 test.
- `npm run build` passed.
- Browser proof passed on `/mvp` and `/` at `http://127.0.0.1:4173`.

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
