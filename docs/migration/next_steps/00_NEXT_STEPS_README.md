# Next Steps After The Orchestrator — Phases 50–52

The second migration wave, to run **after** Phases 47–49 (the reasoning-orchestrator-with-rails work in
`docs/migration/`) are merged and green. Same agent-agnostic, repo-native format. Same RALPH loop and
Cortex rules from `AGENTS.md`.

## /goals

1. **Make it pilot-safe (Phase 50, ADR-005):** parameterized SQL, egress enforced by default, PHI encrypted at rest + retention sweeper running.
2. **Make it extensible (Phase 51, ADR-006):** de-hardcode the skill system; multi-skill + community skills via the gateway; worker breadth inside the read-only approval envelope; procedural worker memory.
3. **Make it compound (Phase 52, ADR-007):** close the continuous-learning loop — reviewer-approved matured skills may drive answers, under the same evidence rails.

## Files

| File | Maps to | Purpose |
|---|---|---|
| `ADR-005-production-hardening.md` | `docs/adr/ADR-005-…md` | P0 hardening decision. |
| `ADR-006-extensible-skills-and-worker-breadth.md` | `docs/adr/ADR-006-…md` | Skill de-hardcode + worker breadth. |
| `ADR-007-closing-the-learning-loop.md` | `docs/adr/ADR-007-…md` | Trusted answer-driving promotion. |
| `IMPLEMENTATION_PLAN_phases_50-52.md` | append to `docs/IMPLEMENTATION_PLAN.md` | Per-module changes. |
| `ACCEPTANCE_CRITERIA_phases_50-52.md` | append to `docs/ACCEPTANCE_CRITERIA.md` | Acceptance + test map. |
| `PROGRESS_scaffold_phases_50-52.md` | append to `docs/PROGRESS.md` | Slice tracker to fill. |
| `cortex_notes_phases_50-52.md` | Cortex (private) | Drafted episodic + semantic update. |
| `CODEX_PROMPT_phases_50-52.md` | — | Short start prompt for the executing agent. |

## How to use

1. Confirm Phases 47–49 are merged and green. Do not start before that — these phases depend on the
   durable checkpointer (49) and the reasoning/degradation layer (47–48).
2. Run phases in order **50 → 51 → 52**. Phase 50 gates any external pilot. Phase 52 is the highest-risk
   change — ship it only with reviewer approval, citation rails, demotion path, and kill switch proven.
3. Follow the same loop as wave one: fresh branch per phase, safety suites stay green and unmodified,
   fill PROGRESS, land both the project PR and the Cortex PR before calling a phase done.

## The single rule that matters most

`productionDrivingAllowed` may flip to `true` in exactly one place: the Phase 52 `trusted_answer_driving`
path, after a human reviewer approves a matured skill. Everywhere else it stays `false`. Everything else in
these phases is hardening and extensibility around that gate.

## Cortex constraint

The Cortex repo is private and was not reachable from the environment that produced this package, so
`cortex_notes_phases_50-52.md` is a draft (commit paths/branch in its header). Commit it from a machine with
Cortex access, or ask for a live browser read to ground the `supersedes:` chain first.
