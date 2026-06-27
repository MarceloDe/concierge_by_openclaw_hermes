import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildPhase82RuntimeIntelligenceReadinessProof } from "../concierge/phase82RuntimeIntelligenceReadiness.mjs";

test("Phase 82 runtime intelligence proof scores all pointer-context gates", () => {
  const proof = buildPhase82RuntimeIntelligenceReadinessProof();

  assert.equal(proof.status, "phase82_runtime_intelligence_pointer_context_ready");
  assert.equal(proof.ok, true);
  assert.equal(proof.score, 100);
  assert.equal(proof.target, 100);
  assert.equal(proof.proof.redisCompatibleCheckpointPointers, true);
  assert.equal(proof.proof.capabilityPortfolioPointers, true);
  assert.equal(proof.proof.llmOutputIndexPointers, true);
  assert.equal(proof.proof.checkpointResumePlan, true);
  assert.equal(proof.proof.vectorToContextPointers, true);
  assert.equal(proof.proof.rawContextAvoided, true);
  assert.equal(proof.proof.deterministicSafetyStillAuthoritative, true);
});

test("Phase 82 proof is exposed through connector proof and scoreboard", async () => {
  const [server, scoreboard] = await Promise.all([
    readFile(new URL("../server/server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../docs/PHASE_SCOREBOARD.md", import.meta.url), "utf8")
  ]);

  assert.match(server, /phase82_runtime_intelligence_pointer_context/);
  assert.match(server, /buildPhase82RuntimeIntelligenceReadinessProof/);
  assert.match(scoreboard, /\| redis_runtime_context_phase76_82 \| 100 \|/);
  assert.match(scoreboard, /\| llm_primary_chat_orchestrator_phase76_82 \| 100 \|/);
});
