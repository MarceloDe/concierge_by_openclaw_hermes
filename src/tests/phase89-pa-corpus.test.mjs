// Phase 89 (plan §9/§11): PA-policy public corpus crawler proof — LIVE crawl of
// REAL public CMS Medicare Coverage Database policy pages into the EXISTING
// knowledge_sources / research_artifacts tables, read back through the EXISTING
// searchResearchEvidence path (the evidence_sourced arm's real consumer).
//
// Arms: (1) live polite crawl lands rows with resolvable pointers (sha256 + URL),
// (2) idempotent re-run stores 0 new rows, (3) trusted-evidence search returns the
// stored policy artifact for "prior authorization knee replacement" WITH a source
// pointer — trust is arranged HONESTLY through the EXISTING operator review
// function reviewResearchArtifact(decision: "approve") because deterministic-fetch
// artifacts land extracted_pending_review and there is NO auto-trust path,
// (4) all-fetches-failed is a LOUD classified error (offline simulation, no network),
// and the live arms skip-loud when offline.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "./support/sqliteTestStore.mjs";
import { reviewResearchArtifact, searchResearchEvidence } from "../concierge/researchOps.mjs";
import {
  PA_POLICY_CORPUS,
  PaPolicyCrawlerError,
  ingestPaPolicyCorpus
} from "../../scripts/ingest-pa-policy-corpus.mjs";

const LIVE_URLS = PA_POLICY_CORPUS.slice(0, 2).map((entry) => entry.url);

// Skip-loud offline preflight: the live arms need real HTTPS reachability to cms.gov.
async function checkOnline() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const response = await fetch("https://www.cms.gov/robots.txt", {
      method: "GET",
      headers: { "user-agent": "brainstyworkers-pa-policy-crawler/1.0" },
      signal: controller.signal
    });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}
const ONLINE = await checkOnline();
const SKIP_REASON = ONLINE
  ? false
  : `SKIP-LOUD: live network to https://www.cms.gov is unavailable; the Phase 89 live-crawl arms (${LIVE_URLS.join(", ")}) cannot run offline.`;

test("Phase 89: live PA-policy corpus crawl -> pointers -> idempotency -> trusted evidence via existing review", { skip: SKIP_REASON }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-p89-pa-corpus-"));
  process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR = join(dir, "research-artifacts");
  const store = await new SqliteStore(join(dir, "p89.sqlite")).initialize();

  // knowledge_sources registry (incl. aetna_clinical_policy_bulletins) is seeded
  // by SqliteStore.initialize() -> seedRuntimeRegistries; nothing else needed.
  const seededAetna = await store.findOne("knowledge_sources", { source_key: "aetna_clinical_policy_bulletins" });
  assert.ok(seededAetna, "registry seed must provide aetna_clinical_policy_bulletins");

  // --- Arm 1: LIVE polite crawl (limit 2 = the two CMS MCD policy pages). ---
  const first = await ingestPaPolicyCorpus(store, { limit: 2, delayMs: 1500 });
  assert.equal(first.attempted, 2);
  assert.equal(first.ingested, 2, `both live CMS pages must ingest; got ${JSON.stringify(first.pages)}`);
  for (const page of first.pages) {
    assert.equal(page.robots.verdict, "robots_allowed", `robots must allow ${page.url}`);
    assert.equal(page.status, "ingested");
  }

  const artifacts = await store.all("SELECT * FROM research_artifacts ORDER BY created_at ASC;");
  assert.equal(artifacts.length, 2, "exactly two research_artifacts rows land");
  for (const row of artifacts) {
    assert.match(row.content_hash, /^[0-9a-f]{64}$/, "content_hash is a resolvable sha256 pointer");
    assert.match(row.extraction_hash, /^[0-9a-f]{64}$/);
    assert.ok(LIVE_URLS.includes(row.source_url), `source_url pointer resolves to a pinned live URL: ${row.source_url}`);
    assert.equal(row.artifact_type, "deterministic_fetch_text");
    // HONEST trust posture: crawled pages land pending review — never auto-trusted.
    assert.equal(row.citation_status, "extracted_pending_review");
    assert.ok(row.safe_text_preview.length > 0, "text excerpt stored");
    assert.ok(row.created_at, "retrieval date stored");
    assert.ok(row.source_id, "artifact links back to its knowledge_sources row");
    const source = await store.findOne("knowledge_sources", { id: row.source_id });
    assert.equal(new URL(source.base_url).href, new URL(row.source_url).href);
  }
  const runs = await store.all("SELECT * FROM research_runs;");
  assert.equal(runs.length, 2);
  for (const run of runs) assert.equal(run.status, "completed");

  const kneeArtifactRow = artifacts.find((row) => row.source_url.includes("lcdid=36575"));
  assert.ok(kneeArtifactRow, "the CMS LCD L36575 Total Knee Arthroplasty page must be in the corpus");
  assert.match(kneeArtifactRow.title.toLowerCase(), /knee arthroplasty/);

  // --- Arm 2: idempotent re-run stores 0 new rows (URL + content-hash match). ---
  const second = await ingestPaPolicyCorpus(store, { limit: 2, delayMs: 1500 });
  assert.equal(second.ingested, 0, "re-run must ingest 0 new artifacts");
  assert.equal(second.unchangedSkipped, 2, "re-run must classify both pages unchanged");
  const artifactCountAfter = await store.get("SELECT COUNT(*) AS count FROM research_artifacts;");
  assert.equal(artifactCountAfter.count, 2, "no new research_artifacts rows on re-run");
  const runCountAfter = await store.get("SELECT COUNT(*) AS count FROM research_runs;");
  assert.equal(runCountAfter.count, 2, "no new research_runs rows on re-run");

  // --- Arm 3: EXISTING evidence search path. Before review: pending only. ---
  const beforeReview = await searchResearchEvidence(store, { query: "prior authorization knee replacement" });
  assert.equal(beforeReview.status, "pending_review_only", "pre-review, trusted search must NOT return crawled pages");
  assert.equal(beforeReview.results.length, 0);
  assert.ok(beforeReview.pendingReviewCount >= 1);

  // Trust is granted through the EXISTING operator review function — the same
  // path every other trusted artifact takes (no crawler-side auto-approval).
  for (const row of artifacts) {
    const reviewed = await reviewResearchArtifact(store, {
      artifactId: row.id,
      decision: "approve",
      reason: "Phase 89 operator review: public CMS coverage-policy page, honest provenance (URL + sha256 + retrieval date)."
    });
    assert.equal(reviewed.artifact.citationStatus, "trusted_retrieval_approved");
  }

  const evidence = await searchResearchEvidence(store, { query: "prior authorization knee replacement" });
  assert.equal(evidence.status, "trusted_evidence_found", "evidence_sourced substrate: trusted evidence must be found");
  assert.ok(evidence.results.length >= 1);
  const top = evidence.results[0];
  assert.equal(top.citationStatus, "trusted_retrieval_approved");
  assert.equal(top.sourceUrl, kneeArtifactRow.source_url, "top hit for the knee query is the LCD L36575 policy page");
  assert.match(top.contentHash, /^[0-9a-f]{64}$/, "search result carries the sha256 source pointer");
  assert.ok(top.artifactId, "search result carries the artifact pointer");
  // The pointer RESOLVES: the id+hash from the search dereference to the stored row.
  const resolved = await store.findOne("research_artifacts", { id: top.artifactId });
  assert.equal(resolved.content_hash, top.contentHash);
  assert.equal(resolved.source_url, top.sourceUrl);
});

test("Phase 89: all-fetches-failed is a LOUD classified failure (offline simulation, no network)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-p89-pa-offline-"));
  process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR = join(dir, "research-artifacts");
  const store = await new SqliteStore(join(dir, "p89-offline.sqlite")).initialize();
  const offlineFetch = async () => {
    throw new TypeError("fetch failed (simulated offline)");
  };
  await assert.rejects(
    () => ingestPaPolicyCorpus(store, { limit: 2, delayMs: 0, fetchImpl: offlineFetch, sleepImpl: async () => {}, log: () => {} }),
    (error) => error instanceof PaPolicyCrawlerError && error.failureClass === "pa_policy_corpus_all_fetches_failed",
    "an all-fail crawl must throw the classified loud failure, never exit clean"
  );
  const count = await store.get("SELECT COUNT(*) AS count FROM research_artifacts;");
  assert.equal(count.count, 0, "no artifacts stored when every fetch fails");
});
