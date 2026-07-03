import { createId, nowIso } from "./database.mjs";
import { audit } from "./audit.mjs";
import { evictOauthSessionRuntime, recordOauthSessionHandle } from "./oauthSessionRuntime.mjs";
import { dereferenceSecret, destroySecret, putSecret, sha256Hex } from "./secretBackend.mjs";

// credential_session_vault owner (three-layer pivot, plan §5.1) — SOLE writer and
// dereferencer. Pointers and hashes only; NO raw passwords/cookies/2FA in table
// columns (founder boundary). Every artifact is consent-FK-gated: unusable unless the
// user's consent row carries session_reuse_approved=1 (fail-closed default 0).
// This module also owns the DB-read consent/auth state snapshots hydrated into the
// graph's consent_state/auth_state channels (plan §4.1); the Redis mirrors arrive in
// Phase 86 and read through these same builders.
export const CREDENTIAL_VAULT_VERSION = "2026-07-02.credential-vault.v1";

export const VAULT_ARTIFACT_KINDS = Object.freeze(["session_cookie_bundle", "oauth_session_pointer"]);

async function activeConsent(store, userId) {
  return store.get(
    "SELECT * FROM user_consents WHERE user_id = ? ORDER BY created_at DESC LIMIT 1;",
    [userId]
  );
}

// Consent-state snapshot (plan §4.1): the user_consents row + derived per-data-layer
// executability. Missing row hydrates {missing:true} — fail-closed, the graph never
// writes it.
export async function loadConsentState(store, { userId } = {}) {
  if (!store || !userId) return { missing: true, reason: "no_store_or_user" };
  const consent = await activeConsent(store, userId);
  if (!consent) return { missing: true, reason: "no_consent_row" };
  return {
    missing: false,
    consentRowId: consent.id,
    credentialBoundary: consent.credential_boundary,
    sessionReuseApproved: consent.session_reuse_approved === 1,
    mrfPricingLookupApproved: consent.mrf_pricing_lookup_approved === 1,
    readOnlyExtractionApproved: consent.read_only_extraction_approved === 1,
    websiteActionsApproved: consent.website_actions_approved === 1,
    layers: {
      layer_1_public: { allowed: true },
      layer_2_member_authorized_api: { allowed: false, reason: "member_api_consent_not_yet_modeled" },
      layer_3_portal_control: {
        allowed: consent.read_only_extraction_approved === 1,
        writeActions: false
      }
    },
    snapshotAt: nowIso()
  };
}

// Auth-state snapshot (plan §4.1): portal account status + reusable vault artifact
// presence. Credential-free — respects the credential boundary (pointers only).
export async function loadAuthState(store, { userId } = {}) {
  if (!store || !userId) return { loginState: "unknown", portalAccountId: null };
  const portal = await store.get(
    "SELECT id, payer, portal_url, status FROM portal_accounts WHERE user_id = ? ORDER BY created_at DESC LIMIT 1;",
    [userId]
  );
  const artifact = portal ? await loadReusableSessionArtifact(store, { userId, portalAccountId: portal.id }) : { present: false };
  return {
    portalAccountId: portal?.id ?? null,
    payer: portal?.payer ?? null,
    portalStatus: portal?.status ?? null,
    loginState: artifact.present ? "logged_in" : "needs_login",
    sessionArtifact: artifact.present
      ? { vaultId: artifact.vaultId, artifactKind: artifact.artifactKind, expiresAt: artifact.expiresAt, reusable: true }
      : { present: false, reusable: false },
    lastVerifiedAt: artifact.present ? artifact.issuedAt : null,
    snapshotAt: nowIso()
  };
}

// WRITE path: cache a portal-session artifact after a real user-takeover login.
// Refuses loud without session-reuse consent (founder boundary: cached session
// material is reusable ONLY with documented user consent).
export async function cacheSessionArtifact(store, {
  userId, portalAccountId = null, artifactKind, plaintextArtifact,
  scope = [], expiresAt = null, sessionId = null
} = {}) {
  if (!VAULT_ARTIFACT_KINDS.includes(String(artifactKind))) {
    return { cached: false, reason: `artifact_kind_invalid:${artifactKind}` };
  }
  const consent = await activeConsent(store, userId);
  if (!consent || consent.session_reuse_approved !== 1) {
    await audit(store, sessionId, "vault.session_cache_refused", {
      userId, portalAccountId, reason: "session_reuse_not_approved"
    }, { layer: "layer_3_portal_control" });
    return { cached: false, reason: "session_reuse_not_approved" };
  }
  const secret = putSecret(plaintextArtifact, { scope });
  const row = {
    id: createId("vault"),
    user_id: userId,
    portal_account_id: portalAccountId,
    consent_id: consent.id,
    artifact_kind: artifactKind,
    secret_pointer: secret.secretPointer,
    envelope_json: JSON.stringify(secret.envelope),
    secret_hash: secret.secretHash,
    masked_preview: `${String(artifactKind)}:${secret.secretHash.slice(0, 8)}…`,
    scope_json: JSON.stringify(scope),
    status: "active",
    issued_at: nowIso(),
    expires_at: expiresAt,
    created_at: nowIso(),
    updated_at: nowIso()
  };
  await store.insert("credential_session_vault", row);
  await audit(store, sessionId, "vault.session_cached", {
    vaultId: row.id, userId, portalAccountId, artifactKind,
    secretHashPrefix: secret.secretHash.slice(0, 12), consentId: consent.id
  }, { layer: "layer_3_portal_control" });
  // Phase 86 (§6.1): mirror a pointer+hash HANDLE to the oauth-session runtime key —
  // Postgres row first (authoritative), Redis handle second. Never the plaintext.
  let oauthHandleMirror = null;
  if (sessionId) {
    try {
      oauthHandleMirror = await recordOauthSessionHandle({
        sessionId,
        handle: {
          portalAccountId,
          vaultPointer: `credential_session_vault#${row.id}`,
          tokenHash: secret.secretHash.slice(0, 24),
          scope,
          dataLayer: "layer_3_portal_control",
          riskTier: "medium",
          status: "active",
          expiresAt
        }
      });
    } catch (error) {
      oauthHandleMirror = { stored: false, storeError: error.message };
    }
  }
  return { cached: true, vaultId: row.id, maskedPreview: row.masked_preview, secretHash: secret.secretHash, oauthHandleMirror };
}

// READ path (metadata only — no plaintext): the newest active, unexpired artifact.
export async function loadReusableSessionArtifact(store, { userId, portalAccountId = null } = {}) {
  const row = await store.get(
    `SELECT * FROM credential_session_vault
     WHERE user_id = ? AND status = 'active'
       AND (expires_at IS NULL OR expires_at > ?)
       ${portalAccountId ? "AND portal_account_id = ?" : ""}
     ORDER BY issued_at DESC LIMIT 1;`,
    portalAccountId ? [userId, nowIso(), portalAccountId] : [userId, nowIso()]
  );
  if (!row) return { present: false };
  return {
    present: true,
    vaultId: row.id,
    artifactKind: row.artifact_kind,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    secretHash: row.secret_hash,
    maskedPreview: row.masked_preview
  };
}

// DEREFERENCE path: resolve the pointer through the secret backend, verify the
// read-back hash, stamp last_used_at, audit. Backend failure = loud classified
// vault_pointer_unresolvable (plan §5.5 negative arm), never a silent null.
export async function dereferenceSessionArtifact(store, { vaultId, sessionId = null } = {}) {
  const row = await store.findOne("credential_session_vault", { id: vaultId });
  if (!row || row.status !== "active") {
    return { resolved: false, failureClass: "vault_artifact_inactive", vaultId };
  }
  let plaintext;
  try {
    plaintext = dereferenceSecret(row.secret_pointer, JSON.parse(row.envelope_json || "{}"));
  } catch (error) {
    await audit(store, sessionId, "vault.dereference_failed", {
      vaultId, failureClass: error.failureClass ?? "vault_pointer_unresolvable", message: error.message
    }, { layer: "layer_3_portal_control" });
    return { resolved: false, failureClass: error.failureClass ?? "vault_pointer_unresolvable", vaultId, message: error.message };
  }
  if (sha256Hex(plaintext) !== row.secret_hash) {
    await audit(store, sessionId, "vault.dereference_failed", {
      vaultId, failureClass: "vault_secret_hash_mismatch"
    }, { layer: "layer_3_portal_control" });
    return { resolved: false, failureClass: "vault_secret_hash_mismatch", vaultId };
  }
  await store.update("credential_session_vault", { last_used_at: nowIso(), updated_at: nowIso() }, { id: vaultId });
  await audit(store, sessionId, "vault.session_dereferenced", {
    vaultId, artifactKind: row.artifact_kind, secretHashPrefix: row.secret_hash.slice(0, 12)
  }, { layer: "layer_3_portal_control" });
  return { resolved: true, vaultId, artifactKind: row.artifact_kind, plaintext };
}

export async function revokeSessionArtifact(store, { vaultId, reason = "revoked", sessionId = null } = {}) {
  const row = await store.findOne("credential_session_vault", { id: vaultId });
  if (!row) return { revoked: false, reason: "vault_row_missing" };
  destroySecret(row.secret_pointer);
  await store.update(
    "credential_session_vault",
    { status: "revoked", revoked_at: nowIso(), revocation_reason: reason, updated_at: nowIso() },
    { id: vaultId }
  );
  await audit(store, sessionId, "vault.session_revoked", { vaultId, reason }, { layer: "layer_3_portal_control" });
  // Phase 86 (§6.1): a revoked artifact's mirrored handle must not survive — targeted eviction.
  if (sessionId) {
    try { await evictOauthSessionRuntime(sessionId); } catch { /* mirror eviction best-effort; DB is authority */ }
  }
  return { revoked: true, vaultId };
}
