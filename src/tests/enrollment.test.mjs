import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";

async function testStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-enroll-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

test("enrollDefaultMember creates user, consent, portal, session, gates, and audit records", async () => {
  const store = await testStore();
  const result = await enrollDefaultMember(store);
  const counts = await store.counts();

  assert.equal(result.user.name, "Marcelo Felix");
  assert.equal(result.user.email, "mocfelix@gmail.com");
  assert.equal(result.portal.payer, "Aetna");
  assert.equal(result.consent.phi_storage_fields, "all fields");
  assert.equal(counts.users, 1);
  assert.equal(counts.user_consents, 1);
  assert.equal(counts.portal_accounts, 1);
  assert.equal(counts.sessions, 1);
  assert.equal(counts.session_state, 1);
  assert.equal(counts.session_events, 1);
  assert.equal(counts.approval_gates, 2);
  assert.ok(counts.audit_events >= 3);
});
