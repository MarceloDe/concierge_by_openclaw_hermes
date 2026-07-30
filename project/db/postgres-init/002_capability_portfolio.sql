-- Postgres-only performance/index layer for the capability/process portfolio.
-- The shared SCHEMA_SQL (src/concierge/schema.mjs) creates the tables in
-- SQLite-compatible dialect and survives both engines. These indexes are
-- Postgres-only (GIN / partial indexes) and are intentionally NOT in the shared
-- DDL. Safe to run repeatedly (IF NOT EXISTS).

-- On a brand-new Compose volume, the application schema does not exist during
-- docker-entrypoint initialization. Create these optional indexes only when the
-- owning runtime tables already exist (for example on an established volume).
-- The application migration path remains authoritative and creates the same
-- indexes after SCHEMA_SQL initializes a fresh database.
DO $$
BEGIN
  IF to_regclass('public.capabilities') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_capabilities_select
      ON capabilities (status, lifecycle_state, planner_score DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_capabilities_kind ON capabilities (kind)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_capabilities_planner_tags_gin
      ON capabilities USING GIN ((planner_tags_json::jsonb))';
  END IF;

  IF to_regclass('public.processes') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_processes_select
      ON processes (status, lifecycle_state, offerable, display_order)';
  END IF;

  IF to_regclass('public.workflow_checkpoint_runs') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_checkpoint_runs_run
      ON workflow_checkpoint_runs (workflow_run_id, step_order)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_checkpoint_runs_status
      ON workflow_checkpoint_runs (status)';
  END IF;

  IF to_regclass('public.capability_provenance') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_capability_provenance_cap
      ON capability_provenance (capability_id, created_at)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_capability_provenance_proc
      ON capability_provenance (process_id, created_at)';
  END IF;
END
$$;
