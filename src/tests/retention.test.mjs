import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createId, SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { sweepExpiredRuntimeState } from "../concierge/retentionPolicy.mjs";

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
