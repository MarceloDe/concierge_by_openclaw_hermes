// Phase 89 MRF pricing pipeline proofs (plan §9 MRF row / §11 Phase 89).
//
// Two arms:
//  1. HERMETIC: the streaming in_network extractor parses a synthetic GZIPPED
//     in-network document fed through zlib in tiny chunks — including a string
//     containing "}]" and escaped quotes (brace-depth tracking must ignore
//     structural characters inside strings).
//  2. LIVE (network; skips LOUD when the public index is unreachable): runs the
//     real pipeline against the Aetna Transparency-in-Coverage egress bucket into
//     a mkdtemp SQLite — proves owner-API provenance (source row url+hash,
//     observation source_pointer), idempotent re-ingest (second run inserts ZERO
//     new observations), and queryMrfPriceEvidence citations for a billing code
//     that actually landed.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gzipSync, createGunzip } from "node:zlib";
import { SqliteStore } from "../concierge/database.mjs";
import { queryMrfPriceEvidence } from "../concierge/mrfPricing.mjs";
import {
  fetchMrfIndex,
  selectSmallestInNetworkFile,
  streamIngestInNetworkFile,
  createMrfStreamExtractor
} from "../concierge/connectors/mrfPipeline.mjs";

const INDEX_URL =
  "https://mrf.healthsparq.com/aetnacvs-egress.nophi.kyruushsq.com/prd/mrf/AETNACVS_I/ALICSI/latest_metadata.json";

async function probeLiveIndex() {
  try {
    const res = await fetch(INDEX_URL, { method: "HEAD", signal: AbortSignal.timeout(15000) });
    return res.ok;
  } catch {
    return false;
  }
}
const LIVE = await probeLiveIndex();
if (!LIVE) {
  console.warn(`[phase89-mrf] SKIPPING LIVE ARM LOUDLY: public MRF index unreachable (${INDEX_URL}) — offline or bucket down. The hermetic extractor arm still runs.`);
}

// ---------------------------------------------------------------------------
// Arm 1: hermetic streaming extractor (always runs)
// ---------------------------------------------------------------------------
test("phase89 hermetic: streaming extractor parses gzipped in_network items across chunk boundaries (strings containing \"}]\" handled)", async () => {
  const doc = {
    reporting_entity_name: "Test Payer Co",
    reporting_entity_type: "Test TPA",
    last_updated_on: "2026-07-01",
    version: "2.0.0",
    provider_references: [
      { provider_group_id: 42, provider_groups: [{ npi: [1234567890], tin: { type: "ein", value: "0" } }] }
    ],
    in_network: [
      {
        billing_code: "27447", billing_code_type: "CPT",
        // the trap: structural-looking characters INSIDE a string, plus an escaped quote
        name: "KNEE ARTHROPLASTY }] \" tricky {[ end",
        negotiated_rates: [{
          provider_references: [42],
          negotiated_prices: [{ negotiated_type: "negotiated", negotiated_rate: 1500.5, service_code: ["22"], billing_class: "professional" }]
        }]
      },
      {
        billing_code: "70553", billing_code_type: "CPT", name: "MRI BRAIN",
        negotiated_rates: [{
          provider_groups: [{ npi: [1999999999] }],
          negotiated_prices: [{ negotiated_type: "fee schedule", negotiated_rate: 400, service_code: ["11", "22"], billing_class: "professional" }]
        }]
      },
      {
        billing_code: "G0121", billing_code_type: "HCPCS", name: "COLORECTAL SCREEN",
        negotiated_rates: [{
          provider_references: [42],
          negotiated_prices: [{ negotiated_type: "negotiated", negotiated_rate: 900.25, service_code: ["24"], billing_class: "institutional" }]
        }]
      }
    ]
  };
  const gzipped = gzipSync(Buffer.from(JSON.stringify(doc), "utf8"));

  const items = [];
  const providerGroups = [];
  const rootFields = {};
  const extractor = createMrfStreamExtractor({
    arrayKeys: ["provider_references", "in_network"],
    onArrayItem: (key, item) => (key === "in_network" ? items : providerGroups).push(item),
    onRootField: (key, value) => { rootFields[key] = value; }
  });

  // Feed through a REAL gunzip stream in 7-byte compressed chunks, and split the
  // decompressed text into 5-char chunks — items must survive both boundaries.
  const gunzip = createGunzip();
  const decoder = new TextDecoder("utf-8");
  const decompressed = [];
  gunzip.on("data", (chunk) => decompressed.push(decoder.decode(chunk, { stream: true })));
  const done = new Promise((resolve, reject) => {
    gunzip.on("end", resolve);
    gunzip.on("error", reject);
  });
  for (let i = 0; i < gzipped.length; i += 7) gunzip.write(gzipped.subarray(i, i + 7));
  gunzip.end();
  await done;
  const text = decompressed.join("") + decoder.decode();
  for (let i = 0; i < text.length; i += 5) extractor.write(text.slice(i, i + 5));
  extractor.end();

  assert.equal(items.length, 3, "exactly 3 in_network items must parse");
  assert.deepEqual(items.map((i) => i.billing_code), ["27447", "70553", "G0121"]);
  assert.equal(items[0].name, "KNEE ARTHROPLASTY }] \" tricky {[ end", "string containing }] and escaped quote must round-trip");
  assert.equal(items[0].negotiated_rates[0].negotiated_prices[0].negotiated_rate, 1500.5);
  assert.equal(providerGroups.length, 1);
  assert.equal(providerGroups[0].provider_group_id, 42);
  assert.equal(rootFields.reporting_entity_name, "Test Payer Co");
  assert.equal(rootFields.last_updated_on, "2026-07-01");
});

test("phase89 hermetic: extractor fails loud on JSON desync", () => {
  const extractor = createMrfStreamExtractor({ arrayKeys: ["in_network"] });
  extractor.write("{\"in_network\":[{\"a\":1}");
  assert.throws(
    () => extractor.write("]}}"),
    (error) => error.failureClass === "mrf_json_desync",
    "unbalanced closing brace must throw a classified mrf_json_desync error"
  );
});

// ---------------------------------------------------------------------------
// Arm 2: LIVE pipeline against the real Aetna TiC bucket
// ---------------------------------------------------------------------------
test("phase89 LIVE: real MRF index -> smallest in-network file -> owner-API ingest with provenance, idempotent re-run, cited evidence", { skip: LIVE ? false : `public MRF index unreachable (${INDEX_URL}) — network required` }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-phase89-mrf-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();

  // 1) Real index
  const index = await fetchMrfIndex({ indexUrl: INDEX_URL });
  assert.ok(index.files.length > 1000, `expected thousands of index entries, got ${index.files.length}`);
  assert.match(index.indexHash, /^[a-f0-9]{64}$/);
  assert.ok(index.reportingEntityName, "index entries must carry reportingEntityName");

  // 2) Real file selection (index has no sizes -> deterministic HEAD scan)
  const selection = await selectSmallestInNetworkFile(index.files, { maxBytes: 200 * 1024 * 1024, headConcurrency: 16 });
  assert.ok(selection.url.endsWith(".json.gz"), `selected file must be a gzipped json: ${selection.url}`);
  assert.ok(selection.contentLength <= 200 * 1024 * 1024, "selected file must respect maxBytes");
  console.log(`[phase89-mrf] selected: ${selection.url} (${selection.contentLength} bytes, ${selection.headRequests} HEADs)`);

  // 3) Streaming ingest, bounded to ~50 observations, NO code whitelist
  const first = await streamIngestInNetworkFile(store, {
    fileUrl: selection.url,
    maxObservations: 50
  });
  console.log(`[phase89-mrf] first run: inserted=${first.inserted} skipped=${first.skipped} compressedBytesRead=${first.compressedBytesRead} codes=${first.billingCodes.join(",")}`);
  assert.ok(first.inserted > 0, "live ingest must land observations");
  assert.equal(first.observationsExtracted, first.inserted + first.skipped);
  assert.ok(first.billingCodes.length > 0, "must record which billing codes landed");
  assert.match(first.contentHash, /^[a-f0-9]{64}$/);

  // Proof 1: provenance via the owner rows — source row carries url + hash,
  // every observation carries a source_pointer.
  const sourceRow = await store.findOne("mrf_pricing_sources", { id: first.sourceId });
  assert.ok(sourceRow, "mrf_pricing_sources row must exist");
  assert.equal(sourceRow.source_url, selection.url);
  assert.equal(sourceRow.content_hash, first.contentHash);
  assert.equal(sourceRow.file_kind, "in_network_rates");
  assert.ok(sourceRow.file_month, "source row must carry file_month");
  const observations = await store.all(
    "SELECT source_pointer, billing_code, negotiated_rate FROM mrf_price_observations WHERE source_id = ?;",
    [first.sourceId]
  );
  assert.equal(observations.length, first.inserted);
  for (const row of observations) {
    assert.ok(row.source_pointer?.startsWith(selection.url), "every observation must carry a source_pointer anchored to the source file url");
  }

  // Proof 2: idempotent re-run — same file, same bounds -> SAME source (dedup on
  // url + deterministic content hash) and ZERO new observations.
  const second = await streamIngestInNetworkFile(store, {
    fileUrl: selection.url,
    maxObservations: 50
  });
  console.log(`[phase89-mrf] second run: inserted=${second.inserted} skipped=${second.skipped} sourceDeduped=${second.sourceDeduped}`);
  assert.equal(second.sourceId, first.sourceId, "re-ingest must dedupe onto the same source row");
  assert.equal(second.sourceDeduped, true);
  assert.equal(second.inserted, 0, "idempotent re-run must insert ZERO new observations");
  assert.ok(second.skipped >= first.inserted, "re-run must skip the previously ingested rows");

  // Proof 3: queryMrfPriceEvidence returns CITED rows for a code that landed.
  const landedCode = first.billingCodes[0];
  const evidence = await queryMrfPriceEvidence(store, { billingCode: landedCode, payer: first.payer });
  assert.ok(evidence.length > 0, `evidence query must return rows for landed code ${landedCode}`);
  for (const item of evidence) {
    assert.equal(item.billingCode, landedCode);
    assert.equal(item.sourceUrl, selection.url, "evidence must cite the real source file url");
    assert.ok(item.sourcePointer, "evidence must carry a source_pointer citation locator");
    assert.ok(item.summary.includes(landedCode));
  }
  console.log(`[phase89-mrf] evidence for ${landedCode}: ${evidence[0].summary} [${evidence[0].sourcePointer}]`);

  store.close();
});
