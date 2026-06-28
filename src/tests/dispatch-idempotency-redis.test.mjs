// Step 8 proof (no mocks): exactly-once worker dispatch. Two dispatches with the same
// persisted plan -> ONE real dispatch; the second returns the cached result and is
// prevented by the Postgres UNIQUE(idempotency_key) even after the Redis lock is flushed.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { createRuntimeContextCache } from "../concierge/runtimeContextCache.mjs";
import { dispatchOnce, computeDispatchIdempotencyKey, workerPlanSignature } from "../concierge/dispatchIdempotency.mjs";

await loadLocalEnvOnce();

async function freshRun() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-idem-"));
  const store = await new SqliteStore(join(dir, "i.sqlite")).initialize();
  const { user, session } = await enrollDefaultMember(store);
  const runId = createId("run");
  await store.insert("workflow_runs", {
    id: runId, user_id: user.id, session_id: session.id,
    workflow_key: "eligibility_benefits_navigation", journey_stage: "coverage_understanding",
    status: "started", route_reason: "test", started_at: nowIso(), created_at: nowIso(), updated_at: nowIso()
  });
  return { store, runId };
}

test("Step 8: idempotency key is deterministic for the same persisted plan", () => {
  const sig = workerPlanSignature(["x#skill:insurance_portal_browser", "x#workflow:eligibility_benefits_navigation"]);
  const k1 = computeDispatchIdempotencyKey({ runId: "r1", beforeWorkerCheckpointId: "ck1", workerPlanSignature: sig });
  const k2 = computeDispatchIdempotencyKey({ runId: "r1", beforeWorkerCheckpointId: "ck1", workerPlanSignature: sig });
  assert.equal(k1, k2, "same inputs -> same key");
  const kDiff = computeDispatchIdempotencyKey({ runId: "r1", beforeWorkerCheckpointId: "ck1", workerPlanSignature: workerPlanSignature(["x#tool:payer_portal_reader"]) });
  assert.notEqual(k1, kDiff, "different plan -> different key");
});

test("Step 8: second dispatch is prevented (one real dispatch) even after Redis flush", async () => {
  assert.ok(process.env.BRAINSTY_REDIS_URL, "BRAINSTY_REDIS_URL required");
  const { store, runId } = await freshRun();
  const cache = createRuntimeContextCache();
  assert.equal(cache.backend, "redis");

  const key = computeDispatchIdempotencyKey({ runId, beforeWorkerCheckpointId: "ckA", workerPlanSignature: workerPlanSignature(["x#skill:insurance_portal_browser"]) });
  let realDispatches = 0;
  const dispatchFn = async () => { realDispatches += 1; return { resultPointer: "portal-observe-1" }; };

  const first = await dispatchOnce(store, { workflowRunId: runId, idempotencyKey: key }, dispatchFn);
  assert.equal(first.dispatched, true);
  assert.equal(first.resultPointer, "portal-observe-1");
  assert.equal(realDispatches, 1);

  // Flush the Redis fast-path lock mid-flight; Postgres must still prevent the duplicate.
  await cache.adapter.del(`brainsty:idempotency:${key}`);

  const second = await dispatchOnce(store, { workflowRunId: runId, idempotencyKey: key }, dispatchFn);
  assert.equal(second.dispatched, false, "second dispatch prevented");
  assert.equal(second.duplicatePrevented, true);
  assert.equal(second.traceEvent, "duplicate-dispatch.prevented");
  assert.equal(second.resultPointer, "portal-observe-1", "returns cached result pointer");
  assert.equal(realDispatches, 1, "the real worker dispatch ran exactly once");

  // Postgres row is the authoritative record.
  const row = await store.findOne("workflow_checkpoint_runs", { idempotency_key: key });
  assert.equal(row.status, "completed");
  assert.equal(row.effect_stage, "after_effect");
});
