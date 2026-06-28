// GATE (Redis targets): the 4 fast-runtime stores are REAL-Redis-backed, hydrate
// cross-instance/cross-turn, and emit a cache-hit trace + measurable latency.
// Targets: runtime manifest, checkpoint pointers, capability portfolio, LLM output index.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import {
  createRuntimeContextCache, getRuntimeCacheMetrics, resetRuntimeCacheMetrics,
  runtimeContextKey, storeRuntimeContextManifest, loadRuntimeContextForSession
} from "../concierge/runtimeContextCache.mjs";
import { loadSessionPortfolio, catalogPortfolioKey } from "../concierge/capabilityCatalog.mjs";
import { indexLlmOutput, loadLlmOutputIndex, llmOutputIndexKey } from "../concierge/llmOutputIndex.mjs";

await loadLocalEnvOnce();
const URL = process.env.BRAINSTY_REDIS_URL;

test("GATE Redis targets: manifest+checkpoint pointers, portfolio, LLM index are real-Redis, cross-turn, traced", { skip: URL ? false : "BRAINSTY_REDIS_URL required" }, async () => {
  const store = await new SqliteStore(join(await mkdtemp(join(tmpdir(), "rt-gate-")), "g.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  const sid = createId("rtsession");
  const writer = createRuntimeContextCache();
  assert.equal(writer.backend, "redis", "REAL Redis backend (not memory Map)");

  // ---- TARGET 1+2: runtime manifest WITH checkpoint pointers ----
  const manifest = { version: "test", manifestHash: "h1", achievedCheckpoints: [{ name: "after_planner", pointer: `ckpt:${sid}:after_planner` }], priorDecisionPointers: [] };
  const wrote = await storeRuntimeContextManifest({ cache: writer, key: runtimeContextKey(sid), manifest });
  assert.equal(wrote.ok, true);

  // ---- TARGET 3: capability portfolio (miss writes, hit reads) ----
  const p1 = await loadSessionPortfolio(store, { sessionId: sid });
  assert.equal(p1.traceEvent, "cache.miss");

  // ---- TARGET 4: LLM output index ----
  await indexLlmOutput({ sessionId: sid, step: "llm_orchestration_decision", model: "gpt-4.1", content: '{"workflow":"x"}', parsed: { workflow: "x" } });

  // ===== CROSS-TURN / CROSS-INSTANCE HYDRATION (a fresh cache object = next turn) =====
  resetRuntimeCacheMetrics();
  const reader = createRuntimeContextCache();
  const t0 = Date.now();
  const rc = await loadRuntimeContextForSession({ id: sid });   // manifest + checkpoint pointers
  const manifestLatencyMs = Date.now() - t0;
  assert.equal(rc.status, "hit", "runtime manifest hydrated from Redis across turns");
  assert.equal(rc.previous.achievedCheckpoints[0].pointer, `ckpt:${sid}:after_planner`, "checkpoint pointers dereferenced cross-turn");

  const p2 = await loadSessionPortfolio(store, { sessionId: sid });
  assert.equal(p2.cacheHit, true, "capability portfolio cross-turn cache HIT");
  assert.equal(p2.traceEvent, "cache.hit", "portfolio emits a cache.hit trace");
  assert.equal(p2.backend, "redis");

  const idx = await loadLlmOutputIndex(sid);
  assert.ok((idx?.entries?.length ?? 0) >= 1, "LLM output index hydrated cross-turn");
  assert.equal(idx.entries[0].model, "gpt-4.1", "indexed model survives in Redis");

  // ===== LATENCY + CACHE-HIT TRACE =====
  const m = getRuntimeCacheMetrics();
  assert.ok(m.hits >= 2, `cache hits recorded (got ${m.hits})`);
  assert.equal(m.hitRate, 1, "all cross-turn reads were hits");
  assert.ok(manifestLatencyMs >= 0 && manifestLatencyMs < 2000, `manifest read latency measured (${manifestLatencyMs}ms)`);
  assert.equal(reader.backend, "redis");
});
