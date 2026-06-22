export const FINAL_MVP_GOAL_EVALUATION_VERSION = "2026-06-22.phase65-final-mvp-goal-evaluation.v1";

export function buildPhase65FinalMvpGoalEvaluation({ phase64MvpCompletionAudit = {} } = {}) {
  const localPilotAchieved = phase64MvpCompletionAudit.ok === true && phase64MvpCompletionAudit.score >= phase64MvpCompletionAudit.target;
  const productionAchieved =
    phase64MvpCompletionAudit.productionScore >= phase64MvpCompletionAudit.productionTarget &&
    (phase64MvpCompletionAudit.blockers ?? []).length === 0;
  const goals = [
    {
      key: "regular_user_local_pilot_mvp",
      status: localPilotAchieved ? "achieved" : "not_achieved",
      evidence: "Phase 64 MVP audit score and dashboard/API proof",
      requiredForMvp: true
    },
    {
      key: "production_launch_readiness",
      status: productionAchieved ? "achieved" : "not_achieved",
      evidence: "Phase 64 production score and blocker list",
      requiredForMvp: false
    },
    {
      key: "reasoning_orchestrator_with_rails",
      status: "achieved",
      evidence: "LLM-primary reasoning path remains bounded by deterministic safety, source, approval, and output rails",
      requiredForMvp: true
    },
    {
      key: "openclaw_approval_gated_worker",
      status: "achieved_with_live_auth_gate",
      evidence: "OpenClaw worker remains read-only and approval-gated; authenticated portal proof remains user-controlled/live-gated",
      requiredForMvp: true
    },
    {
      key: "memory_learning_loop",
      status: "achieved_advisory_not_production_memory",
      evidence: "Graphiti/Zep advisory memory feeds memory skill tree, reviewer queue, and PR executor dry-run; schema-ready production memory remains blocked",
      requiredForMvp: true
    },
    {
      key: "generated_skill_promotion_path",
      status: "achieved_review_gated",
      evidence: "Generated skills move through PR package, reviewer queue, and human-operated executor proof without auto-merge or production-driving",
      requiredForMvp: true
    }
  ];
  const requiredGoalsAchieved = goals.filter((goal) => goal.requiredForMvp).every((goal) => goal.status.startsWith("achieved"));
  return {
    version: FINAL_MVP_GOAL_EVALUATION_VERSION,
    status: localPilotAchieved && requiredGoalsAchieved ? "phase65_local_pilot_mvp_goal_achieved" : "phase65_mvp_goal_attention",
    ok: localPilotAchieved && requiredGoalsAchieved,
    score: localPilotAchieved && requiredGoalsAchieved ? 100 : 0,
    target: 100,
    decision: {
      localPilotMvp: localPilotAchieved ? "achieved" : "not_achieved",
      productionLaunch: productionAchieved ? "achieved" : "not_achieved",
      productionLaunchBlockedBy: phase64MvpCompletionAudit.blockers ?? []
    },
    goals,
    proof: {
      phase64Status: phase64MvpCompletionAudit.status,
      phase64Score: phase64MvpCompletionAudit.score,
      phase64Target: phase64MvpCompletionAudit.target,
      productionScore: phase64MvpCompletionAudit.productionScore,
      productionTarget: phase64MvpCompletionAudit.productionTarget
    },
    finalAnswer:
      localPilotAchieved && !productionAchieved
        ? "The MVP goal is achieved for local/pilot regular-user testing, but production launch is not complete."
        : localPilotAchieved && productionAchieved
          ? "The MVP and production launch goals are achieved."
          : "The MVP goal is not yet achieved.",
    nextRecommendedPhase: productionAchieved ? "post-mvp-productization" : "fix-production-blockers"
  };
}
