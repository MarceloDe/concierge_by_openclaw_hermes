# Codex Start Prompt — Orchestration Intelligence Migration (Phases 47–49)

You are implementing a planned architecture migration for `concierge_by_openclaw_hermes`. A founder-level
review concluded the runtime is deterministic-first with the LLM as an optional advisor, and we are moving it
to a **reasoning-orchestrator-with-rails** architecture: keep the safety rails deterministic, make the
reasoning LLM-primary, never dead-end a journey for missing evidence, and make human-in-the-loop a durable
native LangGraph interrupt. This is an **evolution, not a rewrite** — reuse the existing governance, PHI,
approval, audit, and evidence code, and keep all current tests as the safety net.

## Read these first, in this order (in `docs/migration/`)

1. `00_MIGRATION_SPEC_README.md` — overview, goals, and the execution process.
2. `ADR-004-reasoning-orchestrator-with-rails.md` — the decision and why.
3. `IMPLEMENTATION_PLAN_phases_47-49.md` — the exact per-module, per-function changes.
4. `ACCEPTANCE_CRITERIA_phases_47-49.md` — what "done" means + the test-to-invariant map.
5. `PROGRESS_scaffold_phases_47-49.md` — fill this in as you go.
6. `cortex_episodic_note.md` and `cortex_semantic_supersede_note.md` — drafts to land on Cortex.

Then follow `AGENTS.md` as usual: pull `cortex/main` and read the semantic + latest episodic note before coding.

## What to do

- Implement **one phase at a time, in order: 47 → 48 → 49.** Do not start 48 until 47 is merged and green.
- Start each phase on a fresh branch: `git checkout -b phase-<N>-<slug> origin/main`.
- Make exactly the changes listed under that phase in the IMPLEMENTATION_PLAN — the file and function names
  there are real and current. Keep `describeBrainstyLangGraphTopology()` in sync with any edge change.
- After each slice run `npm run build` and `npm run test:local` plus the phase's focused suites and API/visual proof.

## Hard rules (do not violate)

- The **safety-invariant suites must stay green and unmodified**: `policy`, `phi`, `model-payload-policy`,
  `prompt-contracts`, `output-policy`, `approval-resume`, `execution-v2-write-approval`,
  `openclaw-worker-contract`, `egress`. If a change forces edits to these, STOP and ask — your design is wrong.
- Safety refusals stay hard deterministic stops (emergency → handoff, credential entry, medical advice,
  prompt injection, out-of-scope). Only **evidence-insufficiency** becomes graceful degradation.
- The approval token stays the authorization of record — single-use, time-boxed, bound, fail-closed on expiry.
- Scope is Phases 47–49 only. Do **not** start P0 hardening, worker-breadth, or the learning-loop work
  (Phases 50–52) — they are sequenced later.

## When a phase is done

Update `PROGRESS`, write the Cortex episodic note + semantic supersede (drafts provided), and open BOTH the
project PR and the Cortex PR. Per `AGENTS.md`, a phase is **not done** until the project commit lands on
`concierge_by_openclaw_hermes/main` AND the Cortex notes land on `cortex/main`. CI green is the merge gate.

## If anything is unclear

Ask concise questions before coding that area — do not guess and do not make architectural changes beyond
what ADR-004 and the plan specify.
