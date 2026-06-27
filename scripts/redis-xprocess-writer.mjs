// Phase 5 cross-process proof — TURN 1 (writer process). Builds a real context
// packet which writes the capability portfolio to Redis, then prints the session
// id and a real pointer for the independent reader process to hydrate.
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLocalEnvOnce } from "../src/concierge/secrets.mjs";
import { SqliteStore } from "../src/concierge/database.mjs";
import { enrollDefaultMember } from "../src/concierge/enrollment.mjs";
import { buildContextPacket } from "../src/concierge/memoryHarness.mjs";

await loadLocalEnvOnce();
const store = await new SqliteStore(join(await mkdtemp(join(tmpdir(), "xpw-")), "w.sqlite")).initialize();
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
    stored: portfolio.stored,
    pointer: portfolio.promptTable[0]?.pointer ?? null
  })
);
