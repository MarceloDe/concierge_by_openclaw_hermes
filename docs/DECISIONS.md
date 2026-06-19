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

## 2026-06-02: Dynamic Skill Server As LangGraph State, Not Hidden Worker Autonomy

Context:
`docs/INSURANCE_PLAN_SKILL_METHODOLOGY.md` calls for plan-specialist insurance skills beside journey/workflow skills, while the current runner still hardcodes `insurance_portal_browser` at execution time. The user asked for editable Aetna and claim skills that can mount session, memory, database pointers, success likelihood, dynamic runtime variables, required OpenClaw worker tasks, search engines, and APIs.

Options considered:
- Let OpenClaw choose the skill and workflow dynamically.
- Add arbitrary SQL/tool declarations directly to generated skill files.
- Add a LangGraph-compatible dynamic skill server that reads editable artifacts, validates named mounts, and returns structured graph state.

Decision:
Add a `dynamic_skill_context` state field and a `skill_resolver` LangGraph node. The dynamic skill server reads `skill-server.json` files from `openclaw/skills/*`, validates them, mounts only allowlisted database queries, and returns selected insurance, journey, and execution skill keys plus success estimates and required worker/search/API contracts.

Reason:
This keeps LangGraph as workflow master while allowing progressively smarter skill generation. External skill-generator LLMs can edit structured skill artifacts, but they cannot introduce raw SQL, credential capture, medical advice, or unapproved external actions. The design follows LangGraph's shared-state node pattern and keeps skill selection visible in proof/audit.

Cost of changing later:
Low to medium. Additional generated skills can be added as files. Moving to a database-backed skill registry later will require preserving the `dynamic_skill_context` contract and named mount validation.

## 2026-06-15: First Docker Connector Profile Defaults Product Memory To Disabled-Safe

Context:
The server connector stack now needs a repeatable Docker topology for the Node runtime, FastAPI facade, Next.js mobile PWA, and memory dependency services. The local product-memory adapter can use Graphiti/FalkorDB, but the current Node runtime image does not yet install the Graphiti Python runtime and OpenAI-backed Graphiti dependencies.

Options considered:
- Claim full Graphiti/FalkorDB readiness from a compose file only.
- Build the entire Graphiti Python runtime into the first Node image immediately.
- Ship a connector compose profile that starts FalkorDB and wires Graphiti environment variables, but defaults the Node product-memory adapter to disabled/degraded-safe until the Graphiti image proof is added.

Decision:
Use the third option for the first deployment slice. The compose topology includes FalkorDB and Graphiti env wiring, but `BRAINSTY_PRODUCT_MEMORY_ADAPTER` defaults to `disabled`. The dashboard and health proof must say this honestly.

Reason:
The goal of this slice is remote-app connector deployability, not overstating production memory health. The system remains safe and testable while preserving a clear next step for full Graphiti-in-container proof.

Cost of changing later:
Low. A follow-up Dockerfile layer or sidecar can install Graphiti dependencies and switch `BRAINSTY_PRODUCT_MEMORY_ADAPTER=graphiti` once health, replay, and degraded-mode proof pass in containers.

## 2026-06-15: Install Graphiti Runtime In The Node Connector Image

Context:
The first Docker connector slice intentionally shipped with FalkorDB wired but product memory disabled by default. The remaining product-memory deployment gap was proving that the Node runtime container can actually run the official project-local Graphiti package against the compose FalkorDB service, initialize schema, and retain/recall safe source-pointer memory.

Options considered:
- Keep Graphiti outside Docker and document it as a local-only dependency.
- Add a separate Graphiti worker sidecar immediately.
- Install the Graphiti bridge runtime into the Node image while keeping the adapter env-gated.

Decision:
Use the third option for this slice. The Node image now creates `/app/.venv-graphiti`, installs `vendor/getzep-graphiti[falkordb]`, and verifies the FalkorDB driver during build. Compose still defaults `BRAINSTY_PRODUCT_MEMORY_ADAPTER` to `disabled`, but can be launched with `BRAINSTY_PRODUCT_MEMORY_ADAPTER=graphiti` plus model credentials for live schema and retain/recall proof.

Reason:
The current product runtime is Node/LangGraph calling a Python Graphiti bridge. Baking that bridge into the same internal runtime image is the smallest reliable proof without adding a second worker lifecycle. Keeping the adapter disabled by default preserves safe local startup when credentials are unavailable, while the live smoke prevents disabled-safe memory from being counted as full product-memory readiness.

Cost of changing later:
Medium. A later production deployment can split Graphiti into a sidecar or managed service, but it should preserve the same adapter boundary, outbound payload observation, source-pointer-only retain payloads, replay queue, and dashboard scoring semantics.

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

## 2026-06-01 - Gate Document Access By One Candidate Before Any Broad Document Extraction

Context:
The live OpenClaw discovery path can now find official document, ID card, plan document, EOB, SBC/PDF, and mixed document/form candidates from authenticated portal pages. The user asked to finish the original MVP before a backend architecture pivot and specifically requested a candidate-specific approval gate before approved document observation.

Options considered:
- Allow the existing read-only portal approval to cover all document/PDF surfaces discovered by the worker.
- Add a new document table and document-ingestion subsystem immediately.
- Reuse existing `agent_tasks.metadata_json` and `approval_gates.details` to bind one discovered candidate to one approval and one official OpenClaw observation.

Decision:
Use a narrower `read_only_document_observation` scope and a new task type, `openclaw_document_candidate_proposal`, stored in existing task/audit storage. A candidate must be discovered first, receive a stable ID derived from URL/type/label/source, pass read-only/offsite/mixed-form/submission blocking checks, and then be approved as a single candidate before LangGraph dispatches official OpenClaw to that candidate URL.

Reason:
The MVP needs to prove user value without granting broad document access or starting a large document-ingestion subsystem too early. This preserves the architecture rule: LangGraph owns workflow, approval, verification, source pointers, memory, and final answer; OpenClaw observes the exact approved candidate as the adaptive worker.

Cost of changing later:
Low to medium. A later phase can add full PDF text extraction and document-specific structured parsing behind the same candidate approval contract. If production requires richer document state, a dedicated document table can be added with a migration from the existing task metadata/source pointers.

## 2026-06-01 - Treat Live Portal Unavailability As A First-Class MVP Outcome

Context:
Phase 8W reached the live proof gate, but Aetna was unavailable and the dedicated project OpenClaw profile had no authenticated member portal tab. The current implementation failed closed correctly, but the default response wording still sounded like a proposal-only run rather than an approved worker attempt that was blocked by external portal/auth state.

Options considered:
- Wait for Aetna and leave the current response wording unchanged.
- Treat the blocked run as a failure and move immediately to the Wefella/FastAPI backend pivot.
- Keep the original MVP order, record the external blocker, and harden the user-facing blocked result before retrying live evidence.

Decision:
Keep the original MVP order. `blocked_no_authenticated_evidence` is now a first-class user-facing result: it explains that LangGraph routed the workflow, the approved read-only evidence step could not access authenticated portal evidence, the worker stayed inside the approved scope, and no source pointers or document candidates were created.

Reason:
An unavailable payer portal is a normal real-world outcome. The MVP must show the user and operator exactly what happened without fabricating evidence or hiding behind generic proposal language. This also supports the later FastAPI facade because task status and SSE streams need clear terminal states such as sourced result, partial result, and external portal block.

Cost of changing later:
Low. The blocked-result wording can later be surfaced through a FastAPI/SSE task status contract, but the current Node/LangGraph runtime remains the source of truth until the original MVP proof completes.

## 2026-06-01 - Add FastAPI As A Facade, Not A Runtime Rewrite

Context:
The Wefella support document defines a future FastAPI public backend with JWT, CORS, task status, SSE, source grounding, and audit. The original MVP runtime already has working Node/LangGraph/OpenClaw/Zep Graphiti behavior and has passed local gates plus fail-closed live portal blocker proof. The user accepted the external portal blocker and asked to proceed to the next phase.

Options considered:
- Rewrite the product runtime in FastAPI immediately.
- Defer all Wefella alignment until the original live Aetna flow is available again.
- Add FastAPI as a public facade that delegates to the existing Node/LangGraph/OpenClaw service.

Decision:
Phase 9A adds a small FastAPI facade under `project/api/`. It exposes health, protected chat submission, task status, and SSE-style task streaming, but it delegates the actual healthcare orchestration to the existing Node `/api/chat` runtime. Node/LangGraph/OpenClaw/Zep Graphiti remains the source of truth until parity tests justify deeper migration.

Reason:
This captures the Wefella API shape without destroying the proven runtime. It also gives the next MVP phase a production-facing contract for auth, CORS, async status, and streaming while preserving the real approval-gated OpenClaw path and local proof dashboards.

Cost of changing later:
Medium. The facade can later gain persistent task storage, provider-backed JWT, deployed hosting, and write-once audit. A Python orchestration migration should only happen after facade-vs-Node parity tests prove equivalent behavior.

## 2026-06-01 - Prove FastAPI From The MVP UI Before Making It The Only Entrypoint

Context:
The Wefella guide says FastAPI should become the only public frontend entrypoint, but the current product runtime still has many Node-only proof surfaces: local auth-start, approval, worker continuations, OpenClaw readiness, document candidates, runtime events, and the operator dashboard. Moving every endpoint at once would create a broad migration risk.

Options considered:
- Switch `/mvp` completely to FastAPI in one step.
- Keep FastAPI as a backend-only experiment with no user-facing proof.
- Add a visible `/mvp` backend route selector and route chat through FastAPI first.

Decision:
Phase 9B routes the user-facing chat loop through FastAPI when selected, including local MVP token minting, `POST /api/chat`, task streaming, and status fallback. The direct Node route remains selectable. Approval and worker surfaces stay on Node until Phase 9C adds FastAPI proxies for them.

Reason:
The guide's most important production correction is the task-id plus stream/status loop. Proving that loop from the actual MVP screen gives value immediately and reduces the risk of a hidden second runtime. Keeping the route selector preserves direct parity testing while the facade grows.

Cost of changing later:
Low. Once the remaining Node-only MVP endpoints are proxied through FastAPI, the selector can default to FastAPI or the Node option can become operator-only.

## 2026-06-01 - Proxy MVP Actions Through FastAPI Before Defaulting To It

Context:
Phase 9B proved chat-through-FastAPI from `/mvp`, but approval, worker continuations, document candidates, OpenClaw readiness, and runtime event proof still reached Node directly. The Wefella guide requires FastAPI to become the only public frontend entrypoint, but the direct Node route is still valuable for parity and debugging.

Options considered:
- Immediately remove Node-direct calls from `/mvp`.
- Leave non-chat MVP actions on Node and call the facade "complete enough."
- Add protected FastAPI proxies for every remaining `/mvp` action, with user binding, while keeping Node-direct as a selectable parity path.

Decision:
Phase 9C adds protected FastAPI proxies for approval, worker continuation, document candidate, OpenClaw readiness, and runtime event endpoints. `/mvp` uses those proxies when Wefella mode is selected. The facade injects the JWT subject as `userId` and rejects mismatched user ids. The direct Node route remains selectable.

Reason:
This is the safest bridge to the Wefella architecture: the frontend can now behave like FastAPI is the public API, but the mature Node/LangGraph/OpenClaw runtime still performs the real orchestration. Keeping the Node route lets future phases do side-by-side parity checks before defaulting to FastAPI.

Cost of changing later:
Low. Phase 9D can switch the default route to FastAPI and add formal parity comparison without changing the underlying orchestration contracts.

## 2026-06-01 - Make The MVP FastAPI-First Only After Visible Parity Proof

Context:
Phase 9C moved all user-facing `/mvp` actions behind FastAPI when the Wefella route is selected, but the screen still defaulted to the direct Node path. The Wefella target asks for FastAPI to become the public production API, while the current Node/LangGraph/OpenClaw/Zep Graphiti runtime remains the proven orchestration source of truth.

Options considered:
- Remove Node-direct from `/mvp` and make FastAPI the only route immediately.
- Keep Node-direct as the default until a later backend migration.
- Default `/mvp` to FastAPI now, but keep Node-direct selectable and add an explicit side-by-side parity check.

Decision:
Phase 9D defaults `/mvp` to the Wefella FastAPI facade and adds a visible Node-direct versus FastAPI parity panel for the same Benefits prompt. The parity check uses separate temporary sessions, compares stable graph-contract fields, and remains proposal-only with no approved worker action. Direct Node remains selectable for operator/debug fallback.

Reason:
This makes the user-facing app behave like the future public API without pretending the runtime has been rewritten. A visible parity check is the guardrail that keeps FastAPI honest while Node/LangGraph/OpenClaw continues to own healthcare orchestration.

Cost of changing later:
Low. Once parity stays stable, the Node selector can move out of the user MVP surface and into the operator dashboard. A Python orchestration migration should still wait for parity tests that prove behavior, approval, audit, source-pointer, and memory equivalence.

## 2026-06-01 - Add Provider-Style JWT Checks Before Deeper FastAPI Expansion

Context:
Phase 9D made `/mvp` FastAPI-first and proved parity with the Node runtime, but FastAPI auth was still purely local-development HS256 bearer tokens. The Wefella support document requires JWT auth on public API routes and a production-ready auth posture before the facade becomes more than a local bridge.

Options considered:
- Keep local dev tokens only until deployment.
- Replace local MVP auth immediately with a hosted auth provider.
- Add provider-style JWT claim validation now while preserving local MVP auth for development and parity testing.

Decision:
Phase 9E keeps local HS256 tokens as the default development path, adds explicit `WEFELLA_AUTH_MODE=provider`, requires issuer/audience configuration in provider mode, validates subject, expiration, not-before, issuer, and audience, disables local MVP auth by default in provider mode, and exposes only safe auth metadata from `/api/health`.

Reason:
This improves the public API contract without forcing a provider choice or breaking the local `/mvp` proof loop. It also creates testable auth boundaries before adding production deployment, rate limiting, or deeper Python orchestration.

Cost of changing later:
Low to medium. A later hosted provider can add JWKS/RS256 verification behind the same `require_user` contract. The local dev path can remain for non-production testing while production runs with provider mode and disabled local auth.

## 2026-06-01 - Treat The FastAPI Approved Loop As Complete With A Precise External Blocker

Context:
Phase 9E secured the FastAPI facade auth path. The next risk was whether `/mvp` could drive the same real approval and OpenClaw continuation loop through FastAPI, then let the operator dashboard inspect the same session. The current machine has the dedicated OpenClaw profile available, but no authenticated member-portal tab was available during this proof.

Options considered:
- Wait for an authenticated payer portal before implementing the Phase 9F proof surface.
- Mark the phase incomplete until source pointers can be created from a live member portal.
- Implement the full FastAPI-approved loop now and accept either verified source pointers or a precise external blocker, matching the final-system contract.

Decision:
Phase 9F treats a precise fail-closed blocker as a valid proof branch when authenticated external portal state is missing. `/mvp` now shows a Phase 9F proof panel, the approved loop runs through FastAPI, and `/` can hydrate the same session from the proof link. Tests assert the approved resume carries approval and worker continuation fields to Node/LangGraph, and the live facade gate accepts source pointers or a precise blocker.

Reason:
This proves the product can guide a user through the real deterministic harness without fabricating evidence when the payer portal is unavailable or unauthenticated. It keeps LangGraph and OpenClaw honest: approval can be consumed, read-only worker actions can start, blockers are explicit, and the operator can inspect the same trace.

Cost of changing later:
Low. When the user signs into the dedicated OpenClaw browser profile, the same 9F path can produce source pointers instead of the current `blocked_no_authenticated_evidence` result. The proof panel and tests already accept that sourced-result branch.

## 2026-06-01 - Harden FastAPI Without Moving Orchestration Out Of Node/LangGraph

Context:
Phase 9F proved the FastAPI-first approved loop from `/mvp`, including the correct precise-blocker branch when no authenticated OpenClaw member-portal tab is available. The Wefella support document calls for production API behaviors such as rate limiting, CORS, task status, error contracts, source grounding, and durable task tracking. The risk is adding those concerns by creating a second healthcare runtime.

Options considered:
- Move orchestration into FastAPI now while adding production API features.
- Keep FastAPI as a thin proxy and postpone all hardening until deployment.
- Harden the FastAPI facade contract while continuing to delegate healthcare decisions, approvals, worker dispatch, evidence, memory, and audit to Node/LangGraph/OpenClaw.

Decision:
Phase 9G hardens the facade layer only. FastAPI now adds request IDs, standardized error envelopes, configurable rate limiting, explicit CORS metadata/defaults, optional local JSON task persistence, and source-grounding metadata/enforcement around completed facade chat tasks. Node/LangGraph/OpenClaw remains the orchestration source of truth.

Reason:
This gives the public API a safer deployment posture without reintroducing runtime divergence. Source grounding is checked at the facade boundary as an additional guardrail, but LangGraph still decides workflow state, approval consumption, source-pointer creation, final answer composition, and memory behavior.

Cost of changing later:
Low to medium. The local JSON task store can later become Redis/Postgres while keeping the task registry interface. Source-grounding enforcement can be enabled in production once the sourced-result and blocker branches are both stable across real user sessions.

## 2026-06-01 - Add Readiness And Observability Hooks Without Adding A Second Runtime

Context:
The Phase 9G facade had production API guardrails, but deployment still lacked an operator-ready runbook, a readiness endpoint, a smoke command, and a safe task-level observability hook. The final goal requires public/internal APIs, background/worker status, SSE recovery, and auditable behavior, but the current MVP must not become a FastAPI rewrite of the working Node/LangGraph/OpenClaw runtime.

Options considered:
- Add LangSmith as a required dependency before deployment proof.
- Build a broad production backend rewrite with new operator/research APIs.
- Add small deployment hooks around the current facade and keep product orchestration delegated to Node/LangGraph/OpenClaw.

Decision:
Phase 9H adds deployment and observability readiness at the facade boundary: `/api/readiness`, safe observability metadata in health, optional JSONL facade task events, a running-service `npm run smoke:facade` command, a deployment runbook, and expanded environment examples. The JSONL export stores message hashes and statuses, not raw healthcare input.

Reason:
This gives the project a deployable operating surface without changing who owns healthcare behavior. Readiness and smoke checks make the FastAPI facade easier to run in CI or local demos, while the optional event export gives useful task lifecycle proof without leaking PHI.

Cost of changing later:
Low. JSONL export can be replaced by LangSmith/OpenTelemetry/log drains behind the same event shape. The readiness checks can grow as Postgres, Redis, vector stores, MockWorker, Hermes, or operator/research APIs are implemented.

## 2026-06-01 - Add Document Upload As A Facade Capability Before Chat Grounding

Context:
The broad final-system goal requires user document upload and extraction, but the current MVP proof loop is centered on LangGraph chat plus approval-gated OpenClaw portal observation. Adding document ingest directly into the orchestrator before there is a proven upload/extraction surface would make failures harder to isolate.

Options considered:
- Add uploaded documents directly to the LangGraph chat path first.
- Defer document ingest until after all operator/research APIs are built.
- Build a narrow FastAPI upload/extraction harness first, then connect extracted fields to LangGraph in a later slice.

Decision:
Phase 10A adds authenticated upload and local extraction at the FastAPI facade boundary first. The harness stores files locally, validates type and size, runs real local extraction for text/PDF/image when runtimes are available, returns safe redacted previews and structured fields, and exposes the result in `/mvp`. It does not yet let chat use uploaded document evidence.

Reason:
This satisfies a concrete final-system user capability while keeping the runtime boundaries clean. Upload/extraction can now be tested independently from LangGraph routing, OpenClaw worker state, Graphiti retain, and answer composition. The next phase can wire only the safe extracted evidence into the orchestrator with source-pointer tests.

Cost of changing later:
Low to medium. The local filesystem store can later become object storage with the same upload id and extraction response shape. The extraction harness can be replaced by a stronger OCR/document AI service behind the same API contract, as long as safe preview, fields, provenance, blockers, and user ownership remain stable.

## 2026-06-01 - Ground Chat On Uploaded Extractions Without Dispatching OpenClaw

Context:
Phase 10A proved authenticated upload and local extraction, but the user-facing value loop still could not answer a chat question from an uploaded insurance document. The final-system goal needs user-supplied documents to become evidence, but OpenClaw should remain the adaptive portal/worker arm rather than the mechanism for reading already-extracted local uploads.

Options considered:
- Send uploaded files directly to Node and let LangGraph extract them.
- Dispatch OpenClaw for every uploaded document question.
- Keep extraction and ownership in FastAPI, pass only safe extraction packets into LangGraph, and treat the upload as a read-only local evidence source.

Decision:
Phase 10B keeps upload ownership and extraction at the FastAPI facade boundary. FastAPI resolves `uploaded_document_ids` for the authenticated user and passes safe extraction packets to Node/LangGraph. LangGraph creates `uploaded_document_extractions` source pointers and composes a sourced answer without any OpenClaw worker dispatch.

Reason:
This preserves the runtime boundaries: FastAPI owns public upload/auth checks, LangGraph remains the healthcare workflow master, and OpenClaw stays reserved for approval-gated adaptive portal/document observation. It also gives the user-facing app an immediate document-grounded chat capability without inventing a mock worker path.

Cost of changing later:
Low. The source pointer and safe extraction packet shape can survive a later object-storage or document-AI backend. If uploaded document observation later needs OpenClaw for complex PDFs or OCR, it can be added as an approved worker path without changing the basic ownership and source-pointer contract.

## 2026-06-01 - Make Uploaded Document Citations First-Class MVP Evidence

Context:
Phase 10B allowed chat to answer from uploaded document extractions, but the user-facing UI still showed mostly source-pointer counts and compact labels. The final-system goal requires citations/source views and cross-session product-memory proof, not just an internal source pointer array.

Options considered:
- Leave citation details only in the operator dashboard.
- Add a separate document-inspection workflow before improving the chat result.
- Enrich the existing uploaded-document source pointer and render it directly in `/mvp`, while proving Graphiti retain/recall across sessions.

Decision:
Phase 10C treats uploaded-document extractions as first-class source-backed evidence. LangGraph source pointers now include uploaded-document citation metadata, `/mvp` renders source detail cards and Graphiti memory proof, and product-memory retain sanitizes uploaded-document fields/spans before sending them to Graphiti.

Reason:
This makes the existing user-facing value loop more real without adding a new workflow or runtime fork. The user can see where an answer came from, while the system proves memory is source-pointer based and not raw-document based.

Cost of changing later:
Low. The enriched pointer shape can be reused if storage moves from local files to object storage or if extraction moves to a document-AI service. The UI cards can later render richer page and bounding-box citations without changing the core LangGraph evidence contract.

## 2026-06-01 - Add User Continuity Without Creating A Second Runtime

Context:
The final-system goal requires a user to resume sessions, review prior answers, submit feedback, and export useful outputs. Before Phase 10D, the operator dashboard could inspect session state, but the user-facing `/mvp` app did not have a protected continuity loop through the FastAPI-first route.

Options considered:
- Keep session continuity only in the operator/debug dashboard.
- Add a separate FastAPI session store independent from the Node/LangGraph runtime.
- Add a thin continuity module over the existing SQLite session/messages/state tables and expose it through both Node and FastAPI.

Decision:
Phase 10D adds `sessionContinuity.mjs`, a `feedback_items` table, Node continuity endpoints, FastAPI protected proxy endpoints, and `/mvp` controls for history, feedback, and Markdown export. The continuity layer reads from the existing LangGraph-backed session state and conversation messages, and it persists feedback back into the same audit/session database.

Reason:
This closes user-facing resume/feedback/export gaps without splitting runtime authority. LangGraph remains the workflow master, FastAPI remains the public/auth facade, and Node remains the current product runtime for session state, source pointers, audit, and feedback persistence.

Cost of changing later:
Low to medium. The endpoint contracts can survive a later move from SQLite to Postgres. Markdown export can become server-side artifact storage later, and feedback can feed an operator queue or evaluation workflow without changing the current user ownership checks.

## 2026-06-01 - Add Operator Research Control Plane Without Executing Research Yet

Context:
The final-system goal calls for operator/research APIs, source management, task control, and proof dashboards. After Phase 10D, the user-facing continuity loop existed, but the operator dashboard still had no first-class way to manage research sources or queue source-review work. The risk was jumping straight to scraping/crawling/worker execution without a stable source/run/audit contract.

Options considered:
- Add scrapers or OpenClaw research dispatch immediately.
- Move research APIs into a new backend architecture before finishing the current MVP runtime.
- Add a narrow operator research control plane first, using the current Node/LangGraph database and FastAPI facade, and leave execution queued until the next phase.

Decision:
Phase 10E adds the operator research API foundation only. `knowledge_sources` now supports proposal/review/run metadata, `research_runs` and `research_run_events` store queued manual runs and lifecycle events, Node owns the research operation logic, FastAPI protects the public proxy routes and binds `actorUserId` to the JWT subject, and `/` renders the operator research console. A run is a real queued/audited record, not a scraped result and not a mock answer.

Reason:
This creates the contracts needed for real research execution without hiding behavior. It keeps healthcare orchestration in the existing Node/LangGraph/OpenClaw runtime, keeps FastAPI as the public/auth facade, and gives the operator UI a visible source/run lifecycle before any scraper, crawler, or worker is allowed to act.

Cost of changing later:
Low to medium. The queued run/event shape can feed deterministic fetchers, OpenClaw worker jobs, MockWorker/Hermes mode, or a later Postgres-backed task system. Full RBAC still needs to be added before this becomes a production operator surface.

## 2026-06-01 - Require Operator/Admin RBAC For FastAPI Research Routes

Context:
Phase 10E created the first operator research control plane, but the FastAPI facade only required a valid JWT subject and actor binding. That protected cross-user access but still let any authenticated local user call operator/research routes if they knew the endpoint.

Options considered:
- Leave research routes subject-bound only until the production identity provider is selected.
- Hide research controls only in the UI.
- Add a narrow role boundary in the FastAPI facade now while keeping the Node runtime unchanged.

Decision:
Phase 10F adds role-based authorization at the FastAPI public boundary. The facade normalizes roles from `roles`, `role`, `groups`, `permissions`, `scope`, and `scp` claims. All `/api/research/*` routes require `operator` or `admin`; normal local-session tokens remain user role only. The existing `actorUserId` subject binding remains required after the role check.

Reason:
The final-system goal requires user/operator/admin separation, and research controls are operator actions even before real scraper or OpenClaw execution is attached. Enforcing this at FastAPI is the smallest useful production boundary because `/mvp` user routes keep working while operator routes become explicitly privileged.

Cost of changing later:
Low. The role parser can be narrowed to the selected identity provider's exact claim shape, and the same `require_operator` dependency can later protect additional operator APIs such as write proposals, tool control, and research execution.

## 2026-06-01 - Execute Approved Research Runs With Deterministic Fetch Before Worker Expansion

Context:
After Phase 10F, operator research routes were role-protected, but manual runs were still queued control records only. The final-system contract requires background/evidence pipeline behavior, MockWorker mode, worker status, source artifacts, auditability, and no hidden worker action. Jumping directly to OpenClaw/Hermes research execution would blur the boundary between a proven deterministic pipeline and future adaptive workers.

Options considered:
- Keep research runs queued until OpenClaw/Hermes research workers are ready.
- Add MockWorker only.
- Add a bounded deterministic fetch executor first, plus an explicit MockWorker fallback.

Decision:
Phase 10G executes approved research runs through a deterministic fetch adapter and stores source/run artifacts. The adapter fetches only approved HTTP(S) sources, enforces a byte/content-type boundary, extracts local text, stores a raw artifact file under a git-ignored directory, records hashes and safe previews in `research_artifacts`, and writes execution events/audit rows. MockWorker mode is available and visible, but outputs are marked `mock_worker_untrusted`. OpenClaw and Hermes research modes remain feature-gated.

Reason:
This creates the first real operator research execution loop while preserving truthfulness. The system can now prove source proposal, approval, run queueing, execution, artifact provenance, audit, and UI visibility without overclaiming adaptive worker readiness or trusted retrieval closure.

Cost of changing later:
Low to medium. The artifact table and run event lifecycle can feed future scrapers, OCR/PDF extraction, embeddings, citation closure, OpenClaw worker dispatch, Hermes workers, or a Postgres-backed evidence pipeline. The deterministic adapter may later become one worker mode among several.

## 2026-06-01 - Require Artifact Review Before Trusted Research Retrieval

Context:
Phase 10G created real research artifacts, but deterministic fetch output was intentionally marked `extracted_pending_review`. The final-system goal requires evidence search, citation closure, groundedness, and a review queue. If fetched artifacts became searchable as trusted evidence immediately, the system could silently cite unreviewed scrape/fetch output in healthcare answers.

Options considered:
- Treat every deterministic fetch artifact as trusted because it came from an approved source.
- Wait for embeddings/vector search before exposing any evidence search.
- Add a deterministic review gate and safe-preview search first.

Decision:
Phase 10H adds artifact review and trusted-only evidence search. Operators can approve an artifact for `trusted_retrieval_approved`, quarantine unsuitable artifacts, or leave artifacts pending. Default search returns only trusted reviewed artifacts; pending matches are reported as unavailable to trusted retrieval. MockWorker artifacts are blocked from trusted approval.

Reason:
This creates citation closure before broader retrieval. It preserves the truth boundary between "we fetched something" and "the system may cite it," while still giving operators a usable review/search loop over real artifacts.

Cost of changing later:
Low. Embeddings, Graphiti/Zep indexing, OpenClaw/Hermes research workers, and scheduled automation can all reuse the same citation status contract. If storage moves to Postgres/object storage, the review state remains a simple artifact-level field.

## 2026-06-01 - Let User Answers Use Only Reviewed Research Evidence

Context:
Phase 10H created trusted research artifact search, but user-facing healthcare answers still did not consume that store. The remaining risk was two-sided: answering from scripted templates when no portal evidence was available, or prematurely citing unreviewed fetch/worker artifacts.

Options considered:
- Keep research search operator-only until embeddings or Graphiti indexing are ready.
- Let deterministic fetch artifacts answer users immediately after execution.
- Add a narrow LangGraph evidence node path that uses only `trusted_retrieval_approved` artifacts and refuses when evidence is missing or pending.

Decision:
Phase 10I connects reviewed research evidence to user-facing LangGraph answers. The graph searches reviewed research artifacts when no approved portal/document observation is present, maps trusted matches into `trusted_research_artifact` source pointers, and composes a sourced answer from reviewed snippets. Pending-review matches and missing evidence create blocker/refusal responses, not healthcare answers. MockWorker output remains excluded.

Reason:
This closes the citation loop without weakening the review boundary. It also keeps LangGraph as workflow master, FastAPI as public facade, and Node as the current runtime while making the user-facing MVP more useful: a user can now receive a sourced answer from operator-reviewed evidence without requiring live portal access.

Cost of changing later:
Low to medium. The same source-pointer shape can be backed by embeddings, Graphiti/Zep indexing, scheduled research refreshes, OpenClaw research workers, or Hermes workers later. Ranking may need improvement once many trusted artifacts exist, but the trust boundary remains artifact-level citation status.

## 2026-06-01 - Gate Operator Natural-Language Write Actions With Proposals

Context:
After Phase 10I, user answers could cite reviewed research evidence, but the operator control plane still required direct button/API actions for source/run/artifact changes. The final-system goal calls for a more flexible operator assistant, but letting natural-language instructions mutate research state directly would create hidden worker/operator action risk.

Options considered:
- Let the operator assistant execute all parsed actions immediately.
- Defer natural-language operator control until an LLM planner is added.
- Add a fixed registry-bound assistant now where read tools execute directly and write tools become approval-bound proposals.

Decision:
Phase 10J adds an operator assistant with a fixed research tool registry. Read-only requests execute immediately through registered read tools. Write/action requests create `operator_tool_proposals` with risk, expected effect, hashes, status, and audit proof. Approval or rejection is a separate endpoint; approval executes the stored tool/args exactly once, while rejection performs no target mutation. FastAPI protects the same routes with operator/admin RBAC and actor binding.

Reason:
This gives the operator surface more flexibility without weakening the audit boundary. The system can now accept plain-English operator requests while preserving deterministic tool selection, visible proposal review, and no hidden source/run/artifact changes.

Cost of changing later:
Low. The curated parser can later be replaced or augmented by an LLM classifier/planner as long as it still emits one of the registered tool keys and validated args. The proposal table can also wrap future OpenClaw/Hermes dispatch and scheduled automation actions without changing the approval lifecycle.

## 2026-06-01 - Represent Scheduled Research As Approved Records Plus Explicit Due Ticks

Context:
After Phase 10J, operators could create gated proposals for source/run/artifact changes, but the final-system goal still required recurring research automation. Adding a hidden cron or daemon immediately would make it hard to prove which worker action happened and under whose authority.

Options considered:
- Add a background daemon that automatically executes research on an interval.
- Defer all recurring automation until production infrastructure is chosen.
- Add persisted schedules and an explicit due-tick endpoint that queues work first.

Decision:
Phase 10K stores approved research schedules in `research_schedules` and exposes due ticks that queue `scheduled_research_run` records by default. Schedule creation/pause/resume/run-due are available through the operator tool registry and remain proposal-gated when driven by natural language. Real execution remains a separate worker action.

Reason:
This gives the MVP an auditable automation contract without hiding worker behavior. It preserves the rule that scheduled work must be visible, source-bound, and reviewable before execution.

Cost of changing later:
Low. A real cron, external scheduler, queue worker, OpenClaw dispatch, or Hermes dispatch can call the same due-tick contract. The schedule table can move to Postgres without changing the operator-visible lifecycle.

## 2026-06-01 - Expose Audit Logs Through Redacted Operator API Before More Worker Expansion

Context:
The project already had hash-chained `audit_events`, but the operator dashboard could only see scattered audit snippets embedded in specific task results. The final-system checklist explicitly calls for `GET /api/audit`, and new source/proposal/schedule actions need a single proof surface before adding more autonomous workers.

Options considered:
- Keep audit only inside per-feature responses.
- Return raw audit details to the dashboard for maximum debugging.
- Add a redacted audit API that returns event metadata, hashes, safe previews, and chain verification.

Decision:
Phase 10L adds `GET /api/audit` in Node and a FastAPI operator/admin proxy. The response includes event ids, session ids, event types, action kinds, timestamps, event hashes, details hashes, redacted/truncated details previews, event-type counts, pagination, and visible-chain verification. It explicitly does not return raw audit details.

Reason:
This closes the audit-log API gap while respecting healthcare data boundaries. Operators can now inspect what happened, prove hash-chain status, and trace proposal/scheduler/research events without turning the audit endpoint into a raw data export.

Cost of changing later:
Low. The same contract can later add search indexes, Postgres pagination, downloadable operator reports, or tamper-evidence dashboards while preserving the default redacted response shape.

## 2026-06-01 - Add Explicit Embedding Route Selection Before Adaptive Research Workers

Context:
Phase 10L made research/source/scheduler/proposal actions visible through a redacted audit API. The next gap was retrieval quality and index lifecycle: trusted research artifacts were searchable only by deterministic token scoring, and the final-system goal explicitly required an embedding route decision plus safe reindexing before broader knowledge growth.

Options considered:
- Jump directly to OpenClaw/Hermes research-worker dispatch.
- Wire OpenAI embeddings as the only route.
- Add a persisted route/index/reindex contract first, with a credential-free local route and a failure-safe OpenAI route option.

Decision:
Phase 10M adds `research_embedding_routes`, `research_embedding_jobs`, and `research_embedding_index`. The default route is `local_tfidf` with deterministic local vectors so the MVP has a real, reproducible backend without requiring external credentials. Operators can select `local_tfidf` or `openai`, inspect status, and reindex trusted artifacts. Reindexing writes only `trusted_retrieval_approved` artifacts, reports route use in search, blocks dimension mismatches safely, and preserves prior active index rows unless a new reindex succeeds.

Reason:
This closes the route-selection/reindexing contract without pretending that every environment has OpenAI embedding credentials. It keeps the artifact review boundary intact: approved sources and completed runs still do not become citable until artifact citation review approves them. It also gives future OpenClaw/Hermes research workers a stable rule: worker output must pass review before entering trusted retrieval.

Cost of changing later:
Low to medium. The local vector route can be replaced or complemented by OpenAI, pgvector, Graphiti/Zep, Chroma, or another vector backend behind the same route/job/index contract. If production storage moves to Postgres, the route/job semantics should remain stable while vector storage moves out of SQLite.

## 2026-06-01 - Attach OpenClaw And Hermes As Bounded Research Workers

Context:
Phase 10M closed the trusted-evidence embedding lifecycle, but OpenClaw and Hermes were still visible only as future feature-gated modes. The final-system contract requires real worker adapter modes without letting the frontend call workers directly or letting workers bypass source approval, operator approval, audit, artifact review, or trusted retrieval gates.

Options considered:
- Keep OpenClaw/Hermes as labels until a production queue exists.
- Let `/` execute OpenClaw/Hermes directly as broad autonomous research agents.
- Add bounded adapter modes now, disabled by default, using a typed task envelope and pending-review artifact lifecycle.

Decision:
Phase 10N adds `openclaw` and `hermes` worker modes to research run execution. Both require an approved source/run, explicit `approvedWorkerDispatch=true`, and an environment feature flag before command dispatch. OpenClaw uses the official project profile through `openclaw --profile brainstyworkers agent --local ... --json`; Hermes uses `hermes --oneshot`. Both receive the same `brainstyworkers.research_worker_task.v1` envelope and must return structured JSON. Results become pending-review artifacts, never trusted retrieval evidence directly.

Reason:
This gives the MVP a real adaptive-worker attachment point without weakening the deterministic governance already built. OpenClaw/Hermes can now be tested as powerful workers inside an approved source-scoped task, while LangGraph/FastAPI/researchOps still own routing, approval, audit, artifact review, embeddings, and user-facing citation.

Cost of changing later:
Low to medium. The command runners can be replaced by OpenClaw MCP/channel endpoints, Hermes task channels, a durable queue, or a Postgres-backed worker table while preserving the typed envelope and result schema. The important invariant is stable: adaptive worker output enters trusted retrieval only after operator review.

## 2026-06-01 - Build Research Evidence Graph From Safe Metadata Only

Context:
After Phase 10N, the research system had approved sources, runs, artifacts, review gates, embeddings, schedules, audit, and bounded adaptive workers, but the final-system checklist still required `GET /api/research/graph` and `POST /api/research/graph/build`. The graph needs to help operators understand relationships without becoming another raw-content export.

Options considered:
- Return raw artifact previews and URLs as graph labels for easier debugging.
- Defer the graph until Neo4j or Graphiti production storage is chosen.
- Build a local metadata graph from the existing SQLite research tables and persist graph-build proof rows.

Decision:
Phase 10O adds a metadata-only research evidence graph. Nodes and edges are built from `knowledge_sources`, `research_runs`, `research_artifacts`, `research_embedding_*`, and `research_schedules`. Artifact bodies and safe text previews are not returned. URLs are reduced to host plus hashes inside graph metadata. `POST /api/research/graph/build` records a `research_graph_builds` row and a hash-chained `research_graph_build_completed` audit event.

Reason:
This closes D17/D18 without adding a new graph database or weakening citation safety. Operators get relationship proof across sources, runs, artifacts, schedules, and embedding routes while trusted retrieval still depends on artifact review and reindexing.

Cost of changing later:
Low. The local graph builder can later publish the same node/edge contract to Graphiti, Neo4j, Postgres graph tables, or a UI visualization. The safety invariant should remain: raw artifact text and raw portal/private dumps do not appear in graph responses.

## 2026-06-01 - Add Labels-Only Claim Citation Closure Before Final Answers Are Trusted

Context:
Phase 10O made the research evidence graph visible, but the system still needed a direct answer-quality boundary: every factual answer claim should be linked to trusted reviewed evidence or treated as not citation-closed. Without this, a user-facing answer could contain a well-sourced sentence beside an unsupported sentence and still look grounded.

Options considered:
- Let the LLM decide groundedness in free text.
- Use all fetched and pending-review artifacts as support to maximize coverage.
- Add a deterministic labels-only claim judge over trusted reviewed artifacts first, then later swap in richer LLM/embedding entailment behind the same contract.

Decision:
Phase 10P adds `research_claim_evaluations` and a citation-closure evaluator that extracts factual/domain claims from a safe answer preview, scores them only against `trusted_retrieval_approved` artifacts, labels each claim as supported, low-confidence, or unsupported, and writes only labels, scores, hashes, safety flags, metadata citation pointers, and audit proof. Pending-review evidence cannot support a trusted answer, and the judge never creates or promotes evidence.

Reason:
This closes the immediate grounded-answer safety gap without introducing another source of invented facts. The evaluator can fail an answer cleanly when citation closure is incomplete, while the UI and operator assistant can show exactly which claims need revision or more evidence.

Cost of changing later:
Low to medium. The deterministic scorer can be replaced or complemented by an LLM judge, embedding reranker, or graph entailment service as long as the same invariant holds: the judge labels claims against trusted reviewed evidence and never manufactures support.

## 2026-06-01 - Keep A Tested Final Verification Matrix Before Claiming Completion

Context:
After Phase 10P, the project had many green local gates and a working MVP value loop, but `docs/goal_final_system.md` remained broader than the implemented surface. It included UI mode switching, urgent escalation, manual research PDF ingestion, analytics, budget/kill-switch controls, and live worker/provider proof that were not all finished. The goal instructions require completion to be proven requirement by requirement, not inferred from passing tests.

Options considered:
- Continue directly to another feature without a full matrix.
- Mark the active goal complete because the main local MVP path passes.
- Add a maintained final-system report and make tests/build guards check its coverage.

Decision:
Phase 10Q adds `docs/FINAL_SYSTEM_VERIFICATION_REPORT.md` and a report coverage test. The report maps every explicit `A*` through `H*` item in `docs/goal_final_system.md` to one of the allowed final-report statuses. Known gaps remain visible as `FAILING / NEEDS FIX`, and live OpenClaw/Hermes proof remains `BLOCKED BY EXTERNAL DEPENDENCY`.

Reason:
This prevents accidental completion claims and gives the next agent a crisp, test-backed backlog. It also keeps the project honest: green local tests prove many slices, but the broad final-system contract still contains unfinished surfaces.

Cost of changing later:
Low. As future phases close gaps, the report rows can move from failing/blocked to passing with evidence. The coverage test will keep the report aligned with any new goal-file requirement ids.

## 2026-06-01 - Urgent/Emergency Prompts Bypass Workers And Create Human Handoffs

Context:
The final verification matrix showed A19, A20, and H10 as failing. Unsafe medical-advice prompts were blocked, but emergency/safety-critical messages did not yet have a first-class bypass path, durable handoff record, audit proof, or dashboard visibility.

Options considered:
- Treat urgent prompts as generic medical-advice refusals.
- Let GPT classify emergency language and decide whether to escalate.
- Add a deterministic urgent policy signal that routes directly to a durable handoff before GPT, OpenClaw, or evidence observation.

Decision:
Phase 10R adds deterministic urgent/emergency detection and routes those messages to `human_approval_escalation` with `urgent_emergency_escalation`. LangGraph creates `human_handoff_items`, an `urgent_human_handoff` task, a hash-chained `human_handoff_created` audit event, and immediate emergency-safe guidance. The urgent path skips OpenClaw proposal/dispatch, browser observation, payer contact, external messaging, credential entry, form submission, and GPT calls.

Reason:
Emergency handling must be predictable and must not depend on adaptive worker behavior or model availability. Durable handoff rows give the operator proof surface something concrete to review without turning the worker into a clinical responder.

Cost of changing later:
Low to medium. Assignment, acknowledgement, closure, and notification workflows can be added around `human_handoff_items` without changing the critical invariant: urgent/safety prompts bypass normal worker execution and create audit-backed handoff proof.

## 2026-06-01 - Render The MVP From Typed AI2UI Blocks Instead Of Ad Hoc Text

Context:
The final verification matrix showed A6 and A7 as failing. `/mvp` already displayed answers, citations, approval state, worker state, memory, and handoffs, but it did not have the requested Chat/Split/Guided/Bento mode system and it did not receive a complete typed AI-to-UI block payload from the backend. Without a typed contract, frontend mode changes risk becoming string-specific or duplicating orchestration logic in the browser.

Options considered:
- Keep rendering only the final response text plus scattered proof panels.
- Build a new frontend framework or separate Next.js app before finishing the current MVP scope.
- Add a small backend block contract inside the existing Node/LangGraph runtime and let `/mvp` switch presentation modes over the same run state.

Decision:
Phase 10S adds `brainstyworkers.ai2ui.blocks.v1` through `src/concierge/ai2uiBlocks.mjs`. LangGraph attaches blocks after product-memory retain and `POST /api/chat` returns them as `ai2uiBlocks`. `/mvp` renders typed answer, workflow, approval, worker, citation, memory, handoff, safety, and next-step cards. It also adds Chat, Split, Guided, and Bento modes that re-render the same current result and persist the selected mode in localStorage. Unknown future block types render as safe warning cards.

Reason:
This closes A6/A7 without a frontend rewrite or runtime fork. It keeps LangGraph as the source of truth for healthcare workflow state while giving the UI a stable, testable rendering contract. State-preserving modes help user testing because the same session can be inspected in a friendly chat shape, guided workflow shape, or proof-dense bento shape.

Cost of changing later:
Low. The block schema can be extended with new typed cards, richer renderer hints, or a future Next.js frontend as long as unknown block fallback remains and mode switching stays presentation-only.

## 2026-06-01 - Use An Env-Gated Approved-Schedule Daemon Instead Of Hidden Cron Execution

Context:
Phase 10K created approved research schedules and an explicit due-tick endpoint, but the final verification matrix still showed E1 as failing because there was no always-on daemon/cron proof. The system needed recurring research automation without weakening the existing approval/source/audit boundaries.

Options considered:
- Leave schedule execution as manual `POST /api/research/schedules/tick` only.
- Add an external cron first, before local daemon state and tests.
- Add a hidden background worker that executes all due work automatically.
- Add an env-gated local daemon that calls the same approved due-tick contract and defaults to queue-only behavior.

Decision:
Phase 10T adds `src/concierge/researchScheduler.mjs` and `research_scheduler_daemon_state`. The Node server creates the daemon at startup and auto-starts only when `BRAINSTY_RESEARCH_SCHEDULER_ENABLED=1`. Each tick calls `runDueResearchSchedules`, emits runtime events, writes hash-chain audit proof, records daemon state, and skips overlapping same-process ticks. Default behavior queues `scheduled_research_run` records; adaptive OpenClaw/Hermes execution remains feature-flagged and requires `approvedWorkerDispatch=true`.

Reason:
This closes the local MVP E1 proof while preserving the deterministic research contract. The daemon is observable, testable, and operator-visible, and it does not create a second hidden path for worker execution.

Cost of changing later:
Low to medium. A production cron, queue worker, Vercel Cron, systemd/launchd job, or external scheduler can call the same daemon tick contract. High-volume production should move overlap/concurrency guarantees from the in-process guard and shell-out SQLite to Postgres transactions, leases, or a durable queue.

## 2026-06-15 - Put LLM Intelligence Inside A Deterministic Healthcare Harness

Context:
The consulting loop called for real LLM reasoning and answer composition, but the existing MVP still relied heavily on deterministic route templates and hardcoded OpenClaw skill assumptions. The system needed more intelligence without allowing the model or worker layer to authorize unsafe healthcare actions.

Options considered:
- Keep deterministic routing and postpone LLM composition.
- Add direct model calls in graph nodes for speed.
- Add schema-constrained intent and answer modules behind outbound payload observation, deterministic validators, source-pointer gates, and LangGraph authority.

Decision:
Slice 1 adds `src/concierge/intelligence/*` for structured intent reasoning, journey planning, and source-caged answer composition. LangGraph keeps deterministic policy authority and conditional routing. OpenClaw gets registry/executor/policy modules so skills are discovered and bounded by capability, approval scope, and blocked actions instead of treated as a single hardcoded browser worker.

Reason:
This makes the model useful for interpretation and composition while preserving the critical invariants: the LLM cannot authorize unsafe action, cannot invent evidence, cannot bypass payload observation, and cannot turn advisory memory into instructions. LangGraph remains the healthcare journey authority; OpenClaw remains the bounded worker/tool arm.

Cost of changing later:
Medium. Future work can replace the internal LLM gateway or product memory adapter, but the structured schemas, validators, source-pointer claim cage, and OpenClaw registry contract should remain stable because tests now depend on those safety boundaries.

## 2026-06-15 - Queue Retryable Product-Memory Retain Failures For Replay

Context:
The architecture requires real temporal product memory through Graphiti/Zep or an equivalent adapter. The runtime already reports Graphiti/FalkorDB degradation, but retryable retain failures could still be lost after being audited. That makes degraded mode visible but not recoverable.

Options considered:
- Leave retain failures as audit-only repair plans.
- Treat local SQLite memory as successful product memory when Graphiti is down.
- Persist safe source-pointer retain payloads in a replay queue and expose queue health through the product-memory API.

Decision:
Add `product_memory_replay_queue` as a durable fallback for retryable Graphiti retain failures. The queue stores only safe, identifier-masked, source-pointer retain payloads. Status and replay endpoints expose the backlog, and replay uses the same Graphiti bridge plus outbound payload observation path as normal retain.

Reason:
This preserves the product-memory boundary without pretending degraded Graphiti memory worked. Runtime failures become actionable and replayable; policy failures remain manual-repair items and are not retried automatically.

Cost of changing later:
Low to medium. A production deployment can move this queue to Postgres, Vercel Queues, Redis, or another durable worker system while keeping the same safe payload contract and replay status semantics.

## 2026-06-15 - Replace Shell-Backed SQLite Store With Native SQLite

Context:
The consulting plan called out the database layer as a safety/infrastructure gap because the central store shelled out to `sqlite3` for each statement and built SQL strings for high-level helpers. This created hidden failure modes around per-command PRAGMA state, foreign-key enforcement, quoting, and production migration discipline.

Options considered:
- Keep the CLI-backed store and only add more identifier checks.
- Install `better-sqlite3`.
- Use Node's built-in `node:sqlite` runtime and preserve the current async store interface.

Decision:
Use `node:sqlite` `DatabaseSync` as the local store backend. Keep the public `SqliteStore` methods async for compatibility, but run through a persistent native connection with foreign keys, busy timeout, WAL, bound high-level helpers, explicit transactions, and a `schema_migrations` ledger.

Reason:
This removes shell execution without adding a dependency or rewriting every runtime module at once. It also makes local tests more production-like: foreign keys are consistently enforced, which caught and fixed placeholder-session browser takeover tests.

Cost of changing later:
Medium. The store interface can later move to Postgres or a fully parameterized query layer. The next hardening pass should reduce legacy raw `store.get()` and `store.all()` SQL call sites and add lease-based concurrency for production workers.

## 2026-06-15 - Migrate Recent Memory And Retention Queries To Bound Parameters First

Context:
After the native SQLite migration, the store supports bound parameters, but many legacy modules still pass raw SQL strings to `store.get()` and `store.all()`. Rewriting every query at once would create a large behavioral diff across audit, session, research, memory, and worker subsystems.

Options considered:
- Leave all raw call sites for a later all-at-once rewrite.
- Rewrite the entire repo to a new query builder in one pass.
- Start with recent high-value paths that handle memory replay, retention expiration, and review evidence lookup, then continue module-by-module.

Decision:
Migrate the recent product-memory replay queue, retention sweeper, and review endpoint queries to bound parameters first. Add DB safety coverage proving raw `store.get()` and `store.all()` can safely bind hostile-looking values.

Reason:
This keeps the database hardening moving without destabilizing unrelated legacy modules. It also creates a clear pattern for future migrations: preserve the store API, bind every value, and reserve string assembly for reviewed identifiers or static SQL only.

Cost of changing later:
Low. The remaining raw SQL call sites can be migrated module-by-module using the same parameterized store calls, then eventually folded into stricter query helpers or a production database adapter.

## 2026-06-15 - Parameterize Audit Log Reads Because Audit Is A Proof Surface

Context:
The audit log API is both an operator surface and a verification surface for approvals, model payloads, worker actions, and safety events. It accepted user-facing filters and still used interpolated SQL even after the store gained native bound-parameter support.

Options considered:
- Leave audit SQL for a later broad raw-query migration.
- Replace the audit module with a generic query builder.
- Parameterize the audit filters in place and add hostile-filter tests.

Decision:
Parameterize audit hash lookup, chain verification, and list/filter/count/type queries in `src/concierge/audit.mjs`. Escape user-entered `LIKE` wildcards and keep only the intentional event-prefix suffix wildcard.

Reason:
Audit is too central to leave on manual quote escaping. This change improves security posture without changing the audit event schema or API response shape.

Cost of changing later:
Low. Future work can move audit reads to stricter query helpers or a production database adapter while preserving the current filter semantics and chain verification contract.

## 2026-06-15 - Parameterize Session Runtime Queries Before Broader Legacy Cleanup

Context:
LangGraph statefulness depends on session lookup, resume-latest behavior, checkpoints, and session listing. After audit was parameterized, `sessionManager` still had manual SQL quote helpers around user/email filtering.

Options considered:
- Leave session queries until a full query-builder migration.
- Rewrite the whole session subsystem.
- Bind the stateful lookup/listing queries in place while preserving existing session APIs.

Decision:
Parameterize `resolveManagedSession` latest-session lookup and `listManagedSessions` filters/limit. Remove the unused manual SQL helper from `sessionContinuity`.

Reason:
This hardens a central runtime path without altering LangGraph thread IDs, checkpoint semantics, session continuity export, or API response shape. It also reduces risk that hostile-looking email/user-id strings could affect session listing behavior.

Cost of changing later:
Low. The same bound-parameter pattern can be carried into memory harness, worker continuation, research, and operator query modules.

## 2026-06-15 - Parameterize Memory Harness Queries Because Harness Context Becomes Prompt Context

Context:
The memory harness assembles cross-session context packets for LangGraph and the dedicated OpenClaw arm. It reads memory items, source pointers, tasks, scheduled jobs, outbox proposals, and heartbeat runs. Because this data becomes prompt context and worker context, query broadening or cross-user leakage would be higher impact than an ordinary reporting bug.

Options considered:
- Leave the harness on manual quote escaping until a full query-builder migration.
- Rewrite the memory harness around a new persistence abstraction.
- Parameterize the existing harness queries in place and add hostile-input regression coverage.

Decision:
Remove the harness-local SQL quote helper and migrate memory-harness reads/deduplication lookups to bound parameters. Keep the existing context packet, heartbeat, and follow-up planning contracts unchanged.

Reason:
This closes a high-value database safety gap while preserving the already-tested LangGraph/OpenClaw memory injection behavior. The regression explicitly checks hostile-looking user/source identifiers and cross-user memory isolation.

Cost of changing later:
Low. A future production database adapter can preserve the current query shapes and context packet schema while moving storage to Postgres, a queue-backed worker store, or a stricter typed repository layer.

## 2026-06-15 - Parameterize Approval And Worker Continuation Queries At The Action Boundary

Context:
The approval-resume and worker-continuation modules enforce single-use approval tokens, user/session/task binding, read-only action scope, and async OpenClaw continuation status. These paths are part of the safety boundary between LangGraph authority and OpenClaw worker execution.

Options considered:
- Leave manual SQL quote helpers in place until a broad persistence rewrite.
- Move approval and continuation state to a new repository layer immediately.
- Parameterize the current queries in place and add hostile-binding regressions.

Decision:
Remove local SQL quote helpers from `approvalResume` and `workerContinuations`, bind approval-token/session lookups and continuation listing/latest-event queries, and clamp continuation list limits.

Reason:
This keeps the action boundary stable while reducing query-broadening risk in exactly the code that gates worker execution. The tests now prove hostile-looking session/status values stay literal and do not consume approvals or expose unrelated continuations.

Cost of changing later:
Low. The same API and state schema can later move into a stricter repository or production database adapter without altering LangGraph/OpenClaw approval semantics.

## 2026-06-15 - Route OpenClaw Through Bounded Registry Proposals Before Worker Execution

Context:
OpenClaw needs to become a general bounded proposing/solving worker without taking over healthcare journey authority from LangGraph. The implementation already had registry, executor, readiness, gateway, and policy modules, but the graph path still leaned on a single hardcoded browser skill.

Options considered:
- Keep the insurance browser skill as the only accepted OpenClaw artifact.
- Let OpenClaw choose journeys and tools directly.
- Use registry-driven matching to build a bounded task proposal, then keep LangGraph as the workflow authority and approval owner.

Decision:
OpenClaw now produces a bounded task proposal from the loaded skill registry, dynamic skill context, executor registry, approval state, and readiness state. The proposal can select multiple official skills and an executor, propose subtasks, list required evidence, declare blocked actions, and identify fallbacks, but it cannot choose the healthcare journey or perform write/external actions.

Reason:
This closes the automation gap without weakening the healthcare safety boundary. Skills can be added through the registry, tests prove insurance portal browser, claim journey, and Aetna plan routing, and executor mismatches or write actions fail closed before worker dispatch.

Cost of changing later:
Low to moderate. Additional official skills should extend registry metadata and tests rather than editing hardcoded graph modules. A future dispatcher can consume the same proposal contract once explicit approval and action-execution contracts are documented.

## 2026-06-15 - Prefer Sourced LLM Composition When Evidence Exists

Context:
The project had a strict sourced-answer composer and validator, but the final healthcare answer path still used deterministic text unless the request explicitly asked for a live model. That left evidence-backed answers underusing the LLM composition architecture.

Options considered:
- Keep deterministic final answers as the default.
- Always call the model, even without source pointers.
- Prefer the LLM composer only when source pointers exist and the user has not explicitly disabled live model use, with deterministic fallback for missing credentials or validation failure.

Decision:
The graph now attempts sourced LLM composition when source pointers are present. The composer still runs through observed OpenAI egress, validates claim/source schema, and falls back deterministically when there are no source pointers, no model key, an explicit `useLiveModel:false`, or validator rejection.

Reason:
This implements the required `source pointers + structured facts + advisory memory -> LLM sourced composer -> strict validator -> deterministic policy -> final_response` path while preserving local/offline behavior and unsupported-claim vetoes.

Cost of changing later:
Low. The validator contract and source-pointer schema are stable enough to support more answer types, and the deterministic fallback remains available for offline demos and blocked model calls.

## 2026-06-15 - Treat Retention Sweeper Results As Auditable Acceptance Proof

Context:
Retention expiration was implemented, but the acceptance gate needed explicit proof that sessions, continuations, and memory expiration actions were recorded for review.

Options considered:
- Leave retention as silent database mutation.
- Add a separate reporting table.
- Emit hash-chained audit events for retention actions while preserving the existing sweeper API.

Decision:
The retention sweeper now writes audit proof for expired sessions, expired worker continuations, and tombstoned expired memory items.

Reason:
Retention touches safety, privacy, and product memory. Hash-backed audit events make the cleanup observable without storing raw PHI in the proof surface.

Cost of changing later:
Low. A production retention job can keep emitting the same audit events while moving scheduling, locking, or purge policy into a dedicated worker.

## 2026-06-15 - Make FastAPI /api/v1 The Public Connector For Remote Apps

Context:
The prototype had a strong Node/LangGraph/OpenClaw runtime and a static `/mvp` UI, but remote/mobile apps needed a stable server-only contract that does not expose Node internals, database access, product memory, or raw OpenClaw runtime endpoints.

Options considered:
- Expose the Node server directly to remote apps.
- Put a Next.js API backend-for-frontend in front of Node and FastAPI.
- Promote the existing FastAPI facade into the versioned public connector while leaving Node as the internal orchestration runtime.

Decision:
Add FastAPI `/api/v1` session, task, document, approval, OpenClaw readiness, browser sandbox, and proof-run routes. Keep Node as the internal LangGraph/OpenClaw runtime and keep existing `/api` routes as compatibility aliases.

Reason:
FastAPI already owns auth, rate limits, uploads, task registry, source-grounding policy, and connector-safe response models. Using it as the public API gives mobile and future remote apps a stable integration surface without weakening the existing healthcare workflow safety boundary.

Cost of changing later:
Moderate. A future backend-for-frontend can still call `/api/v1`, but remote clients should not be migrated to direct Node endpoints.

## 2026-06-15 - Introduce A Browser Sandbox Provider Boundary Before Hosted Sandbox Integration

Context:
The MVP needs a remote-user live worker browser block, but a hosted sandbox provider has not been selected or credentialed. The current local OpenClaw/CDP path already supports read-only frames, readiness, takeover, and input relay.

Options considered:
- Keep the browser UI wired directly to Node runtime endpoints.
- Integrate a hosted sandbox immediately.
- Define the sandbox provider interface now and implement a local CDP adapter first.

Decision:
Add a provider-neutral FastAPI browser sandbox boundary with a local CDP adapter. Remote clients create browser sessions through `/api/v1/browser/sessions` and then stream/take over/input through v1 browser routes.

Reason:
This lets the mobile/PWA architecture behave like a remote sandbox while preserving approval gates and current local proof. A hosted provider can replace the adapter later without changing the public API or mobile app.

Cost of changing later:
Low to moderate. The stream transport may evolve from SSE frames to WebRTC, but ownership checks, takeover states, and safety contract should remain stable.

## 2026-06-15 - Use CDP Screenshot Fallback For Live Worker Frames

Context:
The FastAPI `/api/v1/browser/sessions/{id}/stream` route could open the Node live-frame SSE stream, and `Page.startScreencast` returned success, but the local Chromium/CDP runtime did not consistently emit `Page.screencastFrame` events. That left the mobile live-worker block stuck on "waiting for frames" even though the browser session existed.

Options considered:
- Treat missing native screencast frames as a hard browser failure.
- Move immediately to a hosted sandbox/WebRTC provider.
- Keep the SSE frame contract and publish periodic in-memory `Page.captureScreenshot` frames whenever native screencast frames are not arriving.

Decision:
Keep the provider-neutral `/api/v1` browser stream contract and add a Node-side CDP screenshot fallback. The fallback publishes `browser.frame` events through the same in-memory pub/sub, stores no screenshots in the database, and replays the latest in-memory frame to late subscribers.

Reason:
This makes the regular-user live block visually reliable today while preserving the PHI boundary: frames are transient, not persisted, and all input/takeover paths remain approval-gated. A later hosted sandbox can replace the local CDP adapter without changing the public API or PWA client.

Cost of changing later:
Low. The frame payload already carries source metadata, so a future WebRTC or hosted streaming provider can replace `cdp_screenshot_fallback` while keeping the API ownership checks and visual proof contract.

## 2026-06-15 - Add Postgres Compose Target While Keeping SQLite Runtime

Context:
The connector stack needed a production-shaped transactional database profile, but the current application storage layer is already stabilized around the native SQLite adapter, bounded parameters, retention tests, and local proof gates. Switching the runtime driver before a Postgres repository adapter and migration suite exists would create a false production-readiness claim.

Options considered:
- Keep compose on SQLite volumes only until the full Postgres adapter is implemented.
- Flip `BRAINSTY_DB_DRIVER=postgres` immediately and patch failures as they appear.
- Add a live Postgres service, init contract, readiness reporting, and smoke tests now while keeping the app runtime on SQLite by default.

Decision:
Add Postgres as the deployment storage target in Docker Compose and expose it through the dashboard/API storage readiness profile. Keep `BRAINSTY_DB_DRIVER=sqlite` as the default runtime driver and mark `appRuntimeMigratedToPostgres=false` until the adapter and migration tests are implemented.

Reason:
This gives the project a real containerized Postgres dependency, health check, initialization contract, live write/read smoke, and remote-deployment shape without weakening the proven local runtime. The dashboard can now score database architecture honestly: improved to a live Postgres profile, but still below full production readiness.

Cost of changing later:
Moderate. The next storage phase must implement the Postgres app-state adapter, migration parity tests, transactional leases/worker claims, and hosted backup/restore proof. The public readiness shape can remain stable while the runtime driver changes behind it.

## 2026-06-16 - Add Selectable Postgres Runtime Adapter Before Default Migration

Context:
The compose stack had a live Postgres service and readiness smoke, but the Node app still had no Postgres client-backed application store. Moving the full server to Postgres in one step would be risky because many historical endpoint paths still contain raw SQL written for SQLite.

Options considered:
- Keep Postgres as a Docker-only dependency until every raw query is rewritten.
- Flip the default runtime to Postgres immediately and fix endpoint failures reactively.
- Add a real `pg`-backed store adapter, make it selectable with `BRAINSTY_DB_DRIVER=postgres`, prove core app-state parity live, and keep SQLite as the default until full compatibility gates exist.

Decision:
Add `PostgresStore` and a `createDatabaseStore` factory. The server now can boot with `BRAINSTY_DB_DRIVER=postgres`, but compose and local defaults remain SQLite. Storage readiness reports adapter parity smoke separately from full migration and caps database architecture at `90 / 100`.

Reason:
This closes the fake-adapter gap without overclaiming. The project now proves real schema initialization, enrollment, session checkpointing, audit writes, registry seeding, and rollback through Postgres, while still making the remaining SQLite-specific query work visible.

Cost of changing later:
Moderate. The next storage phase should add endpoint-wide Postgres compatibility tests, replace remaining raw SQL assumptions, and then add database-level worker leases, backup/restore proof, and secret-manager wiring before moving the default runtime to Postgres.

## 2026-06-16 - Score Postgres Operational Gates Separately From Secret-Managed Production

Context:
The Postgres runtime adapter can now boot and pass core parity smoke, but database production readiness needs more than a client adapter. The next risks are concurrent worker claims, endpoint-state parity, restore confidence, and credential handling. A local Docker password and env-file URL are useful for development proof but are not a managed-secret profile.

Options considered:
- Move the database score directly from `90 / 100` to `100 / 100` once leases and backup/restore smoke pass.
- Keep the score capped at `90 / 100` until every production deployment concern is implemented.
- Add an intermediate `95 / 100` operational-readiness state for endpoint parity, leases, and backup/restore, and reserve `100 / 100` for Postgres-selected runtime plus a proven managed-secret profile.

Decision:
Add `worker_leases`, a live Postgres production smoke, backup/restore proof, and explicit storage readiness gates. Report `95 / 100` when operational Postgres gates pass but secret management/default rollout remains pending. Report `100 / 100` only when `BRAINSTY_DB_DRIVER=postgres` and all production gates, including `BRAINSTY_DATABASE_SECRET_PROFILE_READY`, are true.

Reason:
This gives the project real concurrency and recovery proof without making a false security claim. It keeps the dashboard useful for operators: they can see exactly which database gates are done and which gate still blocks production declaration.

Cost of changing later:
Low. The readiness fields are additive. A future managed-secret/Docker-secret/hosted-secret phase can satisfy the final gate without changing the worker lease or backup/restore contract.

## 2026-06-16 - Require Secret-Backed Postgres Default Rollout Before 100/100

Context:
The operational Postgres phase proved endpoint parity, worker leases, and logical backup/restore, but it still used local/dev-style database URL handling. A plain `BRAINSTY_DATABASE_SECRET_PROFILE_READY=1` flag would be too easy to set accidentally and would let the dashboard claim full database readiness without proving how the runtime actually receives a secret.

Options considered:
- Treat `BRAINSTY_DATABASE_SECRET_PROFILE_READY=1` as enough to unlock `100 / 100`.
- Require a hosted cloud secret manager immediately before any local proof can pass.
- Add a provider-neutral secret profile contract now: file/Docker-secret or managed-env source, redacted/hash-only proof, and a separate default-rollout smoke that boots the normal Postgres runtime through that profile.

Decision:
Add `databaseSecretProfile` URL resolution and a Postgres default-rollout smoke. The database score reaches `100 / 100` only when Postgres is the selected runtime, operational Postgres gates pass, the database URL is secret-backed, and `BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY=1` is set by the rollout smoke/proven environment.

Reason:
This makes the final database score meaningful without coupling the local prototype to a specific cloud provider. Docker secrets, local secret files, and managed environment injection can all satisfy the same contract, while direct raw env URLs remain visible as not secret-backed. Health and dashboard responses expose only redacted URL and hashes.

Cost of changing later:
Low. A hosted secret manager can replace the local secret-file rehearsal by setting `BRAINSTY_DATABASE_SECRET_SOURCE=managed_env` or mounting `BRAINSTY_DATABASE_URL_FILE`; the runtime factory, readiness status, and dashboard fields stay the same.

## 2026-06-16 - Add Docker-Secret Postgres Runtime Profile Without Bypassing Proof Gates

Context:
The project could already prove a Postgres default rollout in an isolated local smoke, but the compose stack still had no explicit deployment override for a remote/server connector runtime to consume a Docker secret. Simply changing the base compose default to Postgres would make local development fragile, while hardcoding all readiness flags in an override would let operators accidentally claim production readiness without running the smoke gates.

Options considered:
- Flip base `compose.yaml` from SQLite to Postgres.
- Add a Postgres override that also sets every readiness flag to `1`.
- Add a dedicated Postgres Docker-secret override that selects the runtime and secret source, but leaves readiness flags proof-controlled.

Decision:
Add `compose.postgres.yaml` for Postgres runtime selection through `/run/secrets/brainsty_database_url`. Preserve the SQLite local default in base compose. Keep Postgres live/runtime/prod/lease/backup/endpoint/secret/default-rollout flags environment-controlled with `:-0` defaults, and expose the profile as a separate deployment-profile score in the dashboard.

Reason:
This gives remote applications and deployment operators a concrete server-only connector profile without weakening the evidence model. The dashboard can say "the Docker-secret profile exists" separately from "the database runtime is fully production ready."

Cost of changing later:
Low. A hosted cloud secret manager can replace the Docker secret source, or a provider-specific compose/Helm profile can mount the same `BRAINSTY_DATABASE_URL_FILE` contract, without changing storage readiness or the public connector API.

## 2026-06-16 - Require Live Profile Regression Before Treating Postgres Profile As Deployable

Context:
The Docker-secret Postgres override proved its static compose contract, but remote applications need confidence that the separated stack actually boots with Postgres selected as the Node runtime and that `/api/v1`, the PWA, dashboard proof, OpenClaw skill routing, session creation, memory context, chat, and skill-envelope validation still work together.

Options considered:
- Treat the static `compose.postgres.yaml` contract as enough deployment proof.
- Flip the base compose default from SQLite to Postgres immediately.
- Add live endpoint and compose-profile smoke gates while preserving SQLite as the safe local default.

Decision:
Add endpoint-wide Postgres regression and live Docker-secret profile smoke gates. The profile smoke creates a local runtime secret file outside image context, starts the separated stack on isolated ports, verifies Node/FastAPI/PWA/dashboard proof, writes sanitized artifacts, and then tears the stack down after visual proof.

Reason:
This proves the profile works as a server-only connector without over-claiming hosted production deployment. It also keeps developer startup stable: the base compose file still defaults to SQLite, while operators can explicitly run the Postgres override and must still satisfy evidence gates.

Cost of changing later:
Low. A managed cloud secret mount, hosted Postgres provider, or orchestration platform can replace the local Docker-secret file while keeping the same `BRAINSTY_DATABASE_URL_FILE`, readiness flags, `/api/v1`, and dashboard proof contract.

## 2026-06-17 - Make Backup/Restore Runbooks A Separate Production Ops Gate

Context:
The Postgres production smoke already proved logical backup/restore integrity over temporary databases, but the remaining hosted-production gap was operational: operators still needed a provider-neutral runbook for scheduled backups, restore rehearsal, incident restore, migration rollback, and proof artifacts. Treating the logical restore smoke as the full hosted backup plan would overstate readiness.

Options considered:
- Count the existing logical backup/restore smoke as sufficient.
- Pick a specific cloud Postgres provider immediately and write provider-specific automation.
- Add a provider-neutral runbook and smoke gate now, while keeping provider-specific backup/PITR configuration as the next deployment step.

Decision:
Add `docs/POSTGRES_BACKUP_RESTORE_RUNBOOK.md`, `npm run storage:postgres:backup-runbook-smoke`, and a separate dashboard/API score `database_backup_restore_runbook`. Keep it separate from the core database architecture score so the project can show operational readiness progress without claiming a hosted provider is configured.

Reason:
This makes backup/restore operations auditable and repeatable today while preserving truthful deployment status. The runbook gate proves restore rehearsal and safety properties locally, and the same contract can later be backed by Neon/Supabase/Prisma Postgres or another hosted provider.

Cost of changing later:
Low. Provider-specific automation can satisfy the same runbook sections and set `BRAINSTY_POSTGRES_BACKUP_RUNBOOK_READY=1` after hosted proof without changing the public connector API or Postgres adapter.

## 2026-06-17 - Add Hosted Provider Backup Policy As A Separate Gate

Context:
After the provider-neutral backup runbook was added, the next production gap was the provider-specific policy contract: operators need to prove the hosted database has backup/PITR, retention, restore rehearsal, and promotion rules, but the project still does not have a selected hosted provider or credentials.

Options considered:
- Pick Neon, Supabase, or Prisma Postgres immediately and add provider-specific automation.
- Treat the provider-neutral runbook as enough.
- Add a provider-policy contract and smoke now, with a checked-in example and a readiness gate that only passes for a non-example provider policy.

Decision:
Add `project/deployment/postgres-provider-backup-policy.example.json`, `npm run storage:postgres:provider-backup-policy-smoke`, and a separate dashboard/API score `database_provider_backup_policy`. The example file validates the contract but never counts as hosted readiness.

Reason:
This lets the project verify the exact production policy shape without storing secrets or overclaiming deployment status. It keeps the hosted provider choice open while making the remaining work concrete and testable.

Cost of changing later:
Low. The selected provider can provide a private policy file through `BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_FILE` and set `BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_READY=1` after provider-native backup/PITR proof, without changing the connector API or Postgres adapter.

## 2026-06-17 - Add Hosted Browser Sandbox Provider Contract

Context:
The MVP already has a working local-CDP browser stream, screenshot fallback, takeover, and human-only input relay. The remaining production gap is a hosted sandbox/WebRTC provider. No provider or credentials are configured in the repo, so implementing a real hosted adapter would either block or overclaim readiness.

Options considered:
- Integrate a hosted sandbox immediately.
- Keep local CDP only and leave hosted sandbox undefined.
- Add a hosted provider contract and fail-closed FastAPI provider path now, while keeping local CDP as the default provider.

Decision:
Add `project/deployment/browser-sandbox-provider.example.json`, `npm run sandbox:browser:provider-contract`, FastAPI `hosted_remote` recognition, and separate proof keys `hosted_browser_sandbox_provider` and `hosted_remote_browser_sandbox`.

Reason:
This makes the hosted sandbox requirement testable without weakening the current local-CDP proof. Remote clients still use the same `/api/v1/browser/*` contract, and a later provider can replace the backend adapter without changing the PWA or public API.

Cost of changing later:
Low to moderate. The real provider implementation can satisfy the same create-session, stream, screenshot/OCR, takeover, input, and teardown contract. Transport may move to WebRTC, but ownership checks and approval gates remain stable.

## 2026-06-17 - Add Hosted Browser Sandbox Adapter Harness Without Claiming Provider Readiness

Context:
The hosted browser sandbox provider contract made the production requirement visible, but the FastAPI `hosted_remote` path still stopped at a setup-required error. The next useful step is to prove the public connector lifecycle shape for hosted sessions before provider credentials exist.

Options considered:
- Wait until a real hosted provider is selected.
- Mark the existing contract as hosted readiness.
- Add a deterministic contract harness that exercises the same public API lifecycle but remains visibly separate from real provider readiness.

Decision:
Add a `contract_harness` adapter mode, a non-secret harness config, an adapter-harness smoke script, and FastAPI lifecycle responses for hosted-style session creation, safe SSE stream events, approval-gated takeover, sanitized input, and teardown-style ending. Keep `hosted_remote_browser_sandbox` blocked until `adapter.mode=hosted_provider` with real proof.

Reason:
This makes the next hosted adapter implementation concrete and testable without storing credentials or pretending a provider exists. Remote clients can rely on the same `/api/v1/browser/*` shapes, and the dashboard can show harness progress separately from production provider status.

Cost of changing later:
Low. A real provider adapter can replace the harness internals while preserving the public API, ownership checks, approval gates, and proof keys. The harness can remain as a CI fallback contract.

## 2026-06-17 - Add Hosted Browser Sandbox Provider Resolver Before Live Provider Readiness

Context:
The contract harness proved the public hosted browser lifecycle shape, but the real `hosted_provider` mode still needed a safe way to check provider endpoint and auth readiness. Treating a non-example hosted config plus `WEFELLA_BROWSER_SANDBOX_PROVIDER_READY=1` as live-ready would overclaim production readiness and risk leaking provider details in proof artifacts.

Options considered:
- Keep the hosted provider blocked until a vendor is fully selected.
- Let any non-example `hosted_provider` config count as ready.
- Add a resolver gate that checks env-referenced endpoint/auth presence, redacts all values, and still requires separate live verification before the provider score can pass.

Decision:
Add `project/deployment/browser-sandbox-provider.hosted-provider.example.json`, `npm run sandbox:browser:provider-resolver`, FastAPI resolver states, and a separate `hosted_browser_sandbox_provider_resolver` proof score. `hosted_remote_browser_sandbox` remains blocked until endpoint/auth refs resolve, live provider proof passes, `WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=1` is set, and the private provider config marks `adapter.providerLiveConnected=true`.

Reason:
This makes the next real-provider step concrete without committing URLs, tokens, or vendor-specific assumptions. Operators can prove secret wiring safely while the product remains honest about the absence of a live hosted browser sandbox.

Cost of changing later:
Low. A selected provider adapter can consume the same env refs and proof states. If a provider uses mTLS, signed URLs, or a secret manager instead of bearer tokens, the resolver can gain a new secret source while keeping the public `/api/v1/browser/*` contract unchanged.

## 2026-06-17 - Add Hosted Browser Sandbox Provider Adapter Contract Before Live Calls

Context:
After the resolver could safely prove endpoint/auth refs, the next gap was the provider adapter itself. Jumping straight to a real vendor call would require credentials and might conflate request-shape readiness with live stream/screenshot/takeover proof.

Options considered:
- Wait for a selected hosted browser provider.
- Treat resolver readiness as enough adapter readiness.
- Add a deterministic adapter contract smoke that validates the create-session request/response envelope with redacted refs and no network call.

Decision:
Add `npm run sandbox:browser:provider-adapter`, a strict redacted provider request/response contract, and a separate `hosted_browser_sandbox_provider_adapter` proof score. Keep real `hosted_remote_browser_sandbox` blocked until a live provider passes stream, screenshot/OCR, takeover, input, teardown, and offsite-fail-closed proof.

Reason:
This makes the provider implementation target concrete while preserving truthfulness. The project can now prove endpoint/auth wiring and adapter-envelope readiness without exposing secrets or implying that a real sandbox is connected.

Cost of changing later:
Low. The real provider client can reuse the request and response validator, swapping the deterministic mock transport for HTTPS/WebRTC calls once credentials and provider-specific endpoints are available.

## 2026-06-17 - Add Hosted Browser Sandbox Provider HTTP Adapter Harness Before Live Provider Integration

Context:
The adapter contract proved the create-session request and response envelope, but it did not yet prove that the runtime could actually send a provider-style HTTP request and validate the provider response. A real provider is still not selected or credentialed, so using production endpoints would either block or overclaim live readiness.

Options considered:
- Wait for a selected hosted browser provider.
- Treat the deterministic adapter envelope as enough implementation proof.
- Add a local provider-compatible HTTP harness that exercises the request plumbing and response validator without exposing secrets or claiming live provider readiness.

Decision:
Add `npm run sandbox:browser:provider-http-adapter`, an in-process provider-compatible HTTP harness, and a separate `hosted_browser_sandbox_provider_http_adapter` proof score. Keep real `hosted_remote_browser_sandbox` blocked until a live provider passes stream, screenshot/OCR, takeover, input, teardown, and offsite-fail-closed proof.

Reason:
This closes the next meaningful implementation gap while preserving truthfulness. The connector now proves provider-style network plumbing and strict response validation, but the dashboard still clearly distinguishes local harness readiness from production hosted browser readiness.

Cost of changing later:
Low. The selected provider adapter can replace the local harness endpoint with the provider endpoint while keeping the request contract, response validator, redaction policy, and FastAPI public API stable.

## 2026-06-17 - Add Hosted Browser Sandbox Provider Live Lifecycle Harness Before Live Provider Enablement

Context:
The HTTP adapter harness proved provider-style create-session request plumbing, but it did not yet exercise the rest of the hosted-browser lifecycle that a mobile/remote client needs: stream frames, screenshot/OCR, takeover, approved input, teardown, and offsite fail-closed behavior. A real hosted provider is still not selected or credentialed.

Options considered:
- Wait for a selected hosted browser provider before adding lifecycle tests.
- Treat create-session HTTP plumbing as enough lifecycle readiness.
- Add a local provider-compatible lifecycle harness that exercises all required provider operations while keeping live hosted readiness blocked.

Decision:
Add `npm run sandbox:browser:provider-live-lifecycle`, a local provider-compatible lifecycle harness, and a separate `hosted_browser_sandbox_provider_live_lifecycle` proof score. Keep real `hosted_remote_browser_sandbox` blocked until a live provider passes stream, screenshot/OCR, takeover, input, teardown, offsite-fail-closed, and GUI/OCR visual proof.

Reason:
This closes the next implementation gap without leaking secrets or pretending a production sandbox is connected. The public connector can now prove the full provider lifecycle contract while the dashboard remains honest that the provider is local harness only.

Cost of changing later:
Low. A selected provider can replace the local lifecycle handlers with provider HTTPS/WebRTC calls while preserving the same proof fields, redaction policy, approval boundaries, and FastAPI public API contract.

## 2026-06-17 - Add Hosted Browser Sandbox Provider Selection Before Live Provider Enablement

Context:
The lifecycle harness proves the hosted-browser provider shape, but the project still needed an explicit decision gate between "we can exercise a local provider-compatible lifecycle" and "we selected a real provider and are ready to configure live credentials." Without that gate, the next implementation could either stay vague or accidentally treat any private provider config as production readiness.

Options considered:
- Jump directly from lifecycle harness to a vendor-specific implementation.
- Treat the existing hosted-provider example config as the provider-selection record.
- Add a non-secret provider-selection matrix plus preflight smoke that proves candidate/capability readiness separately from live hosted-browser readiness.

Decision:
Add `project/deployment/browser-sandbox-provider.selection.example.json`, `npm run sandbox:browser:provider-selection`, FastAPI/Node proof fields, and a separate `hosted_browser_sandbox_provider_selection` score. Selection preflight can pass only when the selected provider env matches a known candidate and an explicit readiness env is set. `hosted_remote_browser_sandbox` remains blocked until real provider live proof passes.

Reason:
This records the provider choice boundary in code and dashboard proof while preserving secret hygiene and score honesty. It also gives the future iOS/PWA remote-client work a stable expectation: the browser provider may change, but the public `/api/v1/browser/*` contract and visual proof requirements do not.

Cost of changing later:
Low. Candidate fields can be expanded for a real vendor due-diligence checklist, and the selected provider adapter can reuse the existing resolver, HTTP, lifecycle, redaction, and dashboard proof structure.

## 2026-06-17 - Add Hosted Browser Sandbox Live Preflight Before Live Provider Readiness

Context:
Provider selection can now pass, but the project still needed an explicit gate for private provider config, endpoint/auth resolver readiness, and optional provider health probing. Without this gate, a future live provider integration could jump from selection directly to lifecycle implementation and blur whether credentials/config were ready.

Options considered:
- Wait for real provider credentials before adding any preflight code.
- Treat provider selection preflight as enough to start live lifecycle work.
- Add a live-preflight smoke that proves selected-provider, private config, endpoint/auth, and optional health-probe readiness while keeping live hosted-browser readiness blocked.

Decision:
Add `npm run sandbox:browser:provider-live-preflight`, a redacted live-preflight proof contract, private provider JSON ignore patterns, and a non-secret example env file. Expose a separate `hosted_browser_sandbox_provider_live_preflight` score in FastAPI and the dashboard. Keep `hosted_remote_browser_sandbox` blocked until the full selected-provider lifecycle and GUI/OCR visual proof pass.

Reason:
This creates a concrete operational bridge from provider selection to live integration without requiring credentials in Git or overclaiming readiness. It also gives remote-client operators a public proof signal that config/secret wiring is ready before the browser provider is allowed to control sessions.

Cost of changing later:
Low. The live preflight can gain provider-specific health fields or secret-source types without changing the public `/api/v1/browser/*` contract or the existing lifecycle harness.

## 2026-06-17 - Require Selected-Provider Live Verification Before Hosted Remote Browser Readiness

Context:
The live-preflight gate proves selected-provider config and optional health probing, but it still does not prove the browser lifecycle that a remote user needs: create session, live stream, screenshot/OCR, takeover, approved input, offsite fail-closed behavior, and teardown. The hosted provider implementation must therefore support real HTTPS provider calls without putting provider secrets in Git or letting the dashboard overclaim readiness.

Options considered:
- Let live preflight imply hosted remote browser readiness.
- Wait for final provider credentials before adding any runtime integration code.
- Add a selected-provider live verification command and FastAPI hosted-provider runtime path, but keep `hosted_remote_browser_sandbox` blocked until private config reports a real provider live connection.

Decision:
Add `npm run sandbox:browser:provider-live-verification`, a selected-provider live verification contract, a non-secret env example, and a FastAPI provider runtime path for HTTPS create-session, stream, screenshot/OCR, takeover, input, and teardown operations. Expose a separate `hosted_browser_sandbox_provider_live_verification` score. Keep `hosted_remote_browser_sandbox` at `0 / 100` unless the explicit live-verification env gate, `WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=1`, and private config `adapter.providerLiveConnected=true` all agree.

Reason:
This gives remote clients and operators the real integration surface without committing secrets or treating a test harness as a production sandbox. It also preserves the safety model: input relay remains human-approved, raw frames/OCR/input are redacted, offsite navigation fails closed, and Codex must not enter credentials.

Cost of changing later:
Moderate but contained. Provider-specific WebRTC signaling, streaming transport details, or secret-manager support can be added behind the provider client and stream proxy without changing the public `/api/v1/browser/*` contract, the proof keys, or the approval boundary.

## 2026-06-17 - Add Opaque WebRTC Signaling Gate Before Hosted Remote Browser Readiness

Context:
Live verification proves selected-provider lifecycle calls, but WebRTC-capable hosted browser providers still need an explicit signaling path for the remote live block. Raw SDP, ICE candidates, ICE server credentials, provider URLs, or tokens cannot be exposed to remote clients, dashboard text, or proof artifacts.

Options considered:
- Treat the existing SSE-style stream proxy as enough for WebRTC providers.
- Add a public route that accepts and returns raw SDP/ICE payloads.
- Add a provider-backed WebRTC signaling route that accepts opaque offer/candidate references, returns only safe booleans/refs-present metadata, and keeps hosted remote readiness blocked until a real provider is live connected.

Decision:
Add `npm run sandbox:browser:provider-webrtc-signaling`, a non-secret WebRTC signaling env template, an opaque FastAPI `/api/v1/browser/sessions/{browser_session_id}/webrtc/offer` route, and a separate `hosted_browser_sandbox_provider_webrtc_signaling` proof score. For `webrtc` and `webrtc_or_sse_frames` transports, provider readiness requires the explicit signaling gate, but `hosted_remote_browser_sandbox` remains `0 / 100` until private config proves a real provider live connection plus GUI/OCR evidence.

Reason:
This creates the missing remote-live-block signaling surface without making the public connector a raw WebRTC credential/SDP transport. It also keeps the score table honest: signaling readiness can be proved independently while production hosted browser readiness remains blocked.

Cost of changing later:
Low to moderate. Provider-specific WebRTC offer/answer and ICE relay details can be added behind the provider client while preserving the public opaque-ref API, proof keys, redaction policy, and human-only takeover boundary.

## 2026-06-17 - Require Private Visual/OCR Replay Proof Before Hosted Remote Browser Readiness

Context:
Live verification and WebRTC signaling prove provider API behavior, but they still do not prove that a regular user can visually see the hosted worker browser and that OCR/caption proof is safe enough for the operator dashboard. The final hosted remote score therefore needed a separate GUI/OCR artifact gate that can be satisfied by real provider evidence without committing raw screenshots, OCR text, or secrets.

Options considered:
- Let live verification plus WebRTC signaling imply hosted browser readiness.
- Store screenshot and OCR artifacts directly in the repo for replay.
- Add a private proof-manifest replay gate that validates only opaque references and sanitized booleans while keeping raw visual/OCR evidence outside Git.

Decision:
Add `npm run sandbox:browser:provider-visual-ocr-replay`, a non-secret visual/OCR replay env template, a private proof-manifest validator, and separate Node/FastAPI proof fields for `hosted_browser_sandbox_provider_visual_ocr_replay`. Final `hosted_remote_browser_sandbox` readiness now requires the replay gate in addition to live verification, WebRTC signaling when required, explicit live verification, and private config `adapter.providerLiveConnected=true`.

Reason:
This closes the GUI/OCR evidence gap without leaking PHI, provider secrets, raw frames, raw OCR, SDP/ICE details, or credential/input values. It also lets operators prove the user-facing remote-browser experience independently while the final production hosted score remains honest.

Cost of changing later:
Low. Real providers can produce the same manifest from their capture pipeline, and future storage can replace the file reference with a secret-manager or artifact-store reference without changing the public proof keys or approval boundary.

## 2026-06-17 - Add Hosted Browser Sandbox Provider Launch Readiness Gate

Context:
The visual/OCR replay gate proves the last artifact layer before hosted browser readiness, but the operational launch sequence was still spread across selection, preflight, live verification, WebRTC, replay, and final enablement switches. Without an aggregate gate, a future operator or agent could confuse "the runbook exists" with "hosted remote browser is production-ready."

Options considered:
- Mark hosted readiness complete from the existing live verification and replay harnesses.
- Wait for real provider credentials and make no code change.
- Add an operator launch-readiness command, env template, runbook, and dashboard/FastAPI score that aggregates the existing proof chain while preserving the final hosted score block.

Decision:
Add `npm run sandbox:browser:provider-launch-readiness`, `project/deployment/browser-sandbox-provider.launch-readiness.example.env`, and `docs/HOSTED_BROWSER_SANDBOX_PROVIDER_LAUNCH_RUNBOOK.md`. Expose a separate `hosted_browser_sandbox_provider_launch_readiness` proof key in Node dashboard proof and FastAPI `/api/v1/proof`. The aggregate reports runbook readiness, private proof-chain readiness, final enablement allowance, missing private requirements, and sanitized operator steps.

Reason:
This gives the next real provider launch a deterministic, auditable path while staying honest about missing private credentials. The runbook gate can pass in local/default mode, but `hosted_remote_browser_sandbox` still remains `0 / 100` until real private provider config, live verification, WebRTC when required, visual/OCR replay, `WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=1`, and private `adapter.providerLiveConnected=true` all agree.

Cost of changing later:
Low. Provider-specific launch steps can be added behind the same readiness checklist without changing the public `/api/v1/browser/*` contract, proof keys, redaction policy, or human-only takeover boundary.

## 2026-06-18 - Require Private Launch Execution And Final Human Review Before Hosted Remote Browser Readiness

Context:
Phase 26 added an aggregate launch-readiness gate, but launch readiness is still not the same as actually executing the real selected provider launch. A private proof chain can be green while the final operator/human review has not yet approved production hosted remote browser enablement.

Options considered:
- Let `hosted_browser_sandbox_provider_launch_readiness=100 / 100` imply final hosted readiness.
- Wait for real provider credentials and make no code change.
- Add a separate private launch execution gate that depends on launch readiness, explicit private execution, and final human review, then require that gate for `hosted_remote_browser_sandbox`.

Decision:
Add `npm run sandbox:browser:provider-private-launch-execution`, `project/deployment/browser-sandbox-provider.private-launch-execution.example.env`, and a separate `hosted_browser_sandbox_provider_private_launch_execution` proof key in Node dashboard proof and FastAPI `/api/v1/proof`. Require this gate and `WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED=1` before final `hosted_remote_browser_sandbox` readiness can pass.

Reason:
This prevents an operator or future agent from confusing a green runbook/private-proof chain with a reviewed production launch. It also gives the real provider launch a deterministic acceptance point without committing secrets, screenshots, OCR text, WebRTC payloads, private paths, or credential/input values.

Cost of changing later:
Low. Provider-specific launch evidence can be added behind the private execution manifest and proof key without changing the public `/api/v1/browser/*` contract, redaction policy, or human-only takeover boundary.

## 2026-06-18 - Use Self-Hosted Steel Browser For Local Hosted-Sandbox Proof

Context:
The project needed a real selected-provider browser sandbox proof, but no third-party sandbox provider credentials were available and PHI must not leave the machine. A purely fake provider would keep the hosted remote browser gap open, while a new custom sandbox from scratch would delay the connector and visual proof work.

Options considered:
- Wait for a third-party provider account before implementing the adapter.
- Build a browser sandbox from scratch around raw Chrome/CDP.
- Use self-hosted Steel Browser locally, behind the existing BrowserSandboxProvider contract.

Decision:
Add `infra/steel/compose.yaml` with digest-pinned Steel API/UI images and a `steel-self-host` adapter strategy selected by `WEFELLA_BROWSER_SANDBOX_PROVIDER_NAME`. The strategy allows HTTP only for loopback Steel, creates sessions through Steel `/v1/sessions`, proves CDP over the local debugger port, maps the viewer/screenshot/caption/takeover/input/teardown lifecycle into sanitized refs, and exposes a separate `hosted_browser_sandbox_provider_steel_self_host` dashboard/API score.

Reason:
Steel gives the project a real local browser-sandbox provider without introducing a SaaS dependency or moving PHI off the machine. Keeping it behind the existing provider envelope preserves the public `/api/v1/browser/*` contract, approval boundaries, and final hosted-readiness gates.

Cost of changing later:
Low to moderate. Steel Cloud, another provider, or a production self-host deployment can replace the endpoint and strategy-specific client while keeping the public connector, dashboard proof keys, and human-only takeover contract stable.

## 2026-06-18 - Add Steel Self-Host Operations Gate Before Production Claims

Context:
Phase 28A proved that local self-hosted Steel can satisfy the selected-provider lifecycle, but the Cortex canonical note still treats Steel as staging infrastructure until concurrency, lifecycle cleanup, retention, monitoring, patch cadence, and secure remote access are explicitly controlled. The risk was that a green local lifecycle proof could be misread as production hosted remote browser readiness.

Options considered:
- Let `hosted_browser_sandbox_provider_steel_self_host=100 / 100` stand as the only Steel proof.
- Move immediately to a public hosted Steel deployment.
- Add a separate Steel operations gate for self-hosted hardening while keeping final hosted remote readiness blocked.

Decision:
Add `npm run sandbox:browser:steel-operations`, `project/deployment/browser-sandbox-provider.steel-operations.example.json`, and a dashboard/API score named `hosted_browser_sandbox_provider_steel_operations`. Disable Steel browser log storage by default, require loopback-only API/CDP/viewer bindings, digest-pinned images, documented stale-session cleanup, no direct public Steel exposure, and FastAPI as the remote-app boundary.

Reason:
This closes the production-hardening gap without overclaiming hosted readiness. Operators can now see that Steel self-host has an operations contract, while final `hosted_remote_browser_sandbox` still depends on private execution, final human review, visual/OCR replay, WebRTC when required, and real provider live verification.

Cost of changing later:
Low. A managed Steel deployment, Steel Cloud, or another hosted provider can keep the same public `/api/v1/browser/*` contract and proof keys. Only the provider-specific operations policy and probe implementation should change.

## 2026-06-18 - Harden Steel Self-Host For Owned Remote Infrastructure Before Hosted Readiness

Context:
Phase 29 made local Steel operations safer, but Phase 30 must move the same self-hosted provider to remote infrastructure we own instead of introducing a third-party SaaS browser provider. The critical risk is overclaiming `hosted_remote_browser_sandbox` readiness from local Steel, private launch switches, or static runbooks without proving a real remote Steel host from the backend network position.

Options considered:
- Pivot to a hosted SaaS browser provider.
- Build a browser sandbox from scratch around raw Chrome/CDP.
- Keep the existing `steel-self-host` strategy and add a remote-host readiness layer with TLS, host firewall allowlist, private debugger tunnel, recovery runbook, and a ten-check lifecycle proof.

Decision:
Keep `steel-self-host` as the provider strategy and add Phase 30 remote hardening around it. Add `infra/steel/remote/compose.yaml`, `infra/steel/remote/Caddyfile`, `infra/steel/remote/firewall.md`, `infra/steel/remote/wireguard.md`, `infra/steel/remote/recover.sh`, `npm run sandbox:browser:steel-remote-readiness`, and a distinct dashboard/API proof key named `hosted_browser_sandbox_provider_steel_remote_host`.

The chosen deployment option for this phase is option (a): Akamai Connected Cloud, using the Linode-origin VPS/cloud VM model under the owner/operator's compliance controls and required agreements. Akamai's public material describes a shared security model and references HIPAA standards compliance for Akamai Connected Cloud, but the operator must still obtain legal/BAA confirmation and complete workload hardening before PHI touches the host. The repo stores no real provider account, hostname, IP, BAA identifier, token, or tunnel key; those live in host-local private config.

Reason:
This keeps PHI on owned infrastructure, preserves the provider-pluggable adapter contract, avoids a SaaS dependency, and forces remote-host readiness to stay `0 / 100` until the real HTTPS API, private CDP tunnel, screenshot/OCR refs, human takeover, input relay, teardown, host-firewall offsite proof, and redaction checks pass together. The final `hosted_remote_browser_sandbox` score now also requires the Phase 30 remote-host gate.

Cost of changing later:
Low to moderate. A future hosted-SaaS provider under signed BAA can still replace the endpoint and provider name through `WEFELLA_BROWSER_SANDBOX_PROVIDER_NAME`, but this self-hosted track keeps the current public `/api/v1/browser/*` contract and human-only takeover boundary intact.

## 2026-06-18 - Add Steel Remote Ops Drills After Remote Host Readiness

Context:
Phase 30 later completed the owned remote Steel host proof on AWS EC2 in `us-east-1` with public TLS, private CDP tunnel, host firewall proof, and a 10/10 lifecycle artifact. The next risk is operational: a remote browser host can be green once but still unsafe to operate if patching, backup/restore, alerting, and handoff are not executable gates.

Options considered:
- Treat the Phase 30 lifecycle artifact as sufficient for ongoing operations.
- Implement concurrency and N-host routing immediately.
- Add a Phase 31 ops-drill gate for patch cadence, restore drill, health alerting, and on-call handoff, while deferring concurrency.

Decision:
Add `npm run sandbox:browser:steel-ops-drills`, `infra/steel/remote/ops-drills.example.json`, `infra/steel/remote/patching.md`, `infra/steel/remote/backup-restore-drill.sh`, `infra/steel/remote/health-alerts.example.json`, and `infra/steel/remote/oncall-handoff.md`. Expose a distinct dashboard/API score named `hosted_browser_sandbox_provider_steel_ops_drills`.

Reason:
This keeps Phase 31 aligned with the user directive: patching cadence, backup/restore drill, health alerting, and on-call runbook execution only. It depends on the Phase 30 accepted remote lifecycle artifact and preserves the single-host/single-session queue model. Concurrency remains a Phase 32 candidate until product traffic proves the need.

Cost of changing later:
Low. The ops-drill contract can grow concrete monitoring integrations, backup destinations, or N-host routing without changing the public `/api/v1/browser/*` browser contract or the human-only takeover boundary.
## 2026-06-18 - Upgrade Development To Canonical Goal-Tied Phase Execution

Context:
After Phase 31, the project had strong remote Steel operations proof, but the next work risked drifting because the long-run goal lived across Cortex semantic notes, repo AGENTS rules, final-system goals, progress logs, and intelligence-loop prompts. The user asked whether Codex should continue as-is or move to a more multi-agent, `/goal`-tied development system.

Options considered:
- Continue with one long-running implementation thread and rely on `docs/PROGRESS.md`.
- Let several agents edit in parallel without a stronger central operating contract.
- Keep Codex as primary implementer but add role-separated phase discipline, a single source-of-truth order, non-mocked proof labels, dashboard scoring, and Cortex semantic/procedural mirrors.

Decision:
Phase 32 creates the local canonical operating-system mirror in `docs/PROJECT_OPERATING_SYSTEM.md`, `docs/PHASE_SCOREBOARD.md`, and `docs/NON_MOCKED_PROOF_RULES.md`. The existing proof endpoint now exposes `canonical_goal_tied_phase_execution` and `canonical_phase_operating_system` so the operator dashboard can show the development discipline as a real gate. Multi-agent work is allowed only through defined roles and one merge gate; free parallel repo editing remains out of scope.

Reason:
The project is now too large for implicit continuity. The safest path is not more process theater; it is making the process itself testable. This preserves the RALPH loop, protects non-mocked proof claims, keeps Cortex canonical, and gives Phase 33 a clean launch point for continuous procedural intelligence.

Cost of changing later:
Low. These docs and proof keys do not change runtime healthcare behavior. They create a contract future phases can refine without weakening LangGraph/OpenClaw safety boundaries.

## 2026-06-18 - Start Continuous Intelligence In Shadow Mode Only

Context:
Phase 32 established canonical goal-tied execution and identified Phase 33 as the first continuous-intelligence runtime slice. The long-term proposal calls for externalized `CaseState`, G0-G8 universal gates, procedural reconstruction, PEMS maturity, and later skill induction. The risk is letting an immature procedural-memory system silently drive healthcare recommendations or browser actions.

Options considered:
- Implement the whole continuous-learning stack at once.
- Keep the proposal as docs only.
- Add a deterministic shadow scaffold inside LangGraph: typed `CaseState`, G0-G8 gates, PEMS scoring, and shadow reconstruction proof, with production decisioning disabled.

Decision:
Add `src/concierge/continuousIntelligence.mjs` and a LangGraph `case_state_shadow` node after evidence observation. Expose `continuous_procedural_memory_shadow` and `continuous_intelligence_shadow` in connector proof. Score `continuous_procedural_memory` at the Phase 33 shadow target only, with `productionDrivingAllowed=false` and `pemsTrusted=false`.

Reason:
This makes the next intelligence layer real enough to test without giving it unsafe authority. It externalizes case state, proves the universal gates, and creates a maturity schema that later phases can populate from real traces and reviewer decisions.

Cost of changing later:
Low to moderate. Later phases can persist shadow runs, add NeSTR/RHO-style validators, and promote mature procedural candidates without changing the safety boundary that immature candidates cannot drive recommendations.
