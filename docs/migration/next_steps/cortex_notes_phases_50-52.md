<!--
COMMIT TARGETS (Cortex repo, private):
  EPISODIC: episodic/2026/<MM>/<DATE>--<agent>--workerprototype-openclaw--next-steps-hardening-skills-learning-loop.md
  SEMANTIC: merge the "Next steps direction" section into
            semantic/projects/workerprototype-openclaw-late-implementation-architecture.md
  BRANCH:   memory/<agent>/<DATE>
Per AGENTS.md: open a Cortex PR; a phase is not done until both the project commit and the Cortex
notes land on main. Update <DATE> to the actual completion date of each phase (these come after 47–49).
This is a DRAFT prepared in advance; commit from a machine with Cortex access.
-->

# Episodic — Next Steps After The Orchestrator (Phases 50–52)

Date: <fill when 47–49 complete>
Agent: <agent>
Project: workerprototype-openclaw
Type: architecture-direction / production-readiness + learning-loop

## What this covers

The orchestration-intelligence track (Phases 47–49, ADR-004) is done. These are the next three phases,
recorded as ADR-005/006/007:
- Phase 50 (ADR-005) — P0 hardening: parameterized SQL, egress enforced by default, PHI encrypted at
  rest + retention sweeper running. Gates any external pilot.
- Phase 51 (ADR-006) — extensible skills (de-hardcode off `insurance_portal_browser`) + worker breadth
  within the read-only approval envelope + procedural worker memory feeding PEMS.
- Phase 52 (ADR-007) — close the continuous-learning loop: a reviewer-approved matured PEMS skill may
  drive answers (`trusted_answer_driving`), reconstruct-not-retrieve at inference, two-stream candidate
  generation, privacy-preserving Graphiti namespacing.

## Key invariants carried forward

- Safety rails unchanged: refusals, PHI masking, approval-token binding, worker read-only envelope,
  evidence/citation on every answer (incl. driven answers in Phase 52).
- `productionDrivingAllowed` may flip true ONLY on the Phase 52 trusted, reviewer-approved path.
- Episodic memory stays user-scoped + PHI-masked; procedural skills are user-agnostic (privacy boundary).

## Order and gating

50 → 51 → 52, after 47–49. Phase 50 precedes any pilot. Phase 52 is the highest-risk change and ships
only with reviewer approval, citation rails, demotion path, and kill switch all proven.

## Open questions for future agents

- Encryption key management vs ADR-001 substrate.
- How aggressively Path B may write procedural (vs semantic) skills.
- Whether label-free confidence ranking is trustworthy enough to pre-rank candidates before reviewers.

## Supersedes

Extends the late-implementation-architecture semantic note with the production-readiness + closed-loop
direction. Does not change the reasoning-orchestrator-with-rails layer boundary from ADR-004.

---

# Semantic update (merge into late-implementation-architecture note)

## Next steps direction (Phases 50–52)

After the reasoning-orchestrator-with-rails layer (ADR-004), the project hardens for pilot and closes the
learning loop: parameterized data layer + enforced egress + PHI-at-rest/retention (ADR-005); registry-driven
multi-skill system + worker breadth inside the read-only approval envelope + procedural worker memory
(ADR-006); and a human-gated `trusted_answer_driving` PEMS promotion path that lets matured, reviewer-approved
skills drive answers under the same evidence rails, with privacy-preserving memory namespacing (ADR-007).
`productionDrivingAllowed` is true only on the trusted path. All ADR-001/002/003 + ADR-004 safety rails carry
forward unchanged.
