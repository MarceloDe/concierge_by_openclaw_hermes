import { createId, nowIso } from "./database.mjs";
import { audit } from "./audit.mjs";
import { sha256Hex } from "./secretBackend.mjs";

// CANONICAL MRF store owner (three-layer pivot, plan §5.1): mrf_pricing_sources +
// mrf_price_observations — exactly one normalized MRF schema, one owner module.
// Generic from day one (founder #6): never hardwired to a payer; Aetna + Miami/UM is
// only the FIRST SLICE. All 15 founder keys are carried (payer, employer_id,
// plan_external_id, network_id, geography, provider_npi, provider_tin_hash,
// billing_code+type, place_of_service, billing_class, negotiated_rate,
// allowed_amount, source_url, file_month, ingestion_run_id).
// Exposure rule (hard, plan §5.1): MRF rows are NEVER injected into planner metadata —
// prices flow only as evidence + source_pointers to the composer, satisfying the
// deterministic dollar-amounts-require-source-pointers guard.
export const MRF_PRICING_VERSION = "2026-07-02.mrf-pricing.v1";

export async function recordMrfSource(store, {
  payer, sourceUrl, fileKind, fileMonth = null, contentHash = null,
  effectiveAt = null, retrievedAt = null, ingestionRunId = null, stats = {}, sessionId = null
} = {}) {
  if (!payer || !sourceUrl || !fileKind) return { recorded: false, reason: "missing_source_fields" };
  const existing = await store.get(
    "SELECT id FROM mrf_pricing_sources WHERE source_url = ? AND content_hash IS ?;",
    [sourceUrl, contentHash]
  ).catch(async () =>
    store.get("SELECT id FROM mrf_pricing_sources WHERE source_url = ? AND content_hash = ?;", [sourceUrl, contentHash])
  );
  if (existing) {
    await store.update("mrf_pricing_sources", { retrieved_at: retrievedAt ?? nowIso(), updated_at: nowIso() }, { id: existing.id });
    return { recorded: true, sourceId: existing.id, deduped: true };
  }
  const id = createId("mrfsrc");
  await store.insert("mrf_pricing_sources", {
    id,
    payer: String(payer),
    source_url: String(sourceUrl),
    file_kind: String(fileKind),
    file_month: fileMonth,
    content_hash: contentHash,
    effective_at: effectiveAt,
    retrieved_at: retrievedAt ?? nowIso(),
    ingestion_run_id: ingestionRunId,
    status: "fetched",
    ingest_stats_json: JSON.stringify(stats ?? {}),
    created_at: nowIso(),
    updated_at: nowIso()
  });
  await audit(store, sessionId, "mrf.source_recorded", {
    sourceId: id, payer, sourceUrl, fileKind, fileMonth, ingestionRunId
  }, { layer: "layer_1_public" });
  return { recorded: true, sourceId: id, deduped: false };
}

function observationContentHash(sourceId, row) {
  return sha256Hex(JSON.stringify({
    sourceId,
    payer: row.payer ?? null,
    employerId: row.employerId ?? null,
    planExternalId: row.planExternalId ?? null,
    networkId: row.networkId ?? null,
    geography: row.geography ?? null,
    billingCode: row.billingCode,
    billingCodeType: row.billingCodeType,
    billingClass: row.billingClass ?? null,
    placeOfService: row.placeOfService ?? null,
    providerNpi: row.providerNpi ?? null,
    negotiatedType: row.negotiatedType ?? null,
    negotiatedRate: row.negotiatedRate ?? null,
    allowedAmount: row.allowedAmount ?? null,
    effectiveFromAt: row.effectiveFromAt ?? null
  }));
}

// Idempotent ingest: row_content_hash is the authoritative dedupe (idempotency
// precedent: workflow_checkpoint_runs). Re-ingesting an unchanged slice inserts ZERO
// new rows (plan §5.5 proof).
export async function ingestMrfObservations(store, { sourceId, rows = [], sessionId = null } = {}) {
  const source = await store.findOne("mrf_pricing_sources", { id: sourceId });
  if (!source) return { ingested: false, reason: "mrf_source_missing" };
  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!row?.billingCode || !row?.billingCodeType) {
      skipped += 1;
      continue;
    }
    const rowContentHash = observationContentHash(sourceId, row);
    const existing = await store.get("SELECT id FROM mrf_price_observations WHERE row_content_hash = ?;", [rowContentHash]);
    if (existing) {
      skipped += 1;
      continue;
    }
    await store.insert("mrf_price_observations", {
      id: createId("mrfobs"),
      source_id: sourceId,
      payer: row.payer ?? source.payer,
      employer_id: row.employerId ?? null,
      plan_external_id: row.planExternalId ?? null,
      network_id: row.networkId ?? null,
      geography: row.geography ?? null,
      billing_code: String(row.billingCode),
      billing_code_type: String(row.billingCodeType),
      billing_class: row.billingClass ?? null,
      place_of_service: row.placeOfService ?? null,
      provider_npi: row.providerNpi ?? null,
      provider_tin_hash: row.providerTin ? sha256Hex(String(row.providerTin)) : (row.providerTinHash ?? null),
      negotiated_type: row.negotiatedType ?? null,
      negotiated_rate: row.negotiatedRate ?? null,
      allowed_amount: row.allowedAmount ?? null,
      service_codes_json: JSON.stringify(row.serviceCodes ?? []),
      effective_from_at: row.effectiveFromAt ?? null,
      effective_to_at: row.effectiveToAt ?? null,
      ingestion_run_id: row.ingestionRunId ?? source.ingestion_run_id ?? null,
      row_content_hash: rowContentHash,
      source_pointer: `${source.source_url}#${row.billingCode}/${row.providerNpi ?? "any"}`,
      created_at: nowIso()
    });
    inserted += 1;
  }
  await store.update("mrf_pricing_sources", {
    status: "normalized",
    ingest_stats_json: JSON.stringify({ inserted, skipped, at: nowIso() }),
    updated_at: nowIso()
  }, { id: sourceId });
  await audit(store, sessionId, "mrf.observations_ingested", {
    sourceId, inserted, skipped, payer: source.payer
  }, { layer: "layer_1_public" });
  return { ingested: true, sourceId, inserted, skipped };
}

// Evidence query: cited price observations for the composer path. Every row carries
// its source_pointer citation locator — the composer's coverage-number guard demands it.
export async function queryMrfPriceEvidence(store, {
  payer = null, billingCode = null, planExternalId = null, geography = null, limit = 5
} = {}) {
  if (!billingCode) return [];
  const clauses = ["o.billing_code = ?"];
  const params = [String(billingCode)];
  // Payer PREFIX family match (Phase 89): the auth-state payer is the brand ("Aetna");
  // MRF reporting entities carry the legal name ("Aetna Life Insurance Company").
  if (payer) { clauses.push("o.payer LIKE ?"); params.push(`${String(payer)}%`); }
  if (planExternalId) { clauses.push("o.plan_external_id = ?"); params.push(String(planExternalId)); }
  if (geography) { clauses.push("o.geography = ?"); params.push(String(geography)); }
  const bounded = Math.max(1, Math.min(20, Number(limit) || 5));
  const rows = await store.all(
    `SELECT o.*, s.source_url, s.file_month FROM mrf_price_observations o
     JOIN mrf_pricing_sources s ON s.id = o.source_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY o.created_at DESC LIMIT ${bounded};`,
    params
  );
  return rows.map((row) => ({
    table: "mrf_price_observations",
    id: row.id,
    summary: `MRF ${row.payer} ${row.billing_code_type} ${row.billing_code}${row.geography ? ` (${row.geography})` : ""}: negotiated ${row.negotiated_rate ?? "n/a"} / allowed ${row.allowed_amount ?? "n/a"} (${row.file_month ?? "month n/a"})`,
    sourceUrl: row.source_url,
    sourcePointer: row.source_pointer,
    negotiatedRate: row.negotiated_rate,
    allowedAmount: row.allowed_amount,
    billingCode: row.billing_code,
    billingCodeType: row.billing_code_type,
    payer: row.payer,
    geography: row.geography
  }));
}

// Detect a shoppable billing code in free text (CPT 5-digit / HCPCS letter+4).
export function extractBillingCode(text) {
  const match = String(text ?? "").match(/\b(\d{5}|[A-Z]\d{4})\b/);
  return match ? match[1] : null;
}
