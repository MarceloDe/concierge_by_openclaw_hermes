// Phase 4 non-mocked proof: capability pointer dereference/hydration against REAL Redis.
// Requires BRAINSTY_REDIS_URL (a live Redis). HARD FAILS if Redis is absent or the
// pointer cannot be hydrated — per the non-mocked proof rules. Not in test:local
// (offline gate); run via `npm run test:redis:hydration`.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { buildContextPacket } from "../concierge/memoryHarness.mjs";
import { createRuntimeContextCache } from "../concierge/runtimeContextCache.mjs";
import { hydrateCapabilityPointers } from "../concierge/capabilityPortfolio.mjs";

await loadLocalEnvOnce();

test("Phase 4: capability portfolio is written to Redis and pointers hydrate back from it", async () => {
  // Dependency must be live and actually used (no memory fallback for this proof).
  assert.ok(process.env.BRAINSTY_REDIS_URL, "BRAINSTY_REDIS_URL must be configured for the Redis hydration proof");
  const cache = createRuntimeContextCache();
  assert.equal(cache.backend, "redis", "runtime cache must select the redis backend, not memory fallback");

  const dir = await mkdtemp(join(tmpdir(), "brainsty-p4-hydration-"));
  const store = await new SqliteStore(join(dir, "p4.sqlite")).initialize();
  const { user, session } = await enrollDefaultMember(store);

  // Real context build writes the capability portfolio fullPayload to Redis.
  const context = await buildContextPacket(store, {
    user,
    session,
    channel: session.channel,
    userInput: "how much will my medication cost?"
  });
  const portfolio = context.packet.capabilityPortfolio;
  assert.ok(portfolio?.stored, "portfolio must be stored to the cache");
  assert.equal(portfolio.cacheBackend, "redis", "portfolio must be stored in redis");
  assert.ok(portfolio.promptTable.length > 0, "portfolio promptTable must be non-empty");

  // Simulate the planner selecting real pointers; hydrate them back from Redis.
  const selectedPointers = portfolio.promptTable.slice(0, 3).map((row) => row.pointer);
  const hydration = await hydrateCapabilityPointers(session.id, selectedPointers);

  assert.equal(hydration.cacheBackend, "redis", "hydration must read from redis");
  assert.equal(hydration.cacheHit, true, "portfolio must be read back from redis (cache hit)");
  assert.equal(hydration.resolvedCount, selectedPointers.length, "all selected pointers must hydrate to full payloads");
  assert.deepEqual(hydration.missing, [], "no selected pointer should be missing");
  for (const entry of hydration.resolved) {
    assert.ok(entry.hydrate, `hydrated entry ${entry.portfolioId} must carry its full payload`);
    assert.ok(entry.kind, "hydrated entry must carry its kind");
  }

  // Negative proof: a bogus pointer cannot hydrate.
  const bogus = await hydrateCapabilityPointers(session.id, [`${portfolio.cacheKey}#workflow:__does_not_exist__`]);
  assert.equal(bogus.resolvedCount, 0, "bogus pointer must not resolve");
  assert.equal(bogus.missing.length, 1, "bogus pointer must be reported missing");
});
