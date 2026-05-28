import test from "node:test";
import assert from "node:assert/strict";
import { SqliteStore, DEFAULT_DB_PATH } from "../concierge/database.mjs";
import { runConciergeSlice, traceForSession } from "../concierge/engine.mjs";

test("portal page scan persists real stored Aetna page text", async () => {
  const store = await new SqliteStore(DEFAULT_DB_PATH).initialize();
  const sourceSnapshot = await store.get(
    "SELECT * FROM eligibility_snapshots WHERE source_url = 'https://health.aetna.com/' AND raw_text LIKE '%Welcome, Marcelo%' ORDER BY created_at DESC LIMIT 1;"
  );

  assert.ok(sourceSnapshot, "Run the already-open logged Aetna Chrome test before this real-data test.");

  const result = await runConciergeSlice(store, {
    message:
      "Run the multi-page Aetna portal scan from the already-open Chrome session and persist the page-level trace.",
    portalPageSnapshots: [
      {
        pageKind: "home",
        title: "Home - Aetna",
        url: sourceSnapshot.source_url,
        text: sourceSnapshot.raw_text,
        links: [],
        extractedAt: sourceSnapshot.created_at
      }
    ]
  });
  const trace = await traceForSession(store, result.session.id);

  assert.equal(result.browserResult.status, "multi_page_scan");
  assert.equal(trace.portalPageSnapshots.length, 1);
  assert.equal(trace.portalPageSnapshots[0].page_kind, "home");
  assert.match(trace.portalPageSnapshots[0].visible_text, /Welcome, Marcelo/);
  assert.ok(trace.coverageBalances.length >= 2);
  assert.ok(trace.claims.length >= 5);
});

test("portal page scan structures corrected real Aetna home page text", async () => {
  const store = await new SqliteStore(DEFAULT_DB_PATH).initialize();
  const sourcePage = await store.get(
    "SELECT * FROM portal_page_snapshots WHERE page_kind = 'home_corrected' AND visible_text LIKE '%Deductible%' AND visible_text LIKE '%Lamotrigine%' ORDER BY created_at DESC LIMIT 1;"
  );

  assert.ok(sourcePage, "Run the corrected live Aetna scan before this real-data test.");

  const result = await runConciergeSlice(store, {
    message: "Structure the corrected Aetna home page capture.",
    portalPageSnapshots: [
      {
        pageKind: "home_corrected",
        title: sourcePage.title,
        url: sourcePage.url,
        text: sourcePage.visible_text,
        links: JSON.parse(sourcePage.links_json),
        extractedAt: sourcePage.extracted_at
      }
    ]
  });
  const trace = await traceForSession(store, result.session.id);

  assert.equal(result.browserResult.status, "multi_page_scan");
  assert.ok(trace.coverageBalances.length >= 2);
  assert.ok(trace.claims.length >= 5);
  assert.equal(trace.claims[0].description, "Lamotrigine Tab 25mg");
});

test("real corrected Aetna claims page parses full claims rows", async () => {
  const store = await new SqliteStore(DEFAULT_DB_PATH).initialize();
  const sourcePage = await store.get(
    "SELECT * FROM portal_page_snapshots WHERE page_kind = 'claims_corrected' AND visible_text LIKE '%1–20 of 69 Claims%' ORDER BY created_at DESC LIMIT 1;"
  );

  assert.ok(sourcePage, "Run the corrected live Aetna scan before this real-data test.");

  const result = await runConciergeSlice(store, {
    message: "Structure the corrected Aetna claims page capture.",
    portalPageSnapshots: [
      {
        pageKind: "claims_corrected",
        title: sourcePage.title,
        url: sourcePage.url,
        text: sourcePage.visible_text,
        links: JSON.parse(sourcePage.links_json),
        extractedAt: sourcePage.extracted_at
      }
    ]
  });
  const trace = await traceForSession(store, result.session.id);

  assert.ok(trace.claims.length >= 20);
  assert.ok(trace.claims.some((claim) => claim.description === "Divalproex Tab 500mg Er" && claim.share_amount === 25));
  assert.ok(trace.claims.some((claim) => claim.description === "Horacio Groisman" && claim.member_name === "Marcelo (Self)"));
});
