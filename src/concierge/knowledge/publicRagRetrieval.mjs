import { createId, nowIso } from "../database.mjs";
import { audit } from "../audit.mjs";
import {
  EMBEDDING_POLICY_VERSION,
  assertEmbeddable,
  cosineSimilarity,
  embedTexts,
  sha256Hex
} from "./embeddingProvider.mjs";
import { isKnownEvidenceClass } from "./evidenceClasses.mjs";

// rag_chunks owner (plan §5.1 / §7, Phase 87) — SOLE writer and retriever. Backs the
// medical_policy_rag / public_insurance_rag / employer_benefits_doc_rag catalog rows.
// Public corpora only; user-supplied employer-benefits docs chunk under the existing
// local PHI-storage consent with a PUBLIC-class document body (an official SBC/SPD).
// Every chunk row is anchored to a REAL extraction_artifacts row — retrieval verifies
// the anchor and fails loud (rag_chunk_artifact_missing), never a silent uncited answer.
export const PUBLIC_RAG_RETRIEVAL_VERSION = "2026-07-03.public-rag-retrieval.v1";

const CHUNK_TARGET_CHARS = 1200;

// Paragraph-preserving chunking: split on blank lines, pack to ~CHUNK_TARGET_CHARS.
export function chunkDocumentText(text, { targetChars = CHUNK_TARGET_CHARS } = {}) {
  const paragraphs = String(text ?? "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 1 > targetChars) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// INGEST: chunk + LIVE-embed (policy-gated) + insert rag_chunks rows, idempotent on
// chunk_hash. The backing extraction_artifacts row must already exist (real anchor).
export async function ingestRagDocument(store, {
  sourceKey,
  artifactId,
  sourceDocumentId = null,
  text,
  dataClass,
  sourceEvidenceClass,
  sessionId = null
} = {}) {
  assertEmbeddable(dataClass); // loud PHI/unclassified refusal BEFORE any work
  if (!isKnownEvidenceClass(sourceEvidenceClass)) {
    const error = new Error(`source_evidence_class '${sourceEvidenceClass}' is not in the §8.7 taxonomy.`);
    error.failureClass = "evidence_class_unknown";
    throw error;
  }
  const artifact = await store.findOne("extraction_artifacts", { id: artifactId });
  if (!artifact) {
    const error = new Error(`extraction_artifacts row '${artifactId}' does not exist — rag chunks must anchor to a real artifact.`);
    error.failureClass = "rag_ingest_artifact_missing";
    throw error;
  }
  const chunks = chunkDocumentText(text);
  if (!chunks.length) return { ingested: 0, skipped: 0, chunkCount: 0 };

  // Idempotency: skip chunks whose chunk_hash already exists for this source.
  const fresh = [];
  let skipped = 0;
  for (const chunk of chunks) {
    const chunkHash = sha256Hex(`${sourceKey}:${artifactId}:${chunk}`);
    const existing = await store.get("SELECT id FROM rag_chunks WHERE chunk_hash = ? LIMIT 1;", [chunkHash]);
    if (existing) skipped += 1;
    else fresh.push({ chunk, chunkHash });
  }
  if (!fresh.length) {
    return { ingested: 0, skipped, chunkCount: chunks.length, idempotent: true };
  }

  const embedded = await embedTexts(fresh.map((f) => f.chunk), { dataClass });
  let ingested = 0;
  for (let i = 0; i < fresh.length; i += 1) {
    await store.insert("rag_chunks", {
      id: createId("ragchunk"),
      source_key: sourceKey,
      artifact_id: artifactId,
      chunk_text: fresh[i].chunk,
      embedding_json: JSON.stringify(embedded.embeddings[i]),
      content_hash: sha256Hex(fresh[i].chunk),
      // founder #16 required chunk metadata (spine YAML embedding_policy):
      embedding_provider: embedded.provider,
      embedding_model: embedded.model,
      embedding_dimension: embedded.dimension,
      data_class: embedded.dataClass,
      embedding_policy_version: EMBEDDING_POLICY_VERSION,
      source_document_id: sourceDocumentId,
      source_evidence_class: sourceEvidenceClass,
      phi_allowed: 0,
      baa_required: 0,
      baa_status: "not_required_public_class",
      kms_profile: "none_public_class",
      chunk_hash: fresh[i].chunkHash,
      created_at: nowIso()
    });
    ingested += 1;
  }
  await audit(store, sessionId, "rag.chunks_ingested", {
    sourceKey,
    artifactId,
    ingested,
    skipped,
    dataClass: embedded.dataClass,
    embeddingModel: embedded.model,
    embeddingDimension: embedded.dimension
  }, { layer: "layer_1_public" });
  return { ingested, skipped, chunkCount: chunks.length, embeddingModel: embedded.model, embeddingDimension: embedded.dimension };
}

// RETRIEVE: LIVE-embed the query (same policy gate), cosine-score stored chunks,
// verify every returned chunk's artifact anchor. Rows carry a resolvable
// source_pointer (`rag_chunks#<id>` + the backing artifact) or the caller's
// validateCapabilityAnswer rejects the composed answer.
export async function queryRagEvidence(store, {
  query,
  dataClass = "official_payer_public",
  sourceKey = null,
  limit = 5,
  sessionId = null
} = {}) {
  // Cheap corpus check FIRST — an empty class must not cost a live embedding call
  // on every turn (the skip is visible via candidateCount: 0).
  const countRow = await store.get(
    `SELECT COUNT(*) AS n FROM rag_chunks WHERE data_class = ? ${sourceKey ? "AND source_key = ?" : ""};`,
    sourceKey ? [dataClass, sourceKey] : [dataClass]
  );
  if (!Number(countRow?.n)) {
    return { version: PUBLIC_RAG_RETRIEVAL_VERSION, query: String(query ?? "").slice(0, 300), dataClass, candidateCount: 0, evidence: [] };
  }
  const embeddedQuery = await embedTexts([query], { dataClass });
  const rows = await store.all(
    `SELECT id, source_key, artifact_id, chunk_text, embedding_json, content_hash, source_evidence_class, source_document_id
     FROM rag_chunks WHERE data_class = ? ${sourceKey ? "AND source_key = ?" : ""};`,
    sourceKey ? [dataClass, sourceKey] : [dataClass]
  );
  const scored = rows
    .map((row) => ({
      row,
      score: cosineSimilarity(embeddedQuery.embeddings[0], JSON.parse(row.embedding_json || "[]"))
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const evidence = [];
  for (const { row, score } of scored) {
    // Anchor verification — a chunk whose backing artifact vanished is a LOUD
    // classified failure, never a silent uncited answer.
    const artifact = await store.findOne("extraction_artifacts", { id: row.artifact_id });
    if (!artifact) {
      await audit(store, sessionId, "rag.chunk_artifact_missing", {
        chunkId: row.id, artifactId: row.artifact_id, sourceKey: row.source_key
      }, { layer: "layer_1_public" });
      const error = new Error(`rag chunk '${row.id}' backing artifact '${row.artifact_id}' is missing.`);
      error.failureClass = "rag_chunk_artifact_missing";
      throw error;
    }
    evidence.push({
      chunkId: row.id,
      sourceKey: row.source_key,
      artifactId: row.artifact_id,
      chunkText: row.chunk_text,
      contentHash: row.content_hash,
      sourceEvidenceClass: row.source_evidence_class,
      sourceDocumentId: row.source_document_id,
      score: Number(score.toFixed(4)),
      source_pointer: `rag_chunks#${row.id}`,
      artifact_pointer: `extraction_artifacts#${row.artifact_id}`
    });
  }
  return {
    version: PUBLIC_RAG_RETRIEVAL_VERSION,
    query: String(query ?? "").slice(0, 300),
    dataClass,
    candidateCount: rows.length,
    evidence
  };
}
