# Acceptance Criteria — Phases 50–52 (Next Steps)

Status: Second migration track (ADR-005/006/007). Additive to `docs/ACCEPTANCE_CRITERIA.md`. Runs after Phases 47–49.

Last updated: 2026-06-21

Governing rule (unchanged from the orchestrator track): **safety-rail suites stay green and unmodified; the suites tied to the area under change are updated alongside the code; new behavior gets new suites.** Phase 52 is the one place `productionDrivingAllowed` may flip true — and only on the trusted, reviewer-approved path.

## Safety invariants that MUST stay green every phase

`policy`, `phi`, `model-payload-policy`, `prompt-contracts`, `output-policy`, `approval-resume`,
`execution-v2-write-approval`, `openclaw-worker-contract`, `openclaw-skill-registry`, `egress`,
`db-safety`, `postgres-production-readiness-contract`.

## Phase 50: P0 Production Hardening

Phase 50 is acceptable when:

- No SQL is constructed by string interpolation anywhere; all queries are bound-parameter; a SQL-injection attempt in any user-supplied field is inert (proven by `db-safety` + the Postgres readiness contract).
- `outboundPayloadObservability` defaults to `enforced`; an outbound payload containing an unmasked direct identifier is blocked, not merely observed (proven by `egress` / `outbound-payload-policy-enforcement`).
- PHI columns (`eligibility_snapshots.raw_text`, `claim_items.member_name`, …) and durable graph-checkpoint state are encrypted at rest; the retention sweeper runs on schedule and tombstones expired rows (proven by `retention` + a scheduled-run proof).
- `npm run build`, `npm run test:local`, `npm run test:db:safety`, `npm run test:phi`, `npm run test:egress`, `npm run test:retention`, API + visual proof pass with no safety suite modified.

## Phase 51: Extensible Skills And Worker Breadth

Phase 51 is acceptable when:

- A second execution skill is added by dropping a `SKILL.md` + `skill.json` folder, with zero edits to the validator, selector, or runtime; both skills are selectable by match score (new multi-skill test).
- The generic artifact validator rejects any skill declaring a blocked capability (credentials, write/submit/send/pay, external messaging, non-local OCR, instructions-from-page); the blocked-action matrix and `workerMayChooseWorkflow=false` are unchanged.
- A successful worker task writes a masked, source-pointered procedural-memory record (`cortexProductMemory=false`); none of it drives a user answer yet (new worker-memory contract test).
- `npm run test:openclaw:skills`, `npm run build`, `npm run test:local`, API + visual proof pass; safety suites unchanged.

## Phase 52: Close The Continuous-Learning Loop

Phase 52 is acceptable when:

- A candidate cannot reach `trusted_answer_driving` unless maturity ≥ threshold AND required reviewer approvals AND citation-closure passed AND zero safety incidents; below the bar it stays advisory.
- A trusted skill's driven answer still passes `validateSourcedAnswer` and labels unverified items (graceful degradation rails intact).
- A safety incident auto-demotes the implicated skill and the kill switch demotes all trusted skills instantly (new tests).
- Episodic memory never crosses users; procedural skills carry no user-scoped data (privacy test).
- `productionDrivingAllowed=true` appears only on the trusted path (grep-asserted across helpers, DB rows, score objects, API proofs).
- `npm run build`, `npm run test:local`, API + visual proof pass; safety suites unchanged.

## Traceability (quick map)

| Concern | Guarded by | Phase |
|---|---|---|
| Parameterized SQL / injection | `db-safety`, `postgres-production-readiness-contract` | 50 |
| Egress enforced | `egress`, `outbound-payload-policy-enforcement` | 50 |
| PHI at rest + retention | `phi`, `retention` | 50 |
| Multi-skill, de-hardcode | `openclaw-skill-registry`, new multi-skill test | 51 |
| Worker envelope unchanged | `openclaw-worker-contract` | 51 (must stay green) |
| Worker procedural memory | new worker-memory contract test | 51 |
| Trusted promotion gate | `continuous-intelligence`, `pems-promotion-gates`, new trusted-path test | 52 |
| Driven-answer still cited | `intelligence-contracts`, `graceful-degradation` | 52 |
| Cross-user privacy | new privacy test | 52 |
