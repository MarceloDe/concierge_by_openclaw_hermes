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

## Phase 54 Graceful Degradation And The Tiered Offer - 2026-06-22

Slice name:
- Best-effort answers + AI2UI tiered offer; clarify-don't-block.

Files changed (expected):
- `src/concierge/gracefulDegradation.mjs` (new)
- `src/concierge/langgraphRunner.mjs` (`composeResponseNode` evidence branches; `proposeBasicClarification`)
- `src/concierge/ai2uiBlocks.mjs` (`degraded_answer_with_options`, contract bump)
- `src/concierge/promptContracts.mjs` (shared sandbox/privacy copy constant)
- `src/tests/graceful-degradation.test.mjs` (new)

Implemented:
- Added `src/concierge/gracefulDegradation.mjs` with deterministic and live-capable best-effort answer composition.
- Converted missing or untrusted evidence branches in `composeResponseNode` to produce `workflow_outcome: best_effort_degraded`, `degraded_answer`, strict unsupported claims, unverified evidence lists, and non-terminal clarification suggestions.
- Added `degraded_answer` to the LangGraph state annotation so API/UI payloads retain the degradation contract.
- Added `degraded_answer_with_options` to the AI2UI contract and `/mvp` renderer, including verify-myself, approval-gated concierge-check, and provide-more-info choices.
- Shared the isolated sandbox privacy copy through prompt safety rules and the UI payload.
- Updated public endpoint and graph tests from the old terminal blocker copy to the new best-effort degraded contract.

Verification commands:
- `npm run build`
- `npm run test:local`
- `npm run test:journeys`
- API proof + visual proof

Verification result:
- Focused Phase 54 suite passed with 32/32 tests.
- `npm run build` passed.
- `npm run test:journeys` passed with 18/18 tests.
- `npm run test:phi`, `npm run test:egress`, `npm run test:graph:topology`, and `npm run test:execution:v2` all passed.
- Safety-invariant batch passed with 27/27 tests.
- `npm run test:facade` passed with 53 tests and 2 expected skips.
- `npm run test:db:safety`, `npm run test:retention`, and `npm run test:openclaw:skills` all passed.
- `npm run test:local` passed with 265 tests total, 263 passing, 2 expected live-gated OpenClaw skips, and 0 failures.
- API proof passed at `http://127.0.0.1:4220/api/chat`; artifact: `artifacts/phase54/graceful-degradation-api-proof.json`.
- In-app browser visual proof passed at `http://127.0.0.1:4220/mvp?phase=phase-54-graceful-degradation` with 0 console errors; artifacts: `artifacts/phase54/graceful-degradation-mvp-proof.png` and `artifacts/phase54/graceful-degradation-mvp-proof.json`.

What the user can try locally:
- Ask a safe insurance-navigation question with no trusted evidence, such as "What does reviewed evidence say about my deductible before coinsurance?", with `useLiveModel: false` for deterministic proof.
- The response should be a best-effort answer with `Unverified:` evidence, a `degraded_answer_with_options` UI block, and a pending approval-gated concierge-check option if OpenClaw produced a task proposal.

Known risks or gaps:
- Live-model graceful-degradation composition remains credential-gated; deterministic fallback is covered.
- Phase 55 still needs durable native LangGraph interrupt/resume for the approval pause.

---

## Phase 49 Real Dynamic Graph And Native Human-In-The-Loop - 2026-06-22

Slice name:
- Durable checkpointer + `interrupt()`/`Command` approval; planner + real conditional edges; remove `maybe_model` and `engine.mjs`.

Files changed (expected):
- `src/concierge/graphCheckpointer.mjs` (new)
- `src/concierge/langgraphRunner.mjs` (`createBrainstyLangGraph`, `evidenceObservationNode`, new `plan_journey` node, routers → conditional edges, remove `maybeModelNode`, update `describeBrainstyLangGraphTopology`)
- `src/concierge/approvalResume.mjs` (resume via `Command`, token still authoritative)
- removed: `src/concierge/engine.mjs` (+ its test); recorded in `docs/DECISIONS.md`
- `src/tests/graph-interrupt-resume.test.mjs` (new); updated `graph-topology.test.mjs`, `langgraph-runner.test.mjs`

Implemented:
- Implemented as repo Phase 55 after the local phase-number correction.
- Added `src/concierge/graphCheckpointer.mjs` with memory and file-backed saver modes; the file-backed mode round-trips LangGraph serialized checkpoint bytes and proves durable resume in tests.
- Added `plan_journey` as a real graph node before skill resolution, carrying the selected workflow, bounded steps, missing evidence, graceful-degradation contract, and HITL requirements.
- Added native LangGraph approval pause/resume: `evidenceObservationNode` emits approval-waiting state, the conditional edge routes to `approval_pause`, and `approval_pause` calls `interrupt()` with the read-only approval contract payload.
- `runLangGraphOrchestration` detects pending approval interrupts and resumes with `Command({ resume: approvalToken, update: initialState })`; the approval token is still validated only by `consumeReadOnlyObservationApproval`.
- Removed `maybeModelNode`, removed the model-tier `maybe_model` step, and changed topology to `compose_response -> END`.
- Deleted `src/concierge/engine.mjs`; moved trace reads to `src/concierge/traceSession.mjs`; added `src/concierge/langgraphCompatibility.mjs` for old tests, delegating through LangGraph and explicit read-only approvals.
- Updated graph topology, LangGraph runner, approval-resume, live OpenAI, portal scan, runtime adapter, session manager, memory harness, and workflow tests for the graph-owned path.

Verification commands:
- `npm run build`
- `npm run test:local`
- `npm run test:graph:topology`
- `npm run test:execution:v2`
- API proof + visual proof

Verification result:
- Focused graph/HITL suite passed with 23/23 tests.
- `npm run build` passed.
- `npm run test:graph:topology` passed with 4/4 tests.
- `npm run test:local` passed with 267 tests total, 265 passing, 2 expected live-gated OpenClaw skips, and 0 failures.
- API proof artifact: `artifacts/phase55/native-hitl-api-proof.json`.
- Visual proof artifacts: `artifacts/phase55/native-hitl-mvp-proof.png`, `artifacts/phase55/native-hitl-mvp-proof.json`, `artifacts/phase55/native-hitl-mvp-facade-connected-proof.png`, and `artifacts/phase55/native-hitl-mvp-facade-connected-proof.json`.

What the user can try locally:
- Start a journey that needs read-only worker observation. Without a valid approval token, the graph pauses with `approval_interrupt.status = "interrupted"` and a checkpoint pending at `approval_pause`.
- Approve the generated OpenClaw proposal task, then resume with the approval token; the graph consumes the token once and captures source pointers through the normal evidence node.
- Open `/mvp?phase=phase-55-native-hitl` to verify the user-facing shell, run-state panel, OpenClaw panel, and FastAPI connector check.

Known risks or gaps:
- File-backed graph checkpoints can contain graph state and should remain in the private config path with 0600-style local permissions when enabled; production encrypted-at-rest policy remains a deployment hardening concern.
- Compatibility helper is test-oriented and auto-approves only fixture evidence to preserve old tests through the real graph approval contract.
