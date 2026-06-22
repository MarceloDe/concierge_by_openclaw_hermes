# ADR-004: Reasoning Orchestrator With Deterministic Rails

Date: 2026-06-21

## Status

Proposed. Supersedes the implicit "deterministic-first, LLM-as-optional-advisor" posture established across Phases 1–46. Does **not** supersede the safety contract of ADR-001 (HIPAA substrate), ADR-002 (execution v2 manager/worker write gate), or ADR-003 (Graphiti product memory) — those rails are preserved and reused.

This ADR governs the next implementation track (Phases 47–49, "orchestration intelligence"). Phases for P0 hardening, worker breadth, and closing the continuous-learning loop are sequenced after and recorded separately.

## Context

The product runtime is a LangGraph state machine (`src/concierge/langgraphRunner.mjs`, `createBrainstyLangGraph()`). As built, it is deterministic-first and the LLM is an optional advisor:

- The live model is **off unless** `raw_message.useLiveModel === true` AND `OPENAI_API_KEY` is set; otherwise `llmOrchestrationDecisionNode` returns `mode: "not_requested"` / `"skipped_missing_openai_api_key"` and the curated regex classifier (`classifyHealthcareIntent`) decides the workflow.
- Even when on, the LLM only *advises*: `shouldUseLlmDecision()` adopts its workflow only at `confidence ≥ 0.5`, else falls back to `structured_intent.workflow`.
- `maybeModelNode` output lands in `model_invocation`, never in `final_response` — it is auxiliary/discarded; `composeResponseNode` sets the answer deterministically.
- Evidence-insufficiency is treated as a **stop**: `composeResponseNode` emits `blocked_no_authenticated_evidence` / `trusted_research_evidence_unavailable` "blocked" responses rather than a best-effort answer.
- The graph has **no `interrupt()` / `Command()`**; approval pause/resume is simulated with DB state plus a fresh graph run, and the only checkpointer is in-memory `MemorySaver`.

Consequence: in the default path the system behaves like classical rule software ("a deterministic state machine wearing LLM dressing", per the 2026-06-11 senior review). This cannot evaluate the *value* of partial information, substitute a semantically adequate fact for a missing one, or degrade gracefully — which is exactly what real insurance journeys (high exception density, incomplete user input) require.

The founder's intent is explicit and correct: keep the harness deterministic **for the safety trail and validated workflow**, but let **every reasoning function call an LLM (or, later, an edge SLM) sized to the complexity of the step**, never hard-stop a journey for missing evidence, and always produce the most accurate possible answer plus a tiered "verify-it-yourself / let-me-do-it / give-me-more-info" offer.

## Decision

Adopt a **reasoning-orchestrator-with-rails** architecture. Two layers with a hard boundary:

1. **Rails (stay deterministic, forever).** PHI/identifier masking (`modelPayloadPolicy.maskDirectIdentifiers`), SHA-256 hash-chained audit (`audit.mjs`), approval-token binding (`approvalResume.mjs`), schema/allow-list validation (`reasoningValidators`, `normalizeLlmOrchestrationDecision`), the evidence/source-pointer model, and the safety refusals in `evaluateInputPolicy` + `refusalForIntent`. These are the provable guarantees; they must not depend on a model.

2. **Reasoning (LLM-primary, rails-bounded).** Intent understanding, planning under uncertainty, evaluating whether present information can substitute for absent information, answer composition, and the worker's problem-solving. Here the LLM is the **primary** decision-maker; the curated classifier becomes the **fallback** used only when the model is unavailable.

Three concrete changes (detailed in IMPLEMENTATION_PLAN Phases 47–49):

1. **Invert the intelligence default (Phase 47).** Make the live reasoner the primary path in `classify_intent`, `llm_decision`, and answer composition, with the curated/deterministic path as the typed fallback. Introduce a **model-tier policy**: a small/cheap model for classification, a high-intelligence model for planning and degraded-mode answers, and a forward seam for an edge SLM.

2. **Graceful degradation, never evidence-refusal (Phase 48).** Keep safety refusals (emergency → handoff, credential entry, medical advice, prompt injection, out-of-scope) as hard deterministic stops. Convert every *evidence-insufficiency* stop into a best-effort answer: the high-intelligence model produces the most accurate guidance from what is available, states the uncertainty and exactly what is unverified, and always attaches an AI2UI tiered offer ("here's how to verify it yourself" / "let me check it — nothing is stored, it runs in an isolated sandbox you authorize, you enter the 2FA" / "give me more info"). The orchestrator may ask 1–2 basic questions first but never blocks on the answer.

3. **Real dynamic graph + native human-in-the-loop (Phase 49).** Replace the faux-linear flow with real conditional edges and a planner that can re-plan mid-journey; use LangGraph `interrupt()`/`Command(resume=…)` for the approval pause backed by a **durable checkpointer** (Postgres/SQLite saver), so a paused journey survives across requests and resumes against the existing single-use bound token rather than a re-run.

## Consequences

Positive:
- Matches founder intent: deterministic safety trail + intelligence sized to complexity; journeys produce value under incomplete information.
- Reuses the expensive, differentiated assets (governance, PHI, approval, audit, evidence, AI2UI, OpenClaw integration). It is a re-wiring of the orchestration layer, not a rewrite, so the compliance hardening and the 60+ test suites remain the safety net.
- Native `interrupt()` makes human-in-the-loop a first-class, durable primitive instead of a simulated state flag.

Costs / risks:
- The graph-topology and intelligence tests (`graph-topology.test.mjs`, `langgraph-runner.test.mjs`, `llm-orchestration-decision.test.mjs`, `intelligence-contracts.test.mjs`) will change and must be rewritten alongside the code; the safety suites (`policy`, `phi`, `prompt-contracts`, `output-policy`, `approval-resume`, `openclaw-worker-contract`) must stay green unchanged — they are the regression guard.
- LLM-primary increases live-model cost and latency; mitigated by model tiering, the deterministic fallback, and caching of classification.
- Degraded-mode answers raise the bar on grounding discipline: every factual claim still must cite a source pointer or be explicitly flagged unverified (`validateSourcedAnswer` stays mandatory) to avoid confident-but-wrong guidance in a healthcare context.
- Durable checkpointer adds an operational dependency (DB-backed graph state) and must respect the same PHI-at-rest hardening tracked for P0.

Migration cost: estimated 6–10 focused weeks across three slices, executed under the existing RALPH loop with CI green as the merge gate. No architectural rewrite; `engine.mjs` (dead dual pipeline) is deleted as part of Phase 49 cleanup.

## Verification

Each phase lands only when these pass (see ACCEPTANCE_CRITERIA Phases 47–49 for the full matrix):

- `npm run build`
- `npm run test:local` (full suite green; safety suites unchanged)
- `npm run test:journeys` and `npm run test:graph:topology` (updated topology + intelligence contracts)
- `npm run test:phi`, `npm run test:egress`, `npm run test:execution:v2` (rails unchanged)
- New focused suites: `intelligence-default.test.mjs`, `graceful-degradation.test.mjs`, `graph-interrupt-resume.test.mjs`, `model-tier-policy.test.mjs`
- API proof + visual proof per the repo's non-mocked proof rules (`docs/NON_MOCKED_PROOF_RULES.md`).
