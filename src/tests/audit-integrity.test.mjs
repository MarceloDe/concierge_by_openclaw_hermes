import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { audit, verifyAuditChain } from "../concierge/audit.mjs";
import { SqliteStore } from "../concierge/database.mjs";

test("audit events are hash chained and tamper evident", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-audit-chain-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();

  const first = await audit(store, null, "first_event", { value: 1 });
  const second = await audit(store, null, "second_event", { value: 2 });

  assert.match(first.event_hash, /^[a-f0-9]{64}$/);
  assert.equal(second.previous_event_hash, first.event_hash);

  const valid = await verifyAuditChain(store);
  assert.equal(valid.valid, true);
  assert.equal(valid.hashedCount, 2);
  assert.equal(valid.issues.length, 0);

  await store.update("audit_events", { details: JSON.stringify({ value: "tampered" }) }, { id: first.id });
  const tampered = await verifyAuditChain(store);
  assert.equal(tampered.valid, false);
  assert.ok(tampered.issues.some((issue) => issue.issue === "event_hash_mismatch"));
});
