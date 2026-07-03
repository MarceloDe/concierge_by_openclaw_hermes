import { nowIso } from "./database.mjs";
import { createRuntimeContextCache } from "./runtimeContextCache.mjs";

// brainsty:oauth-session:<sessionId> — per-session OAuth/portal session HANDLES persisted
// to the runtime cache (plan §6.1, Phase 86). Shape mirrors workerRuntimeState.mjs.
// HARD INVARIANT: no raw token/cookie/secret/Authorization value ever enters this key —
// handles carry vault POINTERS (credential_session_vault#<rowId>) and sha256-prefix
// hashes only, the same discipline as llm-output-index rawOutputStored:false. The
// authoritative record is the credential_session_vault row (credentialVault.mjs owner).
export const OAUTH_SESSION_RUNTIME_VERSION = "2026-07-03.oauth-session-runtime.v1";

export function oauthSessionKey(sessionId) {
  return `brainsty:oauth-session:${sessionId}`;
}

// The ONLY fields a handle may carry. Building from a whitelist (never spreading the
// caller's object) is what enforces the no-raw-secret invariant by construction.
function shapeHandle(handle = {}) {
  const tokenHash = String(handle.tokenHash ?? "").slice(0, 24);
  const vaultPointer = String(handle.vaultPointer ?? "");
  if (!vaultPointer.startsWith("credential_session_vault#")) {
    const error = new Error(`oauth_session_handle_invalid_pointer:${vaultPointer || "empty"}`);
    error.failureClass = "oauth_session_handle_invalid_pointer";
    throw error;
  }
  if (!tokenHash) {
    const error = new Error("oauth_session_handle_missing_token_hash");
    error.failureClass = "oauth_session_handle_missing_token_hash";
    throw error;
  }
  return {
    portalAccountId: handle.portalAccountId ?? null,
    vaultPointer,
    tokenHash,
    scope: Array.isArray(handle.scope) ? handle.scope.map(String) : [],
    dataLayer: handle.dataLayer ?? null,
    riskTier: handle.riskTier ?? null,
    status: handle.status ?? "active",
    expiresAt: handle.expiresAt ?? null,
    recordedAt: nowIso()
  };
}

// TTL = min(1800, seconds-to-token-expiry) so the mirror can never outlive the token.
function handleTtlSeconds(handle, cap = 1800) {
  if (!handle.expiresAt) return cap;
  const remaining = Math.floor((new Date(handle.expiresAt).getTime() - Date.now()) / 1000);
  if (!Number.isFinite(remaining)) return cap;
  return Math.max(1, Math.min(cap, remaining));
}

// WRITE path: append/replace the handle for its vaultPointer and persist. Called from
// the real vault write path (credentialVault.cacheSessionArtifact) after the
// authoritative credential_session_vault row exists — Postgres-before-Redis.
export async function recordOauthSessionHandle({ sessionId, handle, ttlSeconds = null } = {}) {
  if (!sessionId) return { stored: false, reason: "no_session_id" };
  const cache = createRuntimeContextCache();
  const key = oauthSessionKey(sessionId);
  const shaped = shapeHandle(handle);
  let prior = null;
  try {
    prior = await cache.adapter.get(key);
  } catch {
    prior = null;
  }
  const handles = [
    ...(Array.isArray(prior?.handles) ? prior.handles.filter((h) => h.vaultPointer !== shaped.vaultPointer) : []),
    shaped
  ].slice(-10);
  const next = { version: OAUTH_SESSION_RUNTIME_VERSION, sessionId, handles, updatedAt: shaped.recordedAt };
  let stored = false;
  let storeError = null;
  try {
    await cache.adapter.set(key, next, { ttlSeconds: ttlSeconds ?? handleTtlSeconds(shaped) });
    stored = true;
  } catch (error) {
    storeError = error.message;
  }
  return { cacheBackend: cache.backend, cacheKey: key, stored, storeError, handleCount: handles.length, state: next };
}

export async function readOauthSessionRuntime(sessionId) {
  const cache = createRuntimeContextCache();
  const key = oauthSessionKey(sessionId);
  try {
    const state = await cache.adapter.get(key);
    return { cacheBackend: cache.backend, cacheKey: key, cacheHit: Boolean(state), handles: state?.handles ?? [] };
  } catch (error) {
    return { cacheBackend: cache.backend, cacheKey: key, cacheHit: false, handles: [], error: error.message };
  }
}

// Targeted eviction — called from the vault revoke path so a revoked artifact's handle
// can never be read back for the rest of the mirror TTL.
export async function evictOauthSessionRuntime(sessionId) {
  const cache = createRuntimeContextCache();
  const key = oauthSessionKey(sessionId);
  try {
    return { evicted: (await cache.adapter.del(key)) > 0, cacheKey: key };
  } catch (error) {
    return { evicted: false, cacheKey: key, error: error.message };
  }
}
