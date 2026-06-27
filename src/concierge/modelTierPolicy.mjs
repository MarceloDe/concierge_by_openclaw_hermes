import { ChatOpenAI } from "@langchain/openai";
import { get_langchain_callback_handler } from "../observability/langfuseClient.mjs";
import { withCheckpoint } from "../observability/checkpoints.mjs";
import { safe_metadata, safeSummaryFromPayload } from "../observability/redaction.mjs";

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

async function mergeLangChainConfig(config = {}, { step, selection, context }) {
  const handler = await get_langchain_callback_handler();
  const callbacks = [
    ...(Array.isArray(config.callbacks) ? config.callbacks : config.callbacks ? [config.callbacks] : []),
    ...(handler ? [handler] : [])
  ];
  return {
    ...config,
    callbacks,
    metadata: safe_metadata({
      ...(config.metadata ?? {}),
      app_name: "brainstyworkers-ai-concierge",
      prompt_name: step,
      prompt_role: context.promptRole ?? "runtime",
      model: selection.model,
      workflow: context.workflow,
      route: context.route,
      session_id: context.sessionId,
      trace_id: context.traceId,
      langchain_runtime: "langchain_js",
      safety_mode: "deterministic_rails_llm_planner"
    })
  };
}

function wrapModelWithObservability(llm, { step, selection, context }) {
  if (!llm || typeof llm.invoke !== "function") return llm;
  return new Proxy(llm, {
    get(target, prop, receiver) {
      if (prop !== "invoke") return Reflect.get(target, prop, receiver);
      return async (input, config = {}) => {
        const mergedConfig = await mergeLangChainConfig(config, { step, selection, context });
        return withCheckpoint(
          `model.${step}`,
          {
            kind: "llm.call",
            metadata: {
              trace_id: context.traceId,
              session_id: context.sessionId,
              checkpoint_name: `model.${step}`,
              checkpoint_kind: "llm.call",
              prompt_name: step,
              prompt_version: context.promptVersion ?? selection.policyVersion,
              prompt_role: context.promptRole ?? "runtime",
              model: selection.model,
              workflow: context.workflow,
              route: context.route
            },
            input: {
              input_summary: safeSummaryFromPayload(input, "llm_input"),
              message_count: Array.isArray(input) ? input.length : null
            }
          },
          async () => target.invoke(input, mergedConfig)
        );
      };
    }
  });
}

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
  return { llm: wrapModelWithObservability(llm, { step, selection, context }), selection, options };
}

export function setTieredChatModelFactoryForTests(factory) {
  testChatModelFactory = factory;
}

export function resetTieredChatModelFactoryForTests() {
  testChatModelFactory = null;
}
