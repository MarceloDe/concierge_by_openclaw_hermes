<!--
COMMIT TARGET (Cortex repo, private):
  episodic/2026/06/2026-06-21--<agent>--workerprototype-openclaw--reasoning-orchestrator-with-rails-decision.md
BRANCH: memory/<agent>/2026-06-21
Per AGENTS.md: open a PR landing this on cortex/main; a phase is not done until both the
project commit (concierge_by_openclaw_hermes/main) AND the Cortex notes (cortex/main) land.
This file is a DRAFT prepared in the review package; commit it from a machine with Cortex access.
-->

# Episodic — Reasoning-Orchestrator-With-Rails Decision (Phases 47–49)

Date: 2026-06-21
Agent: <agent>
Project: workerprototype-openclaw
Type: architecture-direction / late-implementation-alignment

## What happened

A founder-level architecture review of the current runtime concluded that, by default, the
system behaves as a deterministic state machine with the LLM as an optional advisor:
- live model off unless `useLiveModel` + `OPENAI_API_KEY`; curated regex classifier is the real backbone;
- LLM workflow adopted only at `confidence >= 0.5`, else regex fallback;
- `maybeModelNode` output discarded; `composeResponseNode` sets the answer deterministically;
- evidence-insufficiency treated as a hard stop (`blocked_no_authenticated_evidence`, etc.);
- no `interrupt()`/`Command()`; approval pause/resume simulated via DB state + re-run; `MemorySaver` only.

This does not match the product intent (intelligence sized to complexity; never dead-end a journey
for missing evidence; durable human-in-the-loop). Decision recorded as ADR-004: adopt a
**reasoning-orchestrator-with-rails** architecture. Evolution, not rewrite — the governance/PHI/
approval/audit/evidence rails and the 60+ test suites are preserved as the safety net.

## Decision (summary)

Two layers with a hard boundary. Rails stay deterministic forever (PHI masking, hash-chained audit,
approval-token binding, schema/allow-list validation, safety refusals). Reasoning becomes LLM-primary,
rails-bounded (intent, planning under uncertainty, semantic substitution, composition, worker).

Three slices, "orchestration intelligence" first:
- Phase 47 — invert the intelligence default + model tiering (classifier / reasoner / planner; edge-SLM seam).
- Phase 48 — graceful degradation: never refuse for missing evidence; best-effort answer + AI2UI tiered offer
  (verify-myself / let-me-check-sandboxed-nothing-stored-you-provide-2FA / give-more-info); clarify, don't block.
- Phase 49 — real dynamic graph: conditional edges + planner + native `interrupt()`/`Command(resume)` +
  durable checkpointer; retire `maybe_model` and dead `engine.mjs`.

Sequenced after: Phase 50 P0 hardening, Phase 51 worker-envelope breadth + skill generalization,
Phase 52 close the continuous-learning loop (shadow → reviewer-approved answer-driving).

## Why (rationale kept for future agents)

- Founder intent: deterministic safety trail + LLM in every reasoning function as complexity warrants.
- Rewrite would discard the differentiated moat (governance) to rebuild commodity LLM orchestration and
  reset compliance hardening; senior review (2026-06-11) explicitly advised "fund hardening, do not rewrite".
- The gap is wiring + one real refactor (dynamic graph + interrupt), not foundations.

## Invariants that must not regress

`policy`, `phi`/`model-payload-policy`, `prompt-contracts`, `output-policy`, `approval-resume`,
`execution-v2-write-approval`, `openclaw-worker-contract`, `egress` suites stay green and unmodified.

## Follow-ups / open questions

- PHI-at-rest for durable checkpoints (coordinate Phase 49 ↔ Phase 50).
- Grounding discipline in degraded mode: confirm `validateSourcedAnswer` labels unverified items, never
  emits confident uncited claims in a clinical-adjacent context.
- Model-tier cost/latency budget; edge-SLM target for the classifier tier.

## Supersedes

Updates the semantic note `semantic/projects/workerprototype-openclaw-late-implementation-architecture.md`
with the reasoning-orchestrator-with-rails direction (see paired semantic update). Supersedes the implicit
deterministic-first posture from Phases 1–46 for the orchestration layer only; all safety rails carry forward.
