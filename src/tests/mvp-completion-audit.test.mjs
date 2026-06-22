import test from "node:test";
import assert from "node:assert/strict";
import { buildPhase64MvpCompletionAudit } from "../concierge/mvpCompletionAudit.mjs";

function baseAudit(overrides = {}) {
  return buildPhase64MvpCompletionAudit({
    phase59PilotReadiness: {
      checks: {
        pwaRequestsLiveReasoning: true,
        fastApiEndpointInventoryAvailable: true
      },
      endpointInventory: { fastApiRouteCount: 79, fastApiV1RouteCount: 12, nodeRouteCount: 60 }
    },
    phase60MemorySkillTree: { score: 100 },
    phase61GeneratedSkillPr: { score: 100 },
    phase62GeneratedSkillReviewQueue: { score: 100 },
    phase63GeneratedSkillPrExecutor: {
      score: 100,
      safety: { autoMergeAllowed: false, productionDrivingAllowed: false }
    },
    productMemory: { adapter: "graphiti", enabled: true, status: "degraded", schemaReady: false },
    storage: {
      ok: true,
      runtimeDriver: "sqlite",
      postgres: { productionProfileReady: false, defaultRolloutReady: false }
    },
    deployment: {
      hostedBrowserSandboxProviderStatus: "contract_ready",
      hostedBrowserSandboxProviderSteelRemoteHost: { status: "remote_host_attention" }
    },
    liveReadiness: {
      status: "login_required",
      nextAction: "manual_sign_in_required",
      readyForReadOnlyObservation: false
    },
    counts: {
      users: 1,
      sessions: 1,
      audit_events: 1,
      generated_skill_review_queue: 1,
      generated_skill_pr_executor_runs: 1,
      source_pointers: 1,
      tasks: 1,
      approvals: 1,
      memory_items: 1,
      workflow_runs: 1
    },
    ...overrides
  });
}

test("Phase 64 audit distinguishes regular-user MVP readiness from production completion", () => {
  const audit = baseAudit();

  assert.equal(audit.status, "phase64_mvp_pilot_ready_not_production_complete");
  assert.equal(audit.ok, true);
  assert.equal(audit.score, 100);
  assert.equal(audit.productionScore < audit.productionTarget, true);
  assert.equal(audit.userMvp.readyForRegularUserPilot, true);
  assert.equal(audit.memoryPosture.advisoryOnly, true);
  assert.equal(audit.blockers.some((blocker) => blocker.includes("Postgres production")), true);
  assert.equal(audit.blockers.some((blocker) => blocker.includes("Graphiti/Zep")), true);
  assert.equal(audit.blockers.some((blocker) => blocker.includes("OpenClaw")), true);
});

test("Phase 64 audit fails attention when core PWA or connector gates are missing", () => {
  const audit = baseAudit({
    phase59PilotReadiness: {
      checks: {
        pwaRequestsLiveReasoning: false,
        fastApiEndpointInventoryAvailable: false
      },
      endpointInventory: { fastApiRouteCount: 0, fastApiV1RouteCount: 0, nodeRouteCount: 0 }
    }
  });

  assert.equal(audit.status, "phase64_mvp_attention");
  assert.equal(audit.ok, false);
  assert.equal(audit.checks.regularUserPwaReady, false);
  assert.equal(audit.checks.connectorApiReady, false);
});
