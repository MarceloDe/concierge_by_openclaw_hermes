// Phase 5 non-mocked proof: Redis runtime context survives a process restart.
// Turn 1 (writer) and Turn 2 (reader) are SEPARATE node processes with no shared
// memory. The reader can only hydrate the portfolio if it persisted in Redis — an
// in-memory fallback Map would be empty in the fresh process. HARD FAILS without
// Redis. Not in test:local; run via `npm run test:redis:crossprocess`.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";

await loadLocalEnvOnce();
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function runNode(scriptRelPath, args = []) {
  const out = execFileSync("node", [join(repoRoot, scriptRelPath), ...args], {
    encoding: "utf8",
    env: process.env,
    cwd: repoRoot
  });
  return JSON.parse(out.trim().split("\n").filter(Boolean).pop());
}

test("Phase 5: Redis runtime context survives a process restart (turn 1 writes, fresh process reads back)", () => {
  assert.ok(process.env.BRAINSTY_REDIS_URL, "BRAINSTY_REDIS_URL must be configured for the cross-process proof");

  // Turn 1 — writer process writes the portfolio to Redis.
  const writer = runNode("scripts/redis-xprocess-writer.mjs");
  assert.equal(writer.backend, "redis", "writer must use the redis backend");
  assert.equal(writer.stored, true, "writer must store the portfolio");
  assert.ok(writer.pointer, "writer must produce a real pointer");

  // Turn 2 — a brand new process (no shared memory) reads it back.
  const reader = runNode("scripts/redis-xprocess-reader.mjs", [writer.sessionId, writer.pointer]);
  assert.equal(reader.backend, "redis", "reader must use the redis backend");
  assert.equal(reader.cacheHit, true, "fresh process must read the portfolio back from redis (proves cross-process persistence)");
  assert.equal(reader.resolvedCount, 1, "pointer must hydrate to a full payload in the fresh process");
});
