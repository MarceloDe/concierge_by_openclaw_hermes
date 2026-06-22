# Implementation Plan — Phases 47–49 (Orchestration Intelligence)

Status: Migration track to the reasoning-orchestrator-with-rails architecture (ADR-004). Earlier phases (1–46) remain in history. This document is additive — paste these phases into `docs/IMPLEMENTATION_PLAN.md` and supersede the relevant earlier notes via Cortex.

Source of truth:
- `docs/adr/ADR-004-reasoning-orchestrator-with-rails.md`
- `AGENTS.md`
- Cortex `semantic/projects/workerprototype-openclaw-late-implementation-architecture.md`

Last updated: 2026-06-21

Scope of this track: orchestration intelligence only — invert the LLM default, add graceful degradation, and make the graph a real dynamic graph with native human-in-the-loop. Out of scope here (sequenced as Phases 50+): P0 security/PHI hardening, worker-envelope breadth, closing the continuous-learning loop. Each is referenced where it interlocks.

Convention for executors: every `*Node` function, router, and helper named below exists today in `src/concierge/langgraphRunner.mjs` unless another file is given. Keep `describeBrainstyLangGraphTopology()` in sync with any edge change (the topology test asserts it).

---

## Phase 47 - Invert The Intelligence Default

Goal:
- Make the LLM the primary reasoner for understanding, workflow selection, and answer composition, with the curated/deterministic path retained as a typed fallback used only when a model is unavailable or fails. Introduce model tiering so step complexity selects the model (small classifier model, high-intelligence planner/answer model, forward seam for an edge SLM).

Implementation plan:
- Add `src/concierge/modelTierPolicy.mjs` exposing `selectModelForStep(step, context)` returning `{ model, baseURL, tier }`. Tiers: `classifier` (`BRAINSTY_CLASSIFIER_MODEL`, default `gpt-5-mini`), `reasoner` (`BRAINSTY_REASONER_MODEL`, default the high-intelligence model), `planner` (`BRAINSTY_PLANNER_MODEL`). Add an `edge_slm` stub branch (`BRAINSTY_EDGE_SLM_ENDPOINT`) that throws `not_implemented` today but pins the interface. Centralize the `new ChatOpenAI({ timeout, maxRetries, configuration:{ baseURL } })` construction here so every call site is tiered and observable.
- `structuredIntentNode` (classify_intent): invert the order. Today it builds deterministic reasoning first. Change to: call `invokeLiveStructuredIntentReasoner` (tier `classifier`) **first**; validate with `validateStructuredIntentReasoning`; on invalid/unavailable/exception, fall back to `buildDeterministicStructuredReasoning` + `classifyHealthcareIntent`. Record `reasoning_source: "llm" | "curated_fallback"` in `structured_intent` for audit.
- `llmOrchestrationDecisionNode` (llm_decision): default the live path ON. Treat `state.raw_message.useLiveModel` as defaulting to `true` (only `false` disables); keep the existing hard skips for `urgentEscalationRequired` and `!allowed` (those are safety — unchanged). Where `OPENAI_API_KEY` is absent, keep `mode: "skipped_missing_openai_api_key"` and fall back to curated — this is the only deterministic-first path that remains.
- `shouldUseLlmDecision` (`llmOrchestrationDecision.mjs`): keep the `valid && workflow && confidence >= 0.5` adoption rule, but change the *low-confidence* behavior. Below threshold must no longer silently use regex; instead set `route_reason: "low_confidence_clarify"` so Phase 48 can ask a basic clarifying question rather than guess. Add `confidenceBand(decision)` → `high | medium | low` for downstream use.
- Answer composition: make `composeResponseNode` → `maybeComposeLiveSourcedAnswer` the single authoritative LLM-composition point (tier `reasoner`). Keep `validateSourcedAnswer` mandatory (every factual claim cites a source pointer or is flagged unsupported). `maybeModelNode` becomes redundant; mark it deprecated here and remove it in Phase 49 (topology change).
- Default the orchestrator entry to live: in `orchestratorDemo.runOrchestratorChat`, keep `useLiveModel` defaulting true; ensure `runLangGraphOrchestration` propagates it into `raw_message`.
- Observability: every tiered call continues to pass through `recordOutboundPayloadObservation` and `maskDirectIdentifiers` (rails unchanged).

Acceptance:
- With a model configured, `classify_intent` and `llm_decision` use the LLM as primary and stamp `reasoning_source: "llm"`; with the model disabled or key absent, the curated classifier still produces a valid result and stamps `curated_fallback`.
- No safety regression: `policy.test.mjs`, `phi.test.mjs`, `prompt-contracts.test.mjs`, `output-policy.test.mjs` unchanged and green.
- New `src/tests/intelligence-default.test.mjs` proves: LLM-primary when available; deterministic fallback on simulated model failure; `validateSourcedAnswer` still rejects uncited factual claims.
- New `src/tests/model-tier-policy.test.mjs` proves tier selection and that all model construction routes through `modelTierPolicy`.
- `npm run build`, `npm run test:local`, API proof, visual proof pass.

---

## Phase 48 - Graceful Degradation And The Tiered Offer

Goal:
- A journey never refuses or dead-ends for missing evidence or unmet journey criteria. Safety refusals stay hard. For everything else the orchestrator asks at most 1–2 basic questions, then produces the most accurate possible answer from available information — clearly marking what is unverified — and always offers the AI2UI tiered choice: verify-it-yourself / let-me-check-it (sandboxed, nothing stored, you provide 2FA) / give-me-more-info.

Implementation plan:
- Preserve the safety boundary exactly. `routeAfterWorkflowRouter` keeps its short-circuits for `urgentEscalationRequired`, `allowed === false`, `refusalForIntent(intent)`, and `workflow_outcome ∈ {urgent_handoff_created, blocked}`. Those remain hard deterministic stops and are out of scope for degradation.
- Add `src/concierge/gracefulDegradation.mjs` with `composeBestEffortAnswer(state, { reason, missingEvidence })`: uses the `reasoner`/`planner` tier to produce the best supported guidance, returns `{ answer, claims[], unverified[], nextSteps[] }`, runs through `validateSourcedAnswer` (unverified items must be labeled, not cited). Reason codes map from the current evidence statuses.
- `composeResponseNode`: replace the *evidence-insufficiency* branches — `blocked_no_authenticated_evidence`, `blocked_pending_research_evidence_review`, `blocked_no_trusted_research_evidence` — so they call `composeBestEffortAnswer(...)` instead of the `composeBlockedEvidenceResponse` / `composeMissingTrustedResearchEvidenceResponse` dead-ends. Set a new `workflow_outcome: "best_effort_degraded"` (distinct from the safety `"blocked"`). The safety-sourced `final_response` short-circuit at the top of the node is untouched.
- Clarify-don't-block: add `proposeBasicClarification(state)` (used when `route_reason === "low_confidence_clarify"` or required basics like coverage type/demographics are absent). It returns at most two basic questions as AI2UI prompts; it must not set a terminal stop. If the user skips, the graph proceeds to `composeBestEffortAnswer`.
- AI2UI: add a `degraded_answer_with_options` block in `ai2uiBlocks.mjs` (contract version bump). The block always renders three actions: `verify_myself`, `let_concierge_check` (carries the read-only observation proposal so approval can follow the existing `approvalResume` path), `provide_more_info`. The "let me check" copy includes the privacy framing as a constant: *"Your data is not stored — it runs in an isolated sandbox and is erased after use; you complete login/2FA yourself in the remote browser, and it is never stored."* Source this from a single exported constant (reused by `promptContracts.baseSafetyRules`) so it cannot drift.
- Keep the offer honest: `let_concierge_check` only appears when a portal/document observation is actually applicable (an `insurance_portal_browser` execution skill resolved); otherwise show only `verify_myself` / `provide_more_info`.

Acceptance:
- A request with insufficient evidence yields a best-effort answer with explicit `unverified[]` and a `degraded_answer_with_options` AI2UI block — never a refusal — and stamps `workflow_outcome: "best_effort_degraded"`.
- Safety still hard-stops: emergency → handoff, credential/medical-advice/prompt-injection/out-of-scope → refusal, unchanged (asserted by existing `policy` + `langgraph-runner` cases plus new ones).
- The "let me check it" option carries a valid read-only observation proposal that, when approved, resumes through the existing `approvalResume` consume path (no change to token binding).
- New `src/tests/graceful-degradation.test.mjs` proves: no-evidence → best-effort + options (not blocked); skipped clarification still answers; every factual claim cited or labeled unverified; privacy copy present and from the shared constant.
- `npm run build`, `npm run test:local`, `npm run test:journeys`, API + visual proof pass.

---

## Phase 49 - Real Dynamic Graph And Native Human-In-The-Loop

Goal:
- Replace the faux-linear flow + simulated approval with a real dynamic LangGraph: conditional edges that branch on reasoning, a planner that can re-plan mid-journey, native `interrupt()`/`Command(resume)` for the approval pause, and a durable checkpointer so a paused journey survives across requests. Retire the dead `maybe_model` node and the dead `engine.mjs` pipeline.

Implementation plan:
- Durable checkpointer: add `src/concierge/graphCheckpointer.mjs` selecting a persistent saver (SQLite locally, Postgres in deployment) behind `BRAINSTY_GRAPH_CHECKPOINTER` (default `memory` for tests). Pass it to `createBrainstyLangGraph().compile({ checkpointer })`. Checkpointed graph state must obey the same PHI-at-rest rule tracked in the P0 hardening phase (encrypt at rest; no raw portal text in checkpoints).
- Native interrupt at the gate: in `evidenceObservationNode`, when no valid approval token exists, call LangGraph `interrupt({ type: "read_only_observation_approval", proposal })` instead of returning a waiting state. Resume via `graph.invoke(new Command({ resume: approvalToken }), config)` driven by the approval API. The single-use, time-boxed, bound token in `approvalResume.consumeReadOnlyObservationApproval` remains the authorization of record — the interrupt only carries control flow, the token still gates the side effect. Fail-closed semantics (expired/mismatch → no side effect) preserved.
- Planner + real edges: introduce a `plan_journey` node (tier `planner`) producing a typed plan `{ workflow, steps[], neededEvidence[], degradeIfMissing: true }`. Convert `routeAfterWorkflowRouter` and `routeAfterEvidenceObservation` into genuine conditional edges driven by the plan and by `confidenceBand`, including a back-edge that lets the planner request one clarification loop (bounded, max 1) before degrading. Keep all safety short-circuits as the highest-priority branches.
- Remove `maybe_model` node and its edge `compose_response → maybe_model → END`; make `compose_response → END`. Composition LLM already lives in compose (Phase 47). Update `describeBrainstyLangGraphTopology()` and the topology test.
- Delete `src/concierge/engine.mjs` (the dead, separately-tested linear pipeline) and its test once parity of the graph path is proven; record the removal in `docs/DECISIONS.md` per the change-control rule.
- Concurrency: the existing `workerLeases`/`workerContinuations` still guard long-running work; a journey interrupted for approval holds no lease while paused.

Acceptance:
- A journey that needs observation **pauses via `interrupt()`**, persists in the durable checkpointer, and **resumes via `Command(resume=token)`** in a separate request — proven to survive a simulated process restart.
- Approval remains single-use, time-boxed, bound; expired/mismatched tokens produce no side effect (existing `approval-resume.test.mjs` invariants extended, not weakened).
- Topology test updated: nodes/edges match the new graph; `maybe_model` gone; `engine.mjs` removed with no remaining importers.
- New `src/tests/graph-interrupt-resume.test.mjs` proves pause/persist/resume and fail-closed expiry under the durable checkpointer.
- `npm run build`, `npm run test:local`, `npm run test:graph:topology`, `npm run test:execution:v2`, API + visual proof pass.

---

## Sequenced after this track (referenced, not detailed here)

- Phase 50 - P0 platform hardening: bound-parameter SQL, enforce egress by default, encrypt PHI at rest + retention sweeper (interlocks with the durable checkpointer in Phase 49).
- Phase 51 - Worker-envelope breadth: widen OpenClaw tool/skill selection and community-skill/gateway use *within* the approved read-only envelope; generalize the skill system off the `insurance_portal_browser` hardcode.
- Phase 52 - Close the continuous-learning loop: promote reviewer-approved PEMS skills from shadow to answer-driving (the worker-success procedural memory the founder described), behind the existing promotion gate.
