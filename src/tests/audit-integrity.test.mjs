import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { audit, listAuditEvents, verifyAuditChain } from "../concierge/audit.mjs";
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

test("audit log API lists redacted hash-backed events and verifies visible chains", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-audit-log-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();

  await audit(store, null, "research_source_proposed", {
    actorUserId: "operator_user",
    note: "Do not leak jane@example.com or SSN 123-45-6789 in the dashboard."
  });
  await audit(store, null, "research_schedule_tick_run_created", {
    action: "queued",
    phone: "555-111-2222"
  });

  const log = await listAuditEvents(store, { eventPrefix: "research", limit: 10 });
  assert.equal(log.status, "audit_visible_and_chain_valid");
  assert.equal(log.safety.rawDetailsReturned, false);
  assert.equal(log.pagination.returned, 2);
  assert.equal(log.chain.valid, true);
  assert.ok(log.events.some((event) => event.eventType === "research_source_proposed"));
  assert.ok(log.events.every((event) => event.detailsHash.match(/^[a-f0-9]{64}$/)));

  const text = JSON.stringify(log);
  assert.doesNotMatch(text, /jane@example\.com/);
  assert.doesNotMatch(text, /123-45-6789/);
  assert.doesNotMatch(text, /555-111-2222/);
  assert.match(text, /\[redacted-email\]/);
  assert.match(text, /\[redacted-phone\]/);
});
