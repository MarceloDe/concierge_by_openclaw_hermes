// Phase 5 cross-process proof — TURN 2 (reader process). A fresh process with no
// shared memory; Phase 86 (§6.3): it reads the DB-catalog MIRROR straight from Redis
// (brainsty:capability-catalog:<sessionId>) — the mirror is only visible here if it
// persisted in Redis (an in-memory Map would be empty in this process).
import { loadLocalEnvOnce } from "../src/concierge/secrets.mjs";
import { catalogPortfolioKey } from "../src/concierge/capabilityCatalog.mjs";
import { createRuntimeContextCache } from "../src/concierge/runtimeContextCache.mjs";

await loadLocalEnvOnce();
const sessionId = process.argv[2];
const pointer = process.argv[3];
const cache = createRuntimeContextCache();
const manifest = await cache.adapter.get(catalogPortfolioKey(sessionId));
const portfolioId = pointer?.includes("#") ? pointer.slice(pointer.indexOf("#") + 1) : pointer;
const entry = manifest?.entries?.[portfolioId] ?? null;
console.log(
  JSON.stringify({
    backend: cache.backend,
    cacheHit: Boolean(manifest),
    resolvedCount: entry ? 1 : 0,
    resolvedKinds: entry ? [entry.kind] : []
  })
);
