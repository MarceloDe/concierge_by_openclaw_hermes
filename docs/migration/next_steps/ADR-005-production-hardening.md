# ADR-005: Production Hardening (P0 Before External Pilot)

Date: 2026-06-21

## Status

Proposed. Sequenced after Phases 47–49 (ADR-004). Builds on ADR-001 (HIPAA substrate). These are correctness/security fixes the 2026-06-11 senior review named as the P0 list before any external user touches the system.

## Context

Independent review found three highest-severity liabilities in the current runtime:

- **Data layer builds SQL by string interpolation** through a shelled-out `sqlite3` CLI (`database.mjs` / the `sql()` helper) — injection surface and subprocess fragility.
- **Outbound egress enforcement defaults to `observe_only`** (`outboundPayloadObservability.mjs`) — a developer can bypass the payload blocker; masking is "load-bearing but advisory" in the default mode.
- **PHI is stored unencrypted at rest** (`eligibility_snapshots.raw_text`, `claim_items.member_name`); `retentionPolicy` has tombstone columns and `sweepExpiredRuntimeState`, but **no scheduled job runs it**.

Phase 49 adds a durable graph checkpointer, which makes "PHI at rest" non-optional: graph state must be encrypted and swept too.

## Decision

Land the P0 hardening as a dedicated phase before any pilot:

1. **Parameterized data layer.** Replace string-interpolated SQL + shelled-out `sqlite3` with bound parameters via an in-process driver (`better-sqlite3` or `node:sqlite` locally; the Postgres path uses parameterized queries). Keep the `store` interface stable so callers don't change.
2. **Egress enforced by default.** Flip `outboundPayloadObservability` default from `observe_only` to `enforced`; a real outbound payload that contains an unmasked direct identifier is blocked, not just observed. Keep an explicit, audited override for tests only.
3. **PHI encrypted at rest + retention sweeper running.** Encrypt PHI columns (and durable checkpoint state) at rest; run `sweepExpiredRuntimeState` on the existing approved-scheduler daemon so `valid_until_at` tombstoning actually happens.

## Consequences

- Removes the injection and bypass risks that block a HIPAA-credible pilot; turns existing-but-dormant safety mechanisms (masking, retention) into enforced guarantees.
- Touches the data layer broadly but behind a stable `store` interface; the `db-safety` and `postgres-*` suites are the regression guard and must stay green.
- Encryption adds key-management as an operational dependency (coordinate with ADR-001 substrate).
- Slight write-path latency from encryption; acceptable for the data volumes involved.

## Verification

`npm run test:db:safety`, `npm run test:phi`, `npm run test:egress`, `npm run test:retention`, `npm run build`, `npm run test:local`, plus the Postgres production-readiness contract test. No safety suite may need modification to pass.
