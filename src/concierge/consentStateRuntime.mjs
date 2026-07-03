import { nowIso } from "./database.mjs";
import { createRuntimeContextCache } from "./runtimeContextCache.mjs";
import { loadConsentState as buildConsentSnapshotFromDb } from "./credentialVault.mjs";

// brainsty:consent-state:<sessionId> — Redis mirror of the AUTHORITATIVE user_consents
// row + derived per-data-layer executability (plan §6.1, Phase 86). The mirror is NEVER
// the consent authority: it is evicted synchronously inside every user_consents write
// (targeted-eviction pattern of the catalog quarantine eviction), and revocation safety
// is additionally guaranteed by DB-side re-checks (resumeRun consent-revocation re-plan
// reads the user_consents row directly, never this key).
export const CONSENT_STATE_RUNTIME_VERSION = "2026-07-03.consent-state-runtime.v1";

export function consentStateKey(sessionId) {
  return `brainsty:consent-state:${sessionId}`;
}

// Build the mirror value FROM POSTGRES (authoritative) via the Phase 85 consent-state
// builder in credentialVault (one derivation for the graph channel and this mirror —
// they can never disagree). Missing consent row keeps the fail-closed layer denials.
export async function buildConsentStateFromDb(store, { userId } = {}) {
  const snapshot = await buildConsentSnapshotFromDb(store, { userId });
  return {
    version: CONSENT_STATE_RUNTIME_VERSION,
    userId: userId ?? null,
    missing: snapshot.missing === true,
    consentRowId: snapshot.consentRowId ?? null,
    credentialBoundary: snapshot.credentialBoundary ?? "user_only",
    sessionReuseApproved: snapshot.sessionReuseApproved === true,
    mrfPricingLookupApproved: snapshot.mrfPricingLookupApproved === true,
    readOnlyExtractionApproved: snapshot.readOnlyExtractionApproved === true,
    websiteActionsApproved: snapshot.websiteActionsApproved === true,
    layers: snapshot.layers ?? {
      layer_1_public: { allowed: true },
      layer_2_member_authorized_api: { allowed: false, reason: "no_consent_row" },
      layer_3_portal_control: { allowed: false, writeActions: false }
    },
    mirroredAt: nowIso()
  };
}

// Whether the authoritative-derived consent state allows a data layer. Used by the
// resumeRun revocation re-plan (which feeds it a fresh DB-built state, never the mirror).
export function consentAllowsDataLayer(consentState, dataLayer) {
  if (!dataLayer || dataLayer === "layer_1_public") return true;
  return consentState?.layers?.[dataLayer]?.allowed === true;
}

// READ half (rebuild-on-miss, Postgres-before-Redis): cache hit fast path; on miss
// rebuild from the authoritative user_consents row and re-mirror.
export async function loadConsentState(store, { sessionId, userId, ttlSeconds = 1800 } = {}) {
  const cache = createRuntimeContextCache();
  const cacheKey = consentStateKey(sessionId);
  let cached = null;
  try {
    cached = await cache.adapter.get(cacheKey);
  } catch {
    cached = null;
  }
  if (cached) {
    return { backend: cache.backend, cacheKey, cacheHit: true, consentState: cached };
  }
  const consentState = await buildConsentStateFromDb(store, { userId });
  let stored = false;
  try {
    await cache.adapter.set(cacheKey, consentState, { ttlSeconds });
    stored = true;
  } catch {
    /* visible degrade: backend reported on the result */
  }
  return { backend: cache.backend, cacheKey, cacheHit: false, stored, rebuiltFromDb: true, consentState };
}

// Synchronous targeted eviction — MUST be called inside every user_consents write path
// (and by the resumeRun consent-revocation re-plan) so the mirror can never outlive a flip.
export async function evictConsentState(sessionIds = []) {
  const cache = createRuntimeContextCache();
  let evicted = 0;
  for (const sessionId of sessionIds) {
    if (!sessionId) continue;
    try {
      evicted += (await cache.adapter.del(consentStateKey(sessionId))) ? 1 : 0;
    } catch {
      /* eviction is best-effort on the mirror; DB re-checks are the safety net */
    }
  }
  return { evicted, requested: sessionIds.length };
}
