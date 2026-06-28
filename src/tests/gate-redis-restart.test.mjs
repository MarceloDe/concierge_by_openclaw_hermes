// GATE (Redis runtime context): write in one OS process, EXIT it, read in a brand-new
// process. A process-local Map cannot survive this; only a real Redis backend can.
// Requires backend=redis and a recorded cache hit. No mocks, no same-process shortcut.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";

await loadLocalEnvOnce();
const URL = process.env.BRAINSTY_REDIS_URL;
const KEY = `brainsty:gate:restart:${Date.now()}`;

const WRITER = `
import { createRuntimeContextCache } from './src/concierge/runtimeContextCache.mjs';
const c = createRuntimeContextCache();
if (c.backend !== 'redis') { console.log(JSON.stringify({ok:false, backend:c.backend})); process.exit(2); }
await c.adapter.set('${KEY}', { proof:'cross-process', pid: process.pid, at: new Date().toISOString() }, { ttlSeconds: 120 });
console.log(JSON.stringify({ok:true, backend:c.backend, wrotePid: process.pid }));
process.exit(0);
`;
const READER = `
import { createRuntimeContextCache, getRuntimeCacheMetrics, resetRuntimeCacheMetrics } from './src/concierge/runtimeContextCache.mjs';
resetRuntimeCacheMetrics();
const c = createRuntimeContextCache();
const v = await c.adapter.get('${KEY}');           // hit => counts a cache hit
const m = getRuntimeCacheMetrics();
console.log(JSON.stringify({ backend:c.backend, value:v, hits:m.hits, readerPid: process.pid }));
process.exit(0);
`;

test("GATE Redis: value written by an exited process is read by a NEW process (backend=redis, cache hit)", { skip: URL ? false : "BRAINSTY_REDIS_URL required" }, () => {
  const w = JSON.parse(execFileSync("node", ["--input-type=module", "-e", WRITER], { encoding: "utf8", env: process.env }).trim().split("\n").pop());
  assert.equal(w.ok, true); assert.equal(w.backend, "redis");
  const writerPid = w.wrotePid;

  // Writer process has fully exited here. New process reads:
  const r = JSON.parse(execFileSync("node", ["--input-type=module", "-e", READER], { encoding: "utf8", env: process.env }).trim().split("\n").pop());
  assert.equal(r.backend, "redis", "reader must be redis-backed, not a Map");
  assert.notEqual(r.readerPid, writerPid, "must be a DIFFERENT OS process");
  assert.ok(r.value, "value survived the process restart (impossible for an in-process Map)");
  assert.equal(r.value.proof, "cross-process");
  assert.equal(r.value.pid, writerPid, "exact payload written by the prior process");
  assert.equal(r.hits, 1, "the read-back recorded a cache HIT");
});

test("GATE Redis fail-loud: BRAINSTY_REQUIRE_REDIS=1 with no URL refuses to score memory as redis", async () => {
  const { initializeRuntimeCache } = await import("../concierge/runtimeContextCache.mjs");
  await assert.rejects(() => initializeRuntimeCache({ env: { BRAINSTY_REQUIRE_REDIS: "1" } }), /Redis is required but not live/);
});
