import { ChatOpenAI } from "@langchain/openai";

export const MODEL_TIER_POLICY_VERSION = "2026-06-21.phase53-model-tier-policy.v1";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODELS = Object.freeze({
  classifier: "gpt-5-mini",
  reasoner: "gpt-5",
  planner: "gpt-5"
});

const STEP_TIERS = Object.freeze({
  structured_intent: "classifier",
  classify_intent: "classifier",
  llm_orchestration_decision: "planner",
  workflow_planner: "planner",
  sourced_answer: "reasoner",
  answer_composer: "reasoner",
  final_response: "reasoner",
  pems_live_evaluator: "reasoner"
});

let testChatModelFactory = null;

function normalizeTier(step, context = {}) {
  const requested = context.tier ?? STEP_TIERS[step] ?? step;
  if (requested === "edge_slm") return "edge_slm";
  if (["classifier", "reasoner", "planner"].includes(requested)) return requested;
  return "reasoner";
}

function envForTier(tier, suffix, env) {
  return env[`BRAINSTY_${tier.toUpperCase()}_${suffix}`];
}

export function selectModelForStep(step, context = {}) {
  const env = context.env ?? process.env;
  const tier = normalizeTier(step, context);
  if (tier === "edge_slm") {
    const error = new Error("edge_slm_not_implemented");
    error.code = "not_implemented";
    error.tier = "edge_slm";
    error.step = step;
    throw error;
  }
  const model =
    context.model ??
    envForTier(tier, "MODEL", env) ??
    (tier === "planner" ? env.BRAINSTY_REASONER_MODEL : null) ??
    (tier === "classifier" ? env.OPENAI_MODEL : null) ??
    DEFAULT_MODELS[tier];
  const baseURL =
    context.baseURL ??
    envForTier(tier, "BASE_URL", env) ??
    env.BRAINSTY_OPENAI_BASE_URL ??
    DEFAULT_BASE_URL;
  return {
    policyVersion: MODEL_TIER_POLICY_VERSION,
    step,
    tier,
    model,
    baseURL
  };
}

export function createTieredChatModel(step, context = {}) {
  const selection = selectModelForStep(step, context);
  const options = {
    model: selection.model,
    timeout: context.timeout ?? 60000,
    maxRetries: context.maxRetries ?? 1,
    configuration: { baseURL: selection.baseURL }
  };
  const llm = testChatModelFactory
    ? testChatModelFactory({ step, selection, options, context })
    : new ChatOpenAI(options);
  return { llm, selection, options };
}

export function setTieredChatModelFactoryForTests(factory) {
  testChatModelFactory = factory;
}

export function resetTieredChatModelFactoryForTests() {
  testChatModelFactory = null;
}
