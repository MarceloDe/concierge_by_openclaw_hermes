import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createId, SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { sweepExpiredRuntimeState } from "../concierge/retentionPolicy.mjs";
import { createRetentionSweepDaemon } from "../concierge/retentionScheduler.mjs";

test("retention sweeper expires sessions and tombstones expired memory items", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-retention-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  const { user, session } = await enrollDefaultMember(store);
  const now = "2026-06-15T16:00:00.000Z";
  await store.update("sessions", { expires_at: "2026-06-01T00:00:00.000Z" }, { id: session.id });
  await store.insert("memory_items", {
    id: createId("mem"),
    user_id: user.id,
    session_id: session.id,
    memory_scope: "episodic",
    memory_type: "test_phi_memory",
    content: "Synthetic expired memory",
    metadata_json: "{}",
    source_table: "sessions",
    source_id: session.id,
    source_url: null,
    sensitivity: "phi",
    retention_policy: "expires",
    adapter_status: "local_only",
    occurred_at: now,
    valid_from_at: "2026-05-01T00:00:00.000Z",
    valid_until_at: "2026-06-01T00:00:00.000Z",
    last_verified_at: null,
    temporal_metadata_json: "{}",
    confidence: 1,
    created_at: now,
    updated_at: now
  });

  const result = await sweepExpiredRuntimeState(store, { now });
  assert.equal(result.expiredSessions, 1);
  assert.equal(result.tombstonedMemoryItems, 1);

  const closed = await store.findOne("sessions", { id: session.id });
  assert.equal(closed.status, "expired");
  const memory = await store.findOne("memory_items", { user_id: user.id });
  assert.equal(memory.retention_policy, "tombstoned");
  assert.doesNotMatch(memory.content, /Synthetic expired memory/);

  const auditRows = await store.all("SELECT event_type, event_hash FROM audit_events WHERE session_id = ? ORDER BY created_at ASC;", [session.id]);
  const auditTypes = auditRows.map((row) => row.event_type);
  assert.ok(auditTypes.includes("retention.session_expired"));
  assert.ok(auditTypes.includes("retention.memory_item_tombstoned"));
  assert.ok(auditRows.every((row) => row.event_hash));
});

test("retention sweeper daemon creates scheduled-run runtime and audit proof", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-retention-daemon-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  const { session } = await enrollDefaultMember(store);
  const now = "2026-06-22T12:00:00.000Z";
  await store.update("sessions", { expires_at: "2026-06-01T00:00:00.000Z" }, { id: session.id });

  const daemon = createRetentionSweepDaemon(store, {
    enabled: true,
    runOnStart: false,
    schedulerKey: "retention_sweeper_unit",
    intervalMs: 60_000
  });
  const tick = await daemon.tickOnce({ now, trigger: "unit_scheduled_tick" });

  assert.equal(tick.status, "tick_completed");
  assert.equal(tick.sweep.expiredSessions, 1);
  assert.ok(tick.auditEventHash);
  const completedEvent = await store.findOne("runtime_events", { event_type: "retention.sweeper.tick_completed" });
  assert.ok(completedEvent);
  const scheduledAudit = await store.findOne("audit_events", { event_type: "retention.sweeper_scheduled_run_completed" });
  assert.ok(scheduledAudit);
  const status = daemon.status();
  assert.equal(status.enabled, true);
  assert.equal(status.lastTick.status, "tick_completed");
  assert.equal(status.safety.rawPhiReturned, false);
});
