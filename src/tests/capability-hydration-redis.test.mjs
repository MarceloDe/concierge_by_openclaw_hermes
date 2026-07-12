// Phase 4 non-mocked proof: capability catalog mirror + pointer hydration against REAL
// Redis. Requires BRAINSTY_REDIS_URL (a live Redis). HARD FAILS if Redis is absent —
// per the non-mocked proof rules. Phase 86 (§6.3): the surface is the DB-catalog mirror
// (brainsty:capability-catalog); pointers hydrate via the authoritative catalog hydrator
// (backing-precedence, §7.0 runtime_selectable gate). Not in test:local (offline gate);
// run via `npm run test:redis:hydration`.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { SqliteStore, createId, nowIso } from "./support/sqliteTestStore.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { buildContextPacket } from "../concierge/memoryHarness.mjs";
import { createRuntimeContextCache } from "../concierge/runtimeContextCache.mjs";
import { hydrateCapabilityPointer, catalogPortfolioKey } from "../concierge/capabilityCatalog.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";

await loadLocalEnvOnce();

test("Phase 4/86: catalog manifest is mirrored to Redis and pointers hydrate via the catalog", async () => {
  // Dependency must be live and actually used (no memory fallback for this proof).
  assert.ok(process.env.BRAINSTY_REDIS_URL, "BRAINSTY_REDIS_URL must be configured for the Redis hydration proof");
  const cache = createRuntimeContextCache();
  assert.equal(cache.backend, "redis", "runtime cache must select the redis backend, not memory fallback");

  const dir = await mkdtemp(join(tmpdir(), "brainsty-p4-hydration-"));
  const store = await new SqliteStore(join(dir, "p4.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  const { user, session } = await enrollDefaultMember(store);

  // Real context build sources the DB-catalog manifest and mirrors it to Redis.
  const context = await buildContextPacket(store, {
    user,
    session,
    channel: session.channel,
    userInput: "how much will my medication cost?"
  });
  const portfolio = context.packet.capabilityPortfolio;
  assert.equal(portfolio.cacheBackend, "redis", "catalog mirror must be stored in redis");
  assert.equal(portfolio.source, "db_catalog", "packet capability surface must be the DB catalog");
  assert.ok(portfolio.promptTable.length > 0, "catalog promptTable must be non-empty");

  // The mirror must be READ BACK from the real Redis (not a process-local Map).
  const mirrored = await cache.adapter.get(catalogPortfolioKey(session.id));
  assert.ok(mirrored, "catalog manifest must be readable back from redis");
  assert.equal(mirrored.cacheKey, portfolio.cacheKey);

  // Simulate the planner selecting real pointers; hydrate via the AUTHORITATIVE catalog.
  // Processes are OFFERABLE surfaces (offerable_processes), not hydratable capability
  // pointers — select capability-kind rows (workflow/skill/tool/graph_path).
  const selectedPointers = portfolio.promptTable.filter((row) => row.kind !== "process").slice(0, 3).map((row) => row.pointer);
  for (const pointer of selectedPointers) {
    const hydration = await hydrateCapabilityPointer(store, { pointer });
    assert.equal(hydration.resolved, true, `pointer ${pointer} must hydrate via the catalog`);
    assert.ok(hydration.hydrate, "hydrated entry must carry its full payload");
    assert.ok(hydration.kind, "hydrated entry must carry its kind");
  }

  // Negative proof: a bogus pointer cannot hydrate (loud missing, never silent).
  const bogus = await hydrateCapabilityPointer(store, { pointer: `${portfolio.cacheKey}#workflow:__does_not_exist__` });
  assert.equal(bogus.resolved, false, "bogus pointer must not resolve");
  assert.ok(bogus.reason, "bogus pointer must carry a classified refusal reason");
});
