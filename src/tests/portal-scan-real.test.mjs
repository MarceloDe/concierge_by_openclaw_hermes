import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { runConciergeSlice, traceForSession } from "../concierge/langgraphCompatibility.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-portal-scan-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

async function fixture(name) {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

test("portal page scan persists sanitized captured Aetna home page text", async () => {
  const store = await createStore();
  const homeText = await fixture("aetna-captured-home-sanitized.txt");

  const result = await runConciergeSlice(store, {
    message:
      "Run the multi-page Aetna portal scan from the already-open Chrome session and persist the page-level trace.",
    portalPageSnapshots: [
      {
        pageKind: "home",
        title: "Home - Aetna",
        url: "https://health.aetna.com/",
        text: homeText,
        links: [
          { text: "Benefits", href: "https://health.aetna.com/benefits" },
          { text: "Claims", href: "https://health.aetna.com/claims" },
          { text: "Documents", href: "https://health.aetna.com/documents" }
        ],
        extractedAt: "2026-06-01T00:00:00.000Z"
      }
    ]
  });
  const trace = await traceForSession(store, result.session.id);

  assert.equal(result.browserResult.status, "multi_page_scan");
  assert.equal(trace.portalPageSnapshots.length, 1);
  assert.equal(trace.portalPageSnapshots[0].page_kind, "home");
  assert.match(trace.portalPageSnapshots[0].visible_text, /Welcome, Fixture Member/);
  assert.equal(trace.coverageBalances.length, 2);
  assert.equal(trace.claims.length, 5);
});

test("portal page scan review payload includes section-specific captured evidence", async () => {
  const store = await createStore();
  const homeText = await fixture("aetna-captured-home-sanitized.txt");

  const result = await runConciergeSlice(store, {
    message: "Structure the sanitized captured Aetna home page.",
    portalPageSnapshots: [
      {
        pageKind: "home_corrected",
        title: "Home - Aetna",
        url: "https://health.aetna.com/",
        text: homeText,
        links: [],
        extractedAt: "2026-06-01T00:00:00.000Z"
      }
    ]
  });
  const trace = await traceForSession(store, result.session.id);
  const structured = result.portalScan.eligibilityResults[0].structured;

  assert.equal(result.browserResult.status, "multi_page_scan");
  assert.equal(trace.portalPageSnapshots.length, 1);
  assert.deepEqual(structured.sectionEvidence.reachable, [
    "benefits",
    "spending",
    "claims",
    "prior_authorizations",
    "documents",
    "id_card",
    "pharmacy",
    "network"
  ]);
  assert.equal(structured.documentSignals.candidateCount, 5);
  assert.equal(structured.documentSignals.policy.documentDownloadAttempted, false);
  assert.equal(structured.idCardSignals.directIdentifierExtracted, false);
});

test("sanitized captured Aetna claims page parses full claims rows", async () => {
  const store = await createStore();
  const claimsText = await fixture("aetna-captured-claims-sanitized.txt");

  const result = await runConciergeSlice(store, {
    message: "Structure the sanitized captured Aetna claims page.",
    portalPageSnapshots: [
      {
        pageKind: "claims_corrected",
        title: "Claims - Aetna",
        url: "https://health.aetna.com/manage/claims#page1",
        text: claimsText,
        links: [],
        extractedAt: "2026-06-01T00:01:00.000Z"
      }
    ]
  });
  const trace = await traceForSession(store, result.session.id);

  assert.equal(result.browserResult.status, "multi_page_scan");
  assert.equal(trace.claims.length, 6);
  assert.ok(trace.claims.some((claim) => claim.description === "Generic Pharmacy Fill" && claim.share_amount === 8.92));
  assert.ok(trace.claims.some((claim) => claim.description === "Generic Preventive Visit" && claim.share_amount === 0));
});
