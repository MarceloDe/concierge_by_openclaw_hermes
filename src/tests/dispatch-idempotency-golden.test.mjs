// Phase 86 HARD INVARIANT (plan §6.2): workerPlanSignature and
// computeDispatchIdempotencyKey stay byte-identical across the pivot — resume of
// pre-pivot runs must produce identical keys. The expected values below were RECORDED
// against the pre-Phase-86 implementation (2026-07-03, dispatch-idempotency v1) from a
// recorded pointer set; any drift in the hash material fails this gate loudly.
import test from "node:test";
import assert from "node:assert/strict";
import { workerPlanSignature, computeDispatchIdempotencyKey } from "../concierge/dispatchIdempotency.mjs";

const RECORDED_PRE_PIVOT_POINTERS = [
  "brainsty:capability-catalog:sess-golden#tool:openclaw_authenticated_browser",
  "brainsty:capability-catalog:sess-golden#skill:insurance_portal_browser",
  "brainsty:capability-portfolio:sess-legacy#workflow:claim_status_navigation"
];

test("golden: workerPlanSignature is byte-identical to the recorded pre-pivot value", () => {
  assert.equal(workerPlanSignature(RECORDED_PRE_PIVOT_POINTERS), "7f26b80d65d435242341d0ea");
  // Order-insensitivity is part of the recorded contract (sorted before hashing).
  assert.equal(workerPlanSignature([...RECORDED_PRE_PIVOT_POINTERS].reverse()), "7f26b80d65d435242341d0ea");
  assert.equal(workerPlanSignature([]), "4f53cda18c2baa0c0354bb5f");
});

test("golden: computeDispatchIdempotencyKey is byte-identical to the recorded pre-pivot value", () => {
  assert.equal(
    computeDispatchIdempotencyKey({
      runId: "wfrun:golden-trace-001",
      beforeWorkerCheckpointId: "ckpt:golden-trace-001:before_worker",
      workerPlanSignature: workerPlanSignature(RECORDED_PRE_PIVOT_POINTERS)
    }),
    "efad2fcf455dec89d2ce7904f45eff48"
  );
  assert.equal(
    computeDispatchIdempotencyKey({
      runId: "wfrun:golden-trace-002",
      beforeWorkerCheckpointId: "",
      workerPlanSignature: workerPlanSignature([])
    }),
    "66683e46fedb1ec704ba57ad241ef757"
  );
});
