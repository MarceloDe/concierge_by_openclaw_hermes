// Phase 89 shared connector substrate (docs/THREE_LAYER_PLANNER_IMPLEMENTATION_PLAN.md §9):
// FHIR R4 GET client. Bearer/Basic header injection, Bundle.link[rel=next] async-iterator
// pagination (_count default 50), 429/Retry-After exponential backoff, per-host throttle.
// Dependency-free on purpose: uses Node's global fetch (Node 24). NOTE: the header-tolerance
// boundary for Aetna's Imperva non-strict-header quirk becomes an undici dispatcher HERE when
// the Aetna OAuth rail lands in Phase 90 — this module is the single place that changes.
// Errors are classified and thrown loud (error.failureClass), never a silent null.

const MAX_RETRIES = 4;
const FALLBACK_BACKOFF_MS = [1000, 2000, 4000, 8000];

// Per-host throttle state is module-level so every client talking to the same host shares one
// promise-chained gate (min interval between requests to that host).
const hostThrottleState = new Map();

function throttleHost(host, minIntervalMs) {
  if (!(minIntervalMs > 0)) return Promise.resolve();
  let state = hostThrottleState.get(host);
  if (!state) {
    state = { chain: Promise.resolve(), lastAt: 0 };
    hostThrottleState.set(host, state);
  }
  const gate = state.chain.then(async () => {
    const waitMs = state.lastAt + minIntervalMs - Date.now();
    if (waitMs > 0) await sleep(waitMs);
    state.lastAt = Date.now();
  });
  state.chain = gate.catch(() => {});
  return gate;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifiedError(message, { failureClass, httpStatus = null, cause = null }) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.failureClass = failureClass;
  if (httpStatus !== null) error.httpStatus = httpStatus;
  return error;
}

export function createFhirClient({
  baseUrl,
  authMode = "none",
  bearerToken = null,
  basicAuth = null,
  defaultCount = 50,
  perHostMinIntervalMs = 250,
  timeoutMs = 30000
} = {}) {
  if (!baseUrl) {
    throw classifiedError("createFhirClient requires baseUrl", { failureClass: "fhir_request_failed" });
  }
  const base = String(baseUrl).replace(/\/+$/, "");

  function authHeaders() {
    if (authMode === "none") return {};
    if (authMode === "bearer") {
      if (!bearerToken) {
        throw classifiedError("authMode=bearer but no bearerToken configured", { failureClass: "fhir_request_failed" });
      }
      return { authorization: `Bearer ${bearerToken}` };
    }
    if (authMode === "basic") {
      const username = basicAuth?.username ?? null;
      const password = basicAuth?.password ?? null;
      if (username === null || password === null) {
        throw classifiedError("authMode=basic but basicAuth {username,password} not configured", {
          failureClass: "fhir_request_failed"
        });
      }
      const encoded = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
      return { authorization: `Basic ${encoded}` };
    }
    throw classifiedError(`Unsupported authMode: ${authMode}`, { failureClass: "fhir_request_failed" });
  }

  function buildUrl(path, params = null) {
    const raw = String(path ?? "");
    const url = /^https?:\/\//i.test(raw)
      ? new URL(raw)
      : new URL(`${base}/${raw.replace(/^\/+/, "")}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  async function requestJson(url) {
    const headers = { accept: "application/fhir+json", ...authHeaders() };
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      await throttleHost(url.host, perHostMinIntervalMs);
      let response;
      try {
        response = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(timeoutMs) });
      } catch (cause) {
        throw classifiedError(`FHIR request failed: GET ${url} — ${cause?.message ?? cause}`, {
          failureClass: "fhir_request_failed",
          cause
        });
      }
      if (response.status === 429 && attempt < MAX_RETRIES) {
        // Honor Retry-After (seconds) when present; else exponential 1s/2s/4s/8s.
        const retryAfterSeconds = Number(response.headers.get("retry-after"));
        const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
          ? retryAfterSeconds * 1000
          : FALLBACK_BACKOFF_MS[Math.min(attempt, FALLBACK_BACKOFF_MS.length - 1)];
        await response.arrayBuffer().catch(() => {});
        await sleep(delayMs);
        continue;
      }
      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        throw classifiedError(
          `FHIR HTTP ${response.status} for GET ${url}${bodyText ? ` — ${bodyText.slice(0, 300)}` : ""}`,
          { failureClass: "fhir_http_error", httpStatus: response.status }
        );
      }
      try {
        return await response.json();
      } catch (cause) {
        throw classifiedError(`FHIR response was not JSON for GET ${url} — ${cause?.message ?? cause}`, {
          failureClass: "fhir_request_failed",
          cause
        });
      }
    }
    throw classifiedError(`FHIR request exhausted ${MAX_RETRIES} retries (429) for GET ${url}`, {
      failureClass: "fhir_http_error",
      httpStatus: 429
    });
  }

  async function get(path, params = null) {
    return requestJson(buildUrl(path, params));
  }

  async function capabilityStatement() {
    return get("metadata");
  }

  // Async iterator over Bundle pages following Bundle.link[rel=next]; stops at maxPages and
  // records the truncation as a note in the LAST page's meta (a next link remained).
  async function* searchAll(resourceType, params = {}, { maxPages = 5 } = {}) {
    let url = buildUrl(resourceType, { _count: defaultCount, ...params });
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const bundle = await requestJson(url);
      const nextUrl = Array.isArray(bundle?.link)
        ? (bundle.link.find((link) => link?.relation === "next")?.url ?? null)
        : null;
      if (nextUrl && pageNumber === maxPages) {
        bundle.meta = {
          ...(bundle.meta ?? {}),
          searchAllTruncated: {
            maxPages,
            nextUrl,
            note: `searchAll stopped at maxPages=${maxPages}; a next link remained`
          }
        };
        yield bundle;
        return;
      }
      yield bundle;
      if (!nextUrl) return;
      url = new URL(nextUrl);
    }
  }

  return { baseUrl: base, authMode, defaultCount, get, capabilityStatement, searchAll };
}
