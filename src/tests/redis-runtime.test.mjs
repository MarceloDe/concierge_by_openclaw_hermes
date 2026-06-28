// Redis real-runtime proof (no mocks, requires BRAINSTY_REDIS_URL): startup connectivity,
// a real write->read-back across SEPARATE cache instances (not a process Map), hit/miss
// metrics, and fail-loud when Redis is required but unavailable.
import test from "node:test";
import assert from "node:assert/strict";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import {
  initializeRuntimeCache, createRuntimeContextCache,
  getRuntimeCacheMetrics, resetRuntimeCacheMetrics
} from "../concierge/runtimeContextCache.mjs";

await loadLocalEnvOnce();
const URL = process.env.BRAINSTY_REDIS_URL;

test("Redis runtime: startup connectivity verified + real write->read probe (productionReady)", { skip: URL ? false : "BRAINSTY_REDIS_URL required" }, async () => {
  const readiness = await initializeRuntimeCache({ env: process.env });
  assert.equal(readiness.backend, "redis", "must select real Redis, not memory");
  assert.equal(readiness.ping.healthy, true, "PING ok");
  assert.equal(readiness.writeReadProbe.ok, true, "boot write->read round-trip succeeded");
  assert.equal(readiness.productionReady, true);
});

test("Redis runtime: key written by one instance is read by a LATER separate instance (not in-process)", async () => {
  if (!URL) return; // covered above
  const key = `brainsty:test:rt:${Date.now()}`;
  const writer = createRuntimeContextCache({ env: process.env });
  await writer.adapter.set(key, { proof: "redis-backed", n: 42 }, { ttlSeconds: 60 });
  // A brand-new cache object (fresh adapter) — a process Map would NOT see this.
  const reader = createRuntimeContextCache({ env: process.env });
  const value = await reader.adapter.get(key);
  assert.equal(value?.proof, "redis-backed");
  assert.equal(value?.n, 42);
  await reader.adapter.del(key);
});

test("Redis runtime: hit/miss metrics are observable", async () => {
  if (!URL) return;
  resetRuntimeCacheMetrics();
  const cache = createRuntimeContextCache({ env: process.env });
  const key = `brainsty:test:metric:${Date.now()}`;
  assert.equal(await cache.adapter.get(key), null);        // miss
  await cache.adapter.set(key, { v: 1 }, { ttlSeconds: 60 });
  assert.ok(await cache.adapter.get(key));                  // hit
  const m = getRuntimeCacheMetrics();
  assert.equal(m.misses, 1); assert.equal(m.hits, 1); assert.equal(m.sets, 1);
  assert.equal(m.hitRate, 0.5);
  await cache.adapter.del(key);
});

test("Redis runtime: FAILS LOUD when required but no Redis configured (no silent memory)", async () => {
  await assert.rejects(
    () => initializeRuntimeCache({ env: { BRAINSTY_REQUIRE_REDIS: "1" } }),
    /Redis is required but not live/,
    "required + no url must throw, never score memory as redis"
  );
});
