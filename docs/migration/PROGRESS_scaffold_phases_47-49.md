# Progress — Orchestration Intelligence Migration (Corrected Phases 53–55)

Numbering correction: the migration package originally labeled this track as Phases 47–49, but the local repo had already landed through Phase 52. The canonical execution mapping for this branch is:

- Migration Phase 47 -> implementation Phase 53
- Migration Phase 48 -> implementation Phase 54
- Migration Phase 49 -> implementation Phase 55

Track each implementation loop here. For every slice, record: Slice name · Files changed · Implemented · Verification commands · Verification result · What the user can try locally · Known risks or gaps.

This file is a pre-filled scaffold. The executing agent fills `Implemented`, `Verification result`, and `What the user can try` as each slice lands. Do not mark a phase done until the project commit lands on `concierge_by_openclaw_hermes/main` AND the Cortex notes land on `cortex/main` (AGENTS.md).

---

## Phase 53 Invert The Intelligence Default - 2026-06-21

Slice name:
- Reasoning-primary intent + decision + composition with model tiering.

Files changed (expected):
- `src/concierge/modelTierPolicy.mjs` (new)
- `src/concierge/langgraphRunner.mjs` (`structuredIntentNode`, `llmOrchestrationDecisionNode`, `composeResponseNode`)
- `src/concierge/llmOrchestrationDecision.mjs` (`shouldUseLlmDecision`, new `confidenceBand`)
- `src/concierge/intelligence/structuredIntentReasoner.mjs` (fallback semantics)
- `src/concierge/orchestratorDemo.mjs` (default `useLiveModel`)
- `src/tests/intelligence-default.test.mjs` (new), `src/tests/model-tier-policy.test.mjs` (new)
- updated: `llm-orchestration-decision.test.mjs`, `intelligence-contracts.test.mjs`

Implemented:
- Added `modelTierPolicy.mjs` as the only ChatOpenAI construction boundary, with classifier/reasoner/planner tier selection, env overrides, base URL selection, a deterministic harness factory, and an explicit not-implemented edge-SLM contract.
- Inverted `structuredIntentNode` to try the live structured-intent classifier tier first when live models are enabled and deterministic safety did not already hard-stop the request.
- Stamped `structured_intent.reasoning_source` as `llm` or `curated_fallback`; live failures and missing model credentials degrade to curated reasoning instead of dead-ending.
- Routed valid live reasoning through the existing `JOURNEY_TO_WORKFLOW` contract.
- Made `llmOrchestrationDecisionNode` live by default unless `useLiveModel === false`; kept urgent and policy-refusal hard deterministic skips.
- Added `confidenceBand()` and labeled valid low-confidence LLM decisions as `low_confidence_clarify` instead of silently adopting them.
- Routed answer composition, the deprecated `maybeModelNode`, and the PEMS live evaluator through the shared tier policy.
- Updated Node and FastAPI API defaults so omitted live-model flags mean live reasoning is allowed; explicit false remains deterministic-only.
- Added deterministic harness tests for tier selection, constructor centralization, live-first structured intent, fallback on model failure, and low-confidence routing.

Verification commands:
- `npm run build`
- `npm run test:local`
- `npm run test:journeys`
- API proof + visual proof

Verification result:
- Focused Phase 53 suite `node --test src/tests/model-tier-policy.test.mjs src/tests/intelligence-default.test.mjs src/tests/llm-orchestration-decision.test.mjs` passed with 12/12 tests before broader gates.
- `npm run build` passed.
- `npm run test:journeys` passed with 14/14 tests.
- `npm run test:phi` passed with 1/1 tests.
- `npm run test:egress` passed with 4/4 tests.
- `npm run test:graph:topology` passed with 2/2 tests.
- `npm run test:execution:v2` passed with 11/11 tests.
- `npm run test:facade` passed with 53 tests and 2 expected skips.
- Safety-invariant batch passed with 23/23 tests.
- `npm run test:local` passed with 261 tests total, 259 passing, 2 expected live-gated OpenClaw skips, and 0 failures.
- API proof artifact: `artifacts/phase53/intelligence-default-api-proof.json`.
- Visual proof artifacts: `artifacts/phase53/intelligence-default-mvp-proof.png`, `artifacts/phase53/intelligence-default-mvp-proof.json`.

What the user can try locally:
- Call `/api/chat` or `/api/langgraph/run` without `useLiveModel`; the graph now requests live intelligence by default when `OPENAI_API_KEY` exists and falls back cleanly when it does not.
- Use `useLiveModel: false` for deterministic-only regression runs.

Known risks or gaps:
- Live-model cost/latency; deterministic fallback is covered by simulated outage tests, but live OpenAI proof remains credential-gated.
- Phase 54 still needs graceful degradation/tiered-offer work; Phase 55 still needs native durable LangGraph interrupt/resume.

---

## Phase 48 Graceful Degradation And The Tiered Offer - <YYYY-MM-DD>

Slice name:
- Best-effort answers + AI2UI tiered offer; clarify-don't-block.

Files changed (expected):
- `src/concierge/gracefulDegradation.mjs` (new)
- `src/concierge/langgraphRunner.mjs` (`composeResponseNode` evidence branches; `proposeBasicClarification`)
- `src/concierge/ai2uiBlocks.mjs` (`degraded_answer_with_options`, contract bump)
- `src/concierge/promptContracts.mjs` (shared sandbox/privacy copy constant)
- `src/tests/graceful-degradation.test.mjs` (new)

Implemented:
- _<fill>_

Verification commands:
- `npm run build`
- `npm run test:local`
- `npm run test:journeys`
- API proof + visual proof

Verification result:
- _<fill>_

What the user can try locally:
- _<fill: e.g. "Ask 'I think I already paid this bill' with no portal connected → receive a best-effort answer + verify/let-me-check/more-info options, not a refusal.">_

Known risks or gaps:
- Grounding discipline in degraded mode (no confident uncited claims). Confirm `validateSourcedAnswer` labels unverified items.

---

## Phase 49 Real Dynamic Graph And Native Human-In-The-Loop - <YYYY-MM-DD>

Slice name:
- Durable checkpointer + `interrupt()`/`Command` approval; planner + real conditional edges; remove `maybe_model` and `engine.mjs`.

Files changed (expected):
- `src/concierge/graphCheckpointer.mjs` (new)
- `src/concierge/langgraphRunner.mjs` (`createBrainstyLangGraph`, `evidenceObservationNode`, new `plan_journey` node, routers → conditional edges, remove `maybeModelNode`, update `describeBrainstyLangGraphTopology`)
- `src/concierge/approvalResume.mjs` (resume via `Command`, token still authoritative)
- removed: `src/concierge/engine.mjs` (+ its test); recorded in `docs/DECISIONS.md`
- `src/tests/graph-interrupt-resume.test.mjs` (new); updated `graph-topology.test.mjs`, `langgraph-runner.test.mjs`

Implemented:
- _<fill>_

Verification commands:
- `npm run build`
- `npm run test:local`
- `npm run test:graph:topology`
- `npm run test:execution:v2`
- API proof + visual proof

Verification result:
- _<fill>_

What the user can try locally:
- _<fill: e.g. "Start a journey that needs observation → it pauses; restart the server; approve → it resumes and completes against the same token.">_

Known risks or gaps:
- Durable checkpoint PHI-at-rest (coordinate with Phase 50). Confirm no raw portal text in checkpoints.
