import { createId, nowIso } from "./database.mjs";
import { audit } from "./audit.mjs";

// Phase 87 (§7): the LIVE public-data HTTP client behind the configured_api executor —
// cms_public_data_api maps onto the existing cms_* knowledge rows through this module.
// Public, signature-free, keyless endpoints ONLY (layer_1_public). Every fetch records
// an honest run row (status public_api_fetch — no browser involved, stated as data)
// and writes the result into extraction_artifacts so composed answers cite a REAL,
// dereferenceable source pointer. Fail-loud on HTTP errors — never a fabricated row.
export const PUBLIC_DATA_CLIENTS_VERSION = "2026-07-03.public-data-clients.v1";

const CMS_DATA_API_BASE = "https://data.cms.gov/data-api/v1";

function classifiedError(failureClass, message) {
  const error = new Error(message);
  error.failureClass = failureClass;
  return error;
}

async function fetchJson(url, { timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { headers: { accept: "application/json" }, signal: controller.signal });
  } catch (error) {
    throw classifiedError("public_api_request_failed", `Public data request failed for ${url}: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw classifiedError("public_api_http_error", `Public data endpoint ${url} returned ${response.status}.`);
  }
  return response.json();
}

// Record the fetch as an honest run + artifact pair. The run row states plainly that
// no browser was involved; the artifact content carries the source URL + retrieval
// time so the §12 source-pointer guards can dereference and re-verify.
async function recordPublicApiArtifact(store, { sessionId, portalAccountId, sourceUrl, artifactType, payload }) {
  const runId = createId("apirun");
  await store.insert("browser_runs", {
    id: runId,
    session_id: sessionId,
    portal_account_id: portalAccountId,
    status: "completed_public_api_fetch",
    remote_debugger_url: "public_api:no_browser",
    start_url: sourceUrl,
    current_url: sourceUrl,
    page_title: artifactType,
    created_at: nowIso(),
    updated_at: nowIso()
  });
  const artifactId = createId("artifact");
  await store.insert("extraction_artifacts", {
    id: artifactId,
    browser_run_id: runId,
    artifact_type: artifactType,
    content: JSON.stringify({
      sourceUrl,
      retrievedAt: nowIso(),
      evidenceClass: "cms_public",
      dataLayer: "layer_1_public",
      payload
    }),
    created_at: nowIso()
  });
  await audit(store, sessionId, "public_api.artifact_recorded", {
    runId, artifactId, sourceUrl, artifactType
  }, { layer: "layer_1_public" });
  return { runId, artifactId, sourcePointer: `extraction_artifacts#${artifactId}`, sourceUrl };
}

// LIVE CMS data.cms.gov datastore fetch (keyless, public). datasetId is a CMS dataset
// UUID; filters use the documented data-api query params.
export async function fetchCmsDatasetRows(store, {
  datasetId,
  sessionId,
  portalAccountId,
  size = 5,
  offset = 0,
  filters = {},
  artifactType = "cms_public_dataset_rows"
} = {}) {
  if (!datasetId) throw classifiedError("public_api_dataset_missing", "datasetId is required.");
  const params = new URLSearchParams({ size: String(size), offset: String(offset) });
  for (const [column, value] of Object.entries(filters)) {
    params.set(`filter[${column}]`, String(value));
  }
  const url = `${CMS_DATA_API_BASE}/dataset/${encodeURIComponent(datasetId)}/data?${params.toString()}`;
  const rows = await fetchJson(url);
  if (!Array.isArray(rows)) {
    throw classifiedError("public_api_shape_unexpected", `CMS data-api returned a non-array payload for ${datasetId}.`);
  }
  const recorded = await recordPublicApiArtifact(store, {
    sessionId,
    portalAccountId,
    sourceUrl: url,
    artifactType,
    payload: { datasetId, rowCount: rows.length, rows }
  });
  return { version: PUBLIC_DATA_CLIENTS_VERSION, datasetId, rowCount: rows.length, rows, ...recorded };
}

// Read back a recorded public-API artifact (the dereference half of the pointer).
export async function loadPublicApiArtifact(store, artifactId) {
  const row = await store.findOne("extraction_artifacts", { id: artifactId });
  if (!row) {
    throw classifiedError("public_api_artifact_missing", `extraction_artifacts row '${artifactId}' not found.`);
  }
  return { id: row.id, artifactType: row.artifact_type, content: JSON.parse(row.content) };
}
