import { createHash } from "node:crypto";
import { createGunzip } from "node:zlib";
import { once } from "node:events";
import { createId, nowIso } from "../database.mjs";
import { sha256Hex } from "../secretBackend.mjs";
import { recordMrfSource, ingestMrfObservations } from "../mrfPricing.mjs";

// Phase 89 (plan §9 MRF row / §11): Transparency-in-Coverage MRF pricing pipeline.
// Fetches the payer's public MRF index (latest_metadata.json), selects a real
// in-network-rates file, and STREAM-ingests a bounded slice of it through the
// canonical MRF store owner (src/concierge/mrfPricing.mjs). This module NEVER
// touches the mrf_* tables directly — recordMrfSource / ingestMrfObservations are
// the only write paths (owner rule, plan §5.1).
//
// REAL index shape discovered live (Aetna / mrf.healthsparq.com egress bucket,
// 2026-07-03, sha256 8cd92b0f…, 12,030 entries — entry-gate transcript at
// artifacts/phase89/mrf-entry-gate-transcript.md):
//   { "files": [ { reportingEntityName, reportingEntityType,
//                  reportingPlans: [{ planId, planIdType, planMarketType, planName }],
//                  lastUpdatedOn: "YYYY-MM-DD",
//                  fileSchema: "IN_NETWORK_RATES" | "ALLOWED_AMOUNTS" | "TABLE_OF_CONTENTS",
//                  fileName, filePath } ] }
// NOTE: entries carry NO size and NO absolute URL — filePath is relative to the
// index URL's directory, and sizes must come from HEAD content-length probes.
//
// REAL in-network file shape (CMS TiC in-network schema v2.0.0, observed live):
//   { reporting_entity_name, reporting_entity_type, last_updated_on, version,
//     provider_references: [{ provider_group_id,
//                             provider_groups: [{ npi: [..], tin: {..} }],
//                             network_name: [..] }],
//     in_network: [{ negotiation_arrangement, name, billing_code_type,
//                    billing_code_type_version, billing_code, description,
//                    negotiated_rates: [{ provider_references: [groupId, ..]  // OR inline provider_groups
//                                         negotiated_prices: [{ negotiated_type, negotiated_rate,
//                                                               expiration_date, service_code: [..],
//                                                               billing_class, billing_code_modifier?,
//                                                               setting }] }] }] }
export const MRF_PIPELINE_VERSION = "2026-07-03.mrf-pipeline.v1";

// contentHash determinism (idempotency-critical): streamIngestInNetworkFile aborts
// the download once maxObservations is reached, so "all compressed bytes read" is
// NOT byte-stable across runs (abort points ride network chunk boundaries). The
// source content hash is therefore sha256 over the first HASH_PREFIX_BYTES of the
// COMPRESSED stream (or the whole file when smaller) — computed streaming, byte-
// stable across re-runs of the same published file, and it still changes whenever
// the payer republishes. This is what makes re-ingest land on the SAME
// mrf_pricing_sources row so row_content_hash dedupe yields zero new observations.
export const HASH_PREFIX_BYTES = 4 * 1024 * 1024;

function classifiedError(message, { failureClass, httpStatus = null, cause = null, details = null }) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.failureClass = failureClass;
  if (httpStatus !== null) error.httpStatus = httpStatus;
  if (details !== null) error.details = details;
  return error;
}

export function resolveMrfFileUrl(indexUrl, filePath) {
  if (/^https?:\/\//i.test(filePath)) return filePath;
  return indexUrl.slice(0, indexUrl.lastIndexOf("/") + 1) + filePath;
}

// ---------------------------------------------------------------------------
// 1. Index fetch
// ---------------------------------------------------------------------------
export async function fetchMrfIndex({ indexUrl, fetchImpl = fetch } = {}) {
  if (!indexUrl) {
    throw classifiedError("fetchMrfIndex requires indexUrl", { failureClass: "mrf_bad_arguments" });
  }
  let res;
  try {
    res = await fetchImpl(indexUrl);
  } catch (cause) {
    throw classifiedError(`MRF index fetch failed: GET ${indexUrl} — ${cause?.message ?? cause}`, {
      failureClass: "mrf_http_failure", cause
    });
  }
  if (!res.ok) {
    throw classifiedError(`MRF index fetch failed: GET ${indexUrl} — HTTP ${res.status}`, {
      failureClass: "mrf_http_failure", httpStatus: res.status
    });
  }
  // ~7MB — buffering the INDEX is fine (only the data files must stream).
  const rawBytes = Buffer.from(await res.arrayBuffer());
  const indexHash = createHash("sha256").update(rawBytes).digest("hex");
  let parsed;
  try {
    parsed = JSON.parse(rawBytes.toString("utf8"));
  } catch (cause) {
    throw classifiedError(`MRF index is not valid JSON (${indexUrl})`, {
      failureClass: "mrf_index_shape_unexpected", cause
    });
  }
  const files = parsed?.files;
  if (!Array.isArray(files) || files.length === 0) {
    throw classifiedError(
      `MRF index shape unexpected: expected non-empty top-level "files" array, got keys ${JSON.stringify(Object.keys(parsed ?? {}))}`,
      { failureClass: "mrf_index_shape_unexpected" }
    );
  }
  for (const entry of files) {
    if (entry && typeof entry === "object" && entry.filePath && !entry.url) {
      entry.url = resolveMrfFileUrl(indexUrl, String(entry.filePath));
    }
  }
  return {
    indexUrl,
    files,
    fileCount: files.length,
    reportingEntityName: files[0]?.reportingEntityName ?? null,
    retrievedAt: nowIso(),
    indexHash
  };
}

// ---------------------------------------------------------------------------
// 2. File selection (smallest real in-network-rates file)
// ---------------------------------------------------------------------------
// The live index carries NO size field, so sizes come from HEAD content-length.
// Candidates are deduped by URL (one physical file can serve many reportingPlans)
// and probed in DETERMINISTIC order (sorted by sha256(url)) so repeated runs scan
// the same sequence and select the same file. Probing proceeds in concurrent
// batches and stops at the first batch that produced a candidate under maxBytes
// (picking the smallest qualifying seen so far).
export async function selectSmallestInNetworkFile(files, {
  maxBytes = 200 * 1024 * 1024,
  headConcurrency = 12,
  maxHeadRequests = 400,
  fetchImpl = fetch,
  logger = console
} = {}) {
  if (!Array.isArray(files)) {
    throw classifiedError("selectSmallestInNetworkFile requires the index files array", {
      failureClass: "mrf_bad_arguments"
    });
  }
  const byUrl = new Map();
  for (const entry of files) {
    if (entry?.fileSchema !== "IN_NETWORK_RATES") continue;
    if (!entry.url) continue;
    const existing = byUrl.get(entry.url);
    if (existing) {
      for (const plan of entry.reportingPlans ?? []) existing.reportingPlans.push(plan);
    } else {
      byUrl.set(entry.url, {
        url: entry.url,
        fileName: entry.fileName ?? null,
        filePath: entry.filePath ?? null,
        lastUpdatedOn: entry.lastUpdatedOn ?? null,
        reportingEntityName: entry.reportingEntityName ?? null,
        reportingPlans: [...(entry.reportingPlans ?? [])]
      });
    }
  }
  const candidates = [...byUrl.values()];
  if (candidates.length === 0) {
    throw classifiedError("MRF index carries no IN_NETWORK_RATES entries", {
      failureClass: "mrf_index_shape_unexpected"
    });
  }

  // Future-proof: if the index ever grows a size field, use it and skip HEADs.
  const sizeKey = ["fileSizeBytes", "fileSize", "sizeBytes", "size", "bytes"]
    .find((k) => candidates.some((c) => Number.isFinite(Number(files.find((f) => f.url === c.url)?.[k]))));
  if (sizeKey) {
    for (const c of candidates) c.contentLength = Number(files.find((f) => f.url === c.url)?.[sizeKey]);
    const qualifying = candidates.filter((c) => c.contentLength <= maxBytes).sort((a, b) => a.contentLength - b.contentLength);
    if (qualifying.length > 0) return { ...qualifying[0], headRequests: 0, probed: candidates.length };
    throw classifiedError(`no in-network file under maxBytes=${maxBytes} (index-declared sizes)`, {
      failureClass: "mrf_no_file_under_max_bytes"
    });
  }

  candidates.sort((a, b) => {
    const ha = sha256Hex(a.url);
    const hb = sha256Hex(b.url);
    return ha < hb ? -1 : ha > hb ? 1 : 0;
  });

  const probed = [];
  let headRequests = 0;
  const budget = Math.min(candidates.length, maxHeadRequests);
  for (let offset = 0; offset < budget; offset += headConcurrency) {
    const batch = candidates.slice(offset, Math.min(offset + headConcurrency, budget));
    const results = await Promise.all(batch.map(async (candidate) => {
      headRequests += 1;
      try {
        const res = await fetchImpl(candidate.url, { method: "HEAD" });
        if (!res.ok) return { candidate, contentLength: null, status: res.status };
        const len = Number(res.headers.get("content-length"));
        return { candidate, contentLength: Number.isFinite(len) ? len : null, status: res.status };
      } catch (cause) {
        return { candidate, contentLength: null, error: cause?.message ?? String(cause) };
      }
    }));
    for (const r of results) {
      if (r.contentLength !== null) probed.push({ ...r.candidate, contentLength: r.contentLength });
    }
    const qualifying = probed.filter((p) => p.contentLength <= maxBytes);
    if (qualifying.length > 0) {
      qualifying.sort((a, b) => a.contentLength - b.contentLength);
      const chosen = qualifying[0];
      logger.log(`[mrf] selected in-network file after ${headRequests} HEADs: ${chosen.url} (${chosen.contentLength} bytes)`);
      return { ...chosen, headRequests, probed: probed.length };
    }
  }
  const smallest = probed.slice().sort((a, b) => a.contentLength - b.contentLength)[0] ?? null;
  throw classifiedError(
    `no in-network file under maxBytes=${maxBytes} within ${headRequests} HEAD probes` +
    (smallest ? ` (smallest seen: ${smallest.contentLength} bytes at ${smallest.url})` : ""),
    { failureClass: "mrf_no_file_under_max_bytes", details: { headRequests, smallestSeen: smallest } }
  );
}

// ---------------------------------------------------------------------------
// 3. Streaming top-level-array extractor
// ---------------------------------------------------------------------------
// Incremental scanner over DECOMPRESSED text chunks. It tracks JSON string/escape
// state and brace/bracket depth, detects root-object keys whose value is an array
// (e.g. "provider_references":[ and "in_network":[ at depth 1), and yields each
// top-level element of those arrays as a parsed object — one at a time, without
// ever materializing the whole document. Root-level STRING scalars (e.g.
// reporting_entity_name, last_updated_on) are surfaced via onRootField.
// Desync (unbalanced brackets / unparseable item slice) fails loud.
export function createMrfStreamExtractor({ arrayKeys = ["in_network"], onArrayItem = null, onRootField = null } = {}) {
  const targets = new Set(arrayKeys);
  let inString = false;
  let escaped = false;
  let collectString = false;
  let stringBuf = "";
  let lastString = null;   // most recently completed string outside targets (key candidate)
  let pendingKey = null;   // root key awaiting its value
  let depth = 0;
  let currentArrayKey = null; // target array we are currently inside (opened at depth 1 -> 2)
  let capturing = false;
  let itemParts = [];
  let itemsEmitted = 0;
  let ended = false;

  function fail(message) {
    throw classifiedError(`MRF stream JSON desync: ${message}`, { failureClass: "mrf_json_desync" });
  }

  function write(text) {
    if (ended) fail("write() after end()");
    let captureStart = -1; // index within THIS chunk where live capture began
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          if (collectString) stringBuf += ch;
        } else if (ch === "\\") {
          escaped = true;
          if (collectString) stringBuf += ch;
        } else if (ch === "\"") {
          inString = false;
          if (collectString) {
            collectString = false;
            lastString = stringBuf;
            if (pendingKey !== null && !capturing && depth === 1 && currentArrayKey === null) {
              // root-level string scalar value (raw, escapes untouched — fine for names/dates)
              if (onRootField) onRootField(pendingKey, stringBuf);
              pendingKey = null;
              lastString = null;
            }
          }
        } else if (collectString) {
          stringBuf += ch;
        }
        continue;
      }
      switch (ch) {
        case "\"":
          inString = true;
          escaped = false;
          if (!capturing && depth === 1 && currentArrayKey === null) {
            collectString = true;
            stringBuf = "";
          }
          break;
        case ":":
          if (lastString !== null) {
            pendingKey = lastString;
            lastString = null;
          }
          break;
        case "[":
          if (depth === 1 && pendingKey !== null && targets.has(pendingKey) && currentArrayKey === null) {
            currentArrayKey = pendingKey;
            pendingKey = null;
            depth += 1;
            break;
          }
          if (currentArrayKey !== null && depth === 2 && !capturing) {
            capturing = true;
            itemParts = [];
            captureStart = i;
          }
          depth += 1;
          pendingKey = null;
          break;
        case "{":
          if (currentArrayKey !== null && depth === 2 && !capturing) {
            capturing = true;
            itemParts = [];
            captureStart = i;
          }
          depth += 1;
          pendingKey = null;
          break;
        case "}":
        case "]":
          depth -= 1;
          if (depth < 0) fail("unbalanced brackets (depth went negative)");
          if (capturing && depth === 2) {
            itemParts.push(text.slice(captureStart === -1 ? 0 : captureStart, i + 1));
            captureStart = -1;
            capturing = false;
            const raw = itemParts.join("");
            itemParts = [];
            let parsed;
            try {
              parsed = JSON.parse(raw);
            } catch (cause) {
              fail(`array "${currentArrayKey}" item ${itemsEmitted} is not valid JSON (${cause.message}); head=${raw.slice(0, 160)}`);
            }
            itemsEmitted += 1;
            if (onArrayItem) onArrayItem(currentArrayKey, parsed);
          } else if (ch === "]" && currentArrayKey !== null && depth === 1) {
            currentArrayKey = null;
          }
          break;
        case ",":
          lastString = null;
          if (depth === 1) pendingKey = null;
          break;
        default:
          break; // whitespace / numbers / literals — depth-neutral
      }
    }
    if (capturing) {
      itemParts.push(captureStart === -1 ? text : text.slice(captureStart));
    }
  }

  function end() {
    ended = true;
    if (inString || capturing || depth !== 0) {
      fail(`stream ended mid-structure (depth=${depth}, inString=${inString}, capturing=${capturing})`);
    }
  }

  return {
    write,
    end,
    get itemsEmitted() { return itemsEmitted; },
    get currentArrayKey() { return currentArrayKey; }
  };
}

// ---------------------------------------------------------------------------
// 4. Streaming ingest of one in-network-rates file (owner API only)
// ---------------------------------------------------------------------------
export async function streamIngestInNetworkFile(store, {
  fileUrl,
  fileMonth = null,
  payer = null,
  billingCodeWhitelist = null,     // iterable of billing codes, or null = take everything
  geographyNpiWhitelist = null,    // iterable of provider NPIs, or null = no NPI filter
  maxObservations = 500,
  maxProviderGroups = 250000,
  ingestBatchSize = 100,
  fetchImpl = fetch,
  logger = console,
  sessionId = null
} = {}) {
  if (!store || !fileUrl) {
    throw classifiedError("streamIngestInNetworkFile requires (store, { fileUrl })", {
      failureClass: "mrf_bad_arguments"
    });
  }
  const codeWhitelist = billingCodeWhitelist ? new Set([...billingCodeWhitelist].map(String)) : null;
  const npiWhitelist = geographyNpiWhitelist ? new Set([...geographyNpiWhitelist].map(String)) : null;
  const maxObs = Math.max(1, Number(maxObservations) || 500);

  let res;
  try {
    res = await fetchImpl(fileUrl);
  } catch (cause) {
    throw classifiedError(`MRF file fetch failed: GET ${fileUrl} — ${cause?.message ?? cause}`, {
      failureClass: "mrf_http_failure", cause
    });
  }
  if (!res.ok || !res.body) {
    throw classifiedError(`MRF file fetch failed: GET ${fileUrl} — HTTP ${res.status}`, {
      failureClass: "mrf_http_failure", httpStatus: res.status
    });
  }

  const hash = createHash("sha256");
  let hashedBytes = 0;
  let compressedBytesRead = 0;
  let truncated = false;
  let streamError = null;

  // Stream state populated by the extractor callbacks (all synchronous).
  const rootFields = {};
  const providerNpisByGroup = new Map(); // provider_group_id -> [npi, ...] (first few)
  let providerGroupsIndexed = 0;
  let providerGroupsDropped = 0;
  let inNetworkItemsSeen = 0;
  let itemsSkippedByCodeWhitelist = 0;
  let pricesSkippedByNpiWhitelist = 0;
  const rows = [];
  let stopExtraction = false;

  function resolveNpis(negotiatedRate) {
    const npis = [];
    for (const groupId of negotiatedRate?.provider_references ?? []) {
      for (const npi of providerNpisByGroup.get(groupId) ?? []) npis.push(npi);
    }
    for (const group of negotiatedRate?.provider_groups ?? []) {
      for (const npi of group?.npi ?? []) {
        if (npi) npis.push(String(npi));
      }
    }
    return npis;
  }

  function onArrayItem(arrayKey, item) {
    if (stopExtraction) return;
    if (arrayKey === "provider_references") {
      const groupId = item?.provider_group_id;
      if (groupId === undefined || groupId === null) return;
      if (providerNpisByGroup.size >= maxProviderGroups) {
        providerGroupsDropped += 1;
        return;
      }
      const npis = [];
      for (const group of item.provider_groups ?? []) {
        for (const npi of group?.npi ?? []) {
          if (npi && npis.length < 5) npis.push(String(npi));
        }
      }
      providerNpisByGroup.set(groupId, npis);
      providerGroupsIndexed += 1;
      return;
    }
    if (arrayKey !== "in_network") return;
    inNetworkItemsSeen += 1;
    const billingCode = item?.billing_code === undefined || item?.billing_code === null
      ? null : String(item.billing_code);
    const billingCodeType = item?.billing_code_type ?? null;
    if (!billingCode || !billingCodeType) return;
    if (codeWhitelist && !codeWhitelist.has(billingCode)) {
      itemsSkippedByCodeWhitelist += 1;
      return;
    }
    for (const negotiatedRate of item.negotiated_rates ?? []) {
      const npis = resolveNpis(negotiatedRate);
      let providerNpi = npis[0] ?? null;
      if (npiWhitelist) {
        providerNpi = npis.find((npi) => npiWhitelist.has(npi)) ?? null;
        if (!providerNpi) {
          pricesSkippedByNpiWhitelist += (negotiatedRate.negotiated_prices ?? []).length;
          continue;
        }
      }
      for (const price of negotiatedRate.negotiated_prices ?? []) {
        if (rows.length >= maxObs) { stopExtraction = true; return; }
        const serviceCodes = Array.isArray(price?.service_code) ? price.service_code.map(String) : [];
        rows.push({
          billingCode,
          billingCodeType: String(billingCodeType),
          billingClass: price?.billing_class ?? null,
          placeOfService: serviceCodes.length === 1 ? serviceCodes[0] : null,
          serviceCodes,
          providerNpi,
          negotiatedType: price?.negotiated_type ?? null,
          negotiatedRate: price?.negotiated_rate ?? null,
          allowedAmount: null, // in-network-rates files carry negotiated rates, not allowed amounts
          effectiveToAt: price?.expiration_date ?? null
        });
      }
      if (stopExtraction) return;
    }
  }

  const extractor = createMrfStreamExtractor({
    arrayKeys: ["provider_references", "in_network"],
    onArrayItem,
    onRootField: (key, value) => { rootFields[key] = value; }
  });

  const gunzip = createGunzip();
  const decoder = new TextDecoder("utf-8");
  gunzip.on("data", (chunk) => {
    if (streamError) return;
    try {
      extractor.write(decoder.decode(chunk, { stream: true }));
    } catch (error) {
      streamError = error;
      gunzip.destroy();
    }
  });
  gunzip.on("error", (cause) => {
    if (!streamError && !(truncated && cause?.code === "Z_BUF_ERROR")) {
      streamError = classifiedError(`gunzip failed for ${fileUrl}: ${cause?.message ?? cause}`, {
        failureClass: "mrf_gzip_failure", cause
      });
    }
  });

  const reader = res.body.getReader();
  let sawEof = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { sawEof = true; break; }
      compressedBytesRead += value.length;
      if (hashedBytes < HASH_PREFIX_BYTES) {
        const take = Math.min(value.length, HASH_PREFIX_BYTES - hashedBytes);
        hash.update(take === value.length ? value : value.subarray(0, take));
        hashedBytes += take;
      }
      if (streamError) throw streamError;
      if (!stopExtraction) {
        const ok = gunzip.write(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
        if (!ok) await once(gunzip, "drain").catch(() => {});
        if (streamError) throw streamError;
      }
      // Stop condition: enough observations AND the deterministic hash prefix is
      // complete (or file ended first). Abort the transfer — never read to EOF
      // just to drain a multi-GB file.
      if (stopExtraction && hashedBytes >= HASH_PREFIX_BYTES) {
        truncated = true;
        break;
      }
    }
  } finally {
    if (!sawEof) await reader.cancel().catch(() => {});
  }
  if (streamError) throw streamError;
  if (sawEof) {
    gunzip.end();
    await new Promise((resolve) => {
      gunzip.once("end", resolve);
      gunzip.once("close", resolve);
      gunzip.once("error", resolve);
    });
    if (streamError) throw streamError;
    extractor.write(decoder.decode()); // flush any trailing multi-byte sequence
    if (!stopExtraction) extractor.end();
  } else {
    gunzip.destroy();
  }

  if (truncated) {
    logger.warn(
      `[mrf] TRUNCATED ingest of ${fileUrl}: stopped at maxObservations=${maxObs} after ` +
      `${compressedBytesRead} compressed bytes (${inNetworkItemsSeen} in_network items scanned). ` +
      `This is a BOUNDED SLICE of the file, not full coverage.`
    );
  }
  if (providerGroupsDropped > 0) {
    logger.warn(`[mrf] provider_references map capped at ${maxProviderGroups}; dropped ${providerGroupsDropped} groups (NPIs for those rates resolve to null).`);
  }
  if (rows.length === 0 && inNetworkItemsSeen === 0) {
    throw classifiedError(
      `no in_network items found in ${fileUrl} (rootFields=${JSON.stringify(rootFields)}) — file shape unexpected`,
      { failureClass: "mrf_file_shape_unexpected" }
    );
  }

  const contentHash = hash.digest("hex");
  const resolvedPayer = payer ?? rootFields.reporting_entity_name ?? null;
  if (!resolvedPayer) {
    throw classifiedError(`cannot resolve payer for ${fileUrl} (no payer param, no reporting_entity_name in stream)`, {
      failureClass: "mrf_file_shape_unexpected"
    });
  }
  const resolvedFileMonth = fileMonth
    ?? (typeof rootFields.last_updated_on === "string" ? rootFields.last_updated_on.slice(0, 7) : null);
  const ingestionRunId = createId("mrfrun");

  // Owner API, step 1: record the source (dedupes on source_url + content_hash).
  const sourceResult = await recordMrfSource(store, {
    payer: resolvedPayer,
    sourceUrl: fileUrl,
    fileKind: "in_network_rates",
    fileMonth: resolvedFileMonth,
    contentHash,
    effectiveAt: rootFields.last_updated_on ?? null,
    retrievedAt: nowIso(),
    ingestionRunId,
    stats: { compressedBytesRead, hashedBytes, truncated, inNetworkItemsSeen, extractedRows: rows.length },
    sessionId
  });
  if (!sourceResult.recorded) {
    throw classifiedError(`recordMrfSource refused: ${sourceResult.reason}`, {
      failureClass: "mrf_owner_api_refused", details: sourceResult
    });
  }

  // Owner API, step 2: ingest observations in batches (row_content_hash dedupe).
  const withRunId = rows.map((row) => ({ ...row, ingestionRunId }));
  let inserted = 0;
  let skipped = 0;
  for (let offset = 0; offset < withRunId.length; offset += ingestBatchSize) {
    const batch = withRunId.slice(offset, offset + ingestBatchSize);
    const result = await ingestMrfObservations(store, { sourceId: sourceResult.sourceId, rows: batch, sessionId });
    if (!result.ingested) {
      throw classifiedError(`ingestMrfObservations refused: ${result.reason}`, {
        failureClass: "mrf_owner_api_refused", details: result
      });
    }
    inserted += result.inserted;
    skipped += result.skipped;
  }

  const billingCodes = [...new Set(rows.map((row) => row.billingCode))];
  return {
    sourceId: sourceResult.sourceId,
    sourceDeduped: sourceResult.deduped,
    fileUrl,
    fileMonth: resolvedFileMonth,
    payer: resolvedPayer,
    contentHash,
    compressedBytesRead,
    truncated,
    inNetworkItemsSeen,
    providerGroupsIndexed,
    itemsSkippedByCodeWhitelist,
    pricesSkippedByNpiWhitelist,
    observationsExtracted: rows.length,
    inserted,
    skipped,
    billingCodes,
    ingestionRunId
  };
}
