// Phase 90 Part 1 proofs (plan §5.2/§9/§11) — the S1-INDEPENDENT substrate: real
// encrypted OAuth-grant vault (secretBackend AES-256-GCM), reauth-required expiry flip
// (never a silent retry), rail probe as a stored fact with a LIVE unauthenticated
// Aetna-sandbox metadata probe arm. The full sandbox OAuth member flow is BLOCKED on
// founder action S1 (developer-portal registration) — recorded loudly, never faked.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import {
  dereferenceOauthGrant,
  memberDataRail,
  recordMemberDataRail,
  revokeOauthGrant,
  storeOauthGrant
} from "../concierge/connectors/tokenVault.mjs";
import { upsertConnectorEndpoint, probeConnectorEndpoint } from "../concierge/connectors/endpointRegistry.mjs";

process.env.BRAINSTY_REDIS_URL = "";
process.env.REDIS_URL = "";

async function seededStore(prefix) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const store = await new SqliteStore(join(dir, "t.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  return store;
}

test("Phase 90: oauth grant vault — encrypted store, hash-verified dereference, expiry flips reauth_required (reconnect ask), revoke destroys", async () => {
  const store = await seededStore("brainsty-p90-vault-");
  const { user, session } = await enrollDefaultMember(store);
  const token = "sandbox-access-token-material-1234567890";

  const stored = await storeOauthGrant(store, {
    userId: user.id, payerKey: "aetna", scope: "launch/patient patient/*.read",
    accessToken: token, refreshToken: null,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), sessionId: session.id
  });
  // Ciphertext-only in the table; metadata in columns.
  const row = await store.findOne("connector_oauth_grants", { id: stored.grantId });
  assert.equal(row.access_token_ciphertext.includes(token), false, "raw token never in the table");
  assert.equal(row.status, "connected");

  const deref = await dereferenceOauthGrant(store, { grantId: stored.grantId, sessionId: session.id });
  assert.equal(deref.resolved, true);
  assert.equal(deref.accessToken, token, "hash-verified round trip");

  // EXPIRY: flip to reauth_required — a first-class reconnect state, never silent.
  await store.update("connector_oauth_grants", { expires_at: new Date(Date.now() - 1000).toISOString() }, { id: stored.grantId });
  const expired = await dereferenceOauthGrant(store, { grantId: stored.grantId, sessionId: session.id });
  assert.equal(expired.resolved, false);
  assert.equal(expired.failureClass, "oauth_grant_reauth_required");
  assert.equal(expired.reconnectAsk, true);
  const flipped = await store.findOne("connector_oauth_grants", { id: stored.grantId });
  assert.equal(Number(flipped.reauth_required), 1);
  assert.equal(flipped.status, "reauth_required");
  const reauthAudit = await store.all("SELECT * FROM audit_events WHERE session_id = ? AND event_type = 'oauth_grant.reauth_required';", [session.id]);
  assert.equal(reauthAudit.length, 1, "the loud classified reauth span is audited");

  const revoked = await revokeOauthGrant(store, { grantId: stored.grantId, sessionId: session.id });
  assert.equal(revoked.revoked, true);
  const afterRevoke = await dereferenceOauthGrant(store, { grantId: stored.grantId });
  assert.equal(afterRevoke.failureClass, "oauth_grant_revoked");
});

test("Phase 90: member data rail — a probed stored fact (fail-closed portal_only), LIVE sandbox metadata probe arm", async (t) => {
  const store = await seededStore("brainsty-p90-rail-");
  const { user } = await enrollDefaultMember(store);

  // Fail-closed: unprobed member is portal_only.
  const unprobed = await memberDataRail(store, { userId: user.id, payerKey: "aetna" });
  assert.equal(unprobed.rail, "portal_only");
  assert.equal(unprobed.unprobed, true);

  // LIVE arm: the Aetna sandbox Patient Access metadata answers UNAUTHENTICATED —
  // record the endpoint + probe, then the honest pre-S1 rail outcome (portal_only,
  // evidence = the stored probe; api_covered requires the S1 member OAuth flow).
  await upsertConnectorEndpoint(store, {
    payerKey: "aetna", connectorKind: "patient_access_fhir_sandbox",
    baseUrl: "https://vteapif1.aetna.com/fhirdemo/v1/patientaccess", authMode: "member_oauth",
    quirks: { sandboxRefreshTokens: "none_five_minute_access_life", registrationGate: "founder_action_s1_developer_portal" }
  });
  const probe = await probeConnectorEndpoint(store, { payerKey: "aetna", connectorKind: "patient_access_fhir_sandbox" });
  if (probe.status !== "connected") {
    t.skip(`live sandbox metadata unreachable (${JSON.stringify(probe)}) — skip-loud`);
    return;
  }
  const endpointRow = await store.get("SELECT id FROM connector_endpoints WHERE payer_key = 'aetna' AND connector_kind = 'patient_access_fhir_sandbox';");
  const recorded = await recordMemberDataRail(store, {
    userId: user.id, payerKey: "aetna", rail: "portal_only",
    probeEvidencePointer: `connector_endpoints#${endpointRow.id}`
  });
  assert.equal(recorded.rail, "portal_only");
  const rail = await memberDataRail(store, { userId: user.id, payerKey: "aetna" });
  assert.equal(rail.rail, "portal_only");
  assert.ok(rail.probeEvidencePointer.startsWith("connector_endpoints#"), "rail selection is DATA with probe evidence");

  // Idempotent update path (the post-S1 flip target is api_covered via a REAL member read).
  const updated = await recordMemberDataRail(store, { userId: user.id, payerKey: "aetna", rail: "portal_only", probeEvidencePointer: rail.probeEvidencePointer });
  assert.equal(updated.updated, true);
});
