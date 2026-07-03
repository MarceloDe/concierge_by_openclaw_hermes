#!/usr/bin/env node
// Phase 89 MRF ingest CLI (plan §9 MRF row / §11 Phase 89).
//
//   node scripts/ingest-mrf.mjs --db data/brainstyworkers.sqlite \
//     [--index-url <url>] [--file-url <url>] [--max-bytes N] \
//     [--max-observations N] [--codes 27447,70553,...]
//
// Runs fetchMrfIndex -> selectSmallestInNetworkFile -> streamIngestInNetworkFile
// against the payer's PUBLIC Transparency-in-Coverage bucket and prints a JSON
// summary. All writes go through the canonical owner (src/concierge/mrfPricing.mjs)
// via the pipeline — never directly into mrf_* tables.
// --file-url skips index fetch + selection (selection HEAD-probes candidate files
// for sizes because the live index carries none; skip it when re-ingesting a
// known file).

import { SqliteStore } from "../src/concierge/database.mjs";
import {
  fetchMrfIndex,
  selectSmallestInNetworkFile,
  streamIngestInNetworkFile
} from "../src/concierge/connectors/mrfPipeline.mjs";

const DEFAULT_INDEX_URL =
  "https://mrf.healthsparq.com/aetnacvs-egress.nophi.kyruushsq.com/prd/mrf/AETNACVS_I/ALICSI/latest_metadata.json";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const value = argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    args[key.slice(2)] = value;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.db || args.db === true) {
  console.error("usage: node scripts/ingest-mrf.mjs --db <sqlite> [--index-url <url>] [--file-url <url>] [--max-bytes N] [--max-observations N] [--codes 27447,70553,...]");
  process.exit(2);
}

const indexUrl = args["index-url"] && args["index-url"] !== true ? String(args["index-url"]) : DEFAULT_INDEX_URL;
const maxBytes = args["max-bytes"] ? Number(args["max-bytes"]) : 200 * 1024 * 1024;
const maxObservations = args["max-observations"] ? Number(args["max-observations"]) : 500;
const billingCodeWhitelist = args.codes && args.codes !== true
  ? String(args.codes).split(",").map((code) => code.trim()).filter(Boolean)
  : null;

const store = await new SqliteStore(String(args.db)).initialize();
try {
  let fileUrl;
  let indexHash = null;
  let selection = null;
  if (args["file-url"] && args["file-url"] !== true) {
    fileUrl = String(args["file-url"]);
    console.error(`[mrf] --file-url given; skipping index fetch + selection: ${fileUrl}`);
  } else {
    console.error(`[mrf] fetching index: ${indexUrl}`);
    const index = await fetchMrfIndex({ indexUrl });
    indexHash = index.indexHash;
    console.error(`[mrf] index: ${index.fileCount} entries, reportingEntityName=${index.reportingEntityName}, sha256=${index.indexHash}`);
    console.error(`[mrf] selecting smallest in-network file under ${maxBytes} bytes (HEAD probes; index has no sizes)...`);
    selection = await selectSmallestInNetworkFile(index.files, { maxBytes });
    fileUrl = selection.url;
    console.error(`[mrf] selected ${fileUrl} (${selection.contentLength} bytes, ${selection.headRequests} HEADs)`);
  }

  console.error(`[mrf] streaming ingest (maxObservations=${maxObservations}${billingCodeWhitelist ? `, codes=${billingCodeWhitelist.join(",")}` : ""})...`);
  const result = await streamIngestInNetworkFile(store, {
    fileUrl,
    billingCodeWhitelist,
    maxObservations
  });

  console.log(JSON.stringify({
    ok: true,
    fileUrl: result.fileUrl,
    fileMonth: result.fileMonth,
    payer: result.payer,
    sourceId: result.sourceId,
    sourceDeduped: result.sourceDeduped,
    contentHash: result.contentHash,
    indexHash,
    selectedFileBytes: selection?.contentLength ?? null,
    compressedBytesRead: result.compressedBytesRead,
    truncated: result.truncated,
    inNetworkItemsSeen: result.inNetworkItemsSeen,
    observationsExtracted: result.observationsExtracted,
    observationsIngested: result.inserted,
    observationsSkipped: result.skipped,
    billingCodes: result.billingCodes
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    failureClass: error.failureClass ?? "unclassified",
    httpStatus: error.httpStatus ?? null,
    message: error.message
  }, null, 2));
  process.exitCode = 1;
} finally {
  await store.close?.();
}
