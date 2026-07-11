import { audit } from "../audit.mjs";
import { createId, nowIso } from "../database.mjs";
import { createFhirClient } from "./fhirClient.mjs";
import { dereferenceOauthGrant, recordMemberDataRail, storeOauthGrant } from "./tokenVault.mjs";

export const AETNA_PATIENT_ACCESS_VERSION = "2026-07-11.aetna-patient-access-sandbox.v1";
export const AETNA_SANDBOX = Object.freeze({
  audience: "https://vteapif1.aetna.com/fhirdemo",
  authorizeUrl: "https://vteapif1.aetna.com/fhirdemo/v1/fhirserver_auth/oauth2/authorize",
  tokenUrl: "https://vteapif1.aetna.com/fhirdemo/v1/fhirserver_auth/oauth2/token",
  fhirBaseUrl: "https://vteapif1.aetna.com/fhirdemo",
  scope: "launch/patient patient/*.read"
});
export const AETNA_OAUTH_STATE_GATE = "aetna_patient_access_oauth_state";

function classifiedError(message, failureClass, extra = {}) {
  const error = new Error(message);
  error.failureClass = failureClass;
  Object.assign(error, extra);
  return error;
}

export function buildAetnaSandboxAuthorizationUrl({
  clientId,
  redirectUri,
  state,
  scope = AETNA_SANDBOX.scope,
  audience = AETNA_SANDBOX.audience,
  authorizeUrl = AETNA_SANDBOX.authorizeUrl,
  codeChallenge = null
} = {}) {
  if (!clientId || !redirectUri || !state) {
    throw classifiedError(
      "Aetna authorization requires clientId, redirectUri, and a caller-bound state value.",
      "aetna_oauth_authorization_missing_fields"
    );
  }
  const url = new URL(authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("aud", audience);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);
  if (codeChallenge) {
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

export async function createAetnaOauthStateGate(store, {
  userId,
  sessionId,
  portalAccountId,
  redirectUri,
  expiresInMinutes = 15
} = {}) {
  if (!userId || !sessionId || !portalAccountId || !redirectUri) {
    throw classifiedError(
      "Aetna OAuth state gate requires userId, sessionId, portalAccountId, and redirectUri.",
      "aetna_oauth_state_missing_fields"
    );
  }
  const state = createId("aetnastate");
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();
  const details = { state, userId, sessionId, portalAccountId, redirectUri, createdAt, expiresAt, consumedAt: null };
  const row = {
    id: createId("gate"),
    session_id: sessionId,
    gate_type: AETNA_OAUTH_STATE_GATE,
    decision: "pending",
    details: JSON.stringify(details),
    created_at: createdAt
  };
  await store.insert("approval_gates", row);
  await audit(store, sessionId, "aetna_patient_access.oauth_state_created", {
    gateId: row.id, userId, portalAccountId, expiresAt
  }, { layer: "layer_2_member_authorized_api" });
  return { gateId: row.id, state, expiresAt };
}

export async function consumeAetnaOauthStateGate(store, { state } = {}) {
  if (!state) {
    throw classifiedError("Aetna OAuth callback omitted state.", "aetna_oauth_state_missing");
  }
  const rows = await store.all(
    "SELECT * FROM approval_gates WHERE gate_type = ? ORDER BY created_at DESC;",
    [AETNA_OAUTH_STATE_GATE]
  );
  const row = rows.find((candidate) => {
    try {
      return JSON.parse(candidate.details || "{}").state === state;
    } catch {
      return false;
    }
  });
  if (!row) throw classifiedError("Aetna OAuth state was not found.", "aetna_oauth_state_not_found");
  const details = JSON.parse(row.details || "{}");
  if (details.consumedAt || row.decision === "approved_consumed") {
    throw classifiedError("Aetna OAuth state was already consumed.", "aetna_oauth_state_replayed");
  }
  if (new Date(details.expiresAt).getTime() <= Date.now()) {
    throw classifiedError("Aetna OAuth state expired.", "aetna_oauth_state_expired");
  }
  const consumedAt = nowIso();
  await store.update("approval_gates", {
    decision: "approved_consumed",
    details: JSON.stringify({ ...details, consumedAt })
  }, { id: row.id });
  await audit(store, details.sessionId, "aetna_patient_access.oauth_state_consumed", {
    gateId: row.id, userId: details.userId, portalAccountId: details.portalAccountId, consumedAt
  }, { layer: "layer_2_member_authorized_api" });
  return { gateId: row.id, ...details, consumedAt };
}

export async function exchangeAetnaSandboxAuthorizationCode({
  code,
  clientId,
  clientSecret,
  redirectUri,
  codeVerifier = null,
  tokenUrl = AETNA_SANDBOX.tokenUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = 30000
} = {}) {
  if (!code || !clientId || !clientSecret || !redirectUri) {
    throw classifiedError(
      "Aetna token exchange requires code, clientId, clientSecret, and redirectUri.",
      "aetna_oauth_exchange_missing_fields"
    );
  }
  if (typeof fetchImpl !== "function") {
    throw classifiedError("Aetna token exchange requires fetch.", "aetna_oauth_exchange_unavailable");
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri
  });
  if (codeVerifier) body.set("code_verifier", codeVerifier);
  const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  let response;
  try {
    response = await fetchImpl(tokenUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Basic ${basic}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (cause) {
    throw classifiedError(
      `Aetna token exchange failed: ${cause?.message ?? cause}`,
      "aetna_oauth_exchange_failed",
      { cause }
    );
  }
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw classifiedError("Aetna token response was not JSON.", "aetna_oauth_exchange_invalid_response", {
      httpStatus: response.status
    });
  }
  if (!response.ok || !payload?.access_token) {
    throw classifiedError(
      `Aetna token exchange returned HTTP ${response.status}.`,
      "aetna_oauth_exchange_rejected",
      { httpStatus: response.status, oauthError: payload?.error ?? null }
    );
  }
  const expiresInSeconds = Number(payload.expires_in);
  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw classifiedError("Aetna token response omitted a valid expires_in.", "aetna_oauth_exchange_invalid_response");
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    scope: payload.scope ?? AETNA_SANDBOX.scope,
    tokenType: payload.token_type ?? "Bearer",
    expiresInSeconds,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    patientId: payload.patient ?? null
  };
}

export async function completeAetnaSandboxOAuth(store, {
  userId,
  sessionId,
  code,
  clientId,
  clientSecret,
  redirectUri,
  codeVerifier = null,
  tokenUrl = AETNA_SANDBOX.tokenUrl,
  fetchImpl = globalThis.fetch
} = {}) {
  const token = await exchangeAetnaSandboxAuthorizationCode({
    code, clientId, clientSecret, redirectUri, codeVerifier, tokenUrl, fetchImpl
  });
  const stored = await storeOauthGrant(store, {
    userId,
    payerKey: "aetna",
    scope: token.scope,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: token.expiresAt,
    sessionId
  });
  const event = await audit(store, sessionId, "aetna_patient_access.oauth_completed", {
    version: AETNA_PATIENT_ACCESS_VERSION,
    grantId: stored.grantId,
    scope: token.scope,
    expiresAt: token.expiresAt,
    sandbox: true,
    hasRefreshToken: Boolean(token.refreshToken)
  }, { layer: "layer_2_member_authorized_api" });
  return {
    grantId: stored.grantId,
    expiresAt: token.expiresAt,
    scope: token.scope,
    patientId: token.patientId,
    proofPointer: `audit_events#${event.id}`
  };
}

function resourcesFrom(value, resourceType) {
  if (!value) return [];
  if (value.resourceType === resourceType) return [value];
  if (value.resourceType !== "Bundle" || !Array.isArray(value.entry)) return [];
  return value.entry.map((entry) => entry?.resource).filter((resource) => resource?.resourceType === resourceType);
}

async function collectSearch(client, path, resourceType, maxPages) {
  const resources = [];
  for await (const page of client.searchAll(path, {}, { maxPages })) {
    resources.push(...resourcesFrom(page, resourceType));
  }
  return resources;
}

function codingText(concept, fallback) {
  return concept?.text
    ?? concept?.coding?.find((coding) => coding?.display)?.display
    ?? concept?.coding?.find((coding) => coding?.code)?.code
    ?? fallback;
}

function moneyValue(value) {
  const number = Number(value?.value);
  return Number.isFinite(number) ? number : null;
}

function memberShare(eob) {
  const values = (eob?.total ?? [])
    .filter((total) => total?.category?.coding?.some((coding) => coding?.code === "memberliability"))
    .map((total) => moneyValue(total?.amount))
    .filter((value) => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function normalizeClaim(eob, snapshotId, source) {
  const firstItem = eob?.item?.[0] ?? null;
  return {
    id: createId("claim"),
    snapshot_id: snapshotId,
    description: codingText(eob?.type, codingText(firstItem?.productOrService, "Aetna claim")),
    member_name: null,
    service_date: eob?.billablePeriod?.start
      ?? firstItem?.servicedDate
      ?? firstItem?.servicedPeriod?.start
      ?? eob?.created
      ?? null,
    share_amount: memberShare(eob),
    raw_text: JSON.stringify({ resourceType: "ExplanationOfBenefit", status: eob?.status ?? null, outcome: eob?.outcome ?? null }),
    source,
    created_at: nowIso()
  };
}

function normalizeBalances(eob, snapshotId, source) {
  const rows = [];
  for (const benefit of eob?.benefitBalance ?? []) {
    for (const financial of benefit?.financial ?? []) {
      const total = moneyValue(financial?.allowedMoney);
      const spent = moneyValue(financial?.usedMoney);
      if (total === null && spent === null) continue;
      rows.push({
        id: createId("balance"),
        snapshot_id: snapshotId,
        balance_type: codingText(benefit?.category, "benefit"),
        label: codingText(financial?.type, codingText(benefit?.category, "Benefit balance")),
        total_amount: total,
        spent_amount: spent,
        remaining_amount: total !== null && spent !== null ? Math.max(0, total - spent) : null,
        currency: financial?.allowedMoney?.currency ?? financial?.usedMoney?.currency ?? "USD",
        source,
        created_at: nowIso()
      });
    }
  }
  return rows;
}

export async function syncAetnaSandboxPatientAccess(store, {
  userId,
  sessionId,
  portalAccountId,
  grantId,
  patientId = null,
  fhirBaseUrl = AETNA_SANDBOX.fhirBaseUrl,
  maxPages = 3
} = {}) {
  if (!userId || !sessionId || !portalAccountId || !grantId) {
    throw classifiedError(
      "Aetna Patient Access sync requires userId, sessionId, portalAccountId, and grantId.",
      "aetna_patient_access_missing_fields"
    );
  }
  const grant = await dereferenceOauthGrant(store, { grantId, sessionId });
  if (!grant.resolved) {
    return { synced: false, failureClass: grant.failureClass, reconnectAsk: Boolean(grant.reconnectAsk) };
  }
  const client = createFhirClient({
    baseUrl: fhirBaseUrl,
    authMode: "bearer",
    bearerToken: grant.accessToken,
    perHostMinIntervalMs: 0
  });
  const patientPath = patientId
    ? `v2/patientaccess/Patient/${encodeURIComponent(patientId)}`
    : "v2/patientaccess/Patient";
  const patientPayload = await client.get(patientPath);
  const patients = resourcesFrom(patientPayload, "Patient");
  if (!patients.length) {
    throw classifiedError("Aetna Patient Access returned no Patient resource.", "aetna_patient_access_member_not_found");
  }
  const [coverages, eobs] = await Promise.all([
    collectSearch(client, "v2/patientaccess/Coverage", "Coverage", maxPages),
    collectSearch(client, "v2/patientaccess/ExplanationOfBenefit", "ExplanationOfBenefit", maxPages)
  ]);
  const snapshot = {
    id: createId("snapshot"),
    user_id: userId,
    session_id: sessionId,
    portal_account_id: portalAccountId,
    source_url: `${String(fhirBaseUrl).replace(/\/+$/, "")}/v2/patientaccess`,
    summary: `Aetna Patient Access sandbox sync: ${coverages.length} coverage resource(s), ${eobs.length} EOB resource(s).`,
    raw_text: JSON.stringify({ patientResources: patients.length, coverageResources: coverages.length, explanationOfBenefitResources: eobs.length }),
    created_at: nowIso()
  };
  await store.insert("eligibility_snapshots", snapshot);
  const claims = [];
  const balances = [];
  for (const eob of eobs) {
    const source = `${snapshot.source_url}/ExplanationOfBenefit/${encodeURIComponent(eob?.id ?? "unknown")}`;
    const claim = normalizeClaim(eob, snapshot.id, source);
    await store.insert("claim_items", claim);
    claims.push(claim);
    for (const balance of normalizeBalances(eob, snapshot.id, source)) {
      await store.insert("coverage_balances", balance);
      balances.push(balance);
    }
  }
  const event = await audit(store, sessionId, "aetna_patient_access.sync_completed", {
    version: AETNA_PATIENT_ACCESS_VERSION,
    grantId,
    snapshotId: snapshot.id,
    patientResources: patients.length,
    coverageResources: coverages.length,
    explanationOfBenefitResources: eobs.length,
    claimRows: claims.length,
    coverageBalanceRows: balances.length,
    sandbox: true
  }, { layer: "layer_2_member_authorized_api" });
  await recordMemberDataRail(store, {
    userId,
    payerKey: "aetna",
    rail: "api_covered",
    probeEvidencePointer: `audit_events#${event.id}`
  });
  return {
    synced: true,
    snapshot,
    structured: { claims, coverageBalances: balances },
    rail: "api_covered",
    proofPointer: `audit_events#${event.id}`
  };
}
