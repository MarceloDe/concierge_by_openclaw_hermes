# Decisions

Record implementation decisions here.

Each decision includes:
- Date
- Context
- Options considered
- Decision
- Reason
- Cost of changing later

## 2026-05-17: Implementation Must Wait For Product Interview

Context:
`docs/CODEX_START_PROMPT.md`, `AGENTS.md`, and `brainstyworkers_ai_concierge_prompt.md` require a prompt sufficiency audit before coding. The source prompt provides a strong architecture vision but leaves first-demo product behavior unresolved.

Options considered:
- Start coding from the inferred Milestone 1 web chat direction.
- Ask the full interview before writing any files.
- Update planning docs with the audit and interview blockers, then ask focused questions.

Decision:
Update the planning docs with a sufficiency audit and wait for user answers before implementation.

Reason:
The project touches healthcare and insurance workflows. The first user role, first workflow, data policy, memory boundaries, and local proof expectations affect architecture and safety behavior.

Cost of changing later:
Low before coding. Medium to high after implementation if the wrong first user, workflow, or data boundary is assumed.

## 2026-05-27: Pause Breadth And Collapse To One LangGraph Product Runtime

Context:
The project has real LangGraph wiring, local browser extraction, an OpenClaw skill artifact, proposal-only validation, local audit/session state, and many deterministic tests. A new MVP hardening review found that the product still has two divergent runtimes: `/api/chat` uses `engine.mjs` and can perform real browser observation, while `/api/langgraph/run` and orchestrator endpoints use `langgraphRunner.mjs` and mostly prepare proposal JSON. The same review also found that product memory is not yet a real Hindsight/Zen/LangMem/Mem0/Zep-style memory runtime and that tests can pass while validating contracts rather than completing a real healthcare journey.

Options considered:
- Continue with the previously documented next step: initialize the dedicated official OpenClaw profile/workspace.
- Add more workflows, UI panels, or OpenClaw metadata.
- Pause expansion and harden one non-mocked eligibility/benefits journey through one LangGraph product runtime.

Decision:
Pause breadth expansion and make Phase 1 of `docs/CODEX_MVP_HARDENING_PLAYBOOK.md` the next implementation target: collapse public product paths into one LangGraph runtime and move real browser/evidence observation into a graph node.

Reason:
The MVP must prove one real healthcare journey end to end. Initializing OpenClaw profile state before fixing runtime divergence would increase surface area without proving that LangGraph truly owns the product workflow. Cortex remains project memory only; product memory must be implemented through a runtime retain/recall adapter before it is claimed as shipping memory.

Cost of changing later:
Medium. The project already has code in both `engine.mjs` and `langgraphRunner.mjs`, so collapsing runtime paths requires careful migration and regression tests. Deferring this would make later OpenClaw execution, product memory, and PHI hardening harder to audit.

## 2026-05-17: Default Slice 1 Should Be Mocked And Local Unless User Says Otherwise

Context:
The source prompt aims at production integrations, but the startup prompt requires an early interactive slice and the safety boundary prohibits real payer communication, PHI handling, account login, medical advice, or external message sending without approval.

Options considered:
- Use live integrations immediately.
- Build a mocked local demo first.
- Build only planning documents.

Decision:
Assume slice 1 should use mocked or seeded data locally, pending user confirmation.

Reason:
This gives the user something to try quickly while preserving healthcare safety boundaries.

Cost of changing later:
Low. Mock adapters can be replaced by real channel, memory, model, and payer integrations in later slices.

## 2026-05-17: Slice 1 Revised To Real User Enrollment And Browser Portal Depuration

Context:
The user rejected the safe mocked-only default and provided interview answers for a more ambitious slice 1: enroll Marcelo Felix, build the local application database, use local web chat, attach to a logged Chrome insurance portal through remote debugging/browser automation, extract eligibility/benefits data, and produce browser/action/data trace proof.

Options considered:
- Keep the mocked eligibility demo as slice 1.
- Move directly to production PHI storage and Vercel deployment.
- Revise slice 1 to local real-user enrollment and read-only browser portal depuration with approval gates.

Decision:
Revise slice 1 to local real-user enrollment plus logged Chrome portal navigation/extraction, but keep implementation pending until the user approves the revised plan and provides portal details.

Reason:
This better matches the user's intended product value: the concierge should enroll the member, understand the member's actual insurance website context, and verify eligibility/benefits through the user-authenticated browser. Keeping the slice local and gated limits risk while testing the hardest workflow early.

Cost of changing later:
Medium. The data model, browser automation boundary, and audit model will shape future slices, but keeping Vercel production persistence and Hindsight retention deferred reduces rework risk.

## 2026-05-17: Stateful Session Manager Before Real LangGraph Runtime

Context:
The user asked for professional user session management to allow LangChain statefulness. The prototype already had `sessions.langgraph_thread_id`, but lacked lifecycle fields, resumable chat behavior, checkpoints, and a state API that can map directly to LangGraph/LangChain thread configuration.

Options considered:
- Install LangChain/LangGraph immediately and wire the runtime into the workflow.
- Keep only the existing `sessions` table and pass thread IDs manually.
- Build a local SQLite-backed session manager with LangGraph-compatible thread IDs, checkpoints, events, and state JSON, then add the real runtime later.

Decision:
Build the local SQLite-backed session manager now and defer real LangGraph runtime installation/API usage.

Reason:
This adds the durable state contract needed by LangChain without introducing external package/API risk during the PHI-heavy browser workflow. It also keeps the local RALPH proof loop fast and auditable.

Cost of changing later:
Low to medium. The state JSON and checkpoint rows can be adapted to a LangGraph checkpointer or persisted store later; some field naming may need mapping when the real runtime is introduced.

## 2026-05-17: Local Memory Harness Before Real Hindsight Runtime

Context:
The user asked whether cross-session memory, OpenClaw heartbeat behavior, and proactive scheduled follow-ups should be implemented through Hindsight, a hook-style harness, or both. The source prompt defines a recall node before orchestration, a retain node after orchestration, Hindsight as temporal memory, and OpenClaw as channel/tool surface. The local prototype already has real PHI-like Aetna records in SQLite, but no approved Hindsight package/API, no real OpenClaw worker, no Vercel AI Gateway credential, and no approved email/WhatsApp sending adapter.

Options considered:
- Install and wire a real Hindsight/LangGraph runtime immediately.
- Keep memory deferred and only document the plan.
- Build a local hook-style memory harness now, with adapter seams for Hindsight, LangGraph, and OpenClaw.
- Put heartbeat logic inside OpenClaw only.

Decision:
Implement the hook-style local memory harness now and design it to be consumed by both LangGraph/LangChain and OpenClaw. Keep real Hindsight/vector recall and real OpenClaw channel execution as explicit adapters for the next integration slice.

Reason:
The hook harness gives the system the needed production shape immediately: context packets before each task, retained memory pointers after each task, user-scoped OpenClaw arm state, scheduled jobs, pending tasks, and approval-gated outbox proposals. It avoids pretending that external memory/channel systems are active while still making the schema and code ready for them.

Cost of changing later:
Low to medium. Hindsight can replace or augment `memory_items` retrieval, LangGraph can consume `context_packets` as graph state, and OpenClaw can execute `scheduled_jobs`/`agent_tasks`. The main migration cost will be mapping local schedule labels and memory metadata into the selected production adapters.

## 2026-05-17: Prompt Contracts Before Real Agent Runtime

Context:
The user asked whether the orchestrator and OpenClaw prompts are appropriate for a personalized dedicated healthcare concierge, and whether memory should shape identity and guardrails. The current local harness can inject memory and DB pointers, but real LangGraph/OpenClaw execution should not proceed until prompt identity, allowed domains, untrusted-context boundaries, and refusal behavior are explicit and testable.

Options considered:
- Move directly to real LangGraph/OpenClaw adapter compatibility tests.
- Keep prompt rules only inside the source markdown prompt.
- Implement executable prompt contracts and policy tests first.

Decision:
Implement explicit prompt contracts now for the orchestrator and OpenClaw arm, and include them in the context packet before real runtime adapters.

Reason:
This prevents memory, portal text, or tool output from becoming accidental instructions. The orchestrator owns workflow and policy decisions. The OpenClaw arm owns delegated observation/action execution only. Memory personalizes context, but it does not grant authority.

Cost of changing later:
Low. Real LangGraph nodes and OpenClaw workers can consume the same prompt bundle; only transport formatting should need adjustment.

## 2026-05-17: Runtime Adapter Compatibility Before Real Runtime Install

Context:
The user asked to verify whether the memory/session harness is compatible with LangChain, LangGraph, OpenClaw, and future Hindsight-style memory. The local prototype now has real SQLite-backed users, sessions, context packets, prompt contracts, memory items, OpenClaw arm state, tasks, and scheduled jobs. However, real LangGraph, OpenClaw, Hindsight, OpenAI API, and Vercel AI Gateway runtimes are not installed or approved for live execution in this slice.

Options considered:
- Install and call the real runtimes immediately.
- Keep compatibility as documentation only.
- Build executable local runtime adapters that map the current context packet into LangChain config/messages, LangGraph agent state, OpenClaw channel/heartbeat envelopes, and future Hindsight retain candidates.

Decision:
Implement executable local runtime compatibility adapters now, and defer live external/runtime package verification until those packages/APIs are explicitly approved and configured.

Reason:
This proves the harness can project its state into the shapes required by the next integration layer without pretending that live external runtimes are active. It also gives tests and an API endpoint that can catch adapter drift before the real runtimes are connected.

Cost of changing later:
Low to medium. Field names and transport wrappers may need adjustment when the actual LangGraph/OpenClaw/Hindsight libraries are installed, but the user/session/thread IDs, database pointers, prompt bundle, memory context, approval policy, and heartbeat semantics should remain stable.

## 2026-05-17: Workflow Architecture Registry Before Live LangGraph/OpenClaw

Context:
The user asked whether the big plan already defines how the orchestrator routes by memory, workflow readiness, learned prior takeaways, required tools, user journey stage, OpenClaw browser skills, heartbeat prompting, and authoritative knowledge skills. The existing local harness injected memory and database pointers, but it did not yet have first-class workflow definitions, tool requirements, journey events, knowledge-source registry, OpenClaw skill catalog, or temporal fields needed for Hindsight-style memory.

Options considered:
- Move directly to live LangGraph/OpenClaw and let the graph logic emerge inside runtime nodes.
- Keep the workflow/tool/journey architecture only in documentation.
- Add executable local registries and context-packet fields now, then let live LangGraph/OpenClaw consume those structures later.

Decision:
Add executable local workflow architecture registries before live runtime integration. Context packets now include workflow readiness, route candidates, user-profile completeness, tool status, journey stage, authoritative knowledge sources, OpenClaw skill catalog, and ISO-8601 UTC temporal memory fields.

Reason:
Real LangGraph routing should make decisions from explicit state, not implicit prompt text. Real OpenClaw skills should receive a narrow task envelope with allowed tools and fallback paths. Hindsight should receive temporally useful retain candidates instead of flat memory strings. Building this now reduces rework and prevents the live runtimes from becoming a pile of one-off branching logic.

Cost of changing later:
Medium. The registry entries can be edited cheaply, but once real LangGraph/OpenClaw nodes depend on these names, workflow keys, tool keys, journey stages, and temporal fields become stable contracts.

## 2026-05-17: Live LangGraph Runtime With External Model Gate

Context:
The user approved moving to the next step and provided an OpenAI API key for LangChain agents. The project now has workflow readiness, memory packets, prompt contracts, and runtime adapters. However, using a live OpenAI model can disclose user/session/workflow context to an external service, so model invocation must be separately gated from local LangGraph orchestration.

Options considered:
- Store the provided API key directly in source or docs.
- Execute live OpenAI calls unconditionally inside the graph.
- Implement the real LangGraph runtime locally, read `OPENAI_API_KEY` only from environment/ignored local env files, and make OpenAI model invocation opt-in per run.

Decision:
Install and use the real `@langchain/langgraph` runtime now. Keep the OpenAI key out of committed files and logs. The graph can use `@langchain/openai` through `OPENAI_API_KEY`, but live model invocation remains an explicit per-request option and may still require external-disclosure approval before sending context to OpenAI.

Reason:
This proves the graph runtime, checkpointer, workflow route, OpenClaw envelope, and audit loop without unnecessarily disclosing PHI or portal context. It keeps the model provider swappable for Vercel AI Gateway later.

Cost of changing later:
Low. The graph is already isolated in a runner module. Replacing direct `ChatOpenAI` with Vercel AI Gateway or a stricter PHI-safe model gateway should mainly affect the model node.

## 2026-05-18: Live OpenAI Proof Uses PHI-Allowed Identifier-Masked Payloads

Context:
The user clarified that the product scope allows insurance, portal, and clinical PHI to be exchanged with the company and OpenAI LLM after patient approval. The previous minimized-payload policy would block too much of the intended healthcare insurance reasoning flow. The user specified that patient name, SSN, and subscription/member identifiers should be masked by database pointers, while insurance and clinical data should be allowed in the LLM payload.

Options considered:
- Keep minimized non-PHI route proof as the default.
- Send full raw context including patient direct identifiers.
- Allow PHI-bearing insurance/clinical context by default, but mask direct identifiers into database pointers.

Decision:
Use PHI-allowed, identifier-masked reasoning payloads by default for live OpenAI model calls. Keep route-proof-only payloads as an optional lower-disclosure mode. The normal test suite now includes the live OpenAI smoke test and will fail if `OPENAI_API_KEY` is missing or invalid.

Reason:
This matches the intended product behavior: the LLM must reason over real insurance and clinical context to help navigate eligibility, claims, prior authorization, and appeals. Masking direct identifiers reduces unnecessary identity disclosure while preserving the data needed for reasoning.

Cost of changing later:
Low to medium. The payload policy is isolated and can be tightened later with a stronger de-identification layer or Vercel AI Gateway policy enforcement, but downstream tests will now expect live model calls and PHI-allowed payload behavior.

## 2026-05-26: Repo-Scoped OpenClaw Skill Artifact Before Real Worker Execution

Context:
The implementation plan already modeled an `insurance_portal_browser` OpenClaw skill in the local workflow registry, but the repo did not contain an actual skill directory or manifest. The machine has OpenClaw user configuration, but the safe project install path and production worker execution boundary are not yet approved.

Options considered:
- Mutate the local user-level OpenClaw configuration directly.
- Leave OpenClaw skill behavior only as database registry rows and prompt text.
- Add a repo-scoped skill artifact with manifest, instructions, validation, API exposure, and UI proof while keeping real worker execution gated.

Decision:
Create a repo-scoped `openclaw/skills/insurance-portal-browser` artifact and validate it locally. Do not install or execute it through a production OpenClaw worker in this slice.

Reason:
This turns the OpenClaw skill contract into a concrete artifact future agents and workers can inspect, while avoiding uncontrolled changes to user-level OpenClaw config or unsafe browser/action execution.

Cost of changing later:
Low to medium. The artifact can be copied or linked into the eventual OpenClaw runtime path. The main migration cost will be mapping the local manifest fields to the final OpenClaw skill packaging format if it differs.

## 2026-05-26: Validate OpenClaw Skill Envelopes Before Worker Execution

Context:
The repo now has a concrete `insurance_portal_browser` artifact, but the local LangGraph runner previously only prepared an OpenClaw channel envelope and marked real worker execution as deferred. The next safe integration step is to prove that a proposed browser task matches the skill contract before any external worker, browser adapter, or user-level OpenClaw install is touched.

Options considered:
- Execute the real OpenClaw worker immediately from the prepared envelope.
- Install the repo skill into the machine-wide personal OpenClaw configuration and test there.
- Add a local validator/proposal gate that consumes the envelope, validates against the repo-scoped skill artifact, and records a pending approval task without executing a worker.

Decision:
Add a local OpenClaw skill envelope validator and approval-gated proposal record before connecting a real OpenClaw worker. The validator/proposal gate uses the repo-scoped `insurance_portal_browser` manifest as the contract source.

Reason:
This proves the proposed browser task, required inputs, approval gates, fallback path, stop conditions, and blocked actions before any high-risk external execution. It also preserves the user's personal OpenClaw skills and configuration by keeping this slice entirely repo-scoped and proposal-only.

Cost of changing later:
Low to medium. A real OpenClaw runtime adapter may need field mapping, but the safety contract should remain stable: validate first, record proposal/audit proof, require explicit approval, then execute only through the selected project-scoped runtime.

## 2026-05-26: Use Installed Official OpenClaw With Dedicated Brainstyworkers Profile

Context:
The user clarified that OpenClaw should mean the official OpenClaw/Claw stack, not a local imitation of similar behavior. The current repo has a deterministic LangGraph proposal gate and a repo-scoped skill artifact, but the next architecture step must decide whether to use the personal machine-wide OpenClaw profile, install a second OpenClaw binary, or use the already installed official CLI with an isolated project profile.

Options considered:
- Reuse the default personal `~/.openclaw` profile, skills, channels, memory, and config.
- Install a second OpenClaw binary or clone before proving the profile/workspace boundary.
- Use the already installed official OpenClaw CLI with `--profile brainstyworkers` and a dedicated agent workspace.

Decision:
Use the already installed official OpenClaw CLI, but never the default personal profile for this project. The Brainstyworkers runtime path is `openclaw --profile brainstyworkers`, with state/config under `~/.openclaw-brainstyworkers`, recommended agent id `brainstyworkers-insurance-browser`, and recommended workspace `~/.openclaw-brainstyworkers/workspace-brainstyworkers`.

Reason:
Local CLI proof shows OpenClaw 2026.5.4 is installed and supports named profiles that isolate state/config. Official docs align with this: profiles isolate state, agents isolate workspaces/auth/routing, and skills can be installed from local directories containing `SKILL.md`. This gives the project the real official OpenClaw stack while protecting the user's personal OpenClaw skills, channels, memory, and state.

Cost of changing later:
Low before profile initialization. Medium after worker adapters depend on the profile, agent id, workspace path, and skill install target. The repo validator/proposal gate should remain stable either way.

## 2026-05-26: LangGraph Owns OpenClaw Worker Job Planning

Context:
The user identified a core architecture risk: if OpenClaw workers are connected before the orchestrator contract is firm, the system could split workflow authority between LangGraph and OpenClaw. That would make session transmission, data schemas, memory retention, worker parallelism, and auditability fragile.

Options considered:
- Perfect all healthcare workflows in LangGraph before touching OpenClaw.
- Let OpenClaw dynamically decide which jobs and subagents to create.
- Add a deterministic LangGraph-owned worker job/result contract before official OpenClaw execution.

Decision:
Add a LangGraph-owned OpenClaw worker job contract now. LangGraph creates the worker job id, correlation id, target OpenClaw profile/agent/workspace, input schema, allowed work, expected result schema, fan-out group, and fan-in rules. OpenClaw workers may execute only the assigned job after approval and must not choose workflows, create subtasks, retain memory, contact payers, send external messages, submit forms, enter credentials, or provide medical advice.

Reason:
This teaches the orchestrator first. LangGraph remains the workflow master and OpenClaw remains the adaptive execution layer. The architecture can later run multiple OpenClaw workers in parallel, but only from a deterministic job DAG created by LangGraph.

Cost of changing later:
Medium. Worker job ids, correlation ids, fan-out/fan-in fields, and deterministic controls will become runtime contracts for official OpenClaw adapters and UI/API proof.

## 2026-05-27: Orchestrator Proof Must Use Real LangGraph And Live GPT

Context:
The user rejected mocked orchestrator proof and asked for real agent and LLM testing. The prior local checks could prove deterministic contracts, but they did not prove the webapp path with live model calls across all workflow journeys.

Options considered:
- Keep live model invocation optional for the orchestrator demo.
- Add a separate mocked demo runner.
- Require live model invocation by default for orchestrator chat and flow-test endpoints.

Decision:
Require real OpenAI model invocation for the orchestrator proof endpoints by default. Add a live test command, `npm run test:orchestrator:live`, that runs all planned workflow/journey cases through the real LangGraph runner and verifies each case invokes the live model.

Reason:
This proves the actual orchestration path: planned-user local auth, LangGraph session/thread, workflow routing, decision points, worker job contracts, proposal gates, memory context, and live GPT model reasoning. It also exposed and fixed real routing issues that only appeared against the persistent app database.

Cost of changing later:
Low to medium. The live proof path can later route through Vercel AI Gateway by changing `BRAINSTY_OPENAI_BASE_URL` and credentials, but the test expectation that the orchestrator uses a real model should remain.

## 2026-05-27: Collapse Product Chat Paths Into One LangGraph Runtime

Context:
The MVP hardening playbook identified a product-risk split: `/api/chat` used the legacy hand-coded engine and could perform browser/evidence observation, while `/api/langgraph/run` used the formal LangGraph path and mostly prepared proposal JSON. That made it possible for browser-capable product behavior to bypass the healthcare journey graph.

Options considered:
- Keep `/api/chat` on the legacy engine and treat `/api/langgraph/run` as an experimental orchestration proof.
- Deprecate `/api/chat` immediately.
- Route `/api/chat` through `runLangGraphOrchestration` and move the evidence observation behavior into a graph node.

Decision:
Route `/api/chat` through `runLangGraphOrchestration` and add a LangGraph evidence-observation node. The legacy engine remains only as supporting code for trace compatibility and older tests; it is no longer the public product chat runtime.

Reason:
This makes LangGraph the healthcare workflow master for public chat. The same runtime now owns policy, context recall, workflow routing, OpenClaw proposal validation, optional read-only evidence capture, source pointers, final response composition, audit, and memory retain.

Cost of changing later:
Medium. Approval-resume, live authenticated portal proof, and product memory adapters should now attach to the graph path instead of the legacy engine. The old engine can be retired after the UI/API and test suite stop depending on its helper exports.

## 2026-05-27: Route Healthcare Journeys From Structured Intent Output

Context:
After the runtime collapse, LangGraph was the product path, but workflow routing still depended too much on keyword/regex route scores from the workflow registry. That could pass tests when messages contained literal workflow labels but fail natural customer phrasing such as "my doctor wants approval for an MRI" or "they said no and I want to fight it."

Options considered:
- Keep the existing registry score order and add more route keywords.
- Require a live LLM classifier for every local routing test.
- Add a strict curated classifier now, with an output contract that can later be swapped or augmented by an LLM classifier.

Decision:
Add a strict structured healthcare intent classifier before workflow routing. The classifier returns intent, workflow, confidence, required evidence, missing evidence, refusal/escalation flag, and rationale. LangGraph routes from this classifier output while deterministic safety refusals still run first.

Reason:
This makes route selection causal and testable without depending on fragile literal keywords or live model availability. It also creates the JSON contract a future LLM classifier must satisfy.

Cost of changing later:
Low to medium. The classifier module can become a hybrid deterministic plus LLM classifier, but the graph should keep routing from the same strict output contract.

## 2026-05-27: Convert Proposal-Only Into Read-Only Approval Resume Gate

Context:
The OpenClaw skill validator created pending approval proposals, but those proposals were a wall rather than a resumable gate. The graph could prepare contracts and proposals, but there was no endpoint that bound a user approval to a task/session/workflow/scope or allowed the next graph run to safely continue.

Options considered:
- Let any `browserSnapshot` or remote debugger request trigger evidence observation.
- Mark proposals as approved in task metadata without a scoped token.
- Add a bounded approval token recorded in `approval_gates` and require LangGraph to consume it before evidence observation.

Decision:
Add `POST /api/orchestrator/approve` and a graph approval-consumption path for read-only observation. Approvals bind to task id, session id, user id, workflow, scope, expiration, and allowed action. The graph consumes a valid approval token before performing browser/evidence observation.

Reason:
This turns proposal-only into a real gate while keeping MVP scope narrow. The only approved action is read-only observation. Denied, expired, missing, mismatched, or already-consumed approvals preserve `actionsTaken=[]` and do not create evidence.

Cost of changing later:
Medium. Later OpenClaw dispatch should reuse the same approval binding model, but may need stronger persistence and one-action-per-token semantics when real worker execution is connected.

## 2026-05-27: Require Verified Authenticated Portal Proof Before Live Evidence

Context:
After approval/resume existed, the graph could capture read-only evidence, but it still needed a live-proof boundary: a page from public Aetna marketing content must not be stored as healthcare evidence, and live portal proof must be opt-in rather than accidental.

Options considered:
- Treat any approved browser snapshot as live healthcare evidence.
- Require only a URL match against the payer domain.
- Require an explicit live flag plus authenticated member-portal verification and source hashes before creating live evidence.

Decision:
Add authenticated portal evidence verification for live proof. When `requireLivePortalProof` or `BRAINSTY_PORTAL_LIVE=1` is active, the graph requires `BRAINSTY_PORTAL_LIVE=1`, verifies an authenticated member portal host/page kind/member-page signals, stores source pointer hashes, and blocks without eligibility evidence when verification fails.

Reason:
This prevents false evidence from public payer pages and makes live proof intentional. It gives the next live test a strict pass condition: real authenticated read-only member portal evidence with URL, title, page kind, timestamp, DOM hash, extraction hash, and evidence fields.

Cost of changing later:
Low to medium. The verifier can expand to more payers and stronger DOM/auth signals, but the fail-closed behavior and source-pointer hash contract should remain.

## 2026-05-27: Make The MVP UI Auth Plus Chat First

Context:
The implementation dashboard proved LangGraph/OpenClaw activity, but the final MVP should feel like a user-facing concierge: sign in, ask or select a workflow in chat, provide missing information when asked, approve read-only observation when needed, and receive workflow output plus source/proof in the chat.

Options considered:
- Keep the dashboard as the primary product UI.
- Add LangSmith as the visible proof surface.
- Render workflow proof directly in the local app while keeping the dashboard for debugging.

Decision:
Make the primary webapp surface an auth plus chat workflow. Keep the proof dashboard as an operator/debug surface. Render LangGraph workflow proof, OpenClaw proposals, approval state, evidence state, missing info, and source pointers directly in chat cards.

Reason:
LangSmith is useful later for developer observability, but it is not required for MVP proof. The app already has the runtime trace, audit, proposal, source pointer, and graph state needed to show proof to the user and operator without adding a new dependency.

Cost of changing later:
Low. LangSmith can be added later as observability/evaluation infrastructure without changing the user-facing auth/chat flow.

## 2026-05-27: Use Zep Graphiti As The MVP Product Memory Runtime

Context:
The hardening playbook corrected the architecture: Cortex is only project memory for agents and handoffs, not product memory for the healthcare concierge. The MVP target requires a real retain/recall memory runtime such as Hindsight, Zen, LangMem, Mem0, or Zep/Graphiti.

Options considered:
- Keep the existing SQLite `memory_items` harness as product memory.
- Add another interface and defer runtime installation.
- Install Zep Graphiti from the official repo and connect it behind the current LangGraph memory seam.

Decision:
Use Zep Graphiti as the Phase 5 product memory runtime. Keep the local SQLite memory harness as operational/audit support, but route product retain/recall through the Graphiti contract when `BRAINSTY_PRODUCT_MEMORY_ADAPTER=graphiti`.

Reason:
Graphiti gives the MVP a real temporal knowledge graph retain/recall runtime without turning Cortex into product state. LangGraph remains the healthcare workflow master and calls Graphiti before and after graph execution. OpenClaw remains the adaptive worker/tool arm and does not own product memory.

Implementation notes:
- Official repo checkout: `vendor/getzep-graphiti`.
- Python runtime: `.venv-graphiti`.
- Verified runtime requirements: Python `>=3.10,<4`, a supported graph backend, and an OpenAI-compatible LLM/embedding provider.
- Active local backend: FalkorDB in Docker on host port `6380`.
- Node contract: `src/concierge/productMemory.mjs`.
- Python bridge: `tools/graphiti/graphiti_bridge.py`.
- UI proof: Product Memory panel and chat proof card.

Cost of changing later:
Medium. The contract can later swap Graphiti backend or hosted Zep service, but the app should preserve the same product-memory boundary: safe summaries/source pointers only, no Cortex product memory, no OpenClaw-owned memory, and LangGraph-owned retain/recall timing.

## 2026-05-27: Add Observe-Only Outbound Payload Audits Before Full PHI Enforcement

Context:
Phase 6 requires PHI, audit, and state hardening. Jumping straight to hard blocking and database rewrites before the full worker path is connected could slow the MVP and create brittle false failures. Deferring all PHI work would be worse because later tests would not know what actually left the app.

Options considered:
- Defer PHI hardening until after OpenClaw execution is connected.
- Implement a full PHI taxonomy and blocking engine immediately.
- First capture exact outbound payloads and labels in audit, then enforce once the real payload surfaces are visible.

Decision:
Implement Phase 6A-lite as observe-only outbound payload observability. Record exact serialized OpenAI and Graphiti payloads before send, attach payload hashes and coarse labels, and expose a summary in the UI. Do not block yet.

Reason:
This gives the project runtime evidence instead of assumptions. It catches direct-identifier leaks, raw portal-text leaks, and source-pointer presence in the real payload body while preserving the current approved PHI policy: direct identifiers are masked, but insurance/clinical reasoning context can be sent to the approved LLM path.

Cost of changing later:
Low. Enforcement can build on the same audit event and label contract. The next hardening step should turn selected labels into fail-closed tests and then policy gates, rather than replacing this observability layer.

## 2026-05-27: Enforce Outbound Payload Policy Before OpenClaw Worker Dispatch

Context:
Phase 6A made outbound payloads visible, but visible-only checks still allowed unsafe payloads to leave if future code accidentally included patient identifiers or raw portal text. Before connecting real OpenClaw worker dispatch, the runtime needs fail-closed behavior for the most dangerous payload classes.

Options considered:
- Keep observability-only until after OpenClaw execution is connected.
- Build a broad PHI taxonomy and full transactional database rewrite immediately.
- Enforce the highest-risk outbound labels now, then deepen PHI taxonomy and database hardening in later slices.

Decision:
Make outbound payload policy enforced by default for OpenAI and Graphiti calls. Block direct identifiers and raw portal text by default, and support required source-pointer assertions for call types that need sourced evidence. Record both observed and blocked payload audit events.

Reason:
This catches the most dangerous regressions without overfitting a partial PHI classifier. It preserves the approved product policy: insurance and clinical reasoning context may go to the approved LLM path, but direct identifiers must be masked and raw portal text must not silently become model or memory payload.

Cost of changing later:
Low to medium. Future hardening can add richer detectors, destination-specific approvals, screenshot/document checks, and database-level policy gates while preserving the current audit/event contract.

## 2026-05-27: Add Local Audit Hash Chain And Same-Session Checkpoint Lock

Context:
The app had append-only audit rows in practice, but no tamper-evident hash chain. Session checkpointing also used read-then-write state version increments, which can collide under concurrent local requests.

Options considered:
- Defer both concerns until the Postgres or `better-sqlite3` migration.
- Replace the database layer immediately.
- Add a local hash chain and a same-process checkpoint lock as an MVP hardening baseline.

Decision:
Add `previous_event_hash`, `event_hash`, and `chain_version` to `audit_events`; compute hashes on every new audit event; add `verifyAuditChain`. Add an in-process per-session checkpoint lock around `checkpointSession`.

Reason:
The MVP now has tamper-evident audit proof for new events and a concrete guard against same-process state version collisions, without blocking the next product slice on a full storage migration.

Cost of changing later:
Medium. Production should still move to transactional `better-sqlite3` or Postgres with database-level locking and stronger append-only guarantees, but the event hash material and verification contract can carry forward.

## 2026-05-27: Connect Official OpenClaw Only Through Dedicated Profile And LangGraph Approval

Context:
The project needs OpenClaw to become a real adaptive worker arm, not just a contract document. At the same time, the user's personal machine-wide OpenClaw profile contains personal skills and must not be used for healthcare MVP execution. The official OpenClaw profile setup had to be proven before any worker dispatch, and worker dispatch had to remain under LangGraph's approval/resume boundary.

Options considered:
- Use the already-installed default personal `~/.openclaw` profile and rely on prompt instructions to avoid personal skills.
- Install a completely separate OpenClaw binary for the project.
- Reuse the installed official OpenClaw CLI with a dedicated project profile, workspace, agent, skill allowlist, and managed browser profile.

Decision:
Use the already-installed official OpenClaw CLI, but only through `openclaw --profile brainstyworkers`. The project profile owns `~/.openclaw-brainstyworkers`, workspace `~/.openclaw-brainstyworkers/workspace-brainstyworkers`, agent `brainstyworkers-insurance-browser`, and managed browser profile `openclaw`. LangGraph may dispatch exactly one approved read-only observation to this profile after consuming a scoped approval token.

Reason:
This preserves the official OpenClaw stack and avoids reinventing the adaptive worker layer while protecting the user's personal OpenClaw profile, personal skills, personal channels, and personal memory. The real worker path now proves the boundary: OpenClaw can observe, but LangGraph decides workflow, approval, evidence verification, persistence, memory retain, and final response.

Implementation notes:
- Local OpenClaw CLI: `/opt/homebrew/bin/openclaw`, version `2026.5.4`.
- Dedicated gateway port: `19789`.
- Dedicated browser CDP port observed: `19800`.
- Repo skill is installed as a workspace skill under the dedicated workspace.
- `browser-automation` and `insurance-portal-browser` are ready for the project agent; personal skills are excluded.
- Official OpenClaw dispatch records outbound payload audit metadata but does not send raw portal text to LLM or product memory.
- Public payer marketing content is blocked after observation and creates no eligibility snapshot.

Cost of changing later:
Medium. Production should add token/authenticated gateway mode, stronger lifecycle management for the project gateway, richer payer-specific portal verification, and hosted/managed worker infrastructure. The profile/agent/workspace isolation and LangGraph-owned approval contract should remain.

## 2026-05-28 - OpenClaw Browser Skill Layering

Context:
The user's personal OpenClaw installation includes the secure `browser-automation` skill. The project also has a repo/workspace `insurance-portal-browser` skill. The question was whether the personal `browser-automation` skill is better than the complete project skill.

Options considered:
- Replace `insurance-portal-browser` with `browser-automation`.
- Ignore `browser-automation` and keep all browser guidance inside the healthcare skill.
- Layer the skills so each owns its proper responsibility.

Decision:
Layer the skills. `insurance-portal-browser` remains the healthcare-specific safety envelope and task/result contract. `browser-automation` is required as the low-level browser-control substrate. `ocr-local` is required as the local visual evidence substrate.

Reason:
`browser-automation` is stronger for general browser reliability, but it does not contain the healthcare workflow allowlist, approval gates, PHI/source-pointer boundaries, no-credential/no-2FA/no-form-submit rules, or LangGraph-owned job contract. Keeping the layer boundary lets the project reuse official OpenClaw browser craft without weakening healthcare safety.

Implementation notes:
- The dedicated project agent allowlist remains `insurance-portal-browser`, `browser-automation`, and `ocr-local`.
- The project does not use the user's default personal OpenClaw profile for Brainstyworkers execution.
- The repo skill manifest now declares `required_companion_skills` and `browser_control_policy`.

Cost of changing later:
Low. Future browser reliability updates should go into the browser substrate, while payer/healthcare policy updates should go into the `insurance-portal-browser` envelope and LangGraph contract.

## 2026-05-28 - Empower OpenClaw Inside Assigned LangGraph Tasks

Context:
The earlier contract kept OpenClaw too narrow: it treated the worker like a single deterministic browser action. The user clarified that OpenClaw should use its adaptive intelligence to get the delegated goal done, including subtasks, alternate automation paths, web scraping, read-only API attempts, task-scoped skill creation, OS automation, heartbeat memory, and progress reporting.

Options considered:
- Keep the strict no-subtask/no-memory worker contract.
- Give OpenClaw full autonomy over workflow selection and external actions.
- Empower OpenClaw inside the assigned LangGraph task while preserving healthcare approval boundaries.

Decision:
Empower OpenClaw inside its delegated task. LangGraph still chooses the healthcare workflow, owns approval gates, ingests final results/memory, and composes the final response. OpenClaw may create subtasks, run task-scoped status subagents, choose browser/web/API/scrape/tool paths, create task-scoped helper skills/scripts, use local OS automation inside the task scope, and update worker heartbeat memory.

Reason:
This captures the value of OpenClaw as an adaptive worker without letting it bypass the healthcare orchestrator. The worker should try hard, report progress, and avoid silent failure. LangGraph should decide when to continue synchronously, convert to async follow-up, or ask the user for missing data.

Implementation notes:
- Worker progress reports are required every 30 seconds while active.
- Terminal outcomes are explicit: sourced result, missing user data, insurance/portal block, policy/approval block, long-running follow-up, or partial result with blockers.
- The OpenClaw envelope carries product-memory recall, prior sessions, open tasks, scheduled jobs, and database pointers.
- Credentials, passkeys, 2FA, SSNs, payer contact, external messaging, form submission, record changes, appeals, authorizations, payments, cancellations, and medical advice remain gated or forbidden as applicable.

Cost of changing later:
Medium. Future execution code must implement the status subagent and async continuation path, but the contract now points in the correct direction for a capable OpenClaw worker.

## 2026-05-28 - Make GPT A Causal LangGraph Orchestration Decision Node

Context:
Phase 8 needs to prove that the MVP is not a scripted harness with an LLM call attached at the end. The user explicitly asked for GPT to provide real LangChain/LangGraph intelligence, with extra-high scrutiny for non-mocked LLM and agent interoperability.

Options considered:
- Keep structured routing deterministic and use GPT only for final response wording.
- Let GPT fully control workflow, approvals, and worker execution.
- Insert GPT as a governed LangGraph decision node after deterministic safety/classification and before workflow routing.

Decision:
Add a real GPT orchestration decision node inside LangGraph. The node returns strict JSON for intent, workflow, confidence, required evidence, missing evidence, approval requirements, worker goal, response strategy, and next user question. LangGraph may route from the GPT decision only when it is valid and confident. Deterministic safety refusals, approval gates, and policy overrides still win.

Reason:
This gives the orchestrator genuine model intelligence while preserving the healthcare control boundary. GPT can reason over user wording, source-pointer hints, route candidates, product-memory recall, and OpenClaw capability policy, but LangGraph still owns final workflow selection, execution gates, persistence, audit, product memory, and user response.

Implementation notes:
- GPT payloads use the existing PHI-approved direct-identifier masking policy.
- Replay mode exists only for deterministic tests; live proof requires real `ChatOpenAI`.
- The UI/API now expose whether GPT was invoked and whether its decision was actually used by the router.

Cost of changing later:
Medium. Prompt shape and workflow keys become contracts for future evaluation and UI debugging. However, the decision node is isolated enough to swap direct OpenAI access for Vercel AI Gateway, LangSmith-evaluated prompts, or a different structured-output model provider.

## 2026-05-28 - Add Runtime Events Before Richer Chat And Worker Progress UI

Context:
The MVP needs a user-facing chat that shows what the graph is doing, plus programmable hooks for LangGraph/OpenClaw cycles, external systems, webhooks, code hooks, and long-running worker status. Adding UI panels without an event spine would create another proof surface disconnected from the runtime.

Options considered:
- Add a custom chat timeline directly from final graph state.
- Add LangSmith immediately as the only observability layer.
- Add a local runtime pub/sub event spine first, then render or export it through UI, SSE, webhooks, and code hooks.

Decision:
Add a local runtime event platform now. LangGraph publishes lifecycle events after each graph run. Events persist locally, stream over SSE, can trigger in-process code hooks, and can be delivered to webhooks only when outbound webhooks are explicitly enabled.

Reason:
This makes the app itself capable of showing workflow proof without requiring LangSmith for the MVP. It also gives OpenClaw progress reporting and future third-party triggers a shared contract instead of one-off callbacks.

Implementation notes:
- Webhooks are dry-run blocked unless `BRAINSTY_ENABLE_OUTBOUND_WEBHOOKS=1`.
- Event types currently include workflow classification/routing, worker plan preparation, approval request, evidence status, final answer, and memory retention.
- Runtime events are diagnostic and orchestration-supporting; they are not product memory.

Cost of changing later:
Low to medium. The event schema can expand as OpenClaw status subagents and async follow-up delivery become real, but event type names and correlation ids should remain stable once UI and integrations depend on them.

## 2026-05-28 - Make Auth Plus Chat The Primary MVP Proof Surface

Context:
The project already had strong operator proof panels, but the user clarified that the MVP must be a user-facing app with friendly local auth, chat, workflow buttons, missing-information prompts, approval cards, OpenClaw result routing, and visible LangGraph activity.

Options considered:
- Keep the dashboard panels as the main proof surface.
- Build a separate new app shell.
- Promote the existing chat panel into the primary MVP loop while keeping dashboard panels for debugging.

Decision:
Use the existing local web app and make auth plus chat the primary proof surface. Workflow buttons become chat shortcuts. Local planned-user sign-in gates workflow execution. The chat surface renders guided state, read-only approval, GPT routing proof, OpenClaw worker/evidence status, product memory proof, and runtime graph events.

Reason:
This proves the system from the perspective of the future user without losing the operator audit/debug tools. It also keeps the project focused on one benefits journey before adding workflow breadth.

Implementation notes:
- The `Portal Ready` control records only user readiness in the UI and enables the live portal/official worker toggles; it does not enter credentials or execute the worker.
- Runtime timeline data comes from `/api/runtime/events` and the SSE stream, not from mocked UI state.
- OpenClaw remains pending approval until the user approves read-only observation.

Cost of changing later:
Low. The chat panel can later be split into a dedicated route or Next.js app, but the event/state contract should remain.

## 2026-05-29 - Publish Approval And Worker Status As First-Class Runtime Events

Context:
Phase 8B made the chat surface visible, but approval/resume still depended mostly on final graph state refresh. The OpenClaw worker empowerment contract requires no silent failure, 30-second progress reporting, and clear terminal outcomes.

Options considered:
- Keep worker progress only in audit rows and final graph state.
- Add frontend-only pseudo-progress.
- Publish approval and worker status transitions as runtime events from the server and LangGraph nodes.

Decision:
Make approval and worker status first-class runtime events. The approval API publishes `approval.recorded`. The graph publishes `approval.consumed` and `worker.status.updated` during evidence observation, including terminal outcomes and actions taken.

Reason:
This lets the chat timeline show real runtime state while preserving LangGraph as the workflow master. It also prepares the event contract for an actual OpenClaw status subagent and async follow-up handoff.

Implementation notes:
- Worker terminal outcomes use the OpenClaw empowerment vocabulary: `completed_with_sourced_result`, `not_possible_insurance_or_portal_block`, and `not_possible_policy_or_approval_block`.
- The chat worker-result card renders source pointers and structured benefits when available, or blocker text when evidence fails closed.
- These events are diagnostic/orchestration proof; they are not product memory.

Cost of changing later:
Low to medium. Event payloads can gain richer subtasks and heartbeat details later, but event names should remain stable for UI and hooks.

## 2026-05-29 - Treat Structured Benefit Rows As Source-Backed Evidence

Context:
Phase 8C made approval/resume visible, but a successful authenticated portal proof still risked feeling like a generic page snapshot. The MVP needs to prove value in the first benefits journey by showing concrete deductible and out-of-pocket rows while staying source-pointer grounded.

Options considered:
- Keep only `eligibility_snapshots` and verified extraction artifacts as source pointers.
- Put parsed balances only in the operator review dashboard.
- Promote persisted `coverage_balances` rows into the LangGraph source-pointer and chat result contract.

Decision:
Promote structured benefit rows to first-class source-backed evidence. When a verified portal proof extracts deductible or out-of-pocket balances, LangGraph persists them in `coverage_balances`, includes those rows as source pointers, summarizes them in the final sourced answer, and renders them in the chat Worker Result card.

Reason:
The user-facing MVP should answer the actual benefits question with concrete evidence, not merely prove that a page was observed. Keeping the rows tied to database source pointers preserves auditability and product-memory boundaries.

Implementation notes:
- Structured parsing now handles DOM/accessibility and OCR-style amount formats.
- Official OpenClaw evidence can carry accessibility-tree and local OCR channel metadata into `evidence_observation`.
- Friendly blocker mapping happens in the chat UI; raw trace details remain available in the operator/debug trace.
- Product memory remains source-pointer oriented and does not use Cortex or raw portal text as product memory.

Cost of changing later:
Low. The parser can be replaced with a richer extraction model later as long as `coverage_balances` source pointers and evidence-channel metadata remain stable.

## 2026-05-29 - Persist Long-Running Worker Follow-Up As Bound Continuation State

Context:
Phase 8C and 8D made approval/resume and evidence quality visible in chat, but longer OpenClaw work still needed an explicit state record instead of relying on the current synchronous browser turn. The OpenClaw empowerment contract requires no silent failure, 30-second status reporting, and a clear handoff when a worker task takes longer than the active chat turn.

Options considered:
- Keep long-running tasks as chat text only.
- Execute continuation controls directly from the browser UI.
- Persist a bound continuation record and scheduled status-check job, while leaving real worker execution to a fresh approved graph run.

Decision:
Persist worker continuations as first-class runtime state. A pending read-only worker proposal can become a `worker_continuations` row tied to task, session, user, workflow, approval scope, allowed action, correlation id, scheduled job, and last progress event. Create/continue/cancel controls publish runtime events and audit rows but do not execute worker actions directly.

Reason:
This creates a real gate instead of another proposal wall. The app can now acknowledge long-running worker work, show status/cancel/continue controls, and preserve LangGraph ownership of the workflow before an official OpenClaw status subagent is wired to consume the continuation.

Implementation notes:
- Continuation controls are limited to `read_only_observation` in this MVP.
- `actionsTaken` remains empty for create, continue, and cancel.
- Chat renders the continuation card and timeline events from persisted runtime state.
- The next bridge should consume this state from LangGraph and dispatch only the bound read-only status/observation action.

Cost of changing later:
Medium. The continuation table and event names should stay stable because the UI, audit, and future status-subagent bridge will depend on them. The scheduled-job backend can later move from local SQLite polling to a durable queue without changing the user-facing contract.

## 2026-05-29 - Consume Worker Continuations Only Through Fresh Approved LangGraph Runs

Context:
Phase 8E persisted long-running worker follow-up state, but the continuation was still only a queue record and chat control. The next architectural risk was allowing the continuation to become either another proposal wall or a UI shortcut that bypassed LangGraph approval/resume.

Options considered:
- Let the continue button execute the worker directly.
- Treat continuation state as documentation only and keep using the original approval button.
- Require a fresh read-only approval run to validate, consume, dispatch, and finalize the continuation inside LangGraph.

Decision:
Continuation dispatch must happen only inside a fresh approved LangGraph run. The graph validates the continuation before consuming approval, requires the dedicated official OpenClaw read-only worker path, then marks the continuation as `dispatching_official_openclaw`. Official worker result ingest finalizes the continuation as `completed` or `blocked` and publishes follow-up runtime events.

Reason:
This preserves LangGraph as the healthcare workflow master while giving OpenClaw a real execution bridge. It also prevents approval tokens from being burned on wrong-session, wrong-task, cancelled, expired, or non-official continuation attempts.

Implementation notes:
- Chat now exposes `Approve + Run Official Read-Only` on active continuation cards.
- `worker.followup.dispatching`, `worker.followup.completed`, `worker.followup.blocked`, and `worker.followup.expired` extend the Phase 8 runtime event vocabulary.
- The live official OpenClaw continuation test is wired but remains gated by `BRAINSTY_OPENCLAW_OFFICIAL_LIVE=1`.
- The continuation bridge still permits only read-only observation; irreversible/external actions remain outside scope.

Cost of changing later:
Medium. The validation-before-approval rule, event names, and continuation status values are now part of the orchestration contract. The underlying scheduler can later move to a queue or OpenClaw status subagent loop without changing the approval boundary.

## 2026-05-29 - Use The Dedicated OpenClaw Current Tab For Authenticated Live Proof

Context:
Phase 8F could dispatch the official OpenClaw worker, but the live proof path still opened the configured portal URL. For authenticated payer portals this is brittle: the user may already be logged in on a deeper member page, and opening a root/public URL can discard the exact authenticated context the proof needs.

Options considered:
- Keep opening the configured payer URL for every official worker run.
- Ask the user to copy portal text or snapshots manually.
- Add a current-tab mode for the dedicated project OpenClaw profile and require a fresh approval before observing it.

Decision:
Add an approved current-tab observation mode. When `officialOpenClawUseCurrentTab` or `BRAINSTY_OPENCLAW_USE_CURRENT_TAB=1` is set, the official worker starts the dedicated browser profile, requires an existing current tab, focuses it when possible, and captures accessibility-tree plus screenshot/OCR evidence from that tab without navigating away first.

Reason:
The MVP proof needs to test the real user journey: the user signs in manually, leaves the authenticated portal tab open, then LangGraph consumes a read-only approval and OpenClaw observes only that approved tab. This preserves user-controlled credentials and avoids replacing authenticated evidence with a public marketing page.

Implementation notes:
- Missing current tab fails closed as `official_openclaw_current_tab_missing`.
- The chat UI now has `Use current OpenClaw tab`.
- `Portal Ready` enables live portal proof, official worker dispatch, and current-tab mode together.
- `npm run test:live:openclaw-auth` runs only the authenticated current-tab proof so it does not first navigate the browser through the public payer fail-closed test.
- The first 8G live attempt failed because the dedicated profile had no open authenticated member-portal tab.
- After manual user login in the dedicated profile, the same live proof passed and created source pointers through the approved current-tab official OpenClaw path.

Cost of changing later:
Low to medium. Current-tab mode can later become a richer tab-selection UI, but the important boundary should remain: user authenticates manually, LangGraph approves observation, and OpenClaw does not enter credentials or force a workflow decision.

## 2026-05-29 - Harden The Successful Chat Result Before Adding Workflow Breadth

Context:
Phase 8G proved the authenticated current-tab OpenClaw continuation path, but the chat loop still looked unfinished after success: an earlier async continuation card could remain visible with active buttons, the missing-data prompt could still mention `portal_accounts`, and the final answer was more like an operator trace than a user-facing benefits answer.

Options considered:
- Add new workflows or richer OpenClaw abilities immediately.
- Leave the proof dashboard as the primary success surface.
- Polish the post-success chat loop while preserving the operator proof panels.

Decision:
Implement Phase 8H as a UI/output hardening slice. Successful evidence answers now use a compact source-pointer-grounded response. The chat suppresses portal-missing prompts once source pointers or captured evidence exist. Worker continuation cards are upserted by continuation id so completed/blocked/cancelled/expired states replace stale active cards and render terminal text without run/continue/cancel buttons.

Reason:
The MVP needs to feel like a usable auth-plus-chat product, not only a backend proof. Hardening the result state reduces silent user confusion while keeping LangGraph/OpenClaw/audit proof visible for debugging.

Cost of changing later:
Low. The output wording and continuation card rendering can evolve with the final UI, but the contract should remain: completed worker states are terminal, source pointers satisfy portal evidence prompts, and raw portal text stays out of the user-facing answer.

## 2026-05-29 - Login And Credential Gates Are Not Authenticated Portal Evidence

Context:
During Phase 8H browser verification, the current dedicated OpenClaw tab could temporarily report an Aetna login/sign-in URL and title while still containing enough generic Aetna/member words to pass the earlier evidence-field checks. That would allow a login page to create source pointers, which is unsafe and misleading.

Options considered:
- Trust approved Aetna hosts alone.
- Require member/benefits keywords only.
- Explicitly classify login, sign-in, authentication, password, passcode, and verification-code pages as credential gates before evidence creation.

Decision:
Authenticated portal verification now rejects login or credential-gate pages even when the host is an approved member-portal host. Such pages are classified as `login_or_credential_gate`, fail closed, and create no eligibility snapshot or source pointer.

Reason:
The MVP must prove authenticated healthcare evidence, not merely the ability to observe an approved domain. Credential and login pages are user-controlled authentication surfaces, not source evidence for benefits or claims.

Cost of changing later:
Low. Future portal-specific adapters can add stronger page-kind rules, but the base rule should remain: login and credential gates are blockers, not evidence.

## 2026-05-29 - Local SQLite Shell Adapter Needs Longer Busy Timeout Under Concurrent Proof

Context:
The full local test suite runs multiple real-data and graph/audit tests against the shared local SQLite database. After browser proof and real-data tests expanded, the shell-based SQLite adapter occasionally failed with `database is locked` after the old 5 second timeout.

Options considered:
- Make all tests serial.
- Move immediately to `better-sqlite3` or Postgres.
- Keep the shell adapter for this slice but raise the busy timeout.

Decision:
Keep the current shell adapter for Phase 8H and raise the SQLite busy timeout default to 30 seconds through `BRAINSTY_SQLITE_BUSY_TIMEOUT_MS`.

Reason:
This is a local proof harness, and the project already tracks transactional storage as a later hardening direction. The longer timeout prevents transient local concurrency from hiding real test outcomes while keeping the current storage layer unchanged for this slice.

Cost of changing later:
Low. The eventual move to `better-sqlite3` or Postgres should replace this timeout workaround with transactional connections and database-level concurrency control.

## 2026-05-29 - Make The MVP Proof Repeatable Before Adding Multi-Page Worker Search

Context:
Phase 8H made successful sourced answers clearer, but the local app still depended on a hand-run sequence: sign in, send Benefits, schedule follow-up, mark portal ready, approve, then inspect proof panels. The next requested direction is "not mock, real data" and a harder next phase, but the MVP needs a repeatable auth-plus-chat harness before OpenClaw gets broader multi-page navigation freedom.

Options considered:
- Move immediately to multi-page OpenClaw portal navigation.
- Keep the proof dashboard as the main way to verify the system.
- Add a small repeatable UI harness that starts a fresh local session, replays the benefits journey through `/api/chat`, and foregrounds the final answer while preserving operator proof.

Decision:
Implement Phase 8I as a repeatable MVP harness. The chat now has reset and replay controls, a visible Current Answer panel, answer-panel approve/follow-up controls, and expandable operator proof for Workflow Proof, Worker Result, payload audits, source pointers, and runtime timeline.

Reason:
Before OpenClaw performs broader adaptive multi-page work, the product path must be easy to rerun and debug without hidden setup. This keeps the proof user-facing while preserving the LangGraph/OpenClaw/audit details needed for engineering verification.

Cost of changing later:
Low. The reset/replay controls and answer panel can evolve into the final auth/chat interface. The important contract is that replay uses real auth plus `/api/chat`, and proof remains available without dominating the user answer.

## 2026-05-28 - Compact Runtime Context Packets And Stream SQLite Writes

Context:
The live multi-flow orchestrator audit exposed a non-obvious runtime failure: repeated real graph runs could grow context-packet inserts until SQLite shell process arguments hit `spawn E2BIG`.

Options considered:
- Limit live orchestrator test breadth.
- Remove context-packet persistence.
- Keep context persistence but compact payload surfaces and stream SQL through stdin.

Decision:
Keep context persistence, strip raw task metadata and scheduled-job payload JSON from runtime context packets, preserve bounded summaries, and stream large SQL write batches through sqlite stdin.

Reason:
The MVP needs repeated real flow tests to catch state growth and interoperability issues. Hiding the failure by shrinking tests would weaken proof. Streaming writes and compacting repeated payloads preserve auditability while avoiding a process-argument ceiling.

Cost of changing later:
Low. A future move to `better-sqlite3` or Postgres should replace this storage workaround with proper transactional writes, while preserving bounded context-packet semantics.

## 2026-05-30 - Multi-Page OpenClaw Navigation Must Stay LangGraph-Verified

Context:
Phase 8I made the benefits MVP repeatable, but OpenClaw was still mostly proving a single current-tab observation. The next real-value test is whether the worker can move through the authenticated insurance site to find relevant benefits evidence while the deterministic harness remains in control.

Options considered:
- Let OpenClaw browse freely and trust its final extraction.
- Keep official OpenClaw limited to one page until every workflow is complete.
- Allow same-origin multi-page read-only navigation, but require LangGraph to verify each page before evidence becomes a source pointer.

Decision:
Implement Phase 8J as same-origin, read-only, multi-page worker navigation inside the existing eligibility/benefits journey. OpenClaw may select and open internal read-only portal pages such as benefits, spending, claims, and prior authorizations. It must avoid logout, profile, messages, forms, uploads, credential gates, and irreversible-action paths. LangGraph verifies every observed page and composes the answer only from verified source pointers.

Reason:
This tests OpenClaw’s adaptive value without giving it authority over healthcare workflow choice or evidence validity. The worker can search the authenticated portal more deeply, while LangGraph remains the workflow master, approval owner, verifier, source-pointer owner, and final-response owner.

Cost of changing later:
Medium. Future worker freedom can expand to APIs, web scrape paths, or more page goals, but the page-by-page verification and source-pointer fan-in contract should remain stable.

## 2026-05-30 - Live Worker Recovery States Replace Auth Bypass

Context:
After the multi-page worker proof, the next MVP risk is user experience around live authentication. The worker should be versatile after approval, but insurance portals still depend on user-owned credentials, passkeys, 2FA, captcha, and session state. If the UI only exposes raw toggles, a user can think the system will bypass login or silently succeed from a public payer page.

Options considered:
- Let OpenClaw attempt OS/browser automation around login and challenge screens.
- Keep only raw live worker toggles and rely on backend fail-closed behavior.
- Add a first-class live-readiness contract that tells the user whether the dedicated OpenClaw profile, browser, current tab, and portal page are ready for approved read-only observation.

Decision:
Implement Phase 8K as a guided readiness and recovery layer. `/api/openclaw/official/status` now returns `liveReadiness`, and the chat UI renders the current status, next user action, allowed worker attempts, blocked actions, and fallback chain. `Portal Ready` checks this status before telling the user that a live run is ready.

Reason:
This preserves the desired worker versatility without crossing the authentication boundary. OpenClaw may adapt its read-only strategy after LangGraph approval, including same-site portal navigation, DOM scrape, OCR confirmation, configured read-only/public lookups, and manual-export fallback. It may not enter credentials, use password managers, solve 2FA/captcha, contact payers, submit forms, change records, or give medical advice.

Cost of changing later:
Low. The readiness classifier can gain portal-specific page rules and richer tab selection, but the contract should remain: user controls authentication, LangGraph approves and verifies observation, and OpenClaw reports blockers instead of bypassing them.

## 2026-05-30 - Multi-Page Source Evidence Must Compose As Executed, Not Proposal-Only

Context:
The Phase 8L live app proof captured verified multi-page official OpenClaw evidence, created source pointers, and completed the worker, but the response composer only recognized the single-page official evidence status. The user-facing Current Answer therefore risked falling back to old proposal-only wording even after approved execution.

Options considered:
- Leave the final response generic and rely on Worker Result proof.
- Special-case the UI only.
- Promote `captured_official_openclaw_multi_page_read_only_observation` into the same captured-evidence response contract as visible-page and single-page official observations.

Decision:
Treat multi-page official OpenClaw observation as a first-class captured-evidence status. The LangGraph response node now composes the sourced answer from stored source pointers for this status, and output policy explicitly says the approved multi-page read-only observation executed through the dedicated official OpenClaw profile with same-site navigation, DOM/accessibility checks, OCR, and verified page count.

Reason:
The MVP must let the user trust the Current Answer. If the worker actually executed after approval and evidence was retained, the response must say that clearly and cite source pointers. Older pre-approval proposal-only messages may remain in conversation history, but they must not be confused with the current sourced result.

Cost of changing later:
Low. More official OpenClaw evidence statuses can be added to the captured-evidence set as worker capabilities expand, but every status that creates source pointers should produce a sourced answer rather than a proposal-only answer.

## 2026-05-30 - Partial Sourced Results Are Completed Continuations With Blockers

Context:
The multi-page worker can verify some pages and block others. A run with verified source pointers and optional blocked pages should not appear as a failed continuation when the final answer can cite evidence.

Options considered:
- Mark any page blocker as failed/blocked.
- Always mark multi-page runs completed even without source pointers.
- Mark `partial_result_with_blockers` as completed only when it is the terminal outcome returned by the worker evidence path.

Decision:
`partial_result_with_blockers` is now a completed terminal continuation outcome. The proof surface can still display page blockers and partial status, while LangGraph treats the continuation as terminal and non-active.

Reason:
This matches the worker contract: a partial sourced result is useful evidence with transparent blockers, not a silent failure. Runs with no verified evidence still fail closed as blocked.

Cost of changing later:
Low. Future result quality scoring can refine when partial evidence is sufficient for an answer, but terminal continuation state should continue to distinguish sourced partial success from no-evidence failure.

## 2026-05-30 - Put The Rich Insurance Worker Playbook In The Skill Contract

Context:
The user asked whether the OpenClaw worker prompt matched a richer insurance-site playbook: try hard, use browser automation, DOM/accessibility extraction, OCR, portal search, PDFs/documents, and structured insurance reasoning, while still asking the user to complete login/2FA/captcha and staying read-only. The repo already allowed adaptive worker behavior, but the richer portal strategy was not fully expressed as a skill artifact, worker job contract, prompt contract, and testable schema.

Options considered:
- Leave the richer playbook only as conversation guidance.
- Put it only in the OpenClaw prompt text.
- Promote it into the repo-scoped skill artifact, dedicated project workspace skill copy, LangGraph worker job contract, prompt contract, artifact validator, and tests.

Decision:
Promote the richer insurance-site playbook into the project `insurance-portal-browser` skill and all related contracts. The worker may use portal search, DOM/accessibility extraction, local OCR, official read-only portal documents/PDFs, multiple same-site read-only approaches, structured insurance extraction, uncertainty reporting, and source pointers inside the approved LangGraph task. The dedicated project workspace copy is refreshed from the repo artifact. Auth recovery remains user-controlled; the worker still must not use password managers, enter credentials, handle passkeys/2FA/captcha, enter SSNs, contact payers, send messages, submit forms, modify records, or provide medical advice.

Reason:
OpenClaw's value is adaptive execution, but healthcare workflow safety needs a stable contract. Encoding the playbook in the skill plus the LangGraph job/prompt contracts lets the worker be versatile without letting it choose workflows or bypass approval/auth boundaries.

Cost of changing later:
Low to medium. The exact portal sections and data fields can expand as live portal testing reveals more structure. The higher-level contract should remain stable: LangGraph owns workflow, approval, verification, source-pointer fan-in, product memory, and final response; OpenClaw owns adaptive read-only execution inside the assigned task.

## 2026-05-30 - Make The Latest Answer And Memory Repair Visible In Chat

Context:
Phase 8L proved the live multi-page worker path, but the user-facing conversation could still contain older pre-approval text beside the newer sourced result. The live run also surfaced a product-memory gap: the sourced answer succeeded while Graphiti retain could report `retained false`, which made the MVP harder to trust and debug from the chat surface.

Options considered:
- Rely on the proof dashboard and leave chat history as-is.
- Hide older messages after every approval.
- Keep the chat history, but make Current Answer the explicit latest LangGraph result and surface memory repair/status there.

Decision:
Keep full chat history and operator proof, but make Current Answer the authoritative latest result for the active session. Add product-memory retain repair metadata and show retain attempts, repair status, next action, and repaired state in the answer panel, workflow proof, and runtime events. Add source-pointer rows for claims and prior authorizations so benefits/claims pages can feed structured proof without exposing raw portal text.

Reason:
The MVP must be user-friendly without losing auditability. Users need to see the current answer clearly, while engineers still need the proposal, approval, worker, source-pointer, payload, and memory proof. Memory failures should not silently disappear behind a sourced answer.

Cost of changing later:
Low. The UI wording and repair labels can evolve, but the contract should remain: latest answer is distinct from history; product memory status is visible; claims/benefits structured rows become source pointers before response composition.

## 2026-05-30 - Make OpenClaw Discovery Observable Before PDF Ingestion

Context:
Phase 8M put portal search and document/PDF handling into the OpenClaw worker skill, but the live official worker path did not yet prove whether those branches were reachable from an authenticated portal. Jumping directly to PDF download/analysis would blur two questions: whether the portal exposes the right controls/documents, and whether the product should ingest them.

Options considered:
- Add real PDF/document download and extraction immediately.
- Leave portal search/document handling as skill text only.
- First add a source-pointer-safe discovery report to the approved read-only observation path.

Decision:
Add an OpenClaw discovery report to the official read-only worker path before implementing document ingestion. The report records portal-search affordance scan status without submitting a query, official document/SBC/PDF candidate counts without downloading documents, blocker reasons for mixed form/submission/offsite areas, portal sections tried/reachable, and the fallback chain. LangGraph carries this into worker events, continuation metadata, evidence observation state, output policy, and UI proof.

Reason:
This keeps the MVP narrow and testable. The user can see whether the enriched worker playbook reached the right surfaces before we add the higher-risk and more complex PDF/document ingestion path. It also preserves the architecture rule: OpenClaw explores adaptively inside the approved task, while LangGraph verifies, stores source pointers, owns product memory, and composes the answer.

Cost of changing later:
Low. A later phase can promote read-only PDF/document ingestion from candidate discovery to actual extraction with a separate approval/scope if needed. The discovery report should remain as a pre-ingestion proof and blocker diagnostic.

## 2026-05-30 - After Live Discovery, Improve Section Extraction Before PDF Ingestion

Context:
The Phase 8P authenticated live OpenClaw proof passed. The worker verified 4/4 portal pages, created 8 source pointers, found portal search affordances, and found document candidates for document center, ID card, plan document, and EOB surfaces. It did not surface direct SBC/PDF candidates from the observed pages, and it correctly blocked one mixed document/form candidate.

Options considered:
- Implement PDF/document ingestion immediately.
- Keep the result as operator-only proof.
- First expose discovery metadata to the user and improve structured extraction for the reachable portal sections.

Decision:
Phase 8Q should improve the user-facing MVP loop and section-specific structured extraction before adding general PDF ingestion. The next implementation should show Discovery/Next Evidence metadata in chat, extract more structured facts from the live-reachable benefits, spending, claims, prior authorization, documents, ID card, pharmacy, and network surfaces, and add a narrower read-only document approval path before any future PDF/document download or analysis.

Reason:
The live proof shows the worker can reach useful authenticated portal surfaces today. The fastest MVP value is to turn those surfaces into clearer sourced answers and next-evidence prompts. PDF ingestion should be scoped to a visible document candidate and approved separately instead of becoming a broad capability by default.

Cost of changing later:
Low to medium. Once page-specific extraction and document-candidate approval are visible in chat, PDF/document ingestion can be added as a smaller, safer slice.

## 2026-05-30 - Add A Sibling MVP App Instead Of Replacing The Proof Dashboard

Context:
The existing app works well as a testing/proof dashboard, but the MVP must also be understandable as a user-facing auth-plus-chat product. The user asked for a friendlier UI that can test the sequencing of the whole system without giving up the already running proof surface.

Options considered:
- Replace the current dashboard with a redesigned single app.
- Start a new Next.js application immediately.
- Add a separate static `/mvp` route served by the existing Node app and wired to the same APIs.

Decision:
Add a separate `/mvp` route and keep `/` as the operator/debug dashboard. The new route is a user-friendly sequencing app: local auth, chat, workflow buttons, live worker readiness, read-only approval, worker continuation, source-pointer evidence, product-memory state, runtime events, and Discovery/Next Evidence metadata. It uses the existing API/runtime path and does not create a new mocked frontend runtime.

Reason:
The implementation risk is lowest if the UI phase does not change the orchestration architecture. The current priority is proving that a user can follow the real LangGraph/OpenClaw/Zep sequence. A Next.js migration can happen later when deployment, routing, auth provider, or component-system needs justify it.

Cost of changing later:
Low. The `/mvp` route can be ported to Next.js later because it already talks to stable API contracts. The dashboard can remain as an internal proof surface even after a production frontend is introduced.

## 2026-05-31 - Test The MVP From The User View Before Adding More Capability

Context:
Phase 8Q added the separate `/mvp` app and proved the proposal/pending-approval path from the user-facing route. The next risk is not whether the operator dashboard can inspect internals; it is whether the user-facing route can complete the live approved OpenClaw path and show a sourced answer or clear blocker without confusing the tester.

Options considered:
- Add PDF/document ingestion next.
- Add more workflows or a Next.js migration next.
- First run and harden the live approved Benefits path from `/mvp`, then improve extraction for reachable sections.

Decision:
The next implementation sequence is 8R live approved MVP run, 8S section-specific structured extraction, 8T candidate-specific document approval, 8U read-only document ingestion, and 8V MVP polish/operator split. Do not add broad PDF ingestion, new healthcare workflows, or a frontend framework migration until `/mvp` proves the current Benefits journey end to end.

Reason:
The live discovery proof already showed portal sections and document candidates. The new MVP route must now prove the value loop from a user's perspective: ask, approve, observe, verify, cite, remember, and explain blockers. This keeps the system from becoming more capable on paper while remaining hard to operate.

Cost of changing later:
Low. The phases are narrow and can be reordered only if a live `/mvp` blocker proves that a smaller prerequisite is missing.

## 2026-06-01 - Use Sanitized Captured-Format Fixtures For Regression, Keep Live OpenClaw As The Non-Mocked Proof

Context:
The Phase 8R live proof passed, but the aggregate local test run exposed a known reproducibility gap: two tests expected specific real Aetna rows to exist in `data/brainstyworkers.sqlite`. That local database is mutable and user-specific, so the tests could fail even when the runtime is healthy.

Options considered:
- Keep asserting against the current local real Aetna database.
- Skip those tests entirely.
- Convert them into sanitized captured-format regression fixtures while keeping authenticated OpenClaw live tests as the non-mocked evidence proof.

Decision:
Use sanitized captured-format portal fixtures for deterministic parser and portal-scan regression tests. Keep live OpenClaw browser tests behind explicit live flags for non-mocked authenticated evidence proof. Add section-specific extractors for benefits, spending, claims, prior authorizations, documents, ID card, pharmacy, network, and plan/effective-date signals before adding document/PDF ingestion.

Reason:
The MVP needs both kinds of proof: deterministic regression tests that run cleanly in a fresh checkout, and real live OpenClaw tests that prove the worker can observe authenticated portal evidence. Depending on a personal local SQLite history gives neither reliable CI-style proof nor a clean live boundary.

Cost of changing later:
Low. The fixtures can be extended as new live captures reveal new page shapes, while live tests remain the authority for real portal behavior.
