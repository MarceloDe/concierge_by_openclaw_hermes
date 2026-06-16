import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, nowIso } from "../concierge/database.mjs";
import {
  WORKER_LEASES_VERSION,
  acquireWorkerLease,
  expireWorkerLeases,
  getWorkerLease,
  heartbeatWorkerLease,
  releaseWorkerLease
} from "../concierge/workerLeases.mjs";

async function testStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-worker-leases-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

test("worker leases allow one active claimant and transfer only after release", async () => {
  const store = await testStore();
  const leaseKey = "eligibility:session:test";

  const first = await acquireWorkerLease(store, { leaseKey, workerId: "worker-a", ttlMs: 60000 });
  assert.equal(first.acquired, true);
  assert.equal(first.lease.worker_id, "worker-a");

  const blocked = await acquireWorkerLease(store, { leaseKey, workerId: "worker-b", ttlMs: 60000 });
  assert.equal(blocked.acquired, false);
  assert.equal(blocked.lease.worker_id, "worker-a");

  const heartbeat = await heartbeatWorkerLease(store, { leaseKey, workerId: "worker-a", ttlMs: 60000 });
  assert.equal(heartbeat.ok, true);

  const wrongRelease = await releaseWorkerLease(store, { leaseKey, workerId: "worker-b" });
  assert.equal(wrongRelease.ok, false);
  assert.equal(wrongRelease.lease.worker_id, "worker-a");

  const release = await releaseWorkerLease(store, { leaseKey, workerId: "worker-a" });
  assert.equal(release.ok, true);
  assert.equal(release.lease.status, "released");

  const second = await acquireWorkerLease(store, { leaseKey, workerId: "worker-b", ttlMs: 60000 });
  assert.equal(second.acquired, true);
  assert.equal(second.lease.worker_id, "worker-b");
  assert.equal(second.lease.claim_count, 2);
});

test("worker lease sweeper expires stale active leases", async () => {
  const store = await testStore();
  const leaseKey = "eligibility:session:expired";
  await acquireWorkerLease(store, { leaseKey, workerId: "worker-a", ttlMs: 60000 });
  await store.update("worker_leases", { expires_at: "2026-01-01T00:00:00.000Z" }, { lease_key: leaseKey });

  const sweep = await expireWorkerLeases(store, { now: nowIso() });
  assert.equal(sweep.ok, true);
  assert.equal(sweep.expiredCount, 1);

  const lease = await getWorkerLease(store, leaseKey);
  assert.equal(lease.status, "expired");
});

test("worker lease module exposes a versioned production contract", () => {
  assert.match(WORKER_LEASES_VERSION, /worker-leases/);
});
