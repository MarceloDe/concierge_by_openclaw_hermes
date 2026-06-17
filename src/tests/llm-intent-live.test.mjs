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
  const curated = classifyHealthcareIntent({
    message,
    policyResult,
    contextPacket: { portalAccount: { id: "portal_1" }, dbPointers: [] }
  });
  return {
    user_input: message,
    policy_result: policyResult,
    structured_intent: curated,
    context_packet: { user: { id: "user_live" }, dbPointers: [], workflowArchitecture: { routeCandidates: [] } },
    product_memory_recall: { facts: [] }
  };
}

test("live LLM structured intent reasoner parses paraphrased journeys", { skip: hasOpenAI ? false : "OPENAI_API_KEY missing; live LLM intent proof blocked" }, async () => {
  const prompts = [
    "My doctor says the scan needs approval before they can schedule it.",
    "The insurance paid nothing on my visit and I do not understand why.",
    "They said no. What do I need to send to fight it?",
    "Will my plan help with physical therapy or am I still paying everything myself?",
    "Is this medication on my plan or do I need a different one?",
    "I uploaded this SBC; what matters for an MRI?",
    "I think this is urgent and I need medical help now."
  ];
  for (const prompt of prompts) {
    const result = await invokeLiveStructuredIntentReasoner({ state: stateFor(prompt) });
    assert.equal(result.mode, "openai_chatopenai_invoked");
    assert.equal(result.valid, true, result.issues?.join("; "));
    assert.ok(result.reasoning.candidate_journeys.length >= 1);
  }
});

