// Phase 5 cross-process proof — TURN 1 (writer process). Builds a real context
// packet; Phase 86 (§6.3): the packet's capability surface is the DB-catalog manifest,
// whose Redis MIRROR (brainsty:capability-catalog:<sessionId>) is what must survive
// into the independent reader process. Prints the session id and a real pointer.
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLocalEnvOnce } from "../src/concierge/secrets.mjs";
import { SqliteStore, createId, nowIso } from "../src/concierge/database.mjs";
import { seedCapabilityCatalog } from "../src/concierge/capabilityCatalogSeed.mjs";
import { enrollDefaultMember } from "../src/concierge/enrollment.mjs";
import { buildContextPacket } from "../src/concierge/memoryHarness.mjs";

await loadLocalEnvOnce();
const store = await new SqliteStore(join(await mkdtemp(join(tmpdir(), "xpw-")), "w.sqlite")).initialize();
await seedCapabilityCatalog(store, { nowIso, createId });
const { user, session } = await enrollDefaultMember(store);
const ctx = await buildContextPacket(store, {
  user,
  session,
  channel: session.channel,
  userInput: "is my provider in network and what will it cost?"
});
const portfolio = ctx.packet.capabilityPortfolio;
console.log(
  JSON.stringify({
    sessionId: session.id,
    backend: portfolio.cacheBackend,
    source: portfolio.source,
    entryCount: portfolio.entryCount,
    pointer: portfolio.promptTable[0]?.pointer ?? null
  })
);
