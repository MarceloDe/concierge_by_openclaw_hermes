import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildPhase70AuthenticatedOpenClawBillProof } from "../concierge/authenticatedOpenClawBillProof.mjs";
import { buildPhase69BillVerificationProof } from "../concierge/billVerification.mjs";
import { buildPhase71BillMemorySkillLoopProof } from "../concierge/billMemorySkillLoop.mjs";
import { buildPhase72BillSourcedAnswerProof } from "../concierge/billSourcedAnswer.mjs";
import { buildPhase73MvpReadinessProof } from "../concierge/phase73MvpReadiness.mjs";
import { buildPhase67GraphitiSchemaMemoryProof } from "../concierge/graphitiSchemaMemory.mjs";
import { buildPhase68ProductionDatabaseProof } from "../concierge/productionDatabaseReadiness.mjs";
import { buildPhase66ProductionContractProof } from "../concierge/productionContract.mjs";

test("phase 73 declares first testable MVP ready while keeping production blockers explicit", async () => {
  const proof = buildPhase73MvpReadinessProof({
    phase66ProductionContract: buildPhase66ProductionContractProof(),
    phase67GraphitiSchemaMemory: buildPhase67GraphitiSchemaMemoryProof(),
    phase68ProductionDatabase: buildPhase68ProductionDatabaseProof(),
    phase69BillVerification: buildPhase69BillVerificationProof(),
    phase70AuthenticatedOpenClawBillProof: buildPhase70AuthenticatedOpenClawBillProof({
      liveReadiness: { status: "live_gate_ready_user_login_required", readyForReadOnlyObservation: false }
    }),
    phase71BillMemorySkillLoop: buildPhase71BillMemorySkillLoopProof(),
    phase72BillSourcedAnswer: await buildPhase72BillSourcedAnswerProof(),
    storage: { runtimeDriver: "sqlite" },
    productMemory: { enabled: false, schemaReady: false },
    deployment: { hostedBrowserSandboxProviderSteelRemoteHost: { ready: false } },
    liveReadiness: { readyForReadOnlyObservation: false }
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.score, 100);
  assert.equal(proof.decision.firstTestableMvpReady, true);
  assert.equal(proof.decision.productionReady, false);
  assert.ok(proof.productionBlockers.includes("production_postgres_live_rollout_still_needs_deployed_runtime_smoke"));
  assert.ok(proof.productionBlockers.includes("authenticated_openclaw_user_signed_in_session_not_live_proven"));
  assert.ok(proof.proofEndpoints.includes("/api/bill-verification/final-answer"));
});

test("phase 73 proof is exposed through server and dashboard surfaces", async () => {
  const server = await readFile(new URL("../server/server.mjs", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../app/app.js", import.meta.url), "utf8");

  assert.match(server, /phase73_first_testable_mvp_readiness/);
  assert.match(server, /\/api\/mvp\/readiness/);
  assert.match(dashboard, /Phase 73 First Testable MVP Readiness/);
});
