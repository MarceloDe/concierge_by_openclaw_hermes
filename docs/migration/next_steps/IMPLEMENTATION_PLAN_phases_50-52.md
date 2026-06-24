# Implementation Plan — Phases 50–52 (Next Steps After The Orchestrator)

Status: Second migration track. Runs only **after** Phases 47–49 (orchestration intelligence) are merged and green. Additive to `docs/IMPLEMENTATION_PLAN.md`.

Source of truth:
- `docs/migration/next_steps/ADR-005-production-hardening.md`
- `docs/migration/next_steps/ADR-006-extensible-skills-and-worker-breadth.md`
- `docs/migration/next_steps/ADR-007-closing-the-learning-loop.md`
- `AGENTS.md` + Cortex semantic note

Last updated: 2026-06-21

Order: **50 → 51 → 52.** Phase 50 (hardening) gates any external pilot and must precede the others.
Function/file names below are current as of the review. Re-confirm against the tree before editing
(Phases 47–49 will have touched `langgraphRunner.mjs` and added `graphCheckpointer.mjs`).

---

## Phase 50 - P0 Production Hardening

Goal:
- Close the three highest-severity liabilities before any external user: string-interpolated SQL, observe-only egress, and unencrypted PHI at rest with no retention sweep. Make existing-but-dormant safety mechanisms enforced.

Implementation plan:
- Parameterized data layer: replace the shelled-out `sqlite3` CLI + `sql()` string interpolation in `database.mjs` / `databaseFactory.mjs` with an in-process bound-parameter driver (`better-sqlite3` or `node:sqlite`); confirm `postgresStore.mjs` uses parameterized queries throughout. Keep the `store` interface and `schema.mjs` table shapes stable so callers are untouched.
- Enforce egress by default: in `outboundPayloadObservability.mjs`, change the default mode from `observe_only` to `enforced`; a payload failing `maskDirectIdentifiers` containment is rejected, not just recorded. Provide one explicit, audited test-only override env.
- Encrypt PHI at rest: encrypt `eligibility_snapshots.raw_text`, `claim_items.member_name`, and any PHI-bearing column (and the durable graph checkpoint state from Phase 49) using a managed key (coordinate with ADR-001 substrate). Decrypt only in-process behind the store interface.
- Run the retention sweeper: schedule `retentionPolicy.sweepExpiredRuntimeState` on the existing approved-scheduler daemon so `valid_until_at` tombstoning actually executes; audit each sweep.
- Remove remaining dead code surfaced during 47–49 (confirm `engine.mjs` already deleted in Phase 49).

Acceptance:
- No SQL is built by string interpolation; `db-safety` + `postgres-production-readiness-contract` suites pass with parameterized queries; a SQL-injection attempt in any user field is inert.
- Egress is `enforced` by default; an unmasked direct identifier in an outbound payload is blocked (proven by `egress` / `outbound-payload-policy-enforcement` suites).
- PHI columns + checkpoint state are encrypted at rest; the retention sweeper runs on schedule and tombstones expired rows (proven by `retention` suite + a scheduled-run proof).
- `npm run build`, `npm run test:local`, `npm run test:db:safety`, `npm run test:phi`, `npm run test:egress`, `npm run test:retention`, API + visual proof pass.

---

## Phase 51 - Extensible Skills And Worker Breadth

Goal:
- De-hardcode the skill system off `insurance_portal_browser`; let multiple skills (incl. community skills via the gateway) coexist and be selected by match score; give the worker breadth within the approved read-only envelope; persist successful worker procedures to a worker-memory store that feeds PEMS.

Implementation plan:
- De-hardcode (three sites): make `openclawSkillArtifacts.validateOpenClawSkillArtifact` validate any skill against a generic contract (not the `insurance_portal_browser` literal); make `dynamicSkillServer.selectByKind` choose the execution skill purely by match score (no hardcoded default key); remove the hardcoded default in `openclawOfficialRuntime`. Adding a skill = drop a `SKILL.md` + `skill.json` folder that passes the generic validator.
- Generic artifact validator hardening: the validator must reject any skill declaring a blocked capability (credentials, write/submit/send/pay, external messaging, non-local OCR, treating page text as instructions). A community skill cannot widen the envelope.
- Worker breadth: extend `openclawWorkerContract` / `executorRegistry` / `gatewayClient` so an approved task may decompose, spawn task-scoped subagents, select among tools/community skills, and use the gateway — all still gated by `workerPolicy` blocked-actions and the read-only/approval envelope (`workerMayChooseWorkflow=false`, no credentials, no write without a bound token).
- Procedural worker memory: add `src/concierge/workerMemory.mjs` persisting successful procedure traces (tool/skill sequence → sourced result), masked + source-pointered, `cortexProductMemory=false`. Emit these as PEMS candidates (consumed in Phase 52). No answer-driving here.

Acceptance:
- A second execution skill can be added by dropping a folder, with no edits to the validator, selector, or runtime; both skills are selectable by match score (proven by a new multi-skill test).
- The generic validator rejects a skill that declares any blocked capability; the blocked-action matrix and `workerMayChooseWorkflow=false` are unchanged (existing `openclaw-worker-contract` / `openclaw-skill-registry` safety assertions stay green).
- A successful worker task writes a masked procedural-memory record (new worker-memory contract test); nothing it writes drives a user answer yet.
- `npm run test:openclaw:skills`, `npm run build`, `npm run test:local`, API + visual proof pass.

---

## Phase 52 - Close The Continuous-Learning Loop

Goal:
- Let a matured, reviewer-approved PEMS skill actually drive answers — behind human approval and the same evidence rails. Add candidate generation (resolved cases + nightly external research), reconstruct-not-retrieve at inference, and privacy-preserving memory namespacing.

Implementation plan:
- Trusted status: in `continuousIntelligence.mjs`, add a `trusted_answer_driving` status above `supervised_advisory_allowed` in `evaluatePemsPromotionGate`, reachable only when maturity ≥ `PEMS_TRUST_THRESHOLD`, required reviewer approvals present (`recordPemsPromotionReview`), citation-closure passed, and zero safety incidents. `productionDrivingAllowed` may become true ONLY on this path.
- Inference use (G6): when a trusted skill matches, assemble a per-scenario sub-workflow from procedural skill fragments (Cue→Tag→Content), pruned by the validation gate; the resulting answer still passes `validateSourcedAnswer` and uses graceful-degradation labeling (ADR-004) for anything unverified.
- Candidate generation: Path A induces candidates from resolved cases + worker procedural memory (Phase 51); Path B is a nightly external-research change-detector on the approved-scheduler daemon. Both write candidates only.
- Memory namespacing: adopt Graphiti namespaces `semantic:plan:<id>`, `episodic:member:<id>` (PHI-masked, user-scoped), `procedural:skills` (user-agnostic), `collective:patterns`. Procedural skills must contain no user-scoped data.
- Safety controls: a kill switch demotes all trusted skills instantly; any safety incident auto-demotes the implicated skill and audits it.

Acceptance:
- A candidate cannot reach `trusted_answer_driving` without every gate; below the bar it stays advisory (existing invariant preserved).
- A trusted skill's driven answer still passes `validateSourcedAnswer` and labels unverified items; a safety incident demotes + kill-switches it (new tests).
- Episodic memory never crosses users; procedural skills carry no user-scoped data (privacy test).
- `productionDrivingAllowed=true` appears only on the trusted path and nowhere else (grep-asserted).
- `npm run build`, `npm run test:local`, API + visual proof pass.
