import { createHash } from "node:crypto";
import { createRuntimeContextCache } from "./runtimeContextCache.mjs";

export const RUNTIME_VECTOR_INDEX_VERSION = "2026-06-26.phase81-runtime-vector-index.v1";

function sha(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function tokens(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function vectorize(value) {
  const vector = new Map();
  for (const token of tokens(value)) vector.set(token, (vector.get(token) ?? 0) + 1);
  return vector;
}

function cosine(a, b) {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (const value of a.values()) aNorm += value * value;
  for (const value of b.values()) bNorm += value * value;
  for (const [key, value] of a) dot += value * (b.get(key) ?? 0);
  if (!aNorm || !bNorm) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

export function runtimeVectorIndexKey(sessionId) {
  return `brainsty:runtime-vector-index:${sessionId}`;
}

function entryText(entry) {
  const aliases = {
    "workflow:pharmacy_formulary": "medication drug pharmacy formulary prescription rx copay tier",
    "workflow:claim_status_navigation": "claim eob paid denied status patient responsibility",
    "workflow:eligibility_benefits_navigation": "benefits eligibility deductible out of pocket copay coverage",
    "skill:insurance_portal_browser": "remote browser openclaw portal live view read only navigation scrape extract",
    "tool:openclaw_authenticated_browser": "openclaw authenticated browser remote sandbox live portal"
  };
  return [
    entry.portfolioId,
    aliases[entry.portfolioId],
    entry.kind,
    entry.title,
    entry.shortDescription,
    entry.workflowKey,
    entry.skillKey,
    entry.toolKey,
    entry.graphPathId
  ]
    .filter(Boolean)
    .join(" ");
}

function portfolioDocuments(contextPacket) {
  return (contextPacket.capabilityPortfolio?.promptTable ?? []).map((entry) => ({
    docId: `portfolio:${entry.portfolioId}`,
    kind: "capability_portfolio",
    pointer: entry.pointer,
    label: entry.title,
    sourceId: entry.portfolioId,
    text: entryText(entry)
  }));
}

function checkpointDocuments(contextPacket) {
  return (contextPacket.runtimeContext?.achievedCheckpoints ?? []).map((checkpoint) => ({
    docId: `checkpoint:${checkpoint.checkpointId}`,
    kind: "checkpoint",
    pointer: `${contextPacket.runtimeContext.cacheKey}#${checkpoint.checkpointId}`,
    label: checkpoint.stepName,
    sourceId: checkpoint.checkpointId,
    text: [
      checkpoint.stepName,
      checkpoint.workflow,
      checkpoint.routeReason,
      checkpoint.evidenceObservationStatus
    ]
      .filter(Boolean)
      .join(" ")
  }));
}

function llmOutputDocuments(contextPacket) {
  return (contextPacket.llmOutputIndex?.entries ?? []).map((entry) => ({
    docId: `llm:${entry.outputId}`,
    kind: "llm_output_pointer",
    pointer: entry.pointer,
    label: entry.step,
    sourceId: entry.outputId,
    text: [
      entry.step,
      entry.parsedSummary?.workflow,
      entry.parsedSummary?.intent,
      entry.parsedSummary?.selectedCapabilityPortfolioIds?.join(" ")
    ]
      .filter(Boolean)
      .join(" ")
  }));
}

export function buildRuntimeVectorIndex(contextPacket) {
  const docs = [
    ...portfolioDocuments(contextPacket),
    ...checkpointDocuments(contextPacket),
    ...llmOutputDocuments(contextPacket)
  ].filter((doc) => doc.text);
  const queryVector = vectorize(contextPacket.request?.userInput ?? "");
  const docsWithScores = docs.map((doc) => {
    const textHash = sha(doc.text).slice(0, 16);
    return {
      docId: doc.docId,
      kind: doc.kind,
      pointer: doc.pointer,
      label: doc.label,
      sourceId: doc.sourceId,
      textHash,
      score: Number(cosine(queryVector, vectorize(doc.text)).toFixed(4))
    };
  });
  const topMatches = docsWithScores
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score || a.docId.localeCompare(b.docId))
    .slice(0, 10);
  return {
    version: RUNTIME_VECTOR_INDEX_VERSION,
    cacheKey: runtimeVectorIndexKey(contextPacket.currentSession?.id ?? "global"),
    sessionId: contextPacket.currentSession?.id ?? null,
    generatedAt: contextPacket.generatedAt,
    queryHash: sha(contextPacket.request?.userInput ?? "").slice(0, 16),
    method: "deterministic_lexical_term_vector",
    embeddingProvider: "none_local_fallback",
    docCount: docsWithScores.length,
    topMatches,
    docs: docsWithScores
  };
}

export async function attachRuntimeVectorIndex(contextPacket) {
  if (!contextPacket.currentSession?.id) return null;
  const cache = createRuntimeContextCache();
  const index = buildRuntimeVectorIndex(contextPacket);
  try {
    await cache.adapter.set(index.cacheKey, index, { ttlSeconds: 1800 });
    return {
      version: index.version,
      cacheBackend: cache.backend,
      cacheKey: index.cacheKey,
      method: index.method,
      embeddingProvider: index.embeddingProvider,
      queryHash: index.queryHash,
      docCount: index.docCount,
      topMatches: index.topMatches,
      stored: true
    };
  } catch (error) {
    return {
      version: index.version,
      cacheBackend: cache.backend,
      cacheKey: index.cacheKey,
      method: index.method,
      embeddingProvider: index.embeddingProvider,
      queryHash: index.queryHash,
      docCount: index.docCount,
      topMatches: index.topMatches,
      stored: false,
      storeError: error.message
    };
  }
}

export async function loadRuntimeVectorIndex(sessionId) {
  const cache = createRuntimeContextCache();
  const key = runtimeVectorIndexKey(sessionId);
  try {
    return {
      cacheBackend: cache.backend,
      cacheKey: key,
      status: "ok",
      index: await cache.adapter.get(key)
    };
  } catch (error) {
    return {
      cacheBackend: cache.backend,
      cacheKey: key,
      status: "error",
      error: error.message,
      index: null
    };
  }
}
