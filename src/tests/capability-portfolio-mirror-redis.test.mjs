// Step 5 proof: Postgres-authoritative portfolio mirrored to Redis; cache miss rebuilds
// from Postgres; memory backend degrades visibly (productionReady:false). Redis round-trip
// requires BRAINSTY_REDIS_URL. Run via `npm run test:redis:portfolio`.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { createRuntimeContextCache } from "../concierge/runtimeContextCache.mjs";
import {
  mirrorCapabilityPortfolioToRedis,
  loadSessionPortfolio,
  catalogPortfolioKey
} from "../concierge/capabilityCatalog.mjs";

await loadLocalEnvOnce();

async function seededStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-mirror-"));
  const store = await new SqliteStore(join(dir, "m.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  return store;
}

test("Step 5: memory backend degrades visibly (productionReady:false)", async () => {
  const cache = createRuntimeContextCache({ env: {} });
  assert.equal(cache.backend, "memory");
  const health = await cache.adapter.ping();
  assert.equal(health.backend, "memory");
  assert.equal(health.productionReady, false, "a process-local Map must never score production-ready");
});

test("Step 5: mirror to Redis, read back (cache.hit), evict, rebuild from Postgres (cache.miss)", async () => {
  assert.ok(process.env.BRAINSTY_REDIS_URL, "BRAINSTY_REDIS_URL required for the Redis mirror proof");
  const store = await seededStore();
  const sessionId = createId("mirror");

  const cache = createRuntimeContextCache();
  assert.equal(cache.backend, "redis");
  const ping = await cache.adapter.ping();
  assert.equal(ping.healthy, true, "redis must answer PING");

  // WRITE half (Postgres-before-Redis).
  const mirror = await mirrorCapabilityPortfolioToRedis(store, { sessionId });
  assert.equal(mirror.backend, "redis");
  assert.equal(mirror.stored, true);
  assert.ok(mirror.count > 0, "manifest has rows");

  // READ half: cache.hit.
  const hit = await loadSessionPortfolio(store, { sessionId });
  assert.equal(hit.cacheHit, true);
  assert.equal(hit.traceEvent, "cache.hit");
  assert.equal(hit.manifest.promptTable.length, mirror.count);
  // Planner half only — entries carry pointers, not HOW.
  for (const row of hit.manifest.promptTable) {
    assert.ok(row.pointer.includes("#"), "row carries a pointer");
    assert.equal(row.howConfig, undefined, "manifest must not carry HOW");
  }

  // Kill the Redis key, then read -> rebuild from Postgres (cache.miss).
  await cache.adapter.del(catalogPortfolioKey(sessionId));
  const miss = await loadSessionPortfolio(store, { sessionId });
  assert.equal(miss.cacheHit, false, "evicted key must miss");
  assert.equal(miss.traceEvent, "cache.miss");
  assert.equal(miss.rebuiltFromPostgres, true);
  assert.equal(miss.manifest.promptTable.length, mirror.count, "rebuilt manifest matches Postgres");

  // Re-mirror happened on miss -> next read is a hit again.
  const hit2 = await loadSessionPortfolio(store, { sessionId });
  assert.equal(hit2.cacheHit, true, "miss re-mirrors so the next read hits");

  await cache.adapter.del(catalogPortfolioKey(sessionId)); // cleanup
});
