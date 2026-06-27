# Non-Deterministic Orchestrator Overhaul — Plan & Goals

Owner: CTO (Claude) coordinating coders. Mandate from founder 2026-06-27.
Execution style: Ralph `/loop` — one phase per iteration, each phase Requirements → Architecture → Build → Prove (no mocks) → Harden (multiagent review) → Commit to `main`.
Hard rule: never break the already-working app. Every phase must keep all gate suites green before commit.

## Founder intent (verbatim distillation)

For chat questions the system must ALWAYS make ONE top-tier LLM orchestration call equipped with: all available prior context, the entire system capability definition, and the current orchestrator graph workflow possibilities + decision points — including every worker capability (remote browser, all OpenClaw skills), user journeys, tools, and AI2UI actions. There is no deterministic way to treat all possible chat questions, so chat routing must be non-deterministic (LLM-decided). Determinism is allowed ONLY for: (a) workflow selection behind explicit frontend UI buttons, (b) the AI2UI interface the model itself emits, (c) safety/PHI/credential blocking, (d) parsing structured tool/LLM output. Erase all regex/keyword/static-sentence chat routing and all mocked decision flows that branch on sentences/chats. Add a desired structured response schema mapped to the graph decision points so the deterministic harness can speed execution. Keep latency low, keep the prompt editable via PEMS and structured. Make the system truly stateful (LangGraph + OpenClaw integrated, Redis pointers as the session/intersession context builder, Zep/Graphiti as continuous learning). Tests must use real DB/context and random lay-person questions — never mock DB, context, or user sentences. Verify LLM calls and PEMS visibility in Langfuse; add Langfuse checkpoints for visual debugging.

## Alignment with prior audit

Fully aligned. The phase 76–82 audit found exactly the leaks this mandate forbids: confidence-gated LLM decision (`shouldUseLlmDecision` ≥0.5), missing-key skip to keyword classifier, regex routers (`structuredIntentClassifier`, `classifier`, `structuredIntentReasoner`), silent ELIGIBILITY default, canned non-LLM responses, keyword healthcare gate, write-only Redis pointers (never read back), Graphiti write-gated off. The strong asset to preserve: the real LangGraph checkpointer (interrupt/resume works).

## Environment ground truth (2026-06-27)

- Redis: running + reachable (`PONG`, :6379) but app never connects (`BRAINSTY_REDIS_URL` unset).
- FalkorDB/Graphiti: up (:6380); adapter=graphiti; writes gated by `BRAINSTY_PRODUCT_MEMORY_PHI_CLEARED` (unset).
- DB: SQLite default (no `DATABASE_URL`); user data persists today.
- Servers up: userapp :4226, facade :8000, Steel :3000, Langfuse :3100.
- `capabilityPortfolio.mjs` already inventories workflows + tools + OpenClaw skills (+ hydrate payload + pointers) — foundation exists, just under-fed to the model and never dereferenced.

## /goals

- G1 — Chat = ONE top-tier LLM orchestration call, always, equipped with full prior context + full capability portfolio + current graph possibilities/decision points.
- G2 — Zero regex/keyword/static-sentence chat routing and zero mocked chat decision flows. Determinism only behind UI buttons, AI2UI, safety/PHI, and structured parsing.
- G3 — Healthcare domain gate flexibilized to accept all insurance terminology in chat (no hard keyword block of free text; scope decided by the LLM, hard safety blocks retained).
- G4 — Truly stateful: LangGraph checkpointer (keep) + OpenClaw integrated + Redis pointer context read back across turns AND sessions + Zep/Graphiti continuous learning wired in.
- G5 — Low latency: single top-tier call, prompt caching, compact pointer context, structured output mapped to graph decision points so the deterministic harness short-circuits work.
- G6 — Prompt editable via PEMS, structured; full Langfuse visibility (PEMS prompt + orchestration generation as checkpoints).
- G7 — Tests use real DB + real context + real LLM with randomly generated lay-person questions; no mocks of DB, context, or user sentences.
- G8 — Never break the working app; each phase green-gated and committed to `main`.

## Ralph phases (each: build → prove no-mocks → multiagent harden → commit main)

- Phase 0 — Safety net & observability, no behavior change. Add real-store characterization tests (random lay questions) capturing current behavior; add Langfuse checkpoints around context build, capability portfolio, orchestration decision, PEMS render; turn Redis ON (`BRAINSTY_REDIS_URL` → local) with loud startup readiness for redis/graphiti/db. Gate green.
- Phase 1 — LLM-always chat routing. `llmOrchestrationDecisionNode` always calls top-tier LLM for free-text; remove the `shouldUseLlmDecision` confidence override and the missing-key→keyword skip; LLM decision is authoritative; low confidence ⇒ LLM-authored clarify turn (`userFacingNextQuestion`), never regex. Behind flag `BRAINSTY_ORCHESTRATOR_LLM_ALWAYS` until proven, then default on.
- Phase 2 — Erase deterministic chat routers + mocked chat flows. Remove `structuredIntentClassifier`/`classifier`/`structuredIntentReasoner` as routers (keep at most as non-authoritative hints or delete); remove silent ELIGIBILITY default; remove canned non-LLM chat responses except safety refusals. UI-button intent path stays deterministic.
- Phase 3 — Flexibilize healthcare policy for chat. `policy.mjs` stops hard-blocking chat lacking exact keywords; expand insurance vocabulary / replace keyword gate with LLM scope classification; retain hard credential/medical-advice/injection blocks.
- Phase 4 — Full capability portfolio + graph decision-point map in the LLM call, and implement pointer dereference/hydration in the execution path (the missing half). Adapt the portfolio/graph schema + manager as needed (innovative) to be a consolidated problem-solving "portfolio graph" incl. worker skills, journeys, tools, remote browser, AI2UI.
- Phase 5 — Redis pointer context builder. Make Redis primary (memory fallback only when no redis), store AND read back manifests/pointers across turns and across sessions (intersession); merge prior `achievedCheckpoints` instead of rebuilding; make absence loud.
- Phase 6 — Zep/Graphiti continuous learning. Decide/operate the PHI gate for local MVP, wire recall + retain into the orchestrator context, verify user data ingests.
- Phase 7 — Structured output → deterministic speedup + PEMS + latency. Define the structured decision schema mapped to graph decision points so the harness executes deterministically/fast; move the orchestration prompt into PEMS (editable, versioned); tune tier/caching for latency.
- Phase 8 — Non-mocked test harness + multiagent best-practice review + Langfuse PEMS verification. Random lay-question generator → real orchestrator (real DB/context/LLM) → assert: LLM called, no regex routing reached, PEMS prompt visible in Langfuse, structured decision produced, app still green.

## Guardrails (do not break the app)

- Feature flags wrap risky behavior; old path stays until the new path is proven green.
- Per-phase gate (must all pass before commit): `npm run build`, `test:local`, `test:policy`, `test:phi`, `test:egress`, `test:prompt-contracts`, `test:observability`.
- Multiagent workflow review at the end of each phase (best-practice + adversarial regression check).
- Commit to `main` per phase; Cortex episodic + semantic mirrored to vault `main` per phase.
</content>
