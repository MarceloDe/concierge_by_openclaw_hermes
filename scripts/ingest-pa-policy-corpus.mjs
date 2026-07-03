#!/usr/bin/env node
// Phase 89 (plan §9/§11): polite public PA-policy corpus crawler.
//
// Ingests a SMALL pinned list of REAL public payer / CMS prior-authorization
// policy pages into the EXISTING knowledge_sources / research_artifacts tables
// through the EXISTING research-ops writer pipeline:
//
//   startManualResearchRun -> executeResearchRun(workerMode: "deterministic_fetch")
//
// so every stored artifact carries the full existing provenance chain
// (research_runs row, research_run_events, budget events, audit events,
// content_hash + extraction_hash, safe_text_preview) and is READABLE by
// searchResearchEvidence — the evidence_sourced arm's real substrate.
//
// TRUST MODEL (honest): deterministic_fetch artifacts land as
// "extracted_pending_review". There is NO auto-trust path for crawled pages —
// trusted retrieval ("trusted_retrieval_approved") requires an operator
// review through the EXISTING reviewResearchArtifact(decision: "approve")
// function. This crawler stores pending artifacts and PRINTS the review
// requirement; it never self-approves.
//
// POLITENESS: sequential fetches, configurable delay between HTTP requests,
// honest User-Agent, robots.txt fetched and obeyed per host (RFC 9309:
// robots 4xx => no restrictions; robots 5xx/unreachable => conservative skip).
// Bot-challenge interstitials (e.g. Aetna's Incapsula wall) are detected and
// skipped LOUD — the challenge page is never stored as policy evidence.
//
// Usage:
//   node scripts/ingest-pa-policy-corpus.mjs --db data/brainstyworkers.sqlite [--limit 3] [--delay-ms 1500]
//
// Exit codes: 0 = at least one page ingested or verified unchanged;
//             2 = ALL fetches failed (classified pa_policy_corpus_all_fetches_failed).

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { SqliteStore, createId, nowIso } from "../src/concierge/database.mjs";
import { executeResearchRun, startManualResearchRun } from "../src/concierge/researchOps.mjs";

export const PA_POLICY_CRAWLER_VERSION = "2026-07-03.phase89-pa-policy-corpus-crawler.v1";
export const CRAWLER_USER_AGENT = "brainstyworkers-pa-policy-crawler/1.0";
const DEFAULT_DELAY_MS = 1500;
const DEFAULT_LIMIT = 3;
const FETCH_TIMEOUT_MS = Number(process.env.BRAINSTY_PA_CRAWLER_FETCH_TIMEOUT_MS ?? 45000);

// Pinned corpus of REAL public prior-authorization / coverage policy pages.
// Order matters: the most reliably crawlable authoritative pages come first so
// small --limit runs land useful evidence. Aetna serves an Incapsula JS
// challenge to non-browser clients; those entries stay pinned (robots.txt
// ALLOWS them) and are expected to skip-loud until Aetna serves plain HTML.
export const PA_POLICY_CORPUS = [
  {
    url: "https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=36575",
    sourceKey: "cms_mcd_lcd_l36575_total_knee_arthroplasty",
    title: "CMS MCD LCD L36575 Total Knee Arthroplasty",
    sourceType: "cms_coverage_policy",
    authorityLevel: "cms_primary",
    workflowKeys: ["prior_authorization_navigation", "denial_appeal_preparation"],
    topic: "Prior authorization / medical necessity criteria for total knee arthroplasty (knee replacement)",
    query: { q: "prior authorization knee replacement total knee arthroplasty coverage criteria" }
  },
  {
    url: "https://www.cms.gov/medicare-coverage-database/view/ncd.aspx?ncdid=57",
    sourceKey: "cms_mcd_ncd_100_1_bariatric_surgery",
    title: "CMS MCD NCD 100.1 Bariatric Surgery for Treatment of Co-Morbid Conditions Related to Morbid Obesity",
    sourceType: "cms_coverage_policy",
    authorityLevel: "cms_primary",
    workflowKeys: ["prior_authorization_navigation", "denial_appeal_preparation"],
    topic: "National coverage determination criteria for bariatric surgery (prior authorization substrate)",
    query: { q: "bariatric surgery national coverage determination criteria" }
  },
  {
    // Reuses the EXISTING seeded knowledge_sources row (source_key + base_url
    // both match the registry seed in workflowArchitecture.mjs).
    url: "https://www.aetna.com/health-care-professionals/clinical-policy-bulletins.html",
    sourceKey: "aetna_clinical_policy_bulletins",
    title: "Aetna Clinical Policy Bulletins",
    sourceType: "payer_policy",
    authorityLevel: "payer_primary",
    workflowKeys: ["prior_authorization_navigation", "denial_appeal_preparation"],
    topic: "Aetna clinical policy bulletins index (payer prior-authorization policies)",
    query: { q: "aetna clinical policy bulletin prior authorization" }
  },
  {
    url: "https://www.aetna.com/cpb/medical/data/600_699/0673.html",
    sourceKey: "aetna_cpb_0673_total_knee_arthroplasty",
    title: "Aetna CPB 0673 Total Knee Arthroplasty",
    sourceType: "payer_policy",
    authorityLevel: "payer_primary",
    workflowKeys: ["prior_authorization_navigation", "denial_appeal_preparation"],
    topic: "Aetna clinical policy bulletin 0673: total knee arthroplasty prior authorization criteria",
    query: { q: "prior authorization knee replacement total knee arthroplasty" }
  }
];

export class PaPolicyCrawlerError extends Error {
  constructor(message, failureClass, details = {}) {
    super(message);
    this.name = "PaPolicyCrawlerError";
    this.failureClass = failureClass;
    this.details = details;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

// Mirrors researchOps.mjs stripHtml (not exported there) so the idempotency
// pre-check computes the SAME extraction_hash the existing writer stores.
export function stripHtmlLikeResearchOps(value) {
  return String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const BOT_CHALLENGE_MARKERS = [
  /_incapsula_resource/i,
  /incapsula incident/i,
  /cf-browser-verification/i,
  /cf_chl_/i,
  /px-captcha/i,
  /request unsuccessful/i,
  /verify you are a human/i,
  /enable javascript and cookies to continue/i
];

export function detectBotChallenge(bodyText) {
  const head = String(bodyText ?? "").slice(0, 20000);
  const marker = BOT_CHALLENGE_MARKERS.find((re) => re.test(head));
  return marker ? String(marker) : null;
}

// ---------------------------------------------------------------------------
// robots.txt (RFC 9309): group selection by user-agent product token, rule
// matching with * wildcards and $ end anchor, longest-match precedence,
// Allow wins length ties. 4xx robots => no restrictions. 5xx / network error
// => conservative disallow (we skip the host).
// ---------------------------------------------------------------------------
export function parseRobotsTxt(text) {
  const groups = [];
  let current = null;
  let lastLineWasAgent = false;
  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (!lastLineWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }
    lastLineWasAgent = false;
    if ((field === "allow" || field === "disallow") && current) {
      current.rules.push({ allow: field === "allow", pattern: value });
    }
  }
  return groups;
}

function robotsPatternMatches(pattern, path) {
  if (!pattern) return false; // empty Disallow: means allow everything
  let regex = "";
  for (const char of pattern) {
    if (char === "*") regex += ".*";
    else if (char === "$") regex += "$";
    else regex += char.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${regex}`).test(path);
}

export function robotsVerdictForPath(groups, path, userAgent = CRAWLER_USER_AGENT) {
  const productToken = userAgent.toLowerCase().split("/")[0];
  let selected = null;
  let selectedSpecificity = -1;
  for (const group of groups) {
    for (const agent of group.agents) {
      if (agent === "*" && selectedSpecificity < 0) {
        selected = group;
        selectedSpecificity = 0;
      } else if (agent !== "*" && (productToken.includes(agent) || agent.includes(productToken)) && agent.length > selectedSpecificity) {
        selected = group;
        selectedSpecificity = agent.length;
      }
    }
  }
  if (!selected) return { allowed: true, rule: null, group: null };
  let best = null;
  for (const rule of selected.rules) {
    if (!robotsPatternMatches(rule.pattern, path)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  if (!best) return { allowed: true, rule: null, group: selected.agents.join(",") };
  return { allowed: best.allow, rule: `${best.allow ? "Allow" : "Disallow"}: ${best.pattern}`, group: selected.agents.join(",") };
}

async function fetchWithTimeout(fetchImpl, url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

function makePoliteness({ delayMs, sleepImpl }) {
  let lastRequestAt = 0;
  return async function politePause() {
    const waitMs = lastRequestAt + delayMs - Date.now();
    if (waitMs > 0) await sleepImpl(waitMs);
    lastRequestAt = Date.now();
  };
}

async function robotsVerdictForUrl({ parsedUrl, robotsCache, fetchImpl, politePause, log }) {
  const origin = parsedUrl.origin;
  if (!robotsCache.has(origin)) {
    const robotsUrl = `${origin}/robots.txt`;
    await politePause();
    try {
      const response = await fetchWithTimeout(fetchImpl, robotsUrl, {
        method: "GET",
        headers: { "user-agent": CRAWLER_USER_AGENT, accept: "text/plain,*/*;q=0.5" }
      });
      if (response.ok) {
        robotsCache.set(origin, { status: "fetched", groups: parseRobotsTxt(await response.text()) });
      } else if (response.status >= 400 && response.status < 500) {
        // RFC 9309: robots client errors => crawling is not restricted.
        robotsCache.set(origin, { status: `absent_http_${response.status}`, groups: [] });
      } else {
        robotsCache.set(origin, { status: `unreachable_http_${response.status}`, groups: null });
      }
    } catch (error) {
      robotsCache.set(origin, { status: `unreachable_${error?.name ?? "Error"}`, groups: null });
    }
    log(`robots.txt ${robotsUrl}: ${robotsCache.get(origin).status}`);
  }
  const cached = robotsCache.get(origin);
  if (cached.groups === null) {
    return { allowed: false, verdict: "robots_unreachable_conservative_skip", robotsStatus: cached.status, rule: null };
  }
  const verdict = robotsVerdictForPath(cached.groups, `${parsedUrl.pathname}${parsedUrl.search}`);
  return {
    allowed: verdict.allowed,
    verdict: verdict.allowed ? "robots_allowed" : "robots_disallowed",
    robotsStatus: cached.status,
    rule: verdict.rule
  };
}

async function ensureKnowledgeSource(store, entry, parsedUrl) {
  const existing = await store.findOne("knowledge_sources", { source_key: entry.sourceKey });
  if (existing) {
    const existingHref = new URL(existing.base_url).href;
    if (existingHref !== parsedUrl.href) {
      throw new PaPolicyCrawlerError(
        `knowledge_sources row ${entry.sourceKey} exists with a different base_url (${existingHref}); refusing to repoint it.`,
        "pa_policy_source_key_base_url_mismatch",
        { sourceKey: entry.sourceKey, existingBaseUrl: existingHref, requestedUrl: parsedUrl.href }
      );
    }
    return { source: existing, created: false };
  }
  // New authoritative public source rows follow the registry-seed conventions
  // from workflowArchitecture.mjs KNOWLEDGE_SOURCES (status "active_registry",
  // web_with_source_citation access) — the same documented path that vets the
  // pinned seed registry. Source-level registration is separate from artifact
  // trust: crawled artifacts still land pending review.
  const time = nowIso();
  const row = {
    id: createId("ksrc"),
    source_key: entry.sourceKey,
    title: entry.title,
    source_type: entry.sourceType,
    authority_level: entry.authorityLevel,
    base_url: parsedUrl.href,
    workflow_keys_json: JSON.stringify(entry.workflowKeys ?? []),
    refresh_policy: "check_at_task_time_policy_can_change",
    access_method: "web_with_source_citation",
    status: "active_registry",
    priority: 100,
    last_run_at: null,
    last_status: null,
    metadata_json: JSON.stringify({
      registeredBy: "scripts/ingest-pa-policy-corpus.mjs",
      pinnedCorpus: true,
      publicDocumentClass: "public_payer_or_cms_policy",
      version: PA_POLICY_CRAWLER_VERSION
    }),
    proposed_by: null,
    approved_by: null,
    reviewed_at: null,
    created_at: time,
    updated_at: time
  };
  await store.insert("knowledge_sources", row);
  return { source: row, created: true };
}

export async function ingestPaPolicyCorpus(
  store,
  {
    limit = DEFAULT_LIMIT,
    delayMs = DEFAULT_DELAY_MS,
    corpus = PA_POLICY_CORPUS,
    fetchImpl = globalThis.fetch,
    sleepImpl = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
    actorUserId = null,
    log = (line) => console.error(`[pa-policy-crawler] ${line}`)
  } = {}
) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, corpus.length));
  const selected = corpus.slice(0, boundedLimit);
  const politePause = makePoliteness({ delayMs: Math.max(0, Number(delayMs) || 0), sleepImpl });
  const robotsCache = new Map();
  const summary = {
    version: PA_POLICY_CRAWLER_VERSION,
    userAgent: CRAWLER_USER_AGENT,
    attempted: selected.length,
    ingested: 0,
    unchangedSkipped: 0,
    failed: 0,
    pages: [],
    reviewRequirement:
      "Crawled artifacts are stored citation_status=extracted_pending_review. Trusted retrieval requires an operator approval through reviewResearchArtifact(decision: \"approve\") — there is no auto-trust path for crawled pages."
  };

  for (const entry of selected) {
    const page = { url: entry.url, sourceKey: entry.sourceKey, status: null };
    summary.pages.push(page);
    try {
      const parsedUrl = new URL(entry.url);

      // 1) robots.txt gate (fetched once per host, polite, honest UA).
      const robots = await robotsVerdictForUrl({ parsedUrl, robotsCache, fetchImpl, politePause, log });
      page.robots = robots;
      if (!robots.allowed) {
        page.status = "skipped";
        page.failureClass = robots.verdict;
        summary.failed += 1;
        log(`SKIP ${entry.url}: ${robots.verdict}${robots.rule ? ` (${robots.rule})` : ""}`);
        continue;
      }

      // 2) Single polite fetch of the page.
      await politePause();
      const response = await fetchWithTimeout(fetchImpl, parsedUrl.href, {
        method: "GET",
        headers: {
          "user-agent": CRAWLER_USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5"
        }
      });
      if (!response.ok) {
        page.status = "skipped";
        page.failureClass = `pa_policy_fetch_http_${response.status}`;
        summary.failed += 1;
        log(`SKIP ${entry.url}: HTTP ${response.status}`);
        continue;
      }
      const contentType = response.headers?.get?.("content-type") || "";
      const bodyBuffer = Buffer.from(await response.arrayBuffer());
      const bodyText = bodyBuffer.toString("utf8");

      // 3) Never store a bot-challenge interstitial as policy evidence.
      const challengeMarker = detectBotChallenge(bodyText);
      if (challengeMarker) {
        page.status = "skipped";
        page.failureClass = "pa_policy_bot_challenge_interstitial";
        page.challengeMarker = challengeMarker;
        summary.failed += 1;
        log(`SKIP ${entry.url}: bot-challenge interstitial detected (${challengeMarker}); page NOT stored.`);
        continue;
      }

      // 4) Idempotency by URL + content hash of the extracted text. (Raw bytes
      //    on ASP.NET pages carry per-request tokens; the extracted policy text
      //    is stable, and research_artifacts stores BOTH hashes.)
      const extractedText = stripHtmlLikeResearchOps(bodyText);
      if (!extractedText) {
        page.status = "skipped";
        page.failureClass = "pa_policy_no_extractable_text";
        summary.failed += 1;
        log(`SKIP ${entry.url}: no extractable text.`);
        continue;
      }
      const extractionHash = sha256(extractedText);
      const existingArtifact = await store.get(
        "SELECT id, content_hash, extraction_hash, citation_status FROM research_artifacts WHERE source_url = ? AND extraction_hash = ? LIMIT 1;",
        [parsedUrl.href, extractionHash]
      );
      if (existingArtifact) {
        page.status = "unchanged_already_ingested";
        page.artifactId = existingArtifact.id;
        page.contentHash = existingArtifact.content_hash;
        page.extractionHash = existingArtifact.extraction_hash;
        page.citationStatus = existingArtifact.citation_status;
        summary.unchangedSkipped += 1;
        log(`UNCHANGED ${entry.url}: artifact ${existingArtifact.id} already stored (extraction hash match); 0 new rows.`);
        continue;
      }

      // 5) knowledge_sources row (reuse existing seeded row when present).
      const { source, created } = await ensureKnowledgeSource(store, entry, parsedUrl);
      page.sourceId = source.id;
      page.sourceCreated = created;

      // 6) Store through the EXISTING research-ops writer pipeline so runs,
      //    events, budget and audit rows all land with the artifact. The
      //    fetchImpl replays the body we already fetched politely above —
      //    exactly one network request per page.
      const replayFetch = async () =>
        new Response(bodyBuffer, {
          status: 200,
          headers: {
            "content-type": contentType || "text/html; charset=utf-8",
            "content-length": String(bodyBuffer.byteLength)
          }
        });
      const run = await startManualResearchRun(store, {
        actorUserId,
        sourceKey: entry.sourceKey,
        topic: entry.topic,
        query: entry.query,
        workflowKey: "prior_authorization_navigation",
        runType: "manual_operator_run",
        metadata: {
          crawler: "scripts/ingest-pa-policy-corpus.mjs",
          crawlerVersion: PA_POLICY_CRAWLER_VERSION,
          userAgent: CRAWLER_USER_AGENT,
          robotsVerdict: robots.verdict,
          retrievedAt: nowIso()
        }
      });
      const executed = await executeResearchRun(store, {
        runId: run.run.id,
        actorUserId,
        workerMode: "deterministic_fetch",
        fetchImpl: replayFetch
      });
      page.status = "ingested";
      page.runId = run.run.id;
      page.artifactId = executed.artifact.id;
      page.title = executed.artifact.title;
      page.contentHash = executed.artifact.contentHash;
      page.extractionHash = executed.artifact.extractionHash;
      page.citationStatus = executed.artifact.citationStatus;
      page.retrievedAt = executed.artifact.createdAt;
      summary.ingested += 1;
      log(
        `INGESTED ${entry.url} -> artifact ${executed.artifact.id} (citation_status=${executed.artifact.citationStatus}, sha256=${executed.artifact.contentHash.slice(0, 16)}...). Operator review required before trusted retrieval.`
      );
    } catch (error) {
      page.status = "skipped";
      page.failureClass = error?.failureClass ?? "pa_policy_page_ingest_failed";
      page.error = String(error?.message ?? error);
      summary.failed += 1;
      log(`SKIP ${entry.url}: ${page.error}`);
    }
  }

  if (summary.ingested === 0 && summary.unchangedSkipped === 0) {
    throw new PaPolicyCrawlerError(
      `All ${summary.attempted} PA-policy corpus fetches failed; no policy evidence was stored.`,
      "pa_policy_corpus_all_fetches_failed",
      { summary }
    );
  }
  return summary;
}

function parseArgs(argv) {
  const args = { db: null, limit: DEFAULT_LIMIT, delayMs: DEFAULT_DELAY_MS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--db") args.db = argv[++i];
    else if (key === "--limit") args.limit = Number(argv[++i]);
    else if (key === "--delay-ms") args.delayMs = Number(argv[++i]);
    else if (key === "--help" || key === "-h") args.help = true;
    else throw new PaPolicyCrawlerError(`Unknown argument: ${key}`, "pa_policy_crawler_bad_arguments");
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.db) {
    console.error("Usage: node scripts/ingest-pa-policy-corpus.mjs --db <sqlite-path> [--limit 3] [--delay-ms 1500]");
    process.exit(args.help ? 0 : 2);
  }
  const store = await new SqliteStore(args.db).initialize();
  try {
    const summary = await ingestPaPolicyCorpus(store, { limit: args.limit, delayMs: args.delayMs });
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          failureClass: error?.failureClass ?? "pa_policy_crawler_unclassified_failure",
          message: String(error?.message ?? error),
          details: error?.details ?? {}
        },
        null,
        2
      )
    );
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
