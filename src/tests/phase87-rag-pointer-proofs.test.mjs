// Phase 87 §5.5 rag_chunks deferred-pointer proof (plan §5.5 / §11) — REAL SQLite with
// process-restart simulation (second store over the same file) and LIVE OpenAI
// text-embedding-3-small through the embeddingProvider abstraction (founder #16).
// Skip-loud without OPENAI_API_KEY. Arms: ingest -> restart read-back -> causal answer
// change -> missing-artifact negative (rag_chunk_artifact_missing) -> idempotent
// re-ingest -> the 13 required chunk-metadata fields -> PHI/unclassified refusals.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { assertEmbeddable } from "../concierge/knowledge/embeddingProvider.mjs";
import { chunkDocumentText, ingestRagDocument, queryRagEvidence } from "../concierge/knowledge/publicRagRetrieval.mjs";

await loadLocalEnvOnce();
const LIVE = Boolean(process.env.OPENAI_API_KEY);

const POLICY_TEXT = `Prior authorization for total knee arthroplasty requires documented failure of conservative therapy.

The payer's clinical policy bulletin lists physical therapy for at least twelve weeks, radiographic evidence of severe osteoarthritis, and body mass index documentation as review criteria.

Appeals of a denial must include the operative candidate's conservative-treatment records and the surgeon's medical-necessity letter.`;

test("Phase 87: embedding policy refuses PHI-class and unclassified inputs LOUD (no live call needed)", () => {
  for (const [dataClass, expected] of [
    ["member_phi", "embedding_phi_blocked_no_baa"],
    ["user_uploaded", "embedding_phi_blocked_no_baa"],
    ["", "embedding_data_class_unclassified"],
    ["made_up_class", "embedding_data_class_unknown"]
  ]) {
    assert.throws(() => assertEmbeddable(dataClass), (error) => error.failureClass === expected, `${dataClass || "(empty)"} -> ${expected}`);
  }
  assert.equal(assertEmbeddable("cms_public"), "cms_public");
});

test("Phase 87 §5.5: rag_chunks deferred-pointer proof (LIVE embeddings, restart, causal, negative)", { skip: LIVE ? false : "OPENAI_API_KEY required for the LIVE embedding arm (skip-loud)" }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-p87-rag-"));
  const dbPath = join(dir, "rag.sqlite");
  let store = await new SqliteStore(dbPath).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  const { user, session, portal } = await enrollDefaultMember(store);

  // Real artifact anchor (honest public-api run row + artifact).
  const runId = createId("apirun");
  await store.insert("browser_runs", {
    id: runId, session_id: session.id, portal_account_id: portal.id,
    status: "completed_public_api_fetch", remote_debugger_url: "public_api:no_browser",
    start_url: "https://www.aetna.com/cpb/medical/data/600_699/0673.html",
    created_at: nowIso(), updated_at: nowIso()
  });
  const artifactId = createId("artifact");
  await store.insert("extraction_artifacts", {
    id: artifactId, browser_run_id: runId, artifact_type: "payer_policy_document",
    content: JSON.stringify({ sourceUrl: "https://www.aetna.com/cpb/medical/data/600_699/0673.html", body: POLICY_TEXT }),
    created_at: nowIso()
  });

  // 1) Ingest with LIVE embeddings; the 13 metadata fields land on every row.
  const ingest = await ingestRagDocument(store, {
    sourceKey: "aetna_clinical_policy_bulletins",
    artifactId,
    text: POLICY_TEXT,
    dataClass: "official_payer_public",
    sourceEvidenceClass: "official_payer_public",
    sessionId: session.id
  });
  assert.ok(ingest.ingested > 0, "chunks must be ingested");
  const chunkRow = await store.get("SELECT * FROM rag_chunks LIMIT 1;");
  for (const field of ["embedding_provider", "embedding_model", "embedding_dimension", "data_class", "embedding_policy_version", "source_evidence_class", "phi_allowed", "baa_required", "baa_status", "kms_profile", "chunk_hash", "content_hash", "created_at"]) {
    assert.notEqual(chunkRow[field], null, `chunk metadata field ${field} must be populated`);
    assert.notEqual(chunkRow[field], undefined, `chunk metadata field ${field} must exist`);
  }
  assert.equal(chunkRow.embedding_model, "text-embedding-3-small");
  assert.equal(Number(chunkRow.embedding_dimension) > 0, true);
  assert.equal(Number(chunkRow.phi_allowed), 0);

  // 2) Idempotent re-ingest: zero new rows.
  const again = await ingestRagDocument(store, {
    sourceKey: "aetna_clinical_policy_bulletins", artifactId, text: POLICY_TEXT,
    dataClass: "official_payer_public", sourceEvidenceClass: "official_payer_public", sessionId: session.id
  });
  assert.equal(again.ingested, 0, "re-ingest must be idempotent");
  assert.ok(again.skipped > 0);

  // 3) RESTART simulation: a second store instance over the same file dereferences by
  //    content_hash and retrieval CAUSALLY changes the evidence set.
  store = await new SqliteStore(dbPath).initialize();
  const deref = await store.get("SELECT chunk_text, source_key, artifact_id FROM rag_chunks WHERE content_hash = ?;", [chunkRow.content_hash]);
  assert.ok(deref, "restart read-back by content_hash must dereference");
  assert.equal(deref.artifact_id, artifactId);

  const withCorpus = await queryRagEvidence(store, { query: "what does the payer require before approving knee replacement surgery?", dataClass: "official_payer_public", sessionId: session.id });
  assert.ok(withCorpus.evidence.length > 0, "retrieval must surface cited chunks");
  assert.ok(withCorpus.evidence[0].source_pointer.startsWith("rag_chunks#"), "evidence carries a resolvable source pointer");
  assert.ok(withCorpus.evidence[0].score > 0.2, "the policy chunk must be semantically retrieved");

  // CONTROL: a store without the ingest surfaces nothing (causality).
  const controlStore = await new SqliteStore(join(dir, "control.sqlite")).initialize();
  const control = await queryRagEvidence(controlStore, { query: "what does the payer require before approving knee replacement surgery?", dataClass: "official_payer_public" });
  assert.equal(control.evidence.length, 0, "control turn without ingest must retrieve nothing");

  // 4) NEGATIVE arm: the FK makes a dangling chunk impossible through normal writes
  //    (defense layer 1 — proven by the constraint itself). Simulate an OUT-OF-BAND
  //    deletion (retention job / manual surgery) by suspending FK enforcement for the
  //    delete; the retrieval guard is defense layer 2 and must fail LOUD, classified.
  await store.all("PRAGMA foreign_keys = OFF;");
  await store.all("DELETE FROM extraction_artifacts WHERE id = ?;", [artifactId]);
  await store.all("PRAGMA foreign_keys = ON;");
  await assert.rejects(
    () => queryRagEvidence(store, { query: "knee replacement prior authorization criteria", dataClass: "official_payer_public", sessionId: session.id }),
    (error) => error.failureClass === "rag_chunk_artifact_missing",
    "missing artifact must be a classified loud failure, never a silent uncited answer"
  );
});
