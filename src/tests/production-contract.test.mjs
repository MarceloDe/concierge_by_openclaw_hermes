import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildPhase66ProductionContractProof, PHASE66_PRODUCTION_DECISIONS } from "../concierge/productionContract.mjs";

const docs = await readFile(new URL("../../docs/PRODUCTION_CONTRACT_PHASE66.md", import.meta.url), "utf8");
const server = await readFile(new URL("../server/server.mjs", import.meta.url), "utf8");
const app = await readFile(new URL("../app/app.js", import.meta.url), "utf8");

test("Phase 66 production contract locks founder decisions", () => {
  const proof = buildPhase66ProductionContractProof();

  assert.equal(proof.status, "phase66_production_contract_locked");
  assert.equal(proof.ok, true);
  assert.equal(proof.score, 100);
  assert.equal(proof.decisions.productionTarget.firstUser, "patient_member");
  assert.equal(proof.decisions.productionTarget.firstWorkflow, "bill_verification_flow");
  assert.equal(proof.decisions.postgres.productionDefault, true);
  assert.equal(proof.decisions.postgres.retentionYears, 5);
  assert.equal(proof.decisions.graphitiZep.schemaFirst, true);
  assert.equal(proof.decisions.remoteBrowser.firstDeployment, "self_hosted_steel_on_aws_ec2");
  assert.equal(proof.decisions.remoteBrowser.credentialStorageAllowed, false);
  assert.equal(proof.gates.nextPhase, "phase67_graphiti_zep_schema_ready_memory_layer");
});

test("Phase 66 resolves production safety ambiguities conservatively", () => {
  assert.match(PHASE66_PRODUCTION_DECISIONS.postgres.backupRestorePolicy, /encrypted_cloud_backup_restore_drill_required/);
  assert.equal(PHASE66_PRODUCTION_DECISIONS.skills.operatorActivation, "staging_or_reviewed_queue_only");
  assert.match(PHASE66_PRODUCTION_DECISIONS.skills.productionActivation, /versioned_review_pr_audit/);
  assert.equal(PHASE66_PRODUCTION_DECISIONS.safety.noPhiToPublicResearchSources, true);
  assert.equal(PHASE66_PRODUCTION_DECISIONS.openclawAuth.rememberCredentials, false);
  assert.match(PHASE66_PRODUCTION_DECISIONS.openclawAuth.expiredLoginPolicy, /user_reauth_for_fresh_claims/);
});

test("Phase 66 production contract is visible in docs, API proof, and dashboard", () => {
  for (const required of [
    "bill verification flow",
    "encrypted cloud backup",
    "Graphiti/Zep schema-first",
    "self-hosted Steel on AWS",
    "LLM-sourced composition"
  ]) {
    assert.match(docs, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.match(server, /buildPhase66ProductionContractProof/);
  assert.match(server, /phase66_production_contract/);
  assert.match(app, /Phase 66 Production Contract/);
  assert.match(app, /phase66_production_contract/);
});
