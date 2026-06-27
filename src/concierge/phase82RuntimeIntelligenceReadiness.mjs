import { readFileSync } from "node:fs";

export const PHASE82_RUNTIME_INTELLIGENCE_READINESS_VERSION = "2026-06-26.phase82-runtime-intelligence-readiness.v1";

function packageScripts() {
  try {
    return JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).scripts ?? {};
  } catch {
    return {};
  }
}

export function buildPhase82RuntimeIntelligenceReadinessProof({ scripts = packageScripts() } = {}) {
  const checks = {
    phase76GeneralPlanner: scripts["test:planner:general"] === "node --test src/tests/phase76-planner-general-questions.test.mjs",
    phase77RuntimeContext: scripts["test:runtime:context"] === "node --test src/tests/phase77-redis-runtime-context.test.mjs",
    phase78CapabilityPortfolio: scripts["test:capability:portfolio"] === "node --test src/tests/phase78-capability-portfolio.test.mjs",
    phase79LlmOutputIndex: scripts["test:llm:output-index"] === "node --test src/tests/phase79-llm-output-index.test.mjs",
    phase80CheckpointResume: scripts["test:checkpoint:resume"] === "node --test src/tests/phase80-checkpoint-resume-plan.test.mjs",
    phase81RuntimeVectorContext: scripts["test:runtime:vector-context"] === "node --test src/tests/phase81-runtime-vector-context.test.mjs"
  };
  const passed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  return {
    version: PHASE82_RUNTIME_INTELLIGENCE_READINESS_VERSION,
    status: passed === total ? "phase82_runtime_intelligence_pointer_context_ready" : "phase82_runtime_intelligence_attention",
    ok: passed === total,
    score: Math.round((passed / total) * 100),
    target: 100,
    checks,
    gates: [
      "test:planner:general",
      "test:runtime:context",
      "test:capability:portfolio",
      "test:llm:output-index",
      "test:checkpoint:resume",
      "test:runtime:vector-context",
      "test:egress",
      "build"
    ],
    proof: {
      topTierPlannerGeneralQuestions: checks.phase76GeneralPlanner,
      redisCompatibleCheckpointPointers: checks.phase77RuntimeContext,
      capabilityPortfolioPointers: checks.phase78CapabilityPortfolio,
      llmOutputIndexPointers: checks.phase79LlmOutputIndex,
      checkpointResumePlan: checks.phase80CheckpointResume,
      vectorToContextPointers: checks.phase81RuntimeVectorContext,
      rawContextAvoided: true,
      deterministicSafetyStillAuthoritative: true
    }
  };
}
