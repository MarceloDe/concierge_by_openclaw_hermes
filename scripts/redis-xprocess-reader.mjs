// Phase 5 cross-process proof — TURN 2 (reader process). A fresh process with no
// shared memory; it can only see the portfolio if it persisted in Redis.
import { loadLocalEnvOnce } from "../src/concierge/secrets.mjs";
import { hydrateCapabilityPointers } from "../src/concierge/capabilityPortfolio.mjs";

await loadLocalEnvOnce();
const sessionId = process.argv[2];
const pointer = process.argv[3];
const hydration = await hydrateCapabilityPointers(sessionId, [pointer]);
console.log(
  JSON.stringify({
    backend: hydration.cacheBackend,
    cacheHit: hydration.cacheHit,
    resolvedCount: hydration.resolvedCount,
    resolvedKinds: hydration.resolved.map((entry) => entry.kind)
  })
);
