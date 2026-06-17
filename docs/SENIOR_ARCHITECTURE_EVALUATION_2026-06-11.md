# Senior Architecture Evaluation — concierge_by_openclaw_hermes

**Prepared:** 2026-06-11
**Reviewer:** Claude Code (senior-engineer consulting pass)
**Scope:** Whole-repo architecture audit + viability assessment for the mobile multichannel AI Concierge MVP, with prioritized corrections feeding the next phase.
**Method:** Six parallel deep-read passes (architecture, GUI, LangGraph orchestration, OpenClaw worker, graph/DB, deterministic harness), each grounded in `file:line` evidence. Cross-validated against the project's own `docs/` and the Cortex project memory.

---

## 0. Executive summary

This is a **safety-first, deterministic-harness AI concierge** for the healthcare/insurance domain, built as a **LangGraph.js (Node) product runtime** behind a **Python FastAPI auth facade**, with **OpenClaw** as a gated read-only browser worker, **Graphiti/FalkorDB** as optional product memory, and a **vanilla-JS web GUI**. The engineering culture is unusually disciplined for a prototype: policy gates run *before* the model, answers fail closed without verifiable evidence, audit is hash-chained, PHI is masked on egress, and the negative paths are actually tested.

**Verdict on "will it work":** The **safety harness is production-credible** and is the genuine differentiator. The **product runtime is an MVP-grade prototype** with three structural liabilities that will block scale if carried forward: (1) a data layer that builds **all SQL by string interpolation via a shelled-out `sqlite3` CLI**; (2) **two parallel orchestration pipelines** (`engine.mjs` dead-but-tested vs `langgraphRunner.mjs` live); and (3) a **linear graph that simulates branching/looping** with `final_response` short-circuits instead of real conditional edges + interrupts. None are fatal; all are fixable in a focused hardening phase. The "multichannel" and "graph memory" claims are currently **aspirational** (single web adapter; Graphiti opt-in and dependency-heavy).

**Confidence this becomes a working, demoable MVP:** high. **Confidence it is production/HIPAA-deployable as-is:** low — gated on the P0 list in §8.

---

## 1. Overall Architecture & Framework

**Process topology.** Two cooperating runtimes. The **Node "product runtime"** (`src/server/server.mjs`) is the source of truth — a hand-rolled `node:http` server on `127.0.0.1:4173` (`server.mjs:88-89`) owning LangGraph orchestration, the SQLite store, the OpenClaw worker arm, approvals, audit, the runtime-event bus, and an embedded research-scheduler daemon (`server.mjs:101-103`). It serves both UIs (`/` operator, `/mvp` user) and ~80 `/api/*` routes from one ~1,500-line `handleApi` if-ladder (`server.mjs:143-1526`). The **Python FastAPI facade** (`project/api/main.py`) is a thin JWT/RBAC/rate-limit reverse proxy on `:8000` that delegates every business route to Node via `NodeRuntimeClient` (`node_client.py:12`); its one value-add is converting Node's synchronous `/api/chat` into an async task with SSE streaming (`main.py:165-176, 702-721`).

**Frameworks.** Deliberately lean: Node deps are only `@langchain/core`, `@langchain/langgraph`, `@langchain/openai` (`package.json:28-32`); everything else (HTTP, persistence, audit, event bus) is bespoke stdlib. Python uses FastAPI + httpx, with **hand-rolled HS256 JWT** (`auth.py:87-103`).

**Assessment.** *Strengths:* clean facade/runtime separation with Node as single source of truth; strong safety governance threaded through every layer; excellent self-documentation. *Risks:* (1) **two parallel pipelines** — `engine.mjs:runConciergeSlice` is a complete orchestration path still exercised by 5 test files but no longer used by the server; (2) **God modules** (`langgraphRunner.mjs` 2,881 lines; `server.mjs` if-ladder); (3) **string-interpolated SQL** pervades; (4) ~50 near-duplicate facade passthroughs; (5) large surface (research control plane, scheduler, embeddings) for a single-member local MVP.

---

## 2. GUI & Realtime Surfacing

**Stack.** Pure vanilla JS, no framework, no build step: `src/app/app.js` (~3,950 lines) and `src/app/mvp.js` (~2,110 lines) drive static HTML via `innerHTML` templates + manual `escapeHtml` (`mvp.js:74`), served by `serveStatic` (`server.mjs:130`). Despite the "mobile" framing this is **desktop responsive web at best** — `mvp.css:130` is a fixed three-column grid with **no `@media` query**; it collapses awkwardly on a phone. No PWA, no service worker, no native shell.

**Routes.** `/` = dense operator/proof dashboard; `/mvp` = user app with chat, journey buttons, an 8-step run sequence, and four UI density modes (`mvp.html:17-22`).

**Realtime.** Server-Sent Events over `GET /api/runtime/events/stream` (`server.mjs:198`), fed by an in-process bus (`runtimeEvents.mjs:171,190`), filtered by session/user. Event types are workflow/worker lifecycle (`app.js:554-572`). **Rendering is a text timeline only — there is no visual browser view.** Screenshots *are* captured server-side via CDP `Page.captureScreenshot` (`openclawOfficialRuntime.mjs:672`) but consumed only for OCR→text; **zero `<img>`/`data:image` rendering** in either frontend. Two robustness gaps: SSE has **no keep-alive heartbeat** and the client has **no auto-reconnect/backoff**.

**AI2UI blocks.** A typed-block contract (`ai2uiBlocks.mjs`, `brainstyworkers.ai2ui.blocks.v1`) projecting graph state into ~9 fixed block types rendered per mode via a static allow-list (`mvp.js:6-11`) — schema-driven, not generative.

**Human-in-the-loop today.** Only **approval gating**, not browser control. The system is **read-only by design**: `credential_entry`, `passkey_or_2fa_handling`, `captcha_bypass`, `form_submission` are enumerated *blocked* actions (`ai2uiBlocks.mjs:244-251`); the UX tells the user to do login/2FA/captcha in their *own* browser (`mvp.html:928`). There is **no takeover/control endpoint** — exactly the gap the Phase-11 remote-browser feature closes (§9).

---

## 3. LangGraph Loop Orchestration

**Topology.** A **strictly linear chain, no conditional edges, no loops** (`langgraphRunner.mjs:2633-2657`): `START → input_policy → recall_context → classify_intent → llm_decision → workflow_router → skill_resolver → workflow_executor → observe_evidence → compose_response → maybe_model → END`. "Branching" is faked by nodes early-returning when `state.final_response` is already set (`:951,972,1040`). State `BrainstyState` (`:62-108`) is ~50 fields, **all using a last-write-wins reducer** (`field()`, `:55-60`) — any future fan-in would silently clobber. Checkpointer is a single in-process `MemorySaver()` (`:52`) — non-durable; durable continuity is bolted on via SQLite `checkpointSession` *outside* the graph, and the store is passed via a module-level `activeStores` Map (`:53`) — a side channel that is unsafe under concurrent sessions.

**LLM vs deterministic.** The routing brain is **almost entirely deterministic**: `classifier.mjs` is regex (and both branches of its final `if` return the same workflow — dead code, `classifier.mjs:25-29`); the router uses a hardcoded keyword-score table (`workflowArchitecture.mjs:565-582`). Real LLM calls exist only in `llmOrchestrationDecisionNode` and `maybeModelNode`, **both opt-in** (`useLiveModel===true` + `OPENAI_API_KEY`) and **advisory only** — the user-facing answer is always template strings, and `maybeModelNode`'s output is never read back (dead compute, and an **unguarded throw site**). *In the default path this is a deterministic state machine wearing LLM dressing* — defensible for a safety-critical gate, but it should not be described as LLM reasoning.

**Approval/resume.** **Not** a LangGraph `interrupt()` — it is an **external re-invocation**: run 1 prepares a proposal + approval gate; the operator approves out-of-band; a *new* graph run carries the approval token, consumed single-use, expiring, and binding-checked against task/session/user/workflow (`approvalResume.mjs:184-211`). Correct and auditable, but it reimplements native interrupt/checkpoint resume by hand.

**Prompt contracts.** The most mature part: `promptContracts.mjs` cleanly separates Identity/Guardrails from untrusted context, treats user/portal/memory text as data-never-instructions (`:159-172`), refuses credentials, masks identifiers before egress.

**Assessment.** *Risks:* simulated routing via short-circuits is brittle; `MemorySaver` + `activeStores` defeat durability/concurrency; overwrite-only reducers make fan-out lossy; `maybeModelNode` is dead compute + a throw site. *Recommendations:* real `addConditionalEdges`; native `interrupt()`/durable checkpointer; pass store via `config.configurable`; model the worker as a **sub-graph** with proper reducers; wire or delete `maybeModelNode`.

---

## 4. OpenClaw Structure & Multiskill Potential

**Worker contract.** LangGraph owns the job: `buildLangGraphOpenClawWorkerPlan` (`openclawWorkerContract.mjs:334`) emits stable `jobId`/`correlationId`, a runtime target (profile `brainstyworkers`, agent `brainstyworkers-insurance-browser`), and a 24-flag `deterministicControls` block (`:142-164`) where credentials/payer/forms/medical are hard `false`. Fan-in is owner-locked (`fanInOwner:"langgraph"`, `mergePolicy:"reject_missing_job_id_or_correlation_id"`, `maxConcurrency:1`). `validateOpenClawWorkerPlan` (`:374`) re-asserts every invariant — contract is enforced, not documented.

**Skill artifact.** A skill = a dir with `SKILL.md` (OpenClaw frontmatter) + `skill.json` (Brainstyworkers safety contract: risk level, allowed workflows/tools, approval gates, fallback order, `must_never`, answer schema). `validateOpenClawSkillArtifact` (`openclawSkillArtifacts.mjs:19`) is a near-golden-file validator that **hardcodes `skill_key === "insurance_portal_browser"`** (`:25`) and greps SKILL.md prose for required sentences (`:88-114`) — brittle.

**Real vs proposal-only.** Two layers coexist. Proposal-only always returns `executionMode:"proposal_only"` and never touches the CLI. **Real execution** (`openclawOfficialRuntime.mjs`) is genuinely wired but via **CLI subcommands** (`execFile` → `openclaw --profile brainstyworkers browser start|open|snapshot|status`, `:620-641`), screenshots over raw CDP WebSocket (`:643`), OCR shelled to `ocr-local`. It is **double-gated** (`approvalResume.ok` + `useOfficialOpenClawWorker===true`, `:1337,1445`). The configured gateway port **19789 is dead config — nothing binds or dials it**; the CLI is the real transport.

**Multiskill.** Two systems with opposite generality. The **static** path is **triple-hardcoded** to `insurance_portal_browser` (validator, default key, runtime default). The **`dynamicSkillServer`** is the intended generalization — it scans `skills/*/skill-server.json` against a generic schema (`insurance_specific|journey_specific|execution_specific`), already ships two example skills, scores matches, mounts read-only DB context. **But** dynamic skills only mount context and *request* tasks — every actual browser task still funnels through the one hardcoded insurance executor. *Adding a second real skill today requires editing three modules.*

**Assessment.** *Strengths:* clean orchestrator/worker split, layered fail-closed safety, real CLI+CDP+OCR plumbing. *Risks:* triple-hardcoded skill key; two divergent skill schemas; interpolated SQL in `dynamicSkillServer` (`:130-148`); dead gateway config. *Recommendations:* per-skill JSON-Schema contract + directory-scan loader; a **skill→executor registry** (the key unlock for a 2nd portal/non-insurance task); move to the real OpenClaw gateway/app-server task channel on 19789 for durable, parallel jobs; a typed per-action **write-approval** contract.

---

## 5. Database & Graph Schema

**SQLite.** 52 tables (`schema.mjs:1-54`) from one `SCHEMA_SQL`, FK-enforced, anchored on `users → sessions → (state, checkpoints, memory_items, agent_tasks, audit_events)` plus the evidence cluster `eligibility_snapshots → benefit_items/coverage_balances/claim_items/prior_authorizations`. **Access is raw SQL via a shelled-out `sqlite3` CLI** (`database.mjs:34-56`), **all values string-interpolated** (`quote()` only doubles single quotes, `:21-26`); identifiers unescaped. Migrations are forward-only `ADD COLUMN` with **no version ledger, no rollback, no transactions across statements**.

**Graphiti/FalkorDB.** Product memory is Zep Graphiti over FalkorDB (default `:6380`), reached through a **Python subprocess bridge** spawned per call (`productMemory.mjs:45-117`). The app submits structured `episodeBody` of kind `safe_healthcare_workflow_summary`; Graphiti's own LLM extracts entity nodes/edges with bitemporal validity. **It is opt-in** (`BRAINSTY_PRODUCT_MEMORY_ADAPTER=graphiti`, else `disabledResult`) with **no fallback if FalkorDB is absent**, requiring a `.venv-graphiti` + Docker FalkorDB + OpenAI key. Recall folds facts into context as advisory `"Graphiti memory fact: …"` lines (`langgraphRunner.mjs:614`).

**Product vs Cortex memory.** Clean: every episode/recall carries `cortexProductMemory:false`, `rawPortalTextStored:false`; there is no Cortex write path in this layer.

**Data safety.** Strong: direct-identifier masking to `[DB_POINTER:…]` before egress (`modelPayloadPolicy.mjs:40-63`); raw portal text never sent; **SHA-256 hash-chained audit** with `verifyAuditChain` (`audit.mjs:15-180`). Weaknesses: PHI *does* land in SQLite (`eligibility_snapshots.raw_text`, `claim_items.member_name`) with **no encryption at rest**; masking is regex-based/lossy; `expires_at`/`retention_policy` columns exist but **no purge/TTL job enforces them**.

**Assessment.** *Honest take:* the SQLite layer is the real, load-bearing system; the **Graphiti/FalkorDB graph memory is well-architected but opt-in, dependency-heavy, and effectively aspirational** in any unprovisioned deployment. *Recommendations:* replace the `sqlite3`-CLI store with `better-sqlite3`/`node:sqlite` **bound parameters + transactions** (kills injection + subprocess fragility at once); add a `schema_migrations` ledger; implement a real retention sweeper; encrypt PHI at rest; health-gate the graph with queue+replay fallback.

---

## 6. Deterministic Harness, Safety & Test Coverage

**Evidence contract.** The central claim — benefits answers grounded only in verified portal evidence — is a real control-flow gate. `verifyAuthenticatedPortalEvidence` (`portalEvidenceVerifier.mjs:55-105`) rejects public/marketing/login/unclassifiable/signal-less pages and only a valid result yields a `sourcePointer` with `domHash`/`extractionHash`. The harness **fails closed**: `composeResponseNode` produces a benefits answer only for allowlisted evidence statuses with real browser result (`langgraphRunner.mjs:2364-2369`); every blocked status routes to a refusal composer that explicitly refuses to invent facts, and the block is itself audited. Tests confirm login/marketing pages produce **zero snapshots and empty source_pointers**.

**Guardrails.** Input policy is pure regex/boolean (`policy.mjs:72-140`); `evaluatePortalAction` blocks any `submit|send|file|appeal|authorize|change|cancel|delete|pay`; all portal text is `safeForInstructionUse:false`. **Egress masking is dual-layer**: mask before the LLM (`modelPayloadPolicy.mjs:40-63`) *and* a second independent on-the-wire scan that **throws** in `enforced` mode if an identifier or raw portal text appears (`outboundPayloadObservability.mjs:100-120`). A live test asserts the raw name/email/`sk-` key never appear in the OpenAI payload.

**Audit/secrets/PHI.** Hash-chained audit with tamper-detection tests; secrets exposed only as 7+4 preview; PHI posture is explicitly "consented prototype."

**Tests.** 47 local test files (~174 cases) run unconditionally via `node --test`; live tests gated behind env flags. Coverage of the safety surface is **behavioral, not self-attested** (tampered-chain detection, fail-closed side-effect-freedom, masked egress, injection/credential refusals). *Gaps:* regex masking misses unusual ID/name formats; `outboundPayloadObservability` **defaults to `observe_only`** and only the recorder path is `enforced` (a dev can bypass the blocker); no fuzz/adversarial corpus; audit tamper-evidence is detective, not preventive.

**Assessment.** **The deterministic-harness claim is credible** — substantially better than guardrail-by-prompt systems. *Biggest risks:* (a) regex masking/policy is the load-bearing primitive and is inherently incomplete (PHI leak); (b) enforcement-mode inconsistency; (c) string-concatenated SQL. *Recommendations:* make `enforced` the default everywhere + a test that no egress path runs unrecorded; structural allowlist for identifier fields + adversarial masker corpus; parameterize SQL; externally anchor the terminal audit hash; fuzz the injection/medical-advice patterns.

---

## 7. Consulting verdict — will this system work?

Framed against the goal (a **mobile, multichannel AI concierge** that completes real insurance journeys for patients):

**What is genuinely strong and rare.** The team built the hard, unsexy 80%: a *deterministic safety spine* that most agentic healthcare demos skip. Source-pointer grounding with fail-closed refusals, hash-chained audit, dual-layer PHI masking, single-use binding approvals, and an orchestrator/worker split where the LLM cannot authorize actions — this is the part that makes the product *defensible to a compliance reviewer*, and it is real and tested. That is the moat.

**What is MVP-shaped and must not be carried into production unchanged.**
- **The "intelligence" is mostly deterministic.** Routing is keyword tables; the LLM is opt-in and advisory; `maybeModelNode` output is discarded. This is *fine for a safe demo* but it caps answer quality and adaptability. The next phase should let the LLM own composition and intent **inside** the harness (masked payloads, evidence-gated output), not bolt it on as a discarded side-node.
- **"Multichannel" and "graph memory" are aspirational.** One web adapter; Graphiti opt-in and unprovisioned. Either build one real second channel (WhatsApp is the obvious mobile fit) and stand up FalkorDB, or stop marketing them until they exist.
- **The data layer is a liability.** String-interpolated SQL via a shelled-out CLI is the single highest-severity cross-cutting issue. It is also the easiest high-leverage fix.
- **The graph is linear faking branching.** It works now but will fight every new workflow. Migrate to conditional edges + native interrupts before adding the next five journeys.

**Probability assessment (consulting estimate, not a guarantee).**
- *Reaches a convincing, safe, demoable mobile MVP this quarter:* **~80%** — the spine exists; the remaining work is wiring and UI (incl. the remote-browser feature in §9), not invention.
- *Reaches a production/HIPAA-credible system without addressing the P0 list:* **~20%** — the SQL layer, encryption-at-rest, enforcement-mode default, and retention enforcement are gating.
- *The architecture is the right long-term bet:* **yes, conditionally** — the harness-around-a-worker pattern is correct; the implementation needs the structural cleanups in §8, and the OpenClaw integration should move from CLI-shelling to the real gateway/app-server channel for durability and parallelism.

**Bottom line:** This is not a toy. It is a safety-led prototype with a real moat and a clear, finite list of corrections. Fund the hardening phase; do not rewrite.

---

## 8. Prioritized recommendations (roadmap for the next phase)

**P0 — correctness/safety blockers (do before any external pilot):**
1. Replace the `sqlite3`-CLI store with `node:sqlite`/`better-sqlite3` using **bound parameters + explicit transactions**. Eliminates the injection surface and subprocess fragility in one move. (`database.mjs`, `audit.mjs`, `server.mjs`, `dynamicSkillServer.mjs`)
2. Make outbound-payload enforcement **`enforced` by default** and add a test asserting no LLM/egress path can run unrecorded. (`outboundPayloadObservability.mjs:51`)
3. **Encrypt PHI at rest** (SQLCipher or column-level) and implement a **retention sweeper** honoring `expires_at`/`retention_policy`. (`schema.mjs`, `productMemory.mjs`)
4. Delete or quarantine the dead `engine.mjs` pipeline and migrate its 5 test files onto the graph — remove the dual-pipeline correctness trap.

**P1 — structural (unblock scale):**
5. Convert the linear graph to **conditional edges + native `interrupt()`/durable checkpointer**; pass the store via `config.configurable`; drop `activeStores`. (`langgraphRunner.mjs`)
6. Add a **skill→executor registry** and unify the static + dynamic skill schemas (directory-scan, per-skill JSON-Schema) so a 2nd portal/non-insurance skill is config, not code. (`openclawSkillArtifacts.mjs`, `dynamicSkillServer.mjs`)
7. Move OpenClaw execution from CLI-shelling to the real **gateway/app-server task channel on :19789** for durable, restartable, parallel jobs.
8. Split `server.mjs` (router + per-domain handlers) and `langgraphRunner.mjs` (node files / worker sub-graph).

**P2 — product reality (match the pitch):**
9. Build **one real second channel** (WhatsApp recommended for mobile) behind `channelAdapter`.
10. Stand up FalkorDB as a managed dependency with health-gated fallback, or descope graph memory until then.
11. Let the LLM **own composition/intent inside the harness**; wire or delete `maybeModelNode`.
12. Make `mvp.css` genuinely mobile-first (`@media` breakpoints; single-column tabbed) and add SSE heartbeat + client auto-reconnect.

---

## 9. Next-phase feature: live remote-browser view + mobile takeover

Detailed design and the initial implementation ship on branch `feature/phase-11-remote-browser-control` (see `docs/REMOTE_BROWSER_CONTROL_DESIGN.md`). Summary of the architectural fit:

- **Live view** reuses the existing CDP client (`openclawOfficialRuntime.mjs:509-672`): switch from one-shot `Page.captureScreenshot` to `Page.startScreencast` + `Page.screencastFrame`, relayed over the *existing* SSE bus as a new `browser.frame` event — no new transport.
- **Takeover** adds a narrow, **human-only** input relay (`Input.dispatchKeyEvent`/`dispatchMouseEvent`/`insertText`) behind a new `interactive_takeover` approval scope. This **preserves the core safety invariant** — *the agent still never enters credentials*; it relays the **human's own** keystrokes (password/captcha) into the worker's browser, which is the same trust model the product already uses ("user does login/2FA themselves"), just moved from the user's browser into a live relay. The `agent_*` blocked-action set is unchanged; takeover is logged as a human action in the audit chain.
- This is the bridge from "read-only observation the user can't see" to "supervised, on-rails session the user can watch and rescue" — the Manus/Gemini-style experience — without weakening the deterministic harness.
