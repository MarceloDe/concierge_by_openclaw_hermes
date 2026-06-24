export const PHASE73_MVP_READINESS_VERSION = "2026-06-22.phase73-first-testable-mvp-readiness.v1";

function phaseOk(proof) {
  return Boolean(proof?.ok && Number(proof.score ?? 0) >= Number(proof.target ?? 100));
}

export function buildPhase73MvpReadinessProof({
  phase66ProductionContract,
  phase67GraphitiSchemaMemory,
  phase68ProductionDatabase,
  phase69BillVerification,
  phase70AuthenticatedOpenClawBillProof,
  phase71BillMemorySkillLoop,
  phase72BillSourcedAnswer,
  storage = {},
  productMemory = {},
  deployment = {},
  liveReadiness = {}
} = {}) {
  const checks = {
    productionContractLocked: phaseOk(phase66ProductionContract),
    graphitiZepSchemaReady: phaseOk(phase67GraphitiSchemaMemory),
    postgresProductionDefaultContractReady: phaseOk(phase68ProductionDatabase),
    billVerificationPwaFlowReady: phaseOk(phase69BillVerification),
    openClawAuthenticatedReadOnlyGateReady: phaseOk(phase70AuthenticatedOpenClawBillProof),
    memoryToSkillLoopReady: phaseOk(phase71BillMemorySkillLoop),
    sourcedAnswerRailsReady: phaseOk(phase72BillSourcedAnswer),
    pwaUserCanTestBillFlow: phase69BillVerification?.pwaSurface === "/mvp" && phase72BillSourcedAnswer?.pwaSurface === "/mvp",
    apiEndpointsReady:
      phase69BillVerification?.endpoint === "/api/bill-verification/analyze" &&
      phase72BillSourcedAnswer?.endpoint === "/api/bill-verification/final-answer",
    dashboardProofReady:
      phase66ProductionContract?.status &&
      phase67GraphitiSchemaMemory?.status &&
      phase68ProductionDatabase?.status &&
      phase69BillVerification?.status &&
      phase70AuthenticatedOpenClawBillProof?.status &&
      phase71BillMemorySkillLoop?.status &&
      phase72BillSourcedAnswer?.status,
    safetyBoundariesPreserved:
      phase69BillVerification?.sample?.safety?.payerContacted === false &&
      phase69BillVerification?.sample?.safety?.formSubmitted === false &&
      phase70AuthenticatedOpenClawBillProof?.approvalBoundary?.humanOnly?.includes("credentials") &&
      phase71BillMemorySkillLoop?.candidate?.activation?.autoProductionDrivingAllowed === false,
    liveClaimsNotOverstated:
      phase72BillSourcedAnswer?.fallback?.mode === "deterministic_fallback" &&
      phase70AuthenticatedOpenClawBillProof?.liveReadiness?.status !== "authenticated_portal_proven"
  };
  const passed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  const productionBlockers = [
    storage?.runtimeDriver === "postgres" ? null : "production_postgres_live_rollout_still_needs_deployed_runtime_smoke",
    productMemory?.enabled && productMemory?.schemaReady ? null : "graphiti_zep_live_runtime_or_phi_cleared_adapter_not_enabled",
    deployment?.hostedBrowserSandboxProviderSteelRemoteHost?.ready ? null : "hosted_remote_browser_remote_host_readiness_not_live_green",
    liveReadiness?.readyForReadOnlyObservation ? null : "authenticated_openclaw_user_signed_in_session_not_live_proven",
    process.env.OPENAI_API_KEY ? null : "live_openai_composition_proof_not_run_without_openai_key"
  ].filter(Boolean);
  return {
    version: PHASE73_MVP_READINESS_VERSION,
    status: passed === total ? "phase73_first_testable_mvp_ready" : "phase73_first_testable_mvp_attention",
    ok: passed === total,
    score: Math.round((passed / total) * 100),
    target: 100,
    checks,
    decision: {
      firstTestableMvpReady: passed === total,
      productionReady: productionBlockers.length === 0,
      regularUserEntry: "/mvp",
      operatorEntry: "/",
      firstWorkflow: "bill_verification_flow"
    },
    testPlan: [
      "Open /mvp.",
      "Paste a bill note into the bill verification block.",
      "Click Analyze Bill.",
      "Verify extracted bill signals, missing evidence, no-login fallback, and final answer appear.",
      "Confirm citations/source pointer IDs are shown and model-composed text is not used unless validation passes.",
      "Use the proof dashboard at / to inspect Phases 66-73 and remaining production blockers."
    ],
    productionBlockers,
    proofEndpoints: [
      "/api/bill-verification/analyze",
      "/api/bill-verification/final-answer",
      "/api/bill-verification/skill-candidate",
      "/api/proof/runs/server-connector-next-mobile-mvp"
    ]
  };
}
