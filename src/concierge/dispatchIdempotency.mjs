import { createHash } from "node:crypto";
import { nowIso } from "./database.mjs";
import { createRuntimeContextCache } from "./runtimeContextCache.mjs";

// Exactly-once worker dispatch. Authoritative dedupe is the Postgres
// UNIQUE(idempotency_key) on workflow_checkpoint_runs; the Redis SETNX lock is a
// losable fast-path only. The key derives from the PERSISTED selected capability
// pointers (not a per-turn-rebuilt portfolio) so reruns produce the same key.
export const DISPATCH_IDEMPOTENCY_VERSION = "2026-06-27.dispatch-idempotency.v1";

export function workerPlanSignature(selectedCapabilityPointers = []) {
  const sorted = [...(selectedCapabilityPointers ?? [])].map(String).sort();
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex").slice(0, 24);
}

export function computeDispatchIdempotencyKey({ runId, beforeWorkerCheckpointId = "", workerPlanSignature: signature }) {
  return createHash("sha256").update(`${runId}:${beforeWorkerCheckpointId}:${signature}`).digest("hex").slice(0, 32);
}

function idempotencyLockKey(idempotencyKey) {
  return `brainsty:idempotency:${idempotencyKey}`;
}

// Run dispatchFn at most once per idempotencyKey. Returns {dispatched, duplicatePrevented,
// resultPointer, traceEvent}. effect_stage distinguishes retry-safe from compensation.
export async function dispatchOnce(store, { workflowRunId, idempotencyKey, sessionCheckpointId = null, processId = null, processStepId = null }, dispatchFn) {
  const cache = createRuntimeContextCache();
  const lockKey = idempotencyLockKey(idempotencyKey);
  const lockRowId = `dispatch:${idempotencyKey}`;
  // The lock row's process_step_id must stay DISTINCT from the ledger step row's real pstep:* id
  // (UNIQUE(workflow_run_id, process_step_id)); encode the real step for traceability via a prefix.
  const lockProcessStepId = `step:dispatch:${processStepId ?? idempotencyKey}`;

  // Authoritative check (Postgres) — independent of Redis.
  const existing = await store.findOne("workflow_checkpoint_runs", { idempotency_key: idempotencyKey });
  if (existing && existing.status === "completed") {
    return { dispatched: false, duplicatePrevented: true, traceEvent: "duplicate-dispatch.prevented", resultPointer: existing.result_pointer ?? null, idempotencyKey };
  }
  if (existing && existing.status === "in_progress") {
    return { dispatched: false, duplicatePrevented: true, traceEvent: "duplicate-dispatch.in_flight", resultPointer: existing.result_pointer ?? null, idempotencyKey };
  }

  // Acquire by inserting the lock row; UNIQUE(idempotency_key) wins any race.
  try {
    await store.insert("workflow_checkpoint_runs", {
      id: lockRowId,
      workflow_run_id: workflowRunId,
      process_id: processId,
      process_step_id: lockProcessStepId,
      checkpoint_boundary: "before_worker",
      step_order: 0,
      status: "in_progress",
      effect_stage: "before_effect",
      idempotency_key: idempotencyKey,
      session_checkpoint_id: sessionCheckpointId,
      attempt_count: 1,
      created_at: nowIso(),
      updated_at: nowIso()
    });
  } catch (error) {
    if (/unique|constraint/i.test(String(error.message))) {
      const raced = await store.findOne("workflow_checkpoint_runs", { idempotency_key: idempotencyKey });
      return { dispatched: false, duplicatePrevented: true, traceEvent: "duplicate-dispatch.prevented", resultPointer: raced?.result_pointer ?? null, idempotencyKey };
    }
    throw error;
  }

  // Redis fast-path lock (losable; not load-bearing).
  try {
    await cache.adapter.setNX(lockKey, { status: "in_progress", runId: workflowRunId }, { ttlSeconds: 600 });
  } catch {
    /* fast-path only */
  }

  // Run the real dispatch; record effect stage for retry-vs-compensation semantics.
  let result;
  try {
    result = await dispatchFn();
  } catch (error) {
    await store.update(
      "workflow_checkpoint_runs",
      { status: "failed", effect_stage: "after_effect", failure_class: "dispatch_failed", updated_at: nowIso() },
      { id: lockRowId }
    );
    throw error;
  }
  const resultPointer = result?.resultPointer ?? `result:${idempotencyKey}`;
  await store.update(
    "workflow_checkpoint_runs",
    { status: "completed", effect_stage: "after_effect", result_pointer: resultPointer, updated_at: nowIso() },
    { id: lockRowId }
  );
  return { dispatched: true, duplicatePrevented: false, traceEvent: "worker.dispatch", result, resultPointer, idempotencyKey };
}
