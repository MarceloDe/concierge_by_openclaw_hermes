// Step 1 proof (no mocks): the 5 capability/process portfolio tables exist on a
// fresh real store and their UNIQUE constraints reject real duplicate inserts.
// SQLite is the load-bearing default path; a Postgres variant runs when DATABASE_URL
// is set (skips cleanly otherwise).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, createId } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";

const PORTFOLIO_TABLES = ["capabilities", "processes", "process_steps", "workflow_checkpoint_runs", "capability_provenance"];

async function freshSqlite() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-portfolio-schema-"));
  return new SqliteStore(join(dir, "p.sqlite")).initialize();
}

function now() {
  return new Date(0).toISOString();
}

// Create a real parent workflow_runs row (FKs are enforced) and return its id.
async function freshRun(store, runId = createId("run")) {
  const { user, session } = await enrollDefaultMember(store);
  await store.insert("workflow_runs", {
    id: runId,
    user_id: user.id,
    session_id: session.id,
    workflow_key: "eligibility_benefits_navigation",
    journey_stage: "coverage_understanding",
    status: "started",
    route_reason: "test",
    started_at: now(),
    created_at: now(),
    updated_at: now()
  });
  return runId;
}

test("Step 1: all 5 portfolio tables are created on a fresh SQLite store", async () => {
  const store = await freshSqlite();
  const rows = await store.all("SELECT name FROM sqlite_master WHERE type='table';");
  const names = new Set(rows.map((r) => r.name));
  for (const t of PORTFOLIO_TABLES) {
    assert.ok(names.has(t), `table ${t} must exist`);
  }
  // workflow_runs additive columns exist.
  const cols = new Set((await store.all("PRAGMA table_info(workflow_runs);")).map((c) => c.name));
  for (const c of ["process_id", "resume_count", "last_checkpoint_boundary"]) {
    assert.ok(cols.has(c), `workflow_runs.${c} migration column must exist`);
  }
});

test("Step 1: UNIQUE(workflow_run_id, process_step_id) rejects a real duplicate", async () => {
  const store = await freshSqlite();
  const runId = await freshRun(store);
  const base = () => ({
    id: createId("ckpt"),
    workflow_run_id: runId,
    process_step_id: "step:adhoc:after_planner",
    checkpoint_boundary: "after_planner",
    created_at: now(),
    updated_at: now()
  });
  await store.insert("workflow_checkpoint_runs", base());
  await assert.rejects(
    () => store.insert("workflow_checkpoint_runs", base()),
    /unique|constraint/i,
    "duplicate (workflow_run_id, process_step_id) must be rejected"
  );
  // A different step on the same run is allowed.
  await store.insert("workflow_checkpoint_runs", { ...base(), process_step_id: "step:adhoc:after_response" });
});

test("Step 1: UNIQUE(idempotency_key) rejects a real duplicate but allows multiple NULLs", async () => {
  const store = await freshSqlite();
  const runId = await freshRun(store);
  const row = (over) => ({
    id: createId("ckpt"),
    workflow_run_id: runId,
    process_step_id: createId("step"),
    checkpoint_boundary: "before_worker",
    created_at: now(),
    updated_at: now(),
    ...over
  });
  // Multiple NULL idempotency_key rows are allowed (non-dispatch checkpoints).
  await store.insert("workflow_checkpoint_runs", row({}));
  await store.insert("workflow_checkpoint_runs", row({}));
  // Non-null idempotency_key is unique.
  await store.insert("workflow_checkpoint_runs", row({ idempotency_key: "idem-abc" }));
  await assert.rejects(
    () => store.insert("workflow_checkpoint_runs", row({ idempotency_key: "idem-abc" })),
    /unique|constraint/i,
    "duplicate non-null idempotency_key must be rejected"
  );
});

test("Step 1: capability_key and process_key UNIQUE reject duplicates", async () => {
  const store = await freshSqlite();
  const cap = () => ({ id: createId("cap"), capability_key: "skill:insurance_portal_browser", kind: "skill", created_at: now(), updated_at: now() });
  await store.insert("capabilities", cap());
  await assert.rejects(() => store.insert("capabilities", cap()), /unique|constraint/i);

  const proc = () => ({ id: createId("proc"), process_key: "process:portal_readonly_lookup", title: "Portal lookup", created_at: now(), updated_at: now() });
  await store.insert("processes", proc());
  await assert.rejects(() => store.insert("processes", proc()), /unique|constraint/i);
});
