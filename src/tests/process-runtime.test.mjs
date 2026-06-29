// Non-mocked proof that the authored processes DRIVE runtime behavior (Phase 2/3):
// - a routed workflow binds its process; the ledger writes REAL process_id + pstep:* rows
// - resume reruns ONLY unfinished steps; completed idempotent steps are not re-dispatched
// - on_failure_policy='abort' fails the run loudly (the dormant column now drives behavior)
// - DB unavailable -> resumeRun rejects (fail-loud, no fabricated ok)
// - Redis losable -> dispatchOnce stays exactly-once via the DB UNIQUE(idempotency_key)
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { writeShadowCheckpointLedger, resumeRun, selectProcessForWorkflow } from "../concierge/checkpointRunLedger.mjs";
import { dispatchOnce } from "../concierge/dispatchIdempotency.mjs";

async function freshStore() {
  const store = await new SqliteStore(join(await mkdtemp(join(tmpdir(), "proc-rt-")), "g.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  return store;
}
const reachedAll = (sessionId, userId, workflow) => ({
  user_id: userId, session_id: sessionId, workflow,
  policy_result: { allowed: true }, llm_orchestration_decision: { workflow },
  openclaw_worker_plan: { goal: "x" }, evidence_observation: { status: "ok" }, final_response: "done"
});

test("a routed workflow binds its process; ledger rows carry REAL process_id + pstep:* ids", async () => {
  const store = await freshStore();
  const { user, session } = await enrollDefaultMember(store);
  const proc = await selectProcessForWorkflow(store, "claim_status_navigation");
  assert.equal(proc?.id, "proc:process:claim_status_lookup", "process bound to the routed workflow");

  const res = await writeShadowCheckpointLedger(store, { user, session, state: reachedAll(session.id, user.id, "claim_status_navigation"), graphTraceId: "trace-claim", sessionCheckpointId: null });
  assert.equal(res.processBound, true);
  const run = await store.findOne("workflow_runs", { id: "wfrun:trace-claim" });
  assert.equal(run.process_id, "proc:process:claim_status_lookup", "run bound to the real process");
  const rows = await store.all("SELECT process_id, process_step_id, checkpoint_boundary FROM workflow_checkpoint_runs WHERE workflow_run_id = ? ORDER BY step_order;", ["wfrun:trace-claim"]);
  const steps = await store.all("SELECT id FROM process_steps WHERE process_id = ?;", [proc.id]);
  assert.equal(rows.length, steps.length, "one ledger row per real process step");
  for (const r of rows) {
    assert.equal(r.process_id, proc.id, "real process_id on every row");
    assert.ok(r.process_step_id.startsWith("pstep:process:claim_status_lookup:"), `real pstep id, got ${r.process_step_id}`);
  }
});

async function seedBoundRun(store, user, session, { runId, doneBoundaries }) {
  const proc = await selectProcessForWorkflow(store, "eligibility_benefits_navigation");
  await store.insert("workflow_runs", { id: runId, user_id: user.id, session_id: session.id, workflow_key: "eligibility_benefits_navigation", journey_stage: "coverage_understanding", status: "started", route_reason: "test", process_id: proc.id, started_at: nowIso(), created_at: nowIso(), updated_at: nowIso() });
  const steps = await store.all("SELECT id, step_order, checkpoint_boundary FROM process_steps WHERE process_id = ? ORDER BY step_order;", [proc.id]);
  for (const s of steps) {
    await store.insert("workflow_checkpoint_runs", { id: `ckpt:${runId}:${s.checkpoint_boundary}`, workflow_run_id: runId, process_id: proc.id, process_step_id: s.id, checkpoint_boundary: s.checkpoint_boundary, step_order: s.step_order, status: doneBoundaries.includes(s.checkpoint_boundary) ? "completed" : "pending", effect_stage: doneBoundaries.includes(s.checkpoint_boundary) ? "after_effect" : "before_effect", created_at: nowIso(), updated_at: nowIso() });
  }
  return proc;
}

test("resume reruns ONLY unfinished steps; completed idempotent step not re-dispatched", async () => {
  const store = await freshStore();
  const { user, session } = await enrollDefaultMember(store);
  // before_worker already completed -> resume must NOT re-dispatch it.
  await seedBoundRun(store, user, session, { runId: "wfrun:r1", doneBoundaries: ["after_policy_gate", "after_planner", "before_worker"] });
  let dispatchCount = 0;
  const r = await resumeRun(store, "wfrun:r1", { dispatchFn: async () => { dispatchCount += 1; return { resultPointer: "p1" }; } });
  assert.equal(r.ok, true);
  assert.equal(r.resumeTarget, "after_evidence", "first unfinished step");
  assert.equal(dispatchCount, 0, "completed before_worker not re-dispatched");
});

test("resume dispatches an UNFINISHED idempotent step exactly once (real process_step_id)", async () => {
  const store = await freshStore();
  const { user, session } = await enrollDefaultMember(store);
  await seedBoundRun(store, user, session, { runId: "wfrun:r2", doneBoundaries: ["after_policy_gate", "after_planner"] });
  let dispatchCount = 0;
  const r = await resumeRun(store, "wfrun:r2", { dispatchFn: async () => { dispatchCount += 1; return { resultPointer: "p2" }; } });
  assert.equal(r.resumeTarget, "before_worker");
  assert.equal(dispatchCount, 1, "unfinished before_worker dispatched once");
  const lock = await store.findOne("workflow_checkpoint_runs", { id: `dispatch:${r.dispatch.idempotencyKey}` });
  assert.ok(lock.process_step_id.includes("pstep:process:portal_readonly_lookup:observe"), "dispatch lock encodes the real process step");
  assert.equal(lock.process_id, "proc:process:portal_readonly_lookup", "dispatch lock carries the real process id");
});

test("on_failure_policy='abort' fails the run loudly (dormant column now drives behavior)", async () => {
  const store = await freshStore();
  const { user, session } = await enrollDefaultMember(store);
  const proc = await seedBoundRun(store, user, session, { runId: "wfrun:r3", doneBoundaries: ["after_policy_gate", "after_planner"] });
  await store.update("process_steps", { on_failure_policy: "abort" }, { id: `pstep:process:portal_readonly_lookup:observe` });
  const r = await resumeRun(store, "wfrun:r3", { dispatchFn: async () => { throw new Error("dispatch boom"); } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "step_failed_abort");
  assert.equal(r.failedBoundary, "before_worker");
  const run = await store.findOne("workflow_runs", { id: "wfrun:r3" });
  assert.equal(run.status, "failed", "run marked failed loudly");
});

test("fail-loud: DB unavailable -> resumeRun rejects (no fabricated ok)", async () => {
  const store = await freshStore();
  const { user, session } = await enrollDefaultMember(store);
  await seedBoundRun(store, user, session, { runId: "wfrun:r4", doneBoundaries: ["after_policy_gate"] });
  // Proxy store whose ledger read throws (simulates the primary DB going down mid-resume).
  const brokenStore = Object.create(store);
  brokenStore.all = async (sql, params) => {
    if (/workflow_checkpoint_runs/.test(sql)) throw new Error("db_unavailable");
    return store.all(sql, params);
  };
  await assert.rejects(() => resumeRun(brokenStore, "wfrun:r4", { dispatchFn: async () => ({}) }), /db_unavailable/);
});

test("Redis losable: dispatchOnce stays exactly-once via DB UNIQUE(idempotency_key)", async () => {
  const store = await freshStore();
  const { user, session } = await enrollDefaultMember(store);
  await store.insert("workflow_runs", { id: "wfrun:r5", user_id: user.id, session_id: session.id, workflow_key: "eligibility_benefits_navigation", journey_stage: "coverage_understanding", status: "started", route_reason: "test", started_at: nowIso(), created_at: nowIso(), updated_at: nowIso() });
  let realDispatches = 0;
  const fn = async () => { realDispatches += 1; return { resultPointer: "rp" }; };
  const args = { workflowRunId: "wfrun:r5", idempotencyKey: "idem-k5", processId: "proc:process:portal_readonly_lookup", processStepId: "pstep:process:portal_readonly_lookup:observe" };
  const first = await dispatchOnce(store, args, fn);
  const second = await dispatchOnce(store, args, fn);
  assert.equal(first.dispatched, true);
  assert.equal(second.duplicatePrevented, true, "second blocked by the DB UNIQUE even with Redis losable");
  assert.equal(realDispatches, 1, "the real effect happened exactly once");
});
