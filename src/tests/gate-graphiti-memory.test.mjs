// GATE (Graphiti/Zep product memory): schema-ready LIVE adapter (real bridge + FalkorDB),
// replay queue (DB-backed enqueue/list/replay), and SAFE retain/recall (PHI-gated refusal
// by default; PHI-masked episode; real retain->recall round-trip when cleared+synthetic).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import {
  getProductMemoryStatus, buildSafeProductMemoryEpisode,
  enqueueProductMemoryRetainReplay, listProductMemoryReplayQueue, getProductMemoryReplayQueueSummary,
  retainProductMemoryFromGraphRun, recallProductMemoryForRequest
} from "../concierge/productMemory.mjs";

await loadLocalEnvOnce();
const LIVE = process.env.BRAINSTY_GRAPHITI_LIVE === "1";

async function freshStore() {
  const store = await new SqliteStore(join(await mkdtemp(join(tmpdir(), "pm-gate-")), "g.sqlite")).initialize();
  const { user, session } = await enrollDefaultMember(store);
  return { store, user, session };
}

test("GATE Graphiti: SAFE retain refuses to send PHI until cleared (no payload by default)", async () => {
  const saved = process.env.BRAINSTY_PRODUCT_MEMORY_PHI_CLEARED;
  delete process.env.BRAINSTY_PRODUCT_MEMORY_PHI_CLEARED;
  try {
    const st = await getProductMemoryStatus({ requireEnabled: false, timeoutMs: 30000 });
    assert.equal(st.enabled, true, "adapter is enabled (graphiti)");
    assert.equal(st.status, "degraded");
    assert.equal(st.reason, "phi_clearance_required", "refuses to send until the HIPAA boundary is confirmed");
    assert.equal(st.retained, false, "no payload sent");
  } finally {
    if (saved !== undefined) process.env.BRAINSTY_PRODUCT_MEMORY_PHI_CLEARED = saved;
  }
});

test("GATE Graphiti: episode builder masks PHI (safe payload)", async () => {
  const { user, session } = await freshStore();
  const ep = buildSafeProductMemoryEpisode({ user, session, state: { final_response: "member SSN 123-45-6789 deductible note", source_pointers: [{ id: "sp1", text: "x" }] }, localMemoryItems: [] });
  assert.doesNotMatch(JSON.stringify(ep), /123-45-6789/, "SSN masked out of the episode payload");
});

test("GATE Graphiti: replay queue is DB-backed (enqueue -> list -> summary)", async () => {
  const { store, user, session } = await freshStore();
  const enq = await enqueueProductMemoryRetainReplay(store, { user, session, retainPayload: { episodeName: "synthetic" }, episodeBody: "synthetic episode body", error: "graphiti_unreachable_simulated", repairPlan: { attempt: 1 } });
  assert.ok(enq.id, "queued with an id");
  const queued = await listProductMemoryReplayQueue(store, { status: "queued" });
  assert.ok(queued.some((r) => r.id === enq.id), "row persisted in product_memory_replay_queue");
  const summary = await getProductMemoryReplayQueueSummary(store);
  assert.equal(summary.available, true);
  assert.ok(summary.pending >= 1, "summary reflects the pending (queued) retain");
});

test("GATE Graphiti: LIVE schema-ready retain -> recall round-trip (synthetic)", { skip: LIVE ? false : "set BRAINSTY_GRAPHITI_LIVE=1 (hits the real bridge + FalkorDB)" }, async () => {
  process.env.BRAINSTY_PRODUCT_MEMORY_PHI_CLEARED = "1"; // synthetic local data only
  const { store, user, session } = await freshStore();
  const state = { workflow: "eligibility_benefits_navigation", final_response: "Synthetic plan ACME-ZEBRA covers chiropractic at 80% after a $250 deductible.", source_pointers: [{ id: "sp1", url: "portal://synthetic", text: "chiropractic 80% after $250" }], answer_claims: [{ claim: "ACME-ZEBRA covers chiropractic at 80%", sourcePointerIds: ["sp1"] }] };
  const r = await retainProductMemoryFromGraphRun(store, { user, session, state, localMemoryItems: [] });
  assert.equal(r.ok, true, "real episode retained into FalkorDB via the bridge");
  await new Promise((s) => setTimeout(s, 4000));
  const rec = await recallProductMemoryForRequest({ store, user, session, userInput: "does my plan cover chiropractic", contextPacket: {}, limit: 5 });
  assert.equal(rec.ok, true);
  assert.ok((rec.facts ?? []).length >= 1, "recall returned facts from the live graph");
});
