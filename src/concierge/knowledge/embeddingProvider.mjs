import { createHash } from "node:crypto";

// The SINGLE embedding-provider abstraction (plan §7 / founder decision #16, spine
// YAML embedding_policy) — no retrieval/ingest code may call a provider directly.
//
// Policy (fail-loud, never default-to-public):
// - PUBLIC/non-PHI data classes embed LIVE via OpenAI text-embedding-3-small.
// - PHI/member-document classes are BLOCKED at this abstraction (a loud, classified
//   refusal — an honest disabled_policy state, never contract_ready-by-omission)
//   until an OpenAI BAA or a Bedrock/KMS profile is active.
// - UNCLASSIFIED input is a loud refusal — never embed before the data-class exists.
export const EMBEDDING_POLICY_VERSION = "2026-07-03.embedding-policy.v1";
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_PROVIDER = "openai";

export const PUBLIC_EMBEDDABLE_DATA_CLASSES = Object.freeze([
  "official_payer_public",
  "official_employer_public",
  "cms_public",
  "mrf_public",
  "unauthenticated_public"
]);

export const PHI_BLOCKED_DATA_CLASSES = Object.freeze([
  "member_phi",
  "user_uploaded",
  "authenticated_portal",
  "member_authorized_api"
]);

function classifiedError(failureClass, message) {
  const error = new Error(message);
  error.failureClass = failureClass;
  return error;
}

// The policy chokepoint. Throws classified — callers never see a silent null.
export function assertEmbeddable(dataClass) {
  const value = String(dataClass ?? "").trim();
  if (!value) {
    throw classifiedError(
      "embedding_data_class_unclassified",
      "Refusing to embed unclassified data — classify the data-class first (never default-to-public)."
    );
  }
  if (PUBLIC_EMBEDDABLE_DATA_CLASSES.includes(value)) return value;
  if (PHI_BLOCKED_DATA_CLASSES.includes(value)) {
    throw classifiedError(
      "embedding_phi_blocked_no_baa",
      `Data class '${value}' is PHI/member-scoped — embedding is blocked-by-policy until an OpenAI BAA or Bedrock/KMS profile is active.`
    );
  }
  throw classifiedError(
    "embedding_data_class_unknown",
    `Data class '${value}' is not in the embedding policy — refusing loud (no default bucket).`
  );
}

export function embeddingBackendReadiness(env = process.env) {
  const configured = Boolean(env.OPENAI_API_KEY);
  return {
    policyVersion: EMBEDDING_POLICY_VERSION,
    provider: EMBEDDING_PROVIDER,
    model: EMBEDDING_MODEL,
    configured,
    publicClasses: PUBLIC_EMBEDDABLE_DATA_CLASSES,
    phiBlockedClasses: PHI_BLOCKED_DATA_CLASSES,
    phiEnabled: false // flips only via a BAA/Bedrock-KMS policy profile, never a flag
  };
}

// LIVE embedding call for a policy-cleared data class. Fail-loud on missing key or
// HTTP error — degraded retrieval must be visible, never a silent zero-vector.
export async function embedTexts(texts, { dataClass, env = process.env, timeoutMs = 30000 } = {}) {
  const clearedClass = assertEmbeddable(dataClass);
  const inputs = (Array.isArray(texts) ? texts : [texts]).map((text) => String(text ?? ""));
  if (!inputs.length || inputs.every((text) => !text.trim())) {
    throw classifiedError("embedding_input_empty", "Refusing to embed empty input.");
  }
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw classifiedError(
      "embedding_provider_unavailable",
      "OPENAI_API_KEY is not configured — live public-class embedding is unavailable (loud, not silent)."
    );
  }
  const baseURL = env.BRAINSTY_OPENAI_BASE_URL || "https://api.openai.com/v1";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${baseURL}/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
      signal: controller.signal
    });
  } catch (error) {
    throw classifiedError("embedding_provider_request_failed", `Embedding request failed: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw classifiedError("embedding_provider_http_error", `Embedding provider returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const payload = await response.json();
  const embeddings = (payload.data ?? []).map((row) => row.embedding);
  if (embeddings.length !== inputs.length) {
    throw classifiedError("embedding_provider_shape_mismatch", `Expected ${inputs.length} embeddings, got ${embeddings.length}.`);
  }
  return {
    provider: EMBEDDING_PROVIDER,
    model: EMBEDDING_MODEL,
    policyVersion: EMBEDDING_POLICY_VERSION,
    dataClass: clearedClass,
    dimension: embeddings[0]?.length ?? 0,
    embeddings
  };
}

export function sha256Hex(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

export function cosineSimilarity(a = [], b = []) {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    aNorm += a[i] * a[i];
    bNorm += b[i] * b[i];
  }
  if (!aNorm || !bNorm) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}
