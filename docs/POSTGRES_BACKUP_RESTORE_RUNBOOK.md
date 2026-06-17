# Postgres Backup And Restore Runbook

Purpose:
- Provide the operator procedure for hosted Postgres backup scheduling, restore rehearsal, and incident recovery for the Brainstyworkers server connector.
- Keep this runbook provider-neutral while preserving concrete acceptance gates for Neon, Supabase, Prisma Postgres, or a self-managed Postgres target.

Scope:
- Applies to the public connector stack where FastAPI is the public API, Node is the internal LangGraph/OpenClaw runtime, and Postgres is the application state database.
- Does not authorize payer contact, external messages, record changes, form submission, or credential handling.

## Required Inputs

- Secret source: `BRAINSTY_DATABASE_URL_FILE` or managed environment injection with `BRAINSTY_DATABASE_SECRET_SOURCE=managed_env`.
- Restore target: isolated restore database or provider-created branch/clone.
- Smoke command: `npm run storage:postgres:backup-runbook-smoke`.
- Production readiness command: `npm run storage:postgres:production-smoke`.
- Default rollout command: `npm run storage:postgres:default-rollout-smoke`.
- Endpoint regression command: `npm run storage:postgres:endpoint-regression-smoke`.

## Backup Schedule

- Continuous provider backups, point-in-time recovery, or WAL retention must be enabled before production traffic.
- Minimum backup cadence for providers without PITR: daily full backup plus WAL or incremental backups where available.
- RPO target: 24 hours for the MVP connector profile, tightened before real production PHI traffic.
- RTO target: 4 hours for the MVP connector profile, tightened before real production PHI traffic.
- Backups must be encrypted at rest by the provider or storage layer.

## Restore Rehearsal

1. Create an isolated restore target.
2. Restore from the latest backup or clone/branch.
3. Run schema initialization or migration replay only if the provider restore does not preserve schema.
4. Run application smoke checks against the restore target:
   - health;
   - session checkpoint read;
   - audit event read;
   - approval gate read;
   - worker lease read;
   - endpoint regression in read-only/proposal-only mode.
5. Confirm the restore target does not contain raw secrets in logs or artifacts.
6. Destroy the isolated restore target after proof unless an incident commander asks to preserve it.

## Incident Restore

1. Freeze write traffic or route users to maintenance mode.
2. Capture the incident timestamp, suspected data-loss window, and latest known-good backup.
3. Restore to an isolated target first.
4. Run the restore rehearsal checks.
5. Promote the restore target only after operator approval.
6. Rotate database credentials if compromise is suspected.
7. Record an audit note and attach smoke artifacts to the incident record.

## Migration Rollback

- Keep SQLite local development as a safe fallback only; do not use it as a production rollback database.
- For production Postgres migrations, create a provider snapshot/branch before migration.
- Run `npm run storage:postgres:endpoint-regression-smoke` after migration.
- If regression fails, restore the pre-migration target or promote the provider branch after explicit operator approval.

## Acceptance Gate

The runbook is accepted when:

- `npm run storage:postgres:backup-runbook-smoke` validates this document.
- The smoke proves a logical restore rehearsal through the existing production-readiness smoke.
- The smoke artifact redacts database URLs and secret paths.
- Dashboard proof exposes `postgres_backup_runbook`.
- The temporary restore databases are cleaned up.

## Safety Notes

- Do not print raw database URLs, passwords, or secret-file paths in logs.
- Do not seed real PHI into backup rehearsal data.
- Do not run destructive restore or promotion against production without explicit operator approval.
- Keep all OpenClaw/browser/external actions proposal-only unless a separate approval contract exists.
