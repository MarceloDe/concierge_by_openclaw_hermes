// Phase 89 (plan §9/§11) CMS PDP PUF per-table pointer proofs (§12.1) — REAL ingested
// slice of the CMS "Quarterly Prescription Drug Plan Formulary, Pharmacy Network, and
// Pricing Information" release, driven through scripts/ingest-cms-pdp-puf.mjs via
// child_process (the same entry point operators use).
//
// Discovery evidence (live, 2026-07-03, data.cms.gov data.json catalog):
//   dataset  "Quarterly Prescription Drug Plan Formulary, Pharmacy Network, and Pricing
//            Information" (modified 2026-04-28, temporal 2026-01-01/2026-03-31)
//   download https://data.cms.gov/sites/default/files/2026-04/65e8dafd-c42b-4c2a-93c2-551bbc80bef9/SPUF_2026_20260408.zip
//   size     2,504,003,692 bytes (HEAD, HTTP 200, application/zip) — over the ~800MB full
//            download budget, so the proofs run against a REAL partial slice obtained via
//            HTTP Range requests on that zip (~299MB downloaded): full plan-information /
//            basic-formulary / pricing members + the leading chunk of pharmacy-networks
//            part 2 (contracts H1609..H1951).
//   slice    Florida contract H1609 (AETNA HEALTH INC. (FL), formulary 00026010).
//
// The slice dir is machine-local (not committed): set BRAINSTY_PDP_PUF_DIR to the
// extracted pipe-delimited files. Without it every arm SKIPS LOUD per table with this
// evidence — never a green pass on fabricated rows.
//
// Arms: (1) Part D tier question via pdp_plans JOIN pdp_formulary (real RXCUI 1551300,
// dulaglutide/Trulicity NDC 00002143380 -> tier 3 + PA on H1609 formulary 00026010),
// (2) pharmacy-network question (real PUF pharmacy number 101548275167 -> in-network
// retail, non-preferred), (3) Part D cost question (NDC 00002143380, 30-day supply on
// H1609-001 -> unit_cost 489.9064), (4) idempotent re-ingest (second run inserts 0),
// (5) missing-release negative (bogus dir -> exit 1 + classified stderr).

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";

const SCRIPT_PATH = resolve(import.meta.dirname, "../../scripts/ingest-cms-pdp-puf.mjs");
const RELEASE_CYCLE = "2026Q1_SPUF_20260408";
const DATASET_POINTER =
  "https://data.cms.gov/sites/default/files/2026-04/65e8dafd-c42b-4c2a-93c2-551bbc80bef9/SPUF_2026_20260408.zip";

// Real values read from the release files (see slice provenance in the header comment).
const PROOF = {
  contract: "H1609",
  state: "FL",
  formularyId: "00026010",
  rxcui: "1551300", // dulaglutide (Trulicity) — first RXCUI of formulary 00026010
  ndc: "00002143380",
  tier: 3,
  priorAuthorization: 1,
  pricingPlanId: "001",
  daysSupply: 30,
  unitCost: 489.9064,
  pharmacyNumber: "101548275167", // PUF PHARMACY_NUMBER, lands in pharmacy_npi
  pharmacyPlanId: "092", // pharmacy part-2 slice starts mid-contract at H1609 plan 092
  pharmacyZip: "90232"
};

const PUF_DIR = process.env.BRAINSTY_PDP_PUF_DIR ?? "";

const FILE_KIND_PATTERNS = {
  pdp_plans: "plan information",
  pdp_formulary: "basic drugs formulary file",
  pdp_pharmacy_network: "pharmacy networks file",
  pdp_pricing: "pricing file"
};

function deferralReason(table) {
  const base =
    `DEFERRED: real CMS release is ${DATASET_POINTER} (2,504,003,692 bytes — over the full-download budget); ` +
    "proofs need the range-downloaded slice extracted locally. Set BRAINSTY_PDP_PUF_DIR to the extracted pipe-delimited files.";
  if (!PUF_DIR) return `${table}: ${base} (BRAINSTY_PDP_PUF_DIR is not set)`;
  if (!existsSync(PUF_DIR)) return `${table}: ${base} (BRAINSTY_PDP_PUF_DIR=${PUF_DIR} does not exist)`;
  const entries = readdirSync(PUF_DIR).map((name) => name.toLowerCase());
  const missing = Object.entries(FILE_KIND_PATTERNS)
    .filter(([, pattern]) => !entries.some((name) => name.includes(pattern)))
    .map(([kind, pattern]) => `${kind} ("${pattern}")`);
  if (missing.length > 0) {
    return `${table}: ${base} (BRAINSTY_PDP_PUF_DIR=${PUF_DIR} is missing file kind(s): ${missing.join(", ")}` +
      " — the ingest script is all-or-nothing per release, so every table defers)";
  }
  return null;
}

// The ingest is all-or-nothing per release dir, so per-table availability collapses to
// slice-dir completeness; each arm still names ITS table in the skip message (§12.1).
const SLICE_BLOCKED = deferralReason("slice");
const AVAILABLE = SLICE_BLOCKED === null;

function runIngest(dbPath, extraArgs = []) {
  return spawnSync(
    process.execPath,
    [
      SCRIPT_PATH,
      "--release", RELEASE_CYCLE,
      "--dir", PUF_DIR,
      "--db", dbPath,
      "--state", PROOF.state,
      "--contract", PROOF.contract,
      "--limit-rows", "20000",
      ...extraArgs
    ],
    { encoding: "utf8" }
  );
}

function parseSummary(stdout) {
  const line = String(stdout).split("\n").find((candidate) => candidate.includes("] SUMMARY "));
  assert.ok(line, `ingest stdout must contain a SUMMARY line (got: ${String(stdout).slice(0, 400)})`);
  return JSON.parse(line.slice(line.indexOf("] SUMMARY ") + "] SUMMARY ".length));
}

// Shared context: one REAL ingest for arms 1-4 (arm 4 re-runs it on the same db).
let ctx = null;
async function ingestedContext() {
  if (ctx) return ctx;
  const dir = await mkdtemp(join(tmpdir(), "brainsty-p89-pdp-"));
  const dbPath = join(dir, "pdp.sqlite");
  const run = runIngest(dbPath);
  assert.equal(run.status, 0, `first ingest must succeed (stderr: ${run.stderr})`);
  const summary = parseSummary(run.stdout);
  const store = new SqliteStore(dbPath);
  store.open();
  ctx = { dbPath, summary, store };
  return ctx;
}

test(
  "Phase 89 arm 1 (pdp_plans JOIN pdp_formulary): what tier is dulaglutide (RXCUI 1551300) on Aetna FL H1609?",
  { skip: AVAILABLE ? false : deferralReason("pdp_plans + pdp_formulary") },
  async () => {
    const { store, summary } = await ingestedContext();
    assert.ok(summary.tables.pdp_plans.matched > 0, "plans slice must contain real matched rows");
    assert.ok(summary.tables.pdp_formulary.matched > 0, "formulary slice must contain real matched rows");

    const row = await store.get(
      `SELECT f.tier, f.prior_authorization, f.formulary_id, f.ndc, f.release_cycle, f.dataset_pointer,
              p.state, p.organization_name
       FROM pdp_formulary f
       JOIN pdp_plans p ON p.contract_id = f.contract_id AND p.plan_id = f.plan_id
       WHERE f.rxcui = ? AND f.contract_id = ?
       LIMIT 1;`,
      [PROOF.rxcui, PROOF.contract]
    );
    assert.ok(row, `RXCUI ${PROOF.rxcui} must resolve through the plans JOIN formulary path`);
    assert.equal(row.tier, PROOF.tier, "Part D tier answer must match the release file");
    assert.equal(Number(row.prior_authorization), PROOF.priorAuthorization);
    assert.equal(row.formulary_id, PROOF.formularyId);
    assert.equal(row.ndc, PROOF.ndc);
    assert.equal(row.state, PROOF.state);
    assert.equal(row.release_cycle, RELEASE_CYCLE);
    assert.equal(row.dataset_pointer, DATASET_POINTER, "the row must point at the real CMS release zip");
  }
);

test(
  "Phase 89 arm 2 (pdp_pharmacy_network): is pharmacy 101548275167 in-network/preferred for H1609?",
  { skip: AVAILABLE ? false : deferralReason("pdp_pharmacy_network") },
  async () => {
    const { store, summary } = await ingestedContext();
    assert.ok(summary.tables.pdp_pharmacy_network.matched > 0, "pharmacy slice must contain real matched rows");

    const row = await store.get(
      `SELECT preferred_status, pharmacy_retail, pharmacy_mail, pharmacy_zip, plan_id, release_cycle, dataset_pointer
       FROM pdp_pharmacy_network
       WHERE contract_id = ? AND pharmacy_npi = ? AND plan_id = ?;`,
      [PROOF.contract, PROOF.pharmacyNumber, PROOF.pharmacyPlanId]
    );
    assert.ok(row, `pharmacy ${PROOF.pharmacyNumber} must be present in the H1609 network slice`);
    assert.equal(Number(row.pharmacy_retail), 1, "the pharmacy is an in-network retail pharmacy in the release file");
    assert.equal(Number(row.pharmacy_mail), 0);
    assert.equal(row.preferred_status, "non_preferred", "PREFERRED_STATUS_RETAIL=N and _MAIL=N in the release file");
    assert.equal(row.pharmacy_zip, PROOF.pharmacyZip);
    assert.equal(row.release_cycle, RELEASE_CYCLE);
    assert.equal(row.dataset_pointer, DATASET_POINTER, "the row must point at the real CMS release zip");
  }
);

test(
  "Phase 89 arm 3 (pdp_pricing): what does NDC 00002143380 cost per unit on H1609-001 (30-day)?",
  { skip: AVAILABLE ? false : deferralReason("pdp_pricing") },
  async () => {
    const { store, summary } = await ingestedContext();
    assert.ok(summary.tables.pdp_pricing.matched > 0, "pricing slice must contain real matched rows");

    const row = await store.get(
      `SELECT unit_cost, days_supply, release_cycle, dataset_pointer
       FROM pdp_pricing
       WHERE contract_id = ? AND plan_id = ? AND ndc = ? AND days_supply = ?;`,
      [PROOF.contract, PROOF.pricingPlanId, PROOF.ndc, PROOF.daysSupply]
    );
    assert.ok(row, `NDC ${PROOF.ndc} must be present in the H1609 pricing slice`);
    assert.ok(
      Math.abs(Number(row.unit_cost) - PROOF.unitCost) < 1e-6,
      `unit_cost must match the release file (expected ${PROOF.unitCost}, got ${row.unit_cost})`
    );
    assert.equal(row.release_cycle, RELEASE_CYCLE);
    assert.equal(row.dataset_pointer, DATASET_POINTER, "the row must point at the real CMS release zip");
  }
);

test(
  "Phase 89 arm 4: idempotent re-ingest — second run over the same db inserts 0 rows in all 4 tables",
  { skip: AVAILABLE ? false : deferralReason("pdp_plans/pdp_formulary/pdp_pharmacy_network/pdp_pricing") },
  async () => {
    const { dbPath, summary: first } = await ingestedContext();
    const rerun = runIngest(dbPath);
    assert.equal(rerun.status, 0, `re-ingest must succeed (stderr: ${rerun.stderr})`);
    const second = parseSummary(rerun.stdout);
    for (const table of ["pdp_plans", "pdp_formulary", "pdp_pharmacy_network", "pdp_pricing"]) {
      assert.ok(first.tables[table].inserted > 0, `${table}: first run must have inserted real rows`);
      assert.equal(second.tables[table].inserted, 0, `${table}: second run must insert 0 (idempotent per release cycle)`);
      assert.equal(
        second.tables[table].skippedExisting,
        second.tables[table].matched,
        `${table}: every matched row must dedupe on row_content_hash`
      );
      assert.equal(second.tables[table].matched, first.tables[table].matched, `${table}: deterministic slice selection`);
    }
  }
);

test("Phase 89 arm 5: missing-release negative — bogus --dir exits loud with a classified message", async () => {
  // No slice needed: the negative arm proves the classifier, not the data.
  const bogusDir = await mkdtemp(join(tmpdir(), "brainsty-p89-bogus-"));
  const run = spawnSync(
    process.execPath,
    [SCRIPT_PATH, "--release", RELEASE_CYCLE, "--dir", bogusDir, "--db", join(bogusDir, "neg.sqlite")],
    { encoding: "utf8" }
  );
  assert.notEqual(run.status, 0, "a release dir without the expected files must exit non-zero, never a silent empty ingest");
  assert.match(run.stderr, /pdp_release_files_missing/, "stderr must carry the classified failure");
  assert.match(run.stderr, /plan information/, "stderr must name the expected file kinds");
});
