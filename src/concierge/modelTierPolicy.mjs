import { ChatOpenAI } from "@langchain/openai";
import { get_langchain_callback_handler } from "../observability/langfuseClient.mjs";
import { withCheckpoint } from "../observability/checkpoints.mjs";
import { safe_metadata, safeSummaryFromPayload } from "../observability/redaction.mjs";

export const MODEL_TIER_POLICY_VERSION = "2026-06-21.phase53-model-tier-policy.v1";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
// Latency (benchmark 2026-06-27, real orchestration prompt): gpt-5 minimal ~38s,
// gpt-5-mini ~14s, gpt-4.1 ~3.6s. The interactive chat path must stay snappy, so
// default to the fast flagship gpt-4.1 (non-reasoning). Override per tier via
// BRAINSTY_<TIER>_MODEL / BRAINSTY_REASONER_MODEL to use gpt-5 for deep/offline work.
const DEFAULT_MODELS = Object.freeze({
  classifier: "gpt-4.1-mini",
  reasoner: "gpt-4.1",
  planner: "gpt-4.1"
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

function modelHardTimeoutMs() {
  const value = Number(process.env.BRAINSTY_MODEL_HARD_TIMEOUT_MS || 45000);
  return Number.isFinite(value) && value > 0 ? value : 45000;
}

// Bound every model call so a stalled provider/reasoning call fails loud and
// classified (LLM_TIMEOUT) instead of hanging the orchestration. Aborts the
// request via AbortSignal and races a hard rejection as a backstop.
async function invokeWithHardTimeout(target, input, config, ms, step) {
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), ms);
  let raceTimer = null;
  try {
    return await Promise.race([
      target.invoke(input, { ...config, signal: controller.signal }),
      new Promise((_, reject) => {
        raceTimer = setTimeout(() => {
          reject(Object.assign(new Error(`llm_hard_timeout:${step}:${ms}ms`), { code: "llm_hard_timeout", step }));
        }, ms);
        raceTimer.unref?.();
      })
    ]);
  } finally {
    clearTimeout(abortTimer);
    if (raceTimer) clearTimeout(raceTimer);
  }
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
              message_count: Array.isArray(input) ? input.length : null,
              // Debug trace mode: capture the FULL prompt (identifier-redacted by the
              // checkpoint layer, not truncated) so every LLM call's exact input is
              // inspectable in Langfuse. Off by default (lean + PHI-safe in prod).
              ...(process.env.BRAINSTY_TRACE_FULL_PROMPTS === "1"
                ? { full_prompt: (Array.isArray(input) ? input : [input]).map((m) => ({ role: m?.role ?? m?._getType?.() ?? "message", content: typeof m?.content === "string" ? m.content : JSON.stringify(m?.content ?? m) })) }
                : {})
            }
          },
          async () => invokeWithHardTimeout(target, input, mergedConfig, modelHardTimeoutMs(), step)
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

// Benchmark (2026-06-27): on gpt-5, effort "minimal" (~4s) is FASTER than "low"
// (~7s); default is ~4s. Use minimal everywhere for the latency-sensitive chat path.
const TIER_REASONING_EFFORT = Object.freeze({ classifier: "minimal", planner: "minimal", reasoner: "minimal" });

// Latency control: gpt-5/o-series are reasoning models whose default effort is
// slow. Routing/classification need minimal reasoning; composition a little more.
// Configurable via BRAINSTY_MODEL_REASONING_EFFORT (global) or per-tier env.
function reasoningEffortForTier(tier, context = {}) {
  const env = context.env ?? process.env;
  return (
    context.reasoningEffort ??
    env.BRAINSTY_MODEL_REASONING_EFFORT ??
    env[`BRAINSTY_${tier.toUpperCase()}_REASONING_EFFORT`] ??
    TIER_REASONING_EFFORT[tier] ??
    "low"
  );
}

export function createTieredChatModel(step, context = {}) {
  const selection = selectModelForStep(step, context);
  const options = {
    model: selection.model,
    timeout: context.timeout ?? 60000,
    maxRetries: context.maxRetries ?? 1,
    configuration: { baseURL: selection.baseURL }
  };
  // Only reasoning-capable models accept reasoningEffort.
  if (/^(gpt-5|o\d)/i.test(selection.model)) {
    options.reasoningEffort = reasoningEffortForTier(selection.tier, context);
  }
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
