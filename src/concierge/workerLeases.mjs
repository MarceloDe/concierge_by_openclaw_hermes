import { createId, nowIso } from "./database.mjs";

export const WORKER_LEASES_VERSION = "2026-06-16.worker-leases.v1";
export const DEFAULT_WORKER_LEASE_TTL_MS = 2 * 60 * 1000;

function addMs(iso, ms) {
  return new Date(new Date(iso).getTime() + ms).toISOString();
}

function boundedTtlMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_WORKER_LEASE_TTL_MS;
  return Math.max(1000, Math.min(30 * 60 * 1000, Math.trunc(parsed)));
}

function requireValue(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

export async function getWorkerLease(store, leaseKey) {
  return store.findOne("worker_leases", { lease_key: requireValue(leaseKey, "leaseKey") });
}

export async function acquireWorkerLease(
  store,
  { leaseKey, workerId, scope = "worker_task", ttlMs = DEFAULT_WORKER_LEASE_TTL_MS, metadata = {} }
) {
  const key = requireValue(leaseKey, "leaseKey");
  const worker = requireValue(workerId, "workerId");
  const leaseScope = requireValue(scope, "scope");
  const now = nowIso();
  const expiresAt = addMs(now, boundedTtlMs(ttlMs));
  const row = await store.get(
    `INSERT INTO worker_leases (
       id, lease_key, worker_id, scope, status, claim_count, metadata_json,
       claimed_at, heartbeat_at, expires_at, released_at, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, 'active', 1, ?, ?, ?, ?, NULL, ?, ?)
     ON CONFLICT (lease_key) DO UPDATE SET
       worker_id = EXCLUDED.worker_id,
       scope = EXCLUDED.scope,
       status = 'active',
       claim_count = worker_leases.claim_count + 1,
       metadata_json = EXCLUDED.metadata_json,
       claimed_at = EXCLUDED.claimed_at,
       heartbeat_at = EXCLUDED.heartbeat_at,
       expires_at = EXCLUDED.expires_at,
       released_at = NULL,
       updated_at = EXCLUDED.updated_at
     WHERE worker_leases.status <> 'active'
        OR worker_leases.expires_at <= ?
     RETURNING *;`,
    [createId("lease"), key, worker, leaseScope, JSON.stringify(metadata), now, now, expiresAt, now, now, now]
  );
  return {
    ok: Boolean(row),
    acquired: Boolean(row),
    status: row ? "acquired" : "already_active",
    lease: row ?? (await getWorkerLease(store, key))
  };
}

export async function heartbeatWorkerLease(store, { leaseKey, workerId, ttlMs = DEFAULT_WORKER_LEASE_TTL_MS }) {
  const key = requireValue(leaseKey, "leaseKey");
  const worker = requireValue(workerId, "workerId");
  const now = nowIso();
  const expiresAt = addMs(now, boundedTtlMs(ttlMs));
  const row = await store.get(
    `UPDATE worker_leases
     SET heartbeat_at = ?, expires_at = ?, updated_at = ?
     WHERE lease_key = ?
       AND worker_id = ?
       AND status = 'active'
       AND expires_at > ?
     RETURNING *;`,
    [now, expiresAt, now, key, worker, now]
  );
  return {
    ok: Boolean(row),
    status: row ? "heartbeat_recorded" : "not_owner_or_expired",
    lease: row ?? (await getWorkerLease(store, key))
  };
}

export async function releaseWorkerLease(store, { leaseKey, workerId }) {
  const key = requireValue(leaseKey, "leaseKey");
  const worker = requireValue(workerId, "workerId");
  const now = nowIso();
  const row = await store.get(
    `UPDATE worker_leases
     SET status = 'released',
         released_at = ?,
         updated_at = ?
     WHERE lease_key = ?
       AND worker_id = ?
       AND status = 'active'
     RETURNING *;`,
    [now, now, key, worker]
  );
  return {
    ok: Boolean(row),
    status: row ? "released" : "not_owner_or_not_active",
    lease: row ?? (await getWorkerLease(store, key))
  };
}

export async function expireWorkerLeases(store, { now = nowIso(), limit = 100 } = {}) {
  const boundedLimit = Math.max(1, Math.min(500, Math.trunc(Number(limit) || 100)));
  const rows = await store.all(
    `UPDATE worker_leases
     SET status = 'expired',
         updated_at = ?
     WHERE id IN (
       SELECT id FROM worker_leases
       WHERE status = 'active'
         AND expires_at <= ?
       ORDER BY expires_at ASC
       LIMIT ${boundedLimit}
     )
     RETURNING *;`,
    [now, now]
  );
  return {
    ok: true,
    status: "expired_leases_swept",
    expiredCount: rows.length,
    leases: rows
  };
}
