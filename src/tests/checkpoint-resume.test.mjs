// Step 9 proof (no mocks): authoritative resume reruns ONLY unfinished boundaries,
// skips completed ones, re-dispatch is idempotent (no second worker/portal session),
// and a since-quarantined selected capability forces the resume target back to
// after_planner (re-plan).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { resumeRun, RUN_LEDGER_BOUNDARIES } from "../concierge/checkpointRunLedger.mjs";

async function freshStoreWithRun({ seed = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-resume-"));
  const store = await new SqliteStore(join(dir, "r.sqlite")).initialize();
  if (seed) await seedCapabilityCatalog(store, { nowIso, createId });
  const { user, session } = await enrollDefaultMember(store);
  const runId = createId("run");
  await store.insert("workflow_runs", {
    id: runId, user_id: user.id, session_id: session.id,
    workflow_key: "eligibility_benefits_navigation", journey_stage: "coverage_understanding",
    status: "started", route_reason: "test", started_at: nowIso(), created_at: nowIso(), updated_at: nowIso()
  });
  return { store, runId };
}

async function insertBoundary(store, runId, boundary, order, extra = {}) {
  await store.insert("workflow_checkpoint_runs", {
    id: `ckpt:${runId}:${boundary}`, workflow_run_id: runId,
    process_step_id: `step:adhoc:${boundary}`, checkpoint_boundary: boundary,
    step_order: order, status: "completed", effect_stage: "after_effect",
    created_at: nowIso(), updated_at: nowIso(), ...extra
  });
}

test("Step 9: resume reruns only the unfinished boundary; completed before_worker is not re-dispatched", async () => {
  const { store, runId } = await freshStoreWithRun();
  // Killed after after_evidence: first 4 boundaries completed; after_response missing.
  await insertBoundary(store, runId, "after_policy_gate", 0);
  await insertBoundary(store, runId, "after_planner", 1);
  await insertBoundary(store, runId, "before_worker", 2, { idempotency_key: `K:${runId}`, result_pointer: "portal-observe-1" });
  await insertBoundary(store, runId, "after_evidence", 3);

  let realDispatches = 0;
  const res = await resumeRun(store, runId, { selectedCapabilityKeys: [], dispatchFn: async () => { realDispatches += 1; return { resultPointer: "portal-observe-2" }; } });

  assert.equal(res.resumeTarget, "after_response", "resume only the missing boundary");
  assert.deepEqual(res.toReplay, ["after_response"]);
  assert.ok(res.skipped.includes("before_worker") && res.skipped.includes("after_evidence"));
  assert.equal(realDispatches, 0, "completed before_worker is NOT re-dispatched (no second portal session)");
  const run = await store.findOne("workflow_runs", { id: runId });
  assert.equal(run.status, "completed");
});

test("Step 9: a since-quarantined selected capability forces re-plan (resume target = after_planner), still no duplicate dispatch", async () => {
  const { store, runId } = await freshStoreWithRun({ seed: true });
  for (const [i, b] of RUN_LEDGER_BOUNDARIES.entries()) {
    await insertBoundary(store, runId, b, i, b === "before_worker" ? { idempotency_key: `K:${runId}`, result_pointer: "portal-observe-1" } : {});
  }
  // The capability the run selected is now quarantined.
  await store.update("capabilities", { status: "quarantined" }, { capability_key: "skill:insurance_portal_browser" });

  let realDispatches = 0;
  const res = await resumeRun(store, runId, {
    selectedCapabilityKeys: ["skill:insurance_portal_browser"],
    dispatchFn: async () => { realDispatches += 1; return { resultPointer: "portal-observe-2" }; }
  });

  assert.equal(res.rePlanned, true, "quarantined selected capability triggers re-plan");
  assert.deepEqual(res.invalidCaps, ["skill:insurance_portal_browser"]);
  assert.equal(res.resumeTarget, "after_planner", "resume target moves back to after_planner");
  assert.ok(res.toReplay.includes("before_worker"));
  // before_worker re-dispatch is idempotent: original was completed with the same key.
  assert.equal(res.dispatch.duplicatePrevented, true, "re-dispatch prevented by idempotency (no second portal session)");
  assert.equal(realDispatches, 0);
});
