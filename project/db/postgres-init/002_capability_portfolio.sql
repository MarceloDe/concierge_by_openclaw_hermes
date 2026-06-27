-- Postgres-only performance/index layer for the capability/process portfolio.
-- The shared SCHEMA_SQL (src/concierge/schema.mjs) creates the tables in
-- SQLite-compatible dialect and survives both engines. These indexes are
-- Postgres-only (GIN / partial indexes) and are intentionally NOT in the shared
-- DDL. Safe to run repeatedly (IF NOT EXISTS).

-- Planner selection predicate: only production/active capabilities are deliberated over.
CREATE INDEX IF NOT EXISTS idx_capabilities_select
  ON capabilities (status, lifecycle_state, planner_score DESC);
CREATE INDEX IF NOT EXISTS idx_capabilities_kind ON capabilities (kind);
CREATE INDEX IF NOT EXISTS idx_processes_select
  ON processes (status, lifecycle_state, offerable, display_order);

-- Resumable-run ledger access paths.
CREATE INDEX IF NOT EXISTS idx_checkpoint_runs_run
  ON workflow_checkpoint_runs (workflow_run_id, step_order);
CREATE INDEX IF NOT EXISTS idx_checkpoint_runs_status
  ON workflow_checkpoint_runs (status);

-- Provenance lineage lookups (append-only event log).
CREATE INDEX IF NOT EXISTS idx_capability_provenance_cap
  ON capability_provenance (capability_id, created_at);
CREATE INDEX IF NOT EXISTS idx_capability_provenance_proc
  ON capability_provenance (process_id, created_at);

-- JSONB GIN indexes for planner-tag / metadata querying (Postgres treats the
-- TEXT JSON columns as text; cast to jsonb at index time).
CREATE INDEX IF NOT EXISTS idx_capabilities_planner_tags_gin
  ON capabilities USING GIN ((planner_tags_json::jsonb));
