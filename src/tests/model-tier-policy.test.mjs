import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resetTieredChatModelFactoryForTests,
  selectModelForStep,
  setTieredChatModelFactoryForTests,
  createTieredChatModel
} from "../concierge/modelTierPolicy.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("model tier policy selects explicit classifier reasoner and planner tiers", () => {
  const env = {
    BRAINSTY_CLASSIFIER_MODEL: "classifier-test",
    BRAINSTY_REASONER_MODEL: "reasoner-test",
    BRAINSTY_PLANNER_MODEL: "planner-test",
    BRAINSTY_OPENAI_BASE_URL: "https://models.example.invalid/v1"
  };

  assert.deepEqual(selectModelForStep("structured_intent", { env }), {
    policyVersion: "2026-06-21.phase53-model-tier-policy.v1",
    step: "structured_intent",
    tier: "classifier",
    model: "classifier-test",
    baseURL: "https://models.example.invalid/v1"
  });
  assert.equal(selectModelForStep("sourced_answer", { env }).model, "reasoner-test");
  assert.equal(selectModelForStep("llm_orchestration_decision", { env }).model, "planner-test");
});

test("planner tier does not inherit classifier-sized OPENAI_MODEL fallback", () => {
  const env = { OPENAI_MODEL: "gpt-5-mini" };

  assert.equal(selectModelForStep("structured_intent", { env }).model, "gpt-5-mini");
  assert.equal(selectModelForStep("llm_orchestration_decision", { env }).model, "gpt-5");
  assert.equal(selectModelForStep("sourced_answer", { env }).model, "gpt-5");
});

test("model tier policy keeps edge SLM as a pinned not-implemented interface", () => {
  assert.throws(() => selectModelForStep("offline_small_model", { tier: "edge_slm", env: {} }), {
    code: "not_implemented",
    tier: "edge_slm"
  });
});

test("tiered chat model factory can be injected for deterministic harnesses", async () => {
  setTieredChatModelFactoryForTests(({ selection }) => ({
    invoke: async () => ({ content: JSON.stringify({ tier: selection.tier, model: selection.model }) })
  }));
  try {
    const { llm, selection } = createTieredChatModel("structured_intent", {
      env: { BRAINSTY_CLASSIFIER_MODEL: "fake-classifier" }
    });
    const response = await llm.invoke([]);
    assert.equal(selection.tier, "classifier");
    assert.equal(JSON.parse(response.content).model, "fake-classifier");
  } finally {
    resetTieredChatModelFactoryForTests();
  }
});

test("ChatOpenAI construction is centralized in modelTierPolicy", async () => {
  const files = [
    "concierge/langgraphRunner.mjs",
    "concierge/intelligence/structuredIntentReasoner.mjs",
    "concierge/intelligence/sourcedAnswerComposer.mjs",
    "concierge/continuousIntelligence.mjs"
  ];
  for (const file of files) {
    const text = await readFile(join(root, file), "utf8");
    assert.equal(text.includes("new ChatOpenAI"), false, `${file} should use modelTierPolicy`);
    assert.equal(text.includes("@langchain/openai"), false, `${file} should not import ChatOpenAI directly`);
  }
  const policy = await readFile(join(root, "concierge/modelTierPolicy.mjs"), "utf8");
  assert.equal(policy.includes("new ChatOpenAI"), true);
});
