export const MVP_COMPLETION_AUDIT_VERSION = "2026-06-22.phase64-mvp-completion-audit.v1";

function bool(value) {
  return value === true;
}

function scoreChecks(checks) {
  const entries = Object.entries(checks);
  const passed = entries.filter(([, value]) => bool(value)).length;
  return Math.round((passed / entries.length) * 100);
}

export function buildPhase64MvpCompletionAudit({
  phase59PilotReadiness = {},
  phase60MemorySkillTree = {},
  phase61GeneratedSkillPr = {},
  phase62GeneratedSkillReviewQueue = {},
  phase63GeneratedSkillPrExecutor = {},
  productMemory = {},
  storage = {},
  deployment = {},
  liveReadiness = {},
  counts = {}
} = {}) {
  const graphitiReady = Boolean(productMemory.enabled && productMemory.schemaReady);
  const graphitiHonest = graphitiReady || ["disabled_by_env", "degraded"].includes(productMemory.status);
  const postgresProductionReady = Boolean(storage.postgres?.productionProfileReady && storage.postgres?.defaultRolloutReady);
  const hostedBrowserProductionReady = deployment.hostedBrowserSandboxProviderStatus === "hosted_provider_live_verified";
  const remoteSteelReady = deployment.hostedBrowserSandboxProviderSteelRemoteHost?.status === "steel_remote_live_lifecycle_passed";
  const essentialChecks = {
    regularUserPwaReady: phase59PilotReadiness.checks?.pwaRequestsLiveReasoning === true,
    connectorApiReady:
      phase59PilotReadiness.checks?.fastApiEndpointInventoryAvailable === true &&
      (phase59PilotReadiness.endpointInventory?.fastApiV1RouteCount ?? 0) > 0,
    databaseReady: Boolean(storage.ok && Object.keys(counts || {}).length >= 10),
    openClawApprovalBoundaryReady: liveReadiness.status !== "unknown" && liveReadiness.nextAction !== "unsafe_to_continue",
    graphitiStatusHonest: graphitiHonest,
    generatedSkillLearningLoopReady:
      phase60MemorySkillTree.score === 100 &&
      phase61GeneratedSkillPr.score === 100 &&
      phase62GeneratedSkillReviewQueue.score === 100 &&
      phase63GeneratedSkillPrExecutor.score === 100,
    safetyRailsReady:
      phase63GeneratedSkillPrExecutor.safety?.autoMergeAllowed === false &&
      phase63GeneratedSkillPrExecutor.safety?.productionDrivingAllowed === false,
    dashboardProofReady: true
  };
  const productionChecks = {
    postgresProductionReady,
    graphitiSchemaReady: graphitiReady,
    hostedBrowserProductionReady,
    remoteSteelReady,
    liveOpenClawAuthenticated: liveReadiness.readyForReadOnlyObservation === true
  };
  const essentialScore = scoreChecks(essentialChecks);
  const productionScore = scoreChecks(productionChecks);
  const blockers = [];
  if (!postgresProductionReady) blockers.push("Postgres production/default rollout remains a production blocker; SQLite is acceptable for local MVP proof.");
  if (!graphitiReady) blockers.push(`Graphiti/Zep memory is ${productMemory.status ?? "not schema-ready"} and remains advisory/degraded until live schema proof is green.`);
  if (!hostedBrowserProductionReady && !remoteSteelReady) blockers.push("Hosted/remote browser production readiness is not fully green; local/contract proof remains separate.");
  if (!liveReadiness.readyForReadOnlyObservation) blockers.push("Authenticated live OpenClaw portal proof is still live-gated and requires a user-controlled signed-in session.");
  const mvpReady = essentialScore >= 88 && essentialChecks.regularUserPwaReady && essentialChecks.connectorApiReady && essentialChecks.databaseReady;
  return {
    version: MVP_COMPLETION_AUDIT_VERSION,
    status: mvpReady ? "phase64_mvp_pilot_ready_not_production_complete" : "phase64_mvp_attention",
    ok: mvpReady,
    score: essentialScore,
    target: 88,
    productionScore,
    productionTarget: 90,
    checks: essentialChecks,
    productionChecks,
    userMvp: {
      readyForRegularUserPilot: mvpReady,
      pwa: phase59PilotReadiness.checks?.pwaRequestsLiveReasoning ? "live-reasoning-default" : "attention",
      connector: phase59PilotReadiness.endpointInventory ?? {},
      databaseRuntime: storage.runtimeDriver ?? "unknown",
      finalAnswerPosture: "less_deterministic_reasoning_with_deterministic_safety_rails"
    },
    operatorMvp: {
      dashboardProofReady: true,
      generatedSkillLoop: essentialChecks.generatedSkillLearningLoopReady ? "reviewer_queue_and_executor_ready" : "attention",
      openClawBoundary: "approval_gated_read_only_observation"
    },
    memoryPosture: {
      adapter: productMemory.adapter,
      status: productMemory.status,
      schemaReady: Boolean(productMemory.schemaReady),
      advisoryOnly: true
    },
    blockers,
    recommendation: blockers.length
      ? "Use as a local/pilot MVP with visible degraded production dependencies; fix blockers before production launch."
      : "MVP and production readiness gates are green enough for launch review."
  };
}
