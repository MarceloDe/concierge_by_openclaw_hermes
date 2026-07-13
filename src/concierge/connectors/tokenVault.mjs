import { createId, nowIso } from "../database.mjs";
import { audit } from "../audit.mjs";
import { dereferenceSecret, destroySecret, putSecret, sha256Hex } from "../secretBackend.mjs";

// connector_oauth_grants owner (Phase 90, plan §5.2 vault split) — API-rail OAuth
// grants, DISTINCT from the browser-rail credential_session_vault. SOLE writer and
// dereferencer. Access/refresh tokens are ciphertext-only through the ONE secret
// backend (founder #5); metadata (scope, expiry, payer, consent linkage, status on the
// connector_status_values enum) lives in columns. An expired grant flips
// reauth_required=1 and surfaces as a reconnect ask — never a silent retry (founder #8).
export const TOKEN_VAULT_VERSION = "2026-07-03.connector-token-vault.v1";

export async function storeOauthGrant(store, {
  userId, payerKey, scope, accessToken, refreshToken = null, expiresAt = null, sessionId = null
} = {}) {
  if (!userId || !payerKey || !scope || !accessToken) {
    const error = new Error("OAuth grant storage requires userId, payerKey, scope, and the access token.");
    error.failureClass = "oauth_grant_missing_fields";
    throw error;
  }
  const access = putSecret(accessToken, { scope: [scope] });
  const refresh = refreshToken ? putSecret(refreshToken, { scope: [scope, "refresh"] }) : null;
  const row = {
    id: createId("grant"),
    user_id: userId,
    payer_key: payerKey,
    scope,
    access_token_ciphertext: access.secretPointer,
    refresh_token_ciphertext: refresh?.secretPointer ?? null,
    token_envelope_json: JSON.stringify({ access: access.envelope, refresh: refresh?.envelope ?? null }),
    access_token_hash: access.secretHash,
    status: "connected",
    expires_at: expiresAt,
    consent_recorded_at: nowIso(),
    reauth_required: 0,
    created_at: nowIso(),
    updated_at: nowIso()
  };
  await store.insert("connector_oauth_grants", row);
  await audit(store, sessionId, "oauth_grant.stored", {
    grantId: row.id, userId, payerKey, scope, expiresAt, hasRefreshToken: Boolean(refreshToken),
    accessTokenHashPrefix: access.secretHash.slice(0, 12)
  }, { layer: "layer_2_member_authorized_api" });
  return { grantId: row.id, accessTokenHash: access.secretHash };
}

// DEREFERENCE: expiry check FIRST — an expired grant flips reauth_required and returns
// the classified reconnect state (first-class, per the sandbox's ~5-min token life).
export async function dereferenceOauthGrant(store, { grantId, sessionId = null } = {}) {
  const row = await store.findOne("connector_oauth_grants", { id: grantId });
  if (!row) return { resolved: false, failureClass: "oauth_grant_not_found", grantId };
  if (row.status === "revoked") return { resolved: false, failureClass: "oauth_grant_revoked", grantId };
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    await store.update("connector_oauth_grants", { status: "reauth_required", reauth_required: 1, updated_at: nowIso() }, { id: grantId });
    await audit(store, sessionId, "oauth_grant.reauth_required", {
      grantId, userId: row.user_id, payerKey: row.payer_key, expiresAt: row.expires_at,
      userFacingAsk: "reconnect your plan"
    }, { layer: "layer_2_member_authorized_api" });
    return { resolved: false, failureClass: "oauth_grant_reauth_required", grantId, reconnectAsk: true };
  }
  const envelope = JSON.parse(row.token_envelope_json || "{}");
  let accessToken;
  try {
    accessToken = dereferenceSecret(row.access_token_ciphertext, envelope.access ?? {});
  } catch (error) {
    return { resolved: false, failureClass: error.failureClass ?? "vault_pointer_unresolvable", grantId };
  }
  if (sha256Hex(accessToken) !== row.access_token_hash) {
    return { resolved: false, failureClass: "oauth_grant_hash_mismatch", grantId };
  }
  await audit(store, sessionId, "oauth_grant.dereferenced", {
    grantId, userId: row.user_id, payerKey: row.payer_key, scope: row.scope
  }, { layer: "layer_2_member_authorized_api" });
  return { resolved: true, grantId, accessToken, payerKey: row.payer_key, scope: row.scope };
}

export async function revokeOauthGrant(store, { grantId, reason = "revoked", sessionId = null } = {}) {
  const row = await store.findOne("connector_oauth_grants", { id: grantId });
  if (!row) return { revoked: false, reason: "oauth_grant_not_found" };
  destroySecret(row.access_token_ciphertext);
  if (row.refresh_token_ciphertext) destroySecret(row.refresh_token_ciphertext);
  await store.update("connector_oauth_grants", { status: "revoked", reauth_required: 0, updated_at: nowIso() }, { id: grantId });
  await audit(store, sessionId, "oauth_grant.revoked", { grantId, reason }, { layer: "layer_2_member_authorized_api" });
  return { revoked: true, grantId };
}

// Rail probe (Phase 90, plan §9): records the member's data rail as a PROBED STORED
// FACT. Without S1 registration the API rail cannot carry member data, so the honest
// probe outcome is portal_only with the probe evidence pointer (the recorded
// endpoint-probe/audit row); after S1 + a real member OAuth the probe flips api_covered.
export async function recordMemberDataRail(store, { userId, payerKey, rail, probeEvidencePointer = null } = {}) {
  if (!["api_covered", "portal_only"].includes(rail)) {
    const error = new Error(`rail must be api_covered|portal_only; got ${rail}`);
    error.failureClass = "member_rail_invalid";
    throw error;
  }
  const existing = await store.get(
    "SELECT id FROM member_data_rails WHERE user_id = ? AND payer_key = ? LIMIT 1;", [userId, payerKey]
  );
  if (existing) {
    await store.update("member_data_rails", { rail, probe_evidence_pointer: probeEvidencePointer, probed_at: nowIso() }, { id: existing.id });
    return { railId: existing.id, rail, updated: true };
  }
  const id = createId("rail");
  await store.insert("member_data_rails", {
    id, user_id: userId, payer_key: payerKey, rail,
    probe_evidence_pointer: probeEvidencePointer, probed_at: nowIso(), created_at: nowIso()
  });
  return { railId: id, rail, updated: false };
}

export async function memberDataRail(store, { userId, payerKey } = {}) {
  const row = await store.get(
    "SELECT * FROM member_data_rails WHERE user_id = ? AND payer_key = ? LIMIT 1;", [userId, payerKey]
  );
  // Fail-closed: an unprobed member is portal_only (the browser rail always exists).
  return row ? { rail: row.rail, probedAt: row.probed_at, probeEvidencePointer: row.probe_evidence_pointer } : { rail: "portal_only", probedAt: null, unprobed: true };
}
