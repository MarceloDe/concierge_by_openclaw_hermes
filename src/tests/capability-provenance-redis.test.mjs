// Step 6 proof: the provenance read-back loop. Quarantine/demote writes a hash-chained
// provenance row + a hash-chained audit entry, flips capabilities.status so the
// production select excludes it, AND evicts the Redis mirror. PEMS lifecycle sync
// projects a demotion onto the planner-facing lifecycle. Requires BRAINSTY_REDIS_URL.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { verifyAuditChain } from "../concierge/audit.mjs";
import {
  mirrorCapabilityPortfolioToRedis,
  loadSessionPortfolio,
  quarantineCapability,
  syncCapabilityLifecycleFromPems
} from "../concierge/capabilityCatalog.mjs";

await loadLocalEnvOnce();

async function seededStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-prov-"));
  const store = await new SqliteStore(join(dir, "p.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  return store;
}

function keysOf(manifest) {
  return new Set(manifest.promptTable.map((r) => r.portfolioId));
}

test("Step 6: quarantine flips status, evicts Redis, removes from production select, writes provenance + audit chain", async () => {
  assert.ok(process.env.BRAINSTY_REDIS_URL, "BRAINSTY_REDIS_URL required");
  const store = await seededStore();
  const sessionId = createId("prov");
  const capId = "cap:workflow:pharmacy_formulary";

  await mirrorCapabilityPortfolioToRedis(store, { sessionId });
  const before = await loadSessionPortfolio(store, { sessionId });
  assert.equal(before.cacheHit, true);
  assert.ok(keysOf(before.manifest).has("workflow:pharmacy_formulary"), "present before quarantine");

  const res = await quarantineCapability(store, { capabilityId: capId, reason: "unsupported_claim_incident", safetyClass: "answer_safety", sessionIds: [sessionId] });
  assert.equal(res.ok, true);
  assert.equal(res.toStatus, "quarantined");
  assert.ok(res.redisEvicted >= 1, "the session's Redis mirror was evicted");

  // Status flipped (the read-back the planner select depends on).
  const cap = await store.findOne("capabilities", { id: capId });
  assert.equal(cap.status, "quarantined");

  // Production select now excludes it; load rebuilds from Postgres (cache.miss) without it.
  const after = await loadSessionPortfolio(store, { sessionId });
  assert.equal(after.cacheHit, false, "evicted -> miss -> rebuild");
  assert.ok(!keysOf(after.manifest).has("workflow:pharmacy_formulary"), "quarantined capability gone from planner surface");

  // Provenance row (append-only, hash-chained).
  const prov = await store.findOne("capability_provenance", { id: res.provenanceId });
  assert.equal(prov.event_type, "quarantined");
  assert.equal(prov.from_status, "active");
  assert.equal(prov.to_status, "quarantined");
  assert.ok(prov.event_hash, "provenance event is hash-chained");

  // Hash-chained operator audit trail intact + the event recorded.
  const chain = await verifyAuditChain(store, {});
  assert.equal(chain.valid, true, "audit chain remains valid");
  const auditRows = await store.all("SELECT event_type FROM audit_events WHERE event_type = 'capability_provenance_quarantined';");
  assert.ok(auditRows.length >= 1, "audit event recorded");
});

test("Step 6: PEMS demotion sync removes a capability from the production select (read-back)", async () => {
  assert.ok(process.env.BRAINSTY_REDIS_URL, "BRAINSTY_REDIS_URL required");
  const store = await seededStore();
  const sessionId = createId("prov2");
  const capId = "cap:workflow:claim_status_navigation";
  const candidateId = createId("cand");

  // A PEMS maturity row marked demoted is the authority.
  await store.insert("pems_candidate_maturity", {
    candidate_id: candidateId,
    selected_skill_key: "insurance_portal_browser",
    promotion_status: "demoted",
    production_driving_allowed: 0,
    created_at: nowIso(),
    updated_at: nowIso()
  });

  const sync = await syncCapabilityLifecycleFromPems(store, { capabilityId: capId, candidateId, sessionIds: [sessionId] });
  assert.equal(sync.ok, true);
  assert.equal(sync.toStatus, "quarantined", "demoted pems candidate -> quarantined capability");

  const after = await loadSessionPortfolio(store, { sessionId });
  assert.ok(!keysOf(after.manifest).has("workflow:claim_status_navigation"), "demoted capability removed from planner surface");
});
