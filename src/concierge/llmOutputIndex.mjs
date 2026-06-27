import { createHash } from "node:crypto";
import { createRuntimeContextCache } from "./runtimeContextCache.mjs";

export const LLM_OUTPUT_INDEX_VERSION = "2026-06-26.phase79-llm-output-index.v1";

function sha(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function compact(value, limit = 320) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

export function llmOutputIndexKey(sessionId) {
  return `brainsty:llm-output-index:${sessionId}`;
}

function summarizeParsed(parsed = {}) {
  return {
    workflow: parsed.workflow ?? null,
    intent: parsed.intent ?? parsed.primary_intent ?? null,
    confidence: parsed.confidence ?? parsed.candidate_journeys?.[0]?.confidence ?? null,
    selectedCapabilityPortfolioIds: parsed.selectedCapabilityPortfolioIds ?? [],
    selectedCapabilityPointers: parsed.selectedCapabilityPointers ?? [],
    issueCount: parsed.issues?.length ?? 0,
    warningCount: parsed.warnings?.length ?? 0
  };
}

export async function indexLlmOutput({
  sessionId,
  graphTraceId = null,
  step,
  model = null,
  modelTier = null,
  mode = null,
  content,
  parsed = {},
  ttlSeconds = 1800
}) {
  if (!sessionId || !step) return { ok: false, reason: "missing_session_or_step" };
  const cache = createRuntimeContextCache();
  const key = llmOutputIndexKey(sessionId);
  const prior = (await cache.adapter.get(key).catch(() => null)) ?? {
    version: LLM_OUTPUT_INDEX_VERSION,
    sessionId,
    entries: []
  };
  const outputHash = sha(content);
  const outputId = `llmout_${sha(`${sessionId}:${step}:${model}:${outputHash}`).slice(0, 20)}`;
  const entry = {
    outputId,
    pointer: `${key}#${outputId}`,
    step,
    graphTraceId,
    model,
    modelTier,
    mode,
    outputHash,
    rawOutputStored: false,
    parsedSummary: summarizeParsed(parsed),
    createdAt: new Date().toISOString()
  };
  const entries = [entry, ...(prior.entries ?? []).filter((item) => item.outputId !== outputId)].slice(0, 20);
  const next = {
    version: LLM_OUTPUT_INDEX_VERSION,
    sessionId,
    cacheBackend: cache.backend,
    key,
    latestOutputId: outputId,
    entries
  };
  await cache.adapter.set(key, next, { ttlSeconds });
  return {
    ok: true,
    cacheBackend: cache.backend,
    key,
    outputId,
    pointer: entry.pointer,
    outputHash,
    rawOutputStored: false
  };
}

export async function loadLlmOutputIndex(sessionId) {
  const cache = createRuntimeContextCache();
  const key = llmOutputIndexKey(sessionId);
  try {
    const index = await cache.adapter.get(key);
    return {
      version: LLM_OUTPUT_INDEX_VERSION,
      cacheBackend: cache.backend,
      cacheKey: key,
      status: index ? "hit" : "miss",
      latestOutputId: index?.latestOutputId ?? null,
      entries: (index?.entries ?? []).slice(0, 8).map((entry) => ({
        outputId: entry.outputId,
        pointer: entry.pointer,
        step: entry.step,
        model: entry.model,
        modelTier: entry.modelTier,
        mode: entry.mode,
        outputHash: entry.outputHash,
        rawOutputStored: false,
        parsedSummary: entry.parsedSummary,
        createdAt: entry.createdAt
      }))
    };
  } catch (error) {
    return {
      version: LLM_OUTPUT_INDEX_VERSION,
      cacheBackend: cache.backend,
      cacheKey: key,
      status: "error",
      error: error.message,
      entries: []
    };
  }
}
