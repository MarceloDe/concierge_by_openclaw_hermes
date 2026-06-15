import test from "node:test";
import assert from "node:assert/strict";
import { invokeLiveStructuredIntentReasoner } from "../concierge/intelligence/structuredIntentReasoner.mjs";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { evaluateInputPolicy } from "../concierge/policy.mjs";
import { classifyHealthcareIntent } from "../concierge/structuredIntentClassifier.mjs";

await loadLocalEnvOnce();
const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);

function stateFor(message) {
  const policyResult = evaluateInputPolicy(message);
  return {
    user_input: message,
    policy_result: policyResult,
    structured_intent: classifyHealthcareIntent({ message, policyResult, contextPacket: { portalAccount: { id: "portal_1" }, dbPointers: [] } }),
    context_packet: { user: { id: "user_live" }, dbPointers: [], workflowArchitecture: { routeCandidates: [] } },
    product_memory_recall: { facts: [] }
  };
}

test("live LLM journey reasoning covers the ten journey families", { skip: hasOpenAI ? false : "OPENAI_API_KEY missing; live LLM journey proof blocked" }, async () => {
  const prompts = [
    "Will my plan cover physical therapy and what deductible applies?",
    "Why did my EOB say I owe the whole visit?",
    "My MRI needs approval before scheduling.",
    "Aetna denied this and I want to appeal.",
    "Is this facility in network?",
    "Is this medication on formulary?",
    "Read this plan document and tell me what matters.",
    "Can I estimate the lower cost option?",
    "I might be having an emergency and need help now.",
    "Find trusted insurance policy sources for this coverage rule."
  ];
  const journeys = new Set();
  for (const prompt of prompts) {
    const result = await invokeLiveStructuredIntentReasoner({ state: stateFor(prompt) });
    assert.equal(result.valid, true, result.issues?.join("; "));
    journeys.add(result.reasoning.primary_intent);
  }
  assert.ok(journeys.size >= 7, `Expected broad journey spread, got ${[...journeys].join(", ")}`);
});

