#!/usr/bin/env node
// Phase 89 (plan §9/§11): batch ingest of the CMS "Prescription Drug Plan Formulary,
// Pharmacy Network, and Pricing Information" PUF (the quarterly SPUF release) into the
// four pdp_* tables (schema.mjs): pdp_plans, pdp_formulary, pdp_pharmacy_network,
// pdp_pricing.
//
// - Source of truth: the pipe-delimited text files extracted from the CMS release zip
//   (data.cms.gov catalog entry "Quarterly Prescription Drug Plan Formulary, Pharmacy
//   Network, and Pricing Information"). Every ingested row carries release_cycle +
//   dataset_pointer (the real CMS download URL for that release).
// - Idempotent per release cycle: row_content_hash = sha256 over the significant source
//   fields (release-scoped); existing hashes are skipped (INSERT-or-ignore semantics via
//   a preloaded hash set + UNIQUE constraint backstop). Re-running the same ingest
//   inserts 0 rows.
// - Fails LOUD (classified message, exit 1) when the release directory is missing the
//   expected PUF files, when a header does not match the pinned COLUMN_MAP, or when the
//   configured filter matches zero rows. Never a silent empty ingest (§12.1).
// - Streaming: readline over fs read streams — the pricing file alone is ~2GB of text;
//   nothing is ever whole-loaded.
//
// Usage:
//   node scripts/ingest-cms-pdp-puf.mjs --release <cycle-id> --dir <extracted-puf-dir> \
//     --db <sqlite-path> [--state FL] [--contract H1609] [--limit-rows N] [--pointer <url>]
//
//   --state     filters pdp_plans rows by the plan-information STATE column.
//   --contract  filters all contract-keyed files to one CONTRACT_ID; the formulary file
//               is keyed by FORMULARY_ID and is filtered to the formularies used by the
//               ingested plans slice (denormalized to their contract/plan pairs).
//   --limit-rows caps MATCHED rows per target table (config for slice ingests; the
//               selection is deterministic, so re-runs stay idempotent).

import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { SqliteStore, createId, nowIso } from "../src/concierge/database.mjs";

const TAG = "[ingest-cms-pdp-puf]";

// Known release cycles -> the REAL CMS dataset download URL (dataset_pointer). Discovered
// live from the data.cms.gov catalog (data.json distributions of dataset "Quarterly
// Prescription Drug Plan Formulary, Pharmacy Network, and Pricing Information").
// Unknown release ids require an explicit --pointer (fail-closed: no fabricated pointers).
export const KNOWN_RELEASE_POINTERS = {
  "2026Q1_SPUF_20260408":
    "https://data.cms.gov/sites/default/files/2026-04/65e8dafd-c42b-4c2a-93c2-551bbc80bef9/SPUF_2026_20260408.zip",
  "2025Q4_SPUF_20260107":
    "https://data.cms.gov/sites/default/files/2026-01/5942aa7e-a0c4-4e65-bd56-32608c33649f/SPUF_2026_20260107.zip"
};

// Per-file-kind config: how to recognize the file in the release dir (CMS names them
// like "plan information  PPUF_2026Q1.txt"; slices may carry a ".partial" suffix), the
// pinned source header columns (verified against the real header row before any row is
// mapped), and the target table. COLUMN_MAP documents the source->table field mapping.
export const FILE_KINDS = {
  plans: {
    match: (name) => name.includes("plan information"),
    table: "pdp_plans",
    idPrefix: "pdpplan",
    // Source header (verified 2026Q1 release):
    // CONTRACT_ID|PLAN_ID|SEGMENT_ID|CONTRACT_NAME|PLAN_NAME|FORMULARY_ID|PREMIUM|
    // DEDUCTIBLE|MA_REGION_CODE|PDP_REGION_CODE|STATE|COUNTY_CODE|SNP|PLAN_SUPPRESSED_YN
    COLUMN_MAP: {
      contract_id: "CONTRACT_ID",
      plan_id: "PLAN_ID",
      segment_id: "SEGMENT_ID",
      organization_name: "CONTRACT_NAME",
      plan_name: "PLAN_NAME",
      formulary_id: "FORMULARY_ID", // used to slice the formulary file; not a pdp_plans column
      premium: "PREMIUM",
      deductible: "DEDUCTIBLE",
      ma_region_code: "MA_REGION_CODE",
      pdp_region_code: "PDP_REGION_CODE",
      state: "STATE",
      county_code: "COUNTY_CODE",
      snp: "SNP",
      plan_suppressed_yn: "PLAN_SUPPRESSED_YN"
    }
  },
  formulary: {
    match: (name) => name.includes("basic drugs formulary file"),
    table: "pdp_formulary",
    idPrefix: "pdpform",
    // FORMULARY_ID|FORMULARY_VERSION|CONTRACT_YEAR|RXCUI|NDC|TIER_LEVEL_VALUE|
    // QUANTITY_LIMIT_YN|QUANTITY_LIMIT_AMOUNT|QUANTITY_LIMIT_DAYS|PRIOR_AUTHORIZATION_YN|
    // STEP_THERAPY_YN|SELECTED_DRUG_YN   (no drug-name column in the PUF -> drug_name NULL)
    COLUMN_MAP: {
      formulary_id: "FORMULARY_ID",
      rxcui: "RXCUI",
      ndc: "NDC",
      tier: "TIER_LEVEL_VALUE",
      quantity_limit: "QUANTITY_LIMIT_YN",
      prior_authorization: "PRIOR_AUTHORIZATION_YN",
      step_therapy: "STEP_THERAPY_YN"
    }
  },
  pharmacy: {
    match: (name) => name.includes("pharmacy networks file"),
    table: "pdp_pharmacy_network",
    idPrefix: "pdpnet",
    // CONTRACT_ID|PLAN_ID|SEGMENT_ID|PHARMACY_NUMBER|PHARMACY_ZIPCODE|
    // PREFERRED_STATUS_RETAIL|PREFERRED_STATUS_MAIL|PHARMACY_RETAIL|PHARMACY_MAIL|...
    // PHARMACY_NUMBER is the CMS PUF pharmacy identifier; it lands in pharmacy_npi
    // (the PUF carries no separate NPI or pharmacy-name column -> pharmacy_name NULL).
    COLUMN_MAP: {
      contract_id: "CONTRACT_ID",
      plan_id: "PLAN_ID",
      segment_id: "SEGMENT_ID",
      pharmacy_npi: "PHARMACY_NUMBER",
      pharmacy_zip: "PHARMACY_ZIPCODE",
      preferred_status_retail: "PREFERRED_STATUS_RETAIL",
      preferred_status_mail: "PREFERRED_STATUS_MAIL",
      pharmacy_retail: "PHARMACY_RETAIL",
      pharmacy_mail: "PHARMACY_MAIL"
    }
  },
  pricing: {
    match: (name) => name.includes("pricing file"),
    table: "pdp_pricing",
    idPrefix: "pdpprice",
    // CONTRACT_ID|PLAN_ID|SEGMENT_ID|NDC|DAYS_SUPPLY|UNIT_COST
    COLUMN_MAP: {
      contract_id: "CONTRACT_ID",
      plan_id: "PLAN_ID",
      segment_id: "SEGMENT_ID",
      ndc: "NDC",
      days_supply: "DAYS_SUPPLY",
      unit_cost: "UNIT_COST"
    }
  }
};

const SNP_LABELS = { 0: "standard", 1: "snp_chronic", 2: "snp_dual", 3: "snp_institutional" };
const BATCH_SIZE = 2000;

function failLoud(classification, message) {
  console.error(`${TAG} FAIL ${classification}: ${message}`);
  process.exit(1);
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function yn(value) {
  return String(value ?? "").trim().toUpperCase() === "Y" ? 1 : 0;
}

function num(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed === "" || trimmed === ".") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function intOrNull(value) {
  const parsed = num(value);
  return parsed === null ? null : Math.trunc(parsed);
}

// --- args -----------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    release: { type: "string" },
    dir: { type: "string" },
    db: { type: "string" },
    state: { type: "string" },
    contract: { type: "string" },
    "limit-rows": { type: "string" },
    pointer: { type: "string" }
  }
});

if (!args.release || !args.dir || !args.db) {
  failLoud("pdp_usage", "--release <cycle-id> --dir <extracted-puf-dir> --db <sqlite-path> are required");
}

const releaseCycle = args.release;
const datasetPointer = args.pointer ?? KNOWN_RELEASE_POINTERS[releaseCycle];
if (!datasetPointer) {
  failLoud(
    "pdp_dataset_pointer_missing",
    `release "${releaseCycle}" is not a known cycle (${Object.keys(KNOWN_RELEASE_POINTERS).join(", ")}) and no --pointer was given; refusing to ingest rows without a real dataset pointer`
  );
}

const puf_dir = resolve(args.dir);
const dbPath = resolve(args.db);
const stateFilter = args.state ? args.state.trim().toUpperCase() : null;
const contractFilter = args.contract ? args.contract.trim().toUpperCase() : null;
const limitRows = args["limit-rows"] ? Number(args["limit-rows"]) : null;
if (limitRows !== null && (!Number.isInteger(limitRows) || limitRows <= 0)) {
  failLoud("pdp_usage", `--limit-rows must be a positive integer (got "${args["limit-rows"]}")`);
}

// --- release directory discovery (fail loud on missing files) --------------------------

if (!existsSync(puf_dir) || !statSync(puf_dir).isDirectory()) {
  failLoud("pdp_release_files_missing", `release directory does not exist: ${puf_dir}`);
}

const dirEntries = (await readdir(puf_dir)).sort();
const filesByKind = {};
for (const [kind, config] of Object.entries(FILE_KINDS)) {
  filesByKind[kind] = dirEntries.filter((name) => config.match(name.toLowerCase())).map((name) => join(puf_dir, name));
}
const missingKinds = Object.entries(filesByKind).filter(([, files]) => files.length === 0).map(([kind]) => kind);
if (missingKinds.length > 0) {
  failLoud(
    "pdp_release_files_missing",
    `release dir ${puf_dir} is missing expected PUF file kind(s): ${missingKinds.join(", ")} ` +
      `(expected filenames containing: ${missingKinds.map((kind) => `"${kindPattern(kind)}"`).join(", ")}); ` +
      `found ${dirEntries.length} entr${dirEntries.length === 1 ? "y" : "ies"}. Refusing a silent empty ingest.`
  );
}

function kindPattern(kind) {
  return {
    plans: "plan information",
    formulary: "basic drugs formulary file",
    pharmacy: "pharmacy networks file",
    pricing: "pricing file"
  }[kind];
}

// --- ingest core ------------------------------------------------------------------------

const store = await new SqliteStore(dbPath).initialize();

async function preloadHashes(table) {
  const rows = await store.all(
    `SELECT row_content_hash FROM ${table} WHERE release_cycle = ?;`,
    [releaseCycle]
  );
  return new Set(rows.map((row) => row.row_content_hash));
}

function headerIndex(headerLine, columnMap, filePath) {
  const columns = headerLine.split("|").map((column) => column.trim());
  const index = new Map(columns.map((column, position) => [column, position]));
  const missing = Object.values(columnMap).filter((source) => !index.has(source));
  if (missing.length > 0) {
    failLoud(
      "pdp_header_mismatch",
      `${filePath}: header is missing pinned column(s) ${missing.join(", ")} — the release layout changed; update COLUMN_MAP before ingesting`
    );
  }
  return index;
}

class TableWriter {
  constructor(table, idPrefix, existingHashes) {
    this.table = table;
    this.idPrefix = idPrefix;
    this.existing = existingHashes;
    this.scanned = 0;
    this.matched = 0;
    this.inserted = 0;
    this.skippedExisting = 0;
    this.pendingInBatch = 0;
  }

  limitReached() {
    return limitRows !== null && this.matched >= limitRows;
  }

  async write(hashFields, row) {
    this.matched += 1;
    const hash = sha256(`${this.table}|${releaseCycle}|${hashFields.join("|")}`);
    if (this.existing.has(hash)) {
      this.skippedExisting += 1;
      return;
    }
    this.existing.add(hash);
    if (this.pendingInBatch === 0) await store.exec("BEGIN;");
    await store.insert(this.table, {
      id: createId(this.idPrefix),
      ...row,
      release_cycle: releaseCycle,
      dataset_pointer: datasetPointer,
      row_content_hash: hash,
      created_at: nowIso()
    });
    this.inserted += 1;
    this.pendingInBatch += 1;
    if (this.pendingInBatch >= BATCH_SIZE) {
      await store.exec("COMMIT;");
      this.pendingInBatch = 0;
    }
  }

  async flush() {
    if (this.pendingInBatch > 0) {
      await store.exec("COMMIT;");
      this.pendingInBatch = 0;
    }
  }

  summary() {
    return {
      scanned: this.scanned,
      matched: this.matched,
      inserted: this.inserted,
      skippedExisting: this.skippedExisting
    };
  }
}

async function* pipeLines(filePath) {
  const rl = createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) yield line;
}

// 1) pdp_plans — also builds formulary_id -> distinct (contract, plan) pairs for the slice.
const planWriter = new TableWriter("pdp_plans", FILE_KINDS.plans.idPrefix, await preloadHashes("pdp_plans"));
const formularyPlanPairs = new Map(); // formulary_id -> Map(pairKey -> {contract_id, plan_id})

for (const filePath of filesByKind.plans) {
  let index = null;
  for await (const line of pipeLines(filePath)) {
    if (index === null) {
      index = headerIndex(line, FILE_KINDS.plans.COLUMN_MAP, filePath);
      continue;
    }
    if (line.trim() === "") continue;
    planWriter.scanned += 1;
    const fields = line.split("|");
    const get = (mapped) => (fields[index.get(FILE_KINDS.plans.COLUMN_MAP[mapped])] ?? "").trim();
    const contractId = get("contract_id").toUpperCase();
    const state = get("state").toUpperCase();
    if (contractFilter && contractId !== contractFilter) continue;
    if (stateFilter && state !== stateFilter) continue;
    if (planWriter.limitReached()) break;

    const planId = get("plan_id");
    const formularyId = get("formulary_id");
    if (formularyId) {
      if (!formularyPlanPairs.has(formularyId)) formularyPlanPairs.set(formularyId, new Map());
      formularyPlanPairs.get(formularyId).set(`${contractId}|${planId}`, { contract_id: contractId, plan_id: planId });
    }

    const snpCode = intOrNull(get("snp"));
    await planWriter.write(
      [contractId, planId, get("segment_id"), get("county_code"), state, formularyId, get("premium"), get("deductible"), get("plan_name"), get("snp"), get("plan_suppressed_yn")],
      {
        contract_id: contractId,
        plan_id: planId,
        segment_id: get("segment_id") || null,
        plan_name: get("plan_name") || null,
        organization_name: get("organization_name") || null,
        plan_type: snpCode === null ? null : (SNP_LABELS[snpCode] ?? `snp_${snpCode}`),
        region_code: get("pdp_region_code") || get("ma_region_code") || null,
        county_code: get("county_code") || null,
        state: state || null,
        premium: num(get("premium")),
        deductible: num(get("deductible"))
      }
    );
  }
}
await planWriter.flush();

if (planWriter.matched === 0) {
  failLoud(
    "pdp_filter_matched_zero",
    `plan-information ingest matched 0 rows in ${puf_dir} (state=${stateFilter ?? "any"}, contract=${contractFilter ?? "any"}); refusing a silent empty ingest`
  );
}

// 2) pdp_formulary — the formulary file is keyed by FORMULARY_ID; rows are denormalized
//    to the distinct (contract, plan) pairs of the ingested plans slice so the tier
//    question is answerable via pdp_plans JOIN pdp_formulary.
const formularyWriter = new TableWriter("pdp_formulary", FILE_KINDS.formulary.idPrefix, await preloadHashes("pdp_formulary"));
for (const filePath of filesByKind.formulary) {
  let index = null;
  for await (const line of pipeLines(filePath)) {
    if (index === null) {
      index = headerIndex(line, FILE_KINDS.formulary.COLUMN_MAP, filePath);
      continue;
    }
    if (line.trim() === "") continue;
    formularyWriter.scanned += 1;
    if (formularyWriter.limitReached()) break;
    const fields = line.split("|");
    const get = (mapped) => (fields[index.get(FILE_KINDS.formulary.COLUMN_MAP[mapped])] ?? "").trim();
    const formularyId = get("formulary_id");
    const pairs = formularyPlanPairs.get(formularyId);
    if (!pairs) continue;
    for (const pairKey of [...pairs.keys()].sort()) {
      if (formularyWriter.limitReached()) break;
      const { contract_id, plan_id } = pairs.get(pairKey);
      await formularyWriter.write(
        [formularyId, contract_id, plan_id, get("rxcui"), get("ndc"), get("tier"), get("prior_authorization"), get("step_therapy"), get("quantity_limit")],
        {
          formulary_id: formularyId,
          contract_id,
          plan_id,
          rxcui: get("rxcui"),
          ndc: get("ndc") || null,
          drug_name: null, // the CMS PUF formulary file carries no drug-name column
          tier: intOrNull(get("tier")),
          prior_authorization: yn(get("prior_authorization")),
          step_therapy: yn(get("step_therapy")),
          quantity_limit: yn(get("quantity_limit"))
        }
      );
    }
  }
}
await formularyWriter.flush();

// 3) pdp_pharmacy_network
const pharmacyWriter = new TableWriter("pdp_pharmacy_network", FILE_KINDS.pharmacy.idPrefix, await preloadHashes("pdp_pharmacy_network"));
for (const filePath of filesByKind.pharmacy) {
  if (pharmacyWriter.limitReached()) break;
  let index = null;
  for await (const line of pipeLines(filePath)) {
    if (index === null) {
      index = headerIndex(line, FILE_KINDS.pharmacy.COLUMN_MAP, filePath);
      continue;
    }
    if (line.trim() === "") continue;
    pharmacyWriter.scanned += 1;
    if (pharmacyWriter.limitReached()) break;
    const fields = line.split("|");
    const get = (mapped) => (fields[index.get(FILE_KINDS.pharmacy.COLUMN_MAP[mapped])] ?? "").trim();
    const contractId = get("contract_id").toUpperCase();
    if (contractFilter && contractId !== contractFilter) continue;
    const preferredRetail = yn(get("preferred_status_retail"));
    const preferredMail = yn(get("preferred_status_mail"));
    await pharmacyWriter.write(
      [contractId, get("plan_id"), get("segment_id"), get("pharmacy_npi"), get("pharmacy_zip"), get("preferred_status_retail"), get("preferred_status_mail"), get("pharmacy_retail"), get("pharmacy_mail")],
      {
        contract_id: contractId,
        plan_id: get("plan_id") || null,
        segment_id: get("segment_id") || null,
        pharmacy_npi: get("pharmacy_npi"),
        pharmacy_name: null, // the CMS PUF pharmacy file carries no pharmacy-name column
        pharmacy_zip: get("pharmacy_zip") || null,
        preferred_status: preferredRetail || preferredMail ? "preferred" : "non_preferred",
        pharmacy_retail: yn(get("pharmacy_retail")),
        pharmacy_mail: yn(get("pharmacy_mail"))
      }
    );
  }
}
await pharmacyWriter.flush();

// 4) pdp_pricing
const pricingWriter = new TableWriter("pdp_pricing", FILE_KINDS.pricing.idPrefix, await preloadHashes("pdp_pricing"));
for (const filePath of filesByKind.pricing) {
  if (pricingWriter.limitReached()) break;
  let index = null;
  for await (const line of pipeLines(filePath)) {
    if (index === null) {
      index = headerIndex(line, FILE_KINDS.pricing.COLUMN_MAP, filePath);
      continue;
    }
    if (line.trim() === "") continue;
    pricingWriter.scanned += 1;
    if (pricingWriter.limitReached()) break;
    const fields = line.split("|");
    const get = (mapped) => (fields[index.get(FILE_KINDS.pricing.COLUMN_MAP[mapped])] ?? "").trim();
    const contractId = get("contract_id").toUpperCase();
    if (contractFilter && contractId !== contractFilter) continue;
    await pricingWriter.write(
      [contractId, get("plan_id"), get("segment_id"), get("ndc"), get("days_supply"), get("unit_cost")],
      {
        contract_id: contractId,
        plan_id: get("plan_id") || null,
        segment_id: get("segment_id") || null,
        ndc: get("ndc"),
        days_supply: intOrNull(get("days_supply")),
        unit_cost: num(get("unit_cost")),
        pharmacy_type: null // the quarterly pricing file is not broken out by pharmacy type
      }
    );
  }
}
await pricingWriter.flush();

// --- summary (machine-readable; the test parses the SUMMARY line) ----------------------

const summary = {
  release_cycle: releaseCycle,
  dataset_pointer: datasetPointer,
  filters: { state: stateFilter, contract: contractFilter, limitRows },
  tables: {
    pdp_plans: planWriter.summary(),
    pdp_formulary: formularyWriter.summary(),
    pdp_pharmacy_network: pharmacyWriter.summary(),
    pdp_pricing: pricingWriter.summary()
  }
};

const totalMatched = Object.values(summary.tables).reduce((sum, table) => sum + table.matched, 0);
if (totalMatched === 0) {
  failLoud("pdp_filter_matched_zero", "ingest matched 0 rows across all tables; refusing a silent empty ingest");
}

console.log(`${TAG} SUMMARY ${JSON.stringify(summary)}`);
store.close();
