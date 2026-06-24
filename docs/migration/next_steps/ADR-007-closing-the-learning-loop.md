# ADR-007: Closing The Continuous-Learning Loop

Date: 2026-06-21

## Status

Proposed. Sequenced last (after ADR-005, ADR-006). Promotes the existing shadow PEMS machinery to actually improve answers — behind reviewer approval. Realizes the direction in `docs/CONTINUOUS_LEARNING_PROCEDURAL_MEMORY_PROPOSAL.md`.

## Context

Continuous learning is **built but inert**: `continuousIntelligence.mjs` runs a `case_state_shadow` node every turn, scores PEMS candidate maturity (`scorePemsMaturity`, `PEMS_TRUST_THRESHOLD=85`), and has a full reviewer/evaluator workbench — but every record stamps `productionDrivingAllowed=false`, and the promotion gate (`evaluatePemsPromotionGate`) caps at `supervised_advisory_allowed`. Nothing a candidate learns ever changes a user-facing answer. The founder wants the loop closed: a worker's successful procedure (ADR-006) and a resolved case should be able to mature into a reusable skill that — once a human reviewer approves it — makes the next user's answer better and cheaper to produce. This is the data moat.

## Decision

Close the loop, gated by humans and the same evidence rails:

1. **A trusted, answer-driving status.** Add a `trusted_answer_driving` promotion status above `supervised_advisory_allowed`, reachable only when ALL hold: PEMS maturity ≥ threshold, ≥ the required reviewer approvals (`recordPemsPromotionReview`), citation-closure passed, and zero safety incidents. Only then may a matured skill influence an answer.
2. **Reconstruct-not-retrieve at inference (G6).** For a trusted skill, assemble a per-scenario sub-workflow from procedural skill fragments (the proposal's Cue→Tag→Content), pruned by the validation gate — defeating the member×plan×provider×procedure combinatorial explosion.
3. **Two-stream candidate generation.** Path A induces candidate skills from resolved cases (incl. worker procedural memory, ADR-006); Path B is a nightly external-research change-detector (SBC/SPD/formulary/prior-auth/appeals) on the existing approved-scheduler daemon. Both write *candidates* only; both must clear the same promotion gate.
4. **Layered memory namespacing.** Adopt the proposal's Graphiti namespaces (`semantic:plan`, `episodic:member` [PHI-masked, user-scoped], `procedural:skills` [user-agnostic], `collective:patterns`) so a skill matured from one user is reusable for another **without leaking any private episode**.

## Consequences

- Turns the inert shadow loop into a compounding moat; a trusted skill lowers cost-to-serve and raises answer quality on the long tail of exceptions.
- This is the highest-risk change in the program: a skill now affects real answers. Mitigations are mandatory and non-negotiable — human reviewer approval before any skill drives an answer, the same `validateSourcedAnswer` evidence/citation rails on every driven answer, graceful-degradation labeling for anything unverified (ADR-004), and an instant kill switch + demotion path on any safety incident.
- Procedural skills are user-agnostic by construction; episodic memory stays user-scoped and PHI-masked — the namespacing is the privacy boundary.
- Operationally adds the nightly job and a larger reviewer workload; the workbench already exists to absorb it.

## Verification

`npm run test:local` (continuous-intelligence + PEMS suites), new tests proving: a candidate cannot reach `trusted_answer_driving` without all gates; a trusted skill's driven answer still passes `validateSourcedAnswer`; a safety incident demotes and kill-switches; episodic memory never crosses users. API + visual proof per non-mocked proof rules. `productionDrivingAllowed` may flip to true ONLY on the `trusted_answer_driving` path and nowhere else.
