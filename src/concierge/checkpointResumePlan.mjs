export const CHECKPOINT_RESUME_PLAN_VERSION = "2026-06-26.phase80-checkpoint-resume-plan.v1";

export function buildCheckpointResumePlan({ contextPacket, rawMessage = {} }) {
  const runtime = contextPacket?.runtimeContext ?? {};
  const latest = runtime.latestCheckpoint ?? runtime.achievedCheckpoints?.[0] ?? null;
  const priorLlmPointers = (contextPacket?.llmOutputIndex?.entries ?? []).slice(0, 8).map((entry) => ({
    outputId: entry.outputId,
    pointer: entry.pointer,
    step: entry.step,
    modelTier: entry.modelTier?.tier ?? entry.modelTier ?? null,
    workflow: entry.parsedSummary?.workflow ?? null,
    intent: entry.parsedSummary?.intent ?? null,
    rawOutputStored: false
  }));
  const requested = Boolean(rawMessage.resumeFromRuntimeContext || rawMessage.resumeFromCheckpoint || rawMessage.approvalToken);
  return {
    version: CHECKPOINT_RESUME_PLAN_VERSION,
    requested,
    available: Boolean(latest),
    strategy: latest ? "resume_from_latest_completed_checkpoint_pointer" : "start_without_prior_checkpoint",
    cacheKey: runtime.cacheKey ?? null,
    manifestHash: runtime.manifestHash ?? null,
    resumeCheckpointId: latest?.checkpointId ?? null,
    latestCompletedStep: latest?.stepName ?? null,
    priorWorkflow: latest?.workflow ?? null,
    priorRouteReason: latest?.routeReason ?? null,
    priorEvidenceObservationStatus: latest?.evidenceObservationStatus ?? null,
    priorSourcePointerCount: latest?.sourcePointerCount ?? 0,
    priorDecisionPointers: runtime.priorDecisionPointers ?? [],
    priorLlmOutputPointers: priorLlmPointers,
    deterministicAuthority: "database_session_checkpoints_remain_authoritative",
    cacheRole: "fast_resume_pointer_manifest_only",
    safeToResumeWithoutReplayingPriorSteps: Boolean(latest)
  };
}
