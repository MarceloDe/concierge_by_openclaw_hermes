import test from "node:test";
import assert from "node:assert/strict";
import { buildPhase65FinalMvpGoalEvaluation } from "../concierge/finalMvpGoalEvaluation.mjs";

const phase64PilotReady = {
  ok: true,
  status: "phase64_mvp_pilot_ready_not_production_complete",
  score: 100,
  target: 88,
  productionScore: 0,
  productionTarget: 90,
  blockers: [
    "Postgres production/default rollout remains a production blocker; SQLite is acceptable for local MVP proof.",
    "Graphiti/Zep memory is degraded and remains advisory/degraded until live schema proof is green.",
    "Hosted/remote browser production readiness is not fully green; local/contract proof remains separate.",
    "Authenticated live OpenClaw portal proof is still live-gated and requires a user-controlled signed-in session."
  ]
};

test("Phase 65 final evaluation declares local pilot MVP achieved and production blocked", () => {
  const evaluation = buildPhase65FinalMvpGoalEvaluation({ phase64MvpCompletionAudit: phase64PilotReady });

  assert.equal(evaluation.status, "phase65_local_pilot_mvp_goal_achieved");
  assert.equal(evaluation.ok, true);
  assert.equal(evaluation.score, 100);
  assert.equal(evaluation.decision.localPilotMvp, "achieved");
  assert.equal(evaluation.decision.productionLaunch, "not_achieved");
  assert.equal(evaluation.decision.productionLaunchBlockedBy.length, 4);
  assert.match(evaluation.finalAnswer, /MVP goal is achieved for local\/pilot/);
  assert.equal(evaluation.nextRecommendedPhase, "fix-production-blockers");
});

test("Phase 65 final evaluation does not pass if Phase 64 MVP audit fails", () => {
  const evaluation = buildPhase65FinalMvpGoalEvaluation({
    phase64MvpCompletionAudit: {
      ...phase64PilotReady,
      ok: false,
      score: 75
    }
  });

  assert.equal(evaluation.status, "phase65_mvp_goal_attention");
  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.decision.localPilotMvp, "not_achieved");
});
