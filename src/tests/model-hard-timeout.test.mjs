// Phase 7 proof: a stalled model call fails LOUD + classified (LLM_TIMEOUT) within
// a bound and never hangs. Deterministic — injects a never-resolving model via the
// test factory (the timeout mechanism is what is under test, not a live LLM).
import test from "node:test";
import assert from "node:assert/strict";
import {
  createTieredChatModel,
  setTieredChatModelFactoryForTests,
  resetTieredChatModelFactoryForTests
} from "../concierge/modelTierPolicy.mjs";
import { classifyFailureClass, FAILURE_CLASSES } from "../observability/failures.mjs";

test("model hard timeout: a stalled invoke rejects quickly and classifies as LLM_TIMEOUT", async () => {
  const prev = process.env.BRAINSTY_MODEL_HARD_TIMEOUT_MS;
  process.env.BRAINSTY_MODEL_HARD_TIMEOUT_MS = "200";
  setTieredChatModelFactoryForTests(() => ({ invoke: () => new Promise(() => {}) })); // never resolves
  try {
    const { llm } = createTieredChatModel("llm_orchestration_decision", {});
    const start = Date.now();
    let caught = null;
    try {
      await llm.invoke([{ role: "user", content: "hi" }]);
    } catch (error) {
      caught = error;
    }
    const elapsed = Date.now() - start;
    assert.ok(caught, "stalled model call must reject, not hang");
    assert.match(String(caught.message), /llm_hard_timeout/, "must be a hard-timeout error");
    assert.ok(elapsed < 2000, `must time out quickly (got ${elapsed}ms)`);
    assert.equal(classifyFailureClass(caught), FAILURE_CLASSES.LLM_TIMEOUT, "must classify as LLM_TIMEOUT");
  } finally {
    resetTieredChatModelFactoryForTests();
    if (prev === undefined) delete process.env.BRAINSTY_MODEL_HARD_TIMEOUT_MS;
    else process.env.BRAINSTY_MODEL_HARD_TIMEOUT_MS = prev;
  }
});
