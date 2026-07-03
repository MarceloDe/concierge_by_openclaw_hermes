import { createHash } from "node:crypto";
import { createId, nowIso } from "../database.mjs";
import { audit } from "../audit.mjs";

// Plan-Net provider directory connector (Phase 89, plan §9) — facade + batch sync into
// provider_directory_entries (the nightly delta mirror; 24h cache is safe under the
// CMS-9115-F 30-day freshness ceiling) with live fallback on miss. SOLE writer/reader
// of provider_directory_entries. Every row carries its directory source_url so a
// composed answer cites a REAL dereferenceable pointer. Public data (layer_1) only.
export const PLAN_NET_DIRECTORY_VERSION = "2026-07-03.plan-net-directory.v1";

function sha256Hex(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

// --- FHIR Bundle -> rows (pure; the shapes follow Plan-Net PractitionerRole with
// _include=practitioner,location — resolved from the bundle's entry pool) ---
export function directoryRowsFromBundle(bundle, { payerKey, sourceUrl }) {
  const entries = Array.isArray(bundle?.entry) ? bundle.entry : [];
  const pool = new Map();
  for (const entry of entries) {
    const resource = entry?.resource;
    if (resource?.resourceType && resource?.id) pool.set(`${resource.resourceType}/${resource.id}`, resource);
  }
  const rows = [];
  for (const entry of entries) {
    const role = entry?.resource;
    if (role?.resourceType !== "PractitionerRole") continue;
    const practitioner = role.practitioner?.reference ? pool.get(role.practitioner.reference.replace(/^.*?(Practitioner\/)/, "Practitioner/")) : null;
    const locationRef = Array.isArray(role.location) && role.location[0]?.reference ? role.location[0].reference : null;
    const location = locationRef ? pool.get(locationRef.replace(/^.*?(Location\/)/, "Location/")) : null;
    const specialtyCoding = role.specialty?.[0]?.coding?.[0] ?? null;
    const name = practitioner?.name?.[0];
    const practitionerName = name ? [name.prefix?.join(" "), name.given?.join(" "), name.family].filter(Boolean).join(" ") : role.practitioner?.display ?? null;
    const npi = (practitioner?.identifier ?? []).find((identifier) => String(identifier.system ?? "").includes("us-npi") || String(identifier.system ?? "").includes("2.16.840.1.113883.4.6"))?.value ?? null;
    const address = location?.address ?? null;
    const telecom = (role.telecom ?? location?.telecom ?? []).find((item) => item.system === "phone")?.value ?? null;
    const row = {
      payer_key: payerKey,
      npi,
      practitioner_name: practitionerName,
      specialty: role.specialty?.[0]?.text ?? specialtyCoding?.display ?? null,
      specialty_code: specialtyCoding?.code ?? null,
      network_id: role.extension?.find((extension) => String(extension.url ?? "").includes("network-reference"))?.valueReference?.reference ?? null,
      organization_name: role.organization?.display ?? null,
      address_line: address?.line?.join(", ") ?? null,
      city: address?.city ?? null,
      state: address?.state ?? null,
      postal_code: address?.postalCode ?? null,
      phone: telecom,
      fhir_resource_type: "PractitionerRole",
      fhir_resource_id: role.id ?? null,
      source_url: sourceUrl,
      source_last_updated_at: role.meta?.lastUpdated ?? null
    };
    rows.push(row);
  }
  return rows;
}

// SYNC half: page a live Plan-Net search through the fhirClient and upsert the mirror
// (idempotent on row_content_hash). deltaSince maps to _lastUpdated=ge{date}.
export async function syncProviderDirectory(store, {
  client,
  payerKey,
  specialty = null,
  postalCode = null,
  deltaSince = null,
  count = 50,
  maxPages = 3,
  sessionId = null
} = {}) {
  // Humana quirk (recorded in connector_endpoints.quirks_json by the sync CLI): the
  // chained location.address-postalcode search 504s server-side — geography filters
  // therefore apply at QUERY time over the mirror, never in the live search.
  const params = { _include: ["PractitionerRole:practitioner", "PractitionerRole:location"], _count: String(count) };
  if (specialty) params.specialty = specialty;
  if (postalCode) params["location.address-postalcode"] = postalCode;
  if (deltaSince) params._lastUpdated = `ge${deltaSince}`;
  let pages = 0;
  let inserted = 0;
  let skipped = 0;
  const pageUrls = [];
  for await (const page of client.searchAll("PractitionerRole", params, { maxPages })) {
    pages += 1;
    const sourceUrl = page.link?.find((link) => link.relation === "self")?.url ?? `${client.baseUrl}/PractitionerRole`;
    pageUrls.push(sourceUrl);
    for (const row of directoryRowsFromBundle(page, { payerKey, sourceUrl })) {
      const rowContentHash = sha256Hex([payerKey, row.npi, row.fhir_resource_id, row.specialty_code, row.postal_code, row.practitioner_name].join("|"));
      const existing = await store.get("SELECT id FROM provider_directory_entries WHERE row_content_hash = ? LIMIT 1;", [rowContentHash]);
      if (existing) {
        skipped += 1;
        continue;
      }
      await store.insert("provider_directory_entries", {
        id: createId("dirent"),
        ...row,
        synced_at: nowIso(),
        row_content_hash: rowContentHash,
        created_at: nowIso()
      });
      inserted += 1;
    }
  }
  await audit(store, sessionId, "provider_directory.synced", {
    payerKey, specialty, postalCode, deltaSince, pages, inserted, skipped
  }, { layer: "layer_1_public" });
  return { version: PLAN_NET_DIRECTORY_VERSION, payerKey, pages, pageUrls, inserted, skipped };
}

// --- deterministic query-side extraction (no LLM): specialty keywords + ZIP ---
const SPECIALTY_KEYWORDS = Object.freeze({
  cardiologist: "cardiology", cardiology: "cardiology",
  dermatologist: "dermatology", dermatology: "dermatology",
  orthopedist: "orthopedics", orthopedic: "orthopedics", orthopedics: "orthopedics",
  pediatrician: "pediatrics", pediatrics: "pediatrics",
  oncologist: "oncology", oncology: "oncology",
  neurologist: "neurology", neurology: "neurology",
  psychiatrist: "psychiatry", psychiatry: "psychiatry",
  "primary care": "primary care", "family medicine": "family medicine", internist: "internal medicine"
});

// NUCC provider-taxonomy codes for the live Plan-Net specialty search param.
const SPECIALTY_NUCC = Object.freeze({
  cardiology: "207RC0000X",
  dermatology: "207N00000X",
  orthopedics: "207X00000X",
  pediatrics: "208000000X",
  oncology: "207RX0202X",
  neurology: "2084N0400X",
  psychiatry: "2084P0800X",
  "primary care": "208D00000X",
  "family medicine": "207Q00000X",
  "internal medicine": "207R00000X"
});

export function extractDirectoryQuery(text) {
  const lower = String(text ?? "").toLowerCase();
  const zip = lower.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] ?? null;
  let specialty = null;
  for (const [keyword, canonical] of Object.entries(SPECIALTY_KEYWORDS)) {
    if (lower.includes(keyword)) {
      specialty = canonical;
      break;
    }
  }
  return { specialty, zip, nuccCode: specialty ? SPECIALTY_NUCC[specialty] ?? null : null };
}

// READ half (the evidence path consumer): cited rows from the mirror. Rows carry the
// REAL directory source_url; empty result is an honest miss (the caller may live-sync
// then retry — the "live fallback on miss" rule).
export async function queryProviderDirectoryEvidence(store, { specialty = null, nuccCode = null, zip = null, limit = 5 } = {}) {
  const clauses = [];
  const params = [];
  // Directory rows store the payer's DISPLAY text ("Cardiovascular Disease Physician")
  // + the NUCC code — match the exact code when known, else the specialty stem
  // ("cardio" reaches both "cardiology" and "cardiovascular").
  const stem = specialty ? specialty.toLowerCase().slice(0, 6) : null;
  if (nuccCode) {
    clauses.push("(specialty_code = ? OR LOWER(specialty) LIKE ?)");
    params.push(nuccCode, `%${stem ?? ""}%`);
  } else if (specialty) {
    clauses.push("LOWER(specialty) LIKE ?");
    params.push(`%${stem}%`);
  }
  if (zip) {
    clauses.push("postal_code LIKE ?");
    params.push(`${zip.slice(0, 3)}%`); // same-area prefix match keeps nearby ZIPs in scope
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  let rows = await store.all(
    `SELECT * FROM provider_directory_entries ${where} ORDER BY synced_at DESC LIMIT ${Number(limit)};`,
    params
  );
  let areaMatched = true;
  // Honest zip relaxation: when the mirror has the specialty but not that area yet,
  // return specialty rows FLAGGED areaMatched:false (the composer names locations from
  // the cited rows) instead of a silent empty answer.
  if (!rows.length && zip && (specialty || nuccCode)) {
    rows = await store.all(
      "SELECT * FROM provider_directory_entries WHERE (specialty_code = ? OR LOWER(specialty) LIKE ?) ORDER BY synced_at DESC LIMIT ?;",
      [nuccCode ?? "", `%${stem ?? ""}%`, Number(limit)]
    );
    areaMatched = false;
  }
  return rows.map((row) => ({
    areaMatched,
    table: "provider_directory_entries",
    id: row.id,
    summary: `${row.practitioner_name ?? "Provider"} — ${row.specialty ?? row.specialty_code ?? "specialty n/a"}, ${[row.city, row.state, row.postal_code].filter(Boolean).join(", ")}`,
    npi: row.npi,
    sourceUrl: row.source_url,
    sourcePointer: `provider_directory_entries#${row.id}`,
    syncedAt: row.synced_at
  }));
}
