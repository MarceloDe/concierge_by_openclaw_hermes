# Migration Spec — Reasoning Orchestrator With Rails

An **agent-agnostic**, repo-native migration package to move `concierge_by_openclaw_hermes` from a
deterministic-first runtime to a reasoning-orchestrator-with-rails architecture — without a rewrite.
Any executing agent (Codex, Claude Code, Cursor, …) runs this the same way, because the repo is already
governed agent-agnostically by `AGENTS.md` + Cortex.

## /goals

1. Make the LLM the **primary reasoner** for understanding, planning, and composition — keep the rails deterministic.
2. **Never dead-end a journey** for missing evidence: best-effort answer + AI2UI tiered offer; clarify, don't block.
3. Make human-in-the-loop a **durable, native** LangGraph `interrupt()`/`Command` — not a simulated state flag.
4. Preserve every safety guarantee: PHI masking, audit, approval-token binding, worker read-only, refusals — **zero regression**.
5. Land it incrementally, **CI green as the merge gate**, with Cortex notes before any phase is "done".

## What's in this package

| File | Maps to repo location | Purpose |
|---|---|---|
| `ADR-004-reasoning-orchestrator-with-rails.md` | `docs/adr/ADR-004-…md` | The decision, alternatives, consequences, verification. |
| `IMPLEMENTATION_PLAN_phases_47-49.md` | append to `docs/IMPLEMENTATION_PLAN.md` | Per-module, per-function changes across 3 slices. |
| `ACCEPTANCE_CRITERIA_phases_47-49.md` | append to `docs/ACCEPTANCE_CRITERIA.md` | Acceptance + the test-to-invariant map. |
| `PROGRESS_scaffold_phases_47-49.md` | append to `docs/PROGRESS.md` | Pre-filled slice tracker to complete during execution. |
| `cortex_episodic_note.md` | Cortex `episodic/2026/06/…` (private) | Drafted episodic note to commit. |
| `cortex_semantic_supersede_note.md` | Cortex `semantic/projects/…` (private) | Drafted semantic-note update to merge. |

## The change in one paragraph

Two layers, hard boundary. **Rails stay deterministic forever** (PHI masking, hash-chained audit,
approval-token binding, schema/allow-list validation, the evidence model, and safety refusals). **Reasoning
becomes LLM-primary, rails-bounded** (intent, planning under uncertainty, semantic substitution, composition,
worker). Concretely: invert the `useLiveModel` default and make the curated classifier the *fallback*
(Phase 47); convert every evidence-insufficiency `blocked_*` outcome into a `best_effort_degraded` answer with
a verify / let-me-check / more-info AI2UI offer (Phase 48); replace the faux-linear graph + simulated approval
with real conditional edges, a planner, and native `interrupt()`/`Command` over a durable checkpointer (Phase 49).

## Execution process (RALPH loop, per AGENTS.md)

For each phase, in order, on a fresh branch `git checkout -b phase-<N>-<slug> origin/main`:

1. **Read first.** Pull `cortex/main`; read the semantic note + latest episodic note; read this package's ADR + plan.
2. **Requirements/Architecture.** Confirm the slice scope against ADR-004; no new architectural rewrite.
3. **Loop.** Implement one slice (the files listed in the plan), UI/API → graph logic → persistence/tests.
4. **Prove.** Run `npm run build` + `npm run test:local` + the slice's focused suites + API/visual proof.
   The **safety-invariant suites must stay green and unmodified** (see ACCEPTANCE_CRITERIA).
5. **Harden.** Refactor, then update `describeBrainstyLangGraphTopology()` and the changed tests.
6. **Record.** Fill `PROGRESS`; write the Cortex episodic note + semantic supersede; open the project PR
   AND the Cortex PR. A phase is **not done** until both land (`concierge_by_openclaw_hermes/main` + `cortex/main`).

Recommended order: **Phase 47 → 48 → 49.** 47 unlocks intelligence, 48 delivers the visible UX win
(graceful degradation), 49 makes pause/resume durable. P0 hardening (Phase 50), worker breadth (51), and
closing the learning loop (52) are sequenced after and referenced in the plan.

## Codex vs Claude Code

The spec is identical for either — that's the point. Keep your current executor unless cost/workflow
argues otherwise; the Cortex handoff contract makes switching clean if you ever want to. Whichever runs it,
point it at this package + `cortex/main` and follow the RALPH loop above.

## One constraint to action

The **Cortex repo is private** and was not reachable from the environment that produced this package, so the
two Cortex notes here are **drafts**. Commit them from a machine/agent with Cortex access (paths and branch
names are in each file's header comment), or ask me to read Cortex live through a logged-in browser so I can
ground the semantic `supersedes:` reference against the actual latest note before you commit.
