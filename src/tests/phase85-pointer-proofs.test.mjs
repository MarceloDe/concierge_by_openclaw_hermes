// Phase 85 §5.5 deferred-pointer proofs (plan acceptance): every new table is accepted
// only via the full chain — write → restart/independent read-back → behavior change →
// loud classified failure. REAL SQLite stores in mkdtemp (a second store instance over
// the same file simulates process restart), real owner modules, real audit chain.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, createId, nowIso } from "./support/sqliteTestStore.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { audit, verifyAuditChain, AUDIT_CHAIN_VERSION, AUDIT_CHAIN_VERSION_V1 } from "../concierge/audit.mjs";
import {
  cacheSessionArtifact,
  dereferenceSessionArtifact,
  loadConsentState,
  loadReusableSessionArtifact
} from "../concierge/credentialVault.mjs";
import { destroySecret } from "../concierge/secretBackend.mjs";
import { ingestPlanIdentity, loadPlannerPlanIdentities } from "../concierge/planIdentity.mjs";
import { ingestMrfObservations, queryMrfPriceEvidence, recordMrfSource } from "../concierge/mrfPricing.mjs";
import { validateCapabilityAnswer } from "../concierge/capabilityCatalog.mjs";
import { persistEligibilitySnapshot } from "../concierge/portalExtraction.mjs";
import { buildLlmOrchestrationDecisionPayload } from "../concierge/llmOrchestrationDecision.mjs";

async function freshStorePath() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-p85-"));
  return join(dir, "p85.sqlite");
}

async function openStore(path) {
  const store = await new SqliteStore(path).initialize();
  return store;
}

test("vault: write -> restart read-back -> hash-verified dereference -> loud negative arm", async () => {
  const path = await freshStorePath();
  const store = await openStore(path);
  await seedCapabilityCatalog(store, { nowIso, createId });
  const { user, session } = await enrollDefaultMember(store);

  // Consent fail-closed: caching refuses (loud, audited) before the explicit grant.
  const refused = await cacheSessionArtifact(store, {
    userId: user.id, artifactKind: "session_cookie_bundle", plaintextArtifact: "cookie-blob", sessionId: session.id
  });
  assert.equal(refused.cached, false);
  assert.equal(refused.reason, "session_reuse_not_approved");

  // The grant (real UPDATE — grant/revoke transitions write through audit()).
  await store.all("UPDATE user_consents SET session_reuse_approved = 1, updated_at = ? WHERE user_id = ?;", [nowIso(), user.id]);
  await audit(store, session.id, "consent.granted", { userId: user.id, field: "session_reuse_approved" }, { layer: "layer_3_portal_control" });
  const consentState = await loadConsentState(store, { userId: user.id });
  assert.equal(consentState.sessionReuseApproved, true);

  // Turn 1: write.
  const portal = await store.get("SELECT * FROM portal_accounts WHERE user_id = ?;", [user.id]);
  const cached = await cacheSessionArtifact(store, {
    userId: user.id, portalAccountId: portal.id, artifactKind: "session_cookie_bundle",
    plaintextArtifact: "cookie-blob-A1B2", scope: ["read_only_observation"], sessionId: session.id
  });
  assert.equal(cached.cached, true, JSON.stringify(cached));
  const cachedAudit = await store.all("SELECT * FROM audit_events WHERE event_type = 'vault.session_cached';");
  assert.equal(cachedAudit.length, 1, "vault.session_cached audit row written");
  assert.equal(cachedAudit[0].layer, "layer_3_portal_control", "audit row carries the data layer");
  await store.close?.();

  // RESTART: a NEW store instance over the same file dereferences the pointer.
  const store2 = await openStore(path);
  const reusable = await loadReusableSessionArtifact(store2, { userId: user.id, portalAccountId: portal.id });
  assert.equal(reusable.present, true, "artifact readable after restart");
  const deref = await dereferenceSessionArtifact(store2, { vaultId: reusable.vaultId, sessionId: session.id });
  assert.equal(deref.resolved, true, JSON.stringify(deref));
  assert.equal(deref.plaintext, "cookie-blob-A1B2");
  assert.equal(
    createHash("sha256").update(deref.plaintext).digest("hex"),
    reusable.secretHash,
    "sha256(plaintext) matches the stored read-back hash"
  );
  const used = await store2.findOne("credential_session_vault", { id: reusable.vaultId });
  assert.ok(used.last_used_at, "dereference stamps last_used_at (behavior change)");

  // Negative arm: secret backend removed -> classified vault_pointer_unresolvable.
  destroySecret(used.secret_pointer);
  const broken = await dereferenceSessionArtifact(store2, { vaultId: reusable.vaultId, sessionId: session.id });
  assert.equal(broken.resolved, false);
  assert.equal(broken.failureClass, "vault_pointer_unresolvable");
  const failAudit = await store2.all("SELECT * FROM audit_events WHERE event_type = 'vault.dereference_failed';");
  assert.ok(failAudit.length >= 1, "loud failure is audited");
  await store2.close?.();
});

test("plan identity: real extraction ingest -> restart read-back -> planner payload projection", async () => {
  const path = await freshStorePath();
  const store = await openStore(path);
  const { user, session } = await enrollDefaultMember(store);
  const portal = await store.get("SELECT * FROM portal_accounts WHERE user_id = ?;", [user.id]);

  // Control: no verified identity -> empty planner projection.
  assert.deepEqual(await loadPlannerPlanIdentities(store, { userId: user.id }), []);

  // Turn 1: the REAL persistence path (portal extraction) anchors the identity.
  await persistEligibilitySnapshot(store, {
    user, session, portal,
    browserResult: {
      page: { url: `${portal.portal_url}member/benefits` },
      extraction: {
        summary: "Member plan page with coverage details.",
        fullText: "Open Access Managed Choice - Deductible $600",
        signals: ["deductible"],
        memberId: "W123456789",
        planName: "Open Access Managed Choice",
        planType: "PPO"
      }
    }
  });
  const identityAudit = await store.all("SELECT * FROM audit_events WHERE event_type = 'plan_identity.ingested';");
  assert.equal(identityAudit.length, 1);
  await store.close?.();

  // RESTART: independent read-back flips the planner-visible plan context.
  const store2 = await openStore(path);
  const identities = await loadPlannerPlanIdentities(store2, { userId: user.id });
  assert.equal(identities.length, 1);
  assert.equal(identities[0].verificationStatus, "portal_verified");
  assert.ok(identities[0].sourcePointerId, "source_pointer_id joins back to the snapshot");
  const snapshot = await store2.findOne("eligibility_snapshots", { id: identities[0].sourcePointerId });
  assert.ok(snapshot, "the pointer dereferences to the real snapshot row");
  // No raw member id anywhere planner-visible.
  assert.ok(!JSON.stringify(identities).includes("W123456789"), "member id never leaves as plaintext");
  // Payload projection (prompt layer 3): the planner SEES the verified identity.
  const payload = buildLlmOrchestrationDecisionPayload({
    user_input: "what plan do I have?",
    context_packet: { planIdentities: identities }
  });
  assert.equal(payload.planIdentities.length, 1);
  assert.equal(payload.planIdentities[0].verificationStatus, "portal_verified");
  // Idempotent upsert: same identity again -> still one row.
  await ingestPlanIdentity(store2, {
    userId: user.id, portalAccountId: portal.id, payer: portal.payer, memberId: "W123456789",
    planName: "Open Access Managed Choice", sourceKind: "portal_extraction", sourcePointerId: snapshot.id, sessionId: session.id
  });
  assert.equal((await store2.all("SELECT id FROM member_plan_identities WHERE user_id = ?;", [user.id])).length, 1);
  await store2.close?.();
});

test("MRF: idempotent re-ingest -> cited evidence passes the coverage-number guard; stripped pointer rejected", async () => {
  const path = await freshStorePath();
  const store = await openStore(path);
  await seedCapabilityCatalog(store, { nowIso, createId });

  const source = await recordMrfSource(store, {
    payer: "Aetna", sourceUrl: "https://health1.aetna.com/mrf/2026-06/in-network.json.gz",
    fileKind: "in_network_rates", fileMonth: "2026-06", contentHash: "abc123", ingestionRunId: "run-p85"
  });
  assert.equal(source.recorded, true);
  const rows = [
    { billingCode: "70551", billingCodeType: "CPT", geography: "miami", providerNpi: "1234567890", negotiatedType: "negotiated", negotiatedRate: 412.5, allowedAmount: 500 },
    { billingCode: "70551", billingCodeType: "CPT", geography: "miami", providerNpi: "9876543210", negotiatedType: "negotiated", negotiatedRate: 388.0, allowedAmount: 500 }
  ];
  const first = await ingestMrfObservations(store, { sourceId: source.sourceId, rows });
  assert.equal(first.inserted, 2);
  // Idempotent re-ingest: unchanged rows -> ZERO new observation rows.
  const again = await ingestMrfObservations(store, { sourceId: source.sourceId, rows });
  assert.equal(again.inserted, 0);
  assert.equal(again.skipped, 2);
  await store.close?.();

  // RESTART: the query feeds a cited answer that PASSES the coverage-number guard.
  const store2 = await openStore(path);
  const evidence = await queryMrfPriceEvidence(store2, { payer: "Aetna", billingCode: "70551" });
  assert.equal(evidence.length, 2);
  assert.ok(evidence.every((row) => row.sourcePointer && row.sourceUrl), "every row carries its citation locator");
  const answer = `The negotiated in-network rate for CPT 70551 is $${evidence[0].negotiatedRate}.`;
  const cited = await validateCapabilityAnswer(store2, { answer, sourcePointers: evidence });
  assert.equal(cited.valid, true, cited.issues.join("; "));
  // Doctored run: pointer stripped -> the deterministic guard rejects the dollar amount.
  const stripped = await validateCapabilityAnswer(store2, { answer, sourcePointers: [] });
  assert.equal(stripped.valid, false);
  assert.ok(stripped.issues.includes("coverage_number_without_source_pointer"));
  await store2.close?.();
});

test("audit v2: mixed v1+v2 chain verifies clean; tampering a v2 row's layer fails loud", async () => {
  const path = await freshStorePath();
  const store = await openStore(path);
  const sessionId = null; // root chain

  // A legacy v1 row, hashed with the v1 material (no layer) — exactly as old code wrote it.
  const v1Row = {
    id: createId("audit"),
    session_id: null,
    event_type: "legacy_v1_event",
    details: JSON.stringify({ legacy: true }),
    previous_event_hash: null,
    chain_version: AUDIT_CHAIN_VERSION_V1,
    created_at: nowIso()
  };
  v1Row.event_hash = createHash("sha256").update(JSON.stringify({
    id: v1Row.id, session_id: null, event_type: v1Row.event_type, details: v1Row.details,
    previous_event_hash: null, chain_version: v1Row.chain_version, created_at: v1Row.created_at
  })).digest("hex");
  await store.insert("audit_events", v1Row);

  // v2 rows through the real writer, with and without a layer tag.
  await audit(store, sessionId, "layer_tagged_event", { ok: true }, { layer: "layer_1_public" });
  await audit(store, sessionId, "untagged_runtime_event", { ok: true });

  const clean = await verifyAuditChain(store, { sessionId });
  assert.equal(clean.valid, true, JSON.stringify(clean.issues));
  assert.equal(clean.chainVersion, AUDIT_CHAIN_VERSION);
  assert.equal(clean.hashedCount, 3, "v1 and v2 rows verify in ONE chain via per-row dispatch");

  // Tamper: mutate the v2 row's layer — the tag is inside the v2 hash material.
  await store.all("UPDATE audit_events SET layer = 'layer_3_portal_control' WHERE event_type = 'layer_tagged_event';");
  const tampered = await verifyAuditChain(store, { sessionId });
  assert.equal(tampered.valid, false, "layer tamper must fail the chain");
  assert.ok(tampered.issues.some((issue) => issue.issue === "event_hash_mismatch"));

  // Restore and confirm clean again; then confirm a v1 row is NOT retro-invalidated
  // by the layer column (it hashes without layer regardless of the column value).
  await store.all("UPDATE audit_events SET layer = 'layer_1_public' WHERE event_type = 'layer_tagged_event';");
  await store.all("UPDATE audit_events SET layer = 'layer_2_member_authorized_api' WHERE event_type = 'legacy_v1_event';");
  const restored = await verifyAuditChain(store, { sessionId });
  assert.equal(restored.valid, true, JSON.stringify(restored.issues));
  await store.close?.();
});
