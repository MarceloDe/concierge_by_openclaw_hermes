# Codex Start Prompt — Next Steps (Phases 50–52)

The orchestration-intelligence migration (Phases 47–49) is merged and green. You are now implementing the
next wave: harden the system for a pilot, make the skill/worker layer extensible, and close the
continuous-learning loop. Same architecture (reasoning-orchestrator-with-rails) — keep all safety rails
deterministic and unchanged. Evolution, not rewrite.

## Read first, in this order (in `docs/migration/next_steps/`)

1. `00_NEXT_STEPS_README.md` — goals and how to run this wave.
2. `ADR-005-production-hardening.md`, `ADR-006-extensible-skills-and-worker-breadth.md`, `ADR-007-closing-the-learning-loop.md`.
3. `IMPLEMENTATION_PLAN_phases_50-52.md` — the exact per-module changes.
4. `ACCEPTANCE_CRITERIA_phases_50-52.md` — what "done" means + the test map.
5. `PROGRESS_scaffold_phases_50-52.md` — fill as you go.
6. `cortex_notes_phases_50-52.md` — drafts to land on Cortex.

Then follow `AGENTS.md`: pull `cortex/main`, read the semantic + latest episodic note before coding.

## What to do

- Only start after Phases 47–49 are merged and green.
- Implement **one phase at a time, in order: 50 → 51 → 52.** Phase 50 must precede any external pilot.
- Fresh branch per phase: `git checkout -b phase-<N>-<slug> origin/main`. Make exactly the changes listed
  under that phase in the IMPLEMENTATION_PLAN; re-confirm file/function names against the current tree first.
- After each slice: `npm run build`, `npm run test:local`, plus the phase's focused suites and API/visual proof.

## Hard rules (do not violate)

- Safety-rail suites stay green and **unmodified**: `policy`, `phi`, `model-payload-policy`, `prompt-contracts`,
  `output-policy`, `approval-resume`, `execution-v2-write-approval`, `openclaw-worker-contract`,
  `openclaw-skill-registry`, `egress`, `db-safety`, `postgres-production-readiness-contract`. If a change forces
  edits to these, STOP and ask.
- The worker stays read-only and approval-gated; widening breadth (Phase 51) must not widen the blocked-action
  matrix or the envelope.
- `productionDrivingAllowed` may become `true` in exactly one place: the Phase 52 `trusted_answer_driving` path,
  after human reviewer approval. Nowhere else.
- Phase 52 is highest-risk — ship only with reviewer-approval gate, citation rails, demotion path, and kill
  switch all proven by tests.

## When a phase is done

Fill `PROGRESS`, write the Cortex episodic + semantic update (drafts provided), open BOTH the project PR and
the Cortex PR. Per `AGENTS.md`, a phase is not done until both land on their `main`. CI green is the merge gate.

## If anything is unclear

Ask concise questions before coding that area. Do not make architectural changes beyond what the ADRs and the
plan specify.
