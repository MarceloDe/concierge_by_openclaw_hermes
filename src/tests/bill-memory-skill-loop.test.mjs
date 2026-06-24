import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  buildPhase71BillMemorySkillLoopProof,
  createBillVerificationMemoryEpisode,
  createBillVerificationSkillCandidate
} from "../concierge/billMemorySkillLoop.mjs";
import { analyzeBillVerificationInput } from "../concierge/billVerification.mjs";

test("phase 71 creates ref-only memory episode from a successful bill case", () => {
  const analysis = analyzeBillVerificationInput({
    text: "Provider: North Clinic\nAmount due: $92.10\nPayer: Aetna\nClaim number: CLM-881122",
    sessionId: "phase71-test"
  });
  const episode = createBillVerificationMemoryEpisode({ billAnalysis: analysis });

  assert.equal(episode.targetGoal, "understand_bill");
  assert.equal(episode.status, "closed_resolved");
  assert.equal(episode.graphitiEpisode.phiPayloadStored, false);
  assert.equal(episode.graphitiEpisode.rawBillTextStored, false);
  assert.deepEqual(episode.graphitiEpisode.sourceProvenance, [analysis.sourcePointer.id]);
  assert.ok(episode.loopIterations.length >= 2);
  assert.equal(episode.outcomeMetric.patientConfirmationRequired, true);
});

test("phase 71 skill candidate is review gated and production driving blocked", () => {
  const candidate = createBillVerificationSkillCandidate();

  assert.equal(candidate.status, "operator_review_required");
  assert.equal(candidate.proposedSkillKey, "bill_verification_flow");
  assert.equal(candidate.activation.stagingOperatorActivationAllowed, true);
  assert.equal(candidate.activation.productionActivationRequiresPrMerge, true);
  assert.equal(candidate.activation.autoProductionDrivingAllowed, false);
  assert.equal(candidate.activation.killSwitchRequired, true);
  assert.ok(candidate.contents.tools.includes("payer_portal_consult"));
  assert.ok(candidate.contents.verifiers.includes("approval_gate_required_for_portal"));
  assert.ok(candidate.contents.memoryRetrievalRules.some((rule) => rule.includes("get_loop_for_target")));
  assert.ok(candidate.contents.tests.includes("no_phi_to_public_research"));
});

test("phase 71 proof and surfaces expose the bill memory skill loop", async () => {
  const proof = buildPhase71BillMemorySkillLoopProof();
  const server = await readFile(new URL("../server/server.mjs", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../app/app.js", import.meta.url), "utf8");

  assert.equal(proof.ok, true);
  assert.equal(proof.score, 100);
  assert.equal(proof.checks.episodeStoresRefsOnly, true);
  assert.equal(proof.checks.operatorReviewRequired, true);
  assert.equal(proof.checks.productionDrivingBlocked, true);
  assert.match(server, /phase71_bill_memory_skill_loop/);
  assert.match(server, /\/api\/bill-verification\/skill-candidate/);
  assert.match(dashboard, /Phase 71 Bill Memory Skill Loop/);
});
