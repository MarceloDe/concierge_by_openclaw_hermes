import test from "node:test";
import assert from "node:assert/strict";
import { loadOpenClawSkillRegistry } from "../concierge/openclaw/skillRegistry.mjs";
import { selectExecutorForSkill, selectExecutorForTool, validateExecutorTask } from "../concierge/openclaw/executorRegistry.mjs";
import { buildOpenClawBoundedTaskProposal, evaluateOpenClawWorkerPolicy } from "../concierge/openclaw/workerPolicy.mjs";
import { listOpenClawSkillArtifacts, loadOpenClawSkillArtifact } from "../concierge/openclawSkillArtifacts.mjs";

test("OpenClaw skill registry loads multiple skills without hardcoded artifact edits", async () => {
  const registry = await loadOpenClawSkillRegistry();
  const keys = registry.skills.map((skill) => skill.skillKey);
  assert.ok(keys.includes("insurance_portal_browser"));
  assert.ok(keys.includes("claim_journey_temporary"));
  assert.ok(keys.includes("insurance_plan_aetna_temporary"));
  assert.ok(registry.skills.every((skill) => skill.validation.valid), JSON.stringify(registry.skills.map((skill) => skill.validation)));

  const artifacts = await listOpenClawSkillArtifacts();
  assert.ok(artifacts.artifacts.length >= 3);
  assert.ok((await loadOpenClawSkillArtifact("claim_journey_temporary")).validation.valid);
});

test("executor registry keeps OpenClaw bounded by LangGraph approval policy", async () => {
  const registry = await loadOpenClawSkillRegistry();
  const browserSkill = registry.skills.find((skill) => skill.skillKey === "insurance_portal_browser");
  const executor = selectExecutorForSkill(browserSkill);
  assert.equal(executor.ok, true);
  assert.equal(executor.executorKey, "read_only_browser");
  assert.equal(executor.writeActionsEnabled, false);

  // Phase 87 (§7): the write gate is the tool_registry-declared write_capable flag —
  // the signature-gated claim-submission worker is write-capable and blocked.
  const blocked = validateExecutorTask({ skill: browserSkill, executor, action: "submit_claim_form", toolKey: "openclaw_claim_submission_worker" });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.issues.includes("write_or_external_action_disabled"));
  assert.ok(blocked.issues.includes("approval_required"));
  assert.ok(blocked.issues.includes("write_action_requires_bound_approval"));

  // Previously FALSE-BLOCKED by the verb regex ("contact"): a read-only action whose
  // NAME contains a verb now validates when its tool is read-only.
  const readOnly = validateExecutorTask({
    skill: browserSkill,
    executor,
    action: "payer_portal_reader.extract_provider_contact_details",
    toolKey: "payer_portal_reader",
    approvalToken: "approval:read_only_scope"
  });
  assert.equal(readOnly.ok, true, `read-only verb-named action must validate: ${readOnly.issues.join(",")}`);

  // Unknown tool fails LOUD, never a silent bucket.
  const unknown = selectExecutorForTool("tool_that_does_not_exist");
  assert.equal(unknown.ok, false);
  assert.equal(unknown.status, "executor_missing");
  // NULL-executor write workers cannot dispatch by data.
  const writeWorker = selectExecutorForTool("openclaw_claim_submission_worker");
  assert.equal(writeWorker.ok, false);
  assert.equal(writeWorker.status, "executor_missing");

  const policy = evaluateOpenClawWorkerPolicy({
    skill: browserSkill,
    executorSelection: executor,
    task: { goal: "submit an appeal to the payer" }
  });
  assert.equal(policy.allowed, false);
  assert.equal(policy.openClawMayChooseJourney, false);
});

test("bounded OpenClaw task proposal routes multiple skills through registry without write authority", async () => {
  const registry = await loadOpenClawSkillRegistry();
  const proposal = buildOpenClawBoundedTaskProposal({
    registry,
    workflow: "claim_status_navigation",
    dynamicSkillContext: {
      selected: {
        insuranceSkillKey: "insurance_plan_aetna_temporary",
        journeySkillKey: "claim_journey_temporary",
        executionSkillKey: "insurance_portal_browser"
      },
      requiredEvidence: ["claim_identifier", "service_date"],
      missingData: ["claim_source_pointer"],
      requiredOpenClawTasks: ["insurance_portal_browser.read_only_claims_observation"]
    },
    task: {
      action: "insurance_portal_browser.read_only_claims_observation",
      goal: "Find read-only claim status evidence from the assigned portal context."
    }
  });

  assert.equal(proposal.contract, "brainstyworkers.openclaw.bounded_task_proposal.v1");
  assert.equal(proposal.workflow, "claim_status_navigation");
  assert.equal(proposal.selectedSkill.skillKey, "insurance_portal_browser");
  assert.equal(proposal.selectedExecutor.executorKey, "read_only_browser");
  assert.equal(proposal.openClawMayChooseJourney, false);
  assert.equal(proposal.openClawMayProposeSubtasks, true);
  assert.equal(proposal.openClawMayExecuteWriteActions, false);
  assert.equal(proposal.actionsTaken.length, 0);
  assert.deepEqual(
    proposal.routedSkills.map((skill) => skill.skillKey),
    ["insurance_plan_aetna_temporary", "claim_journey_temporary", "insurance_portal_browser"]
  );
  assert.ok(proposal.proposedSubtasks.some((task) => task.subtaskKey === "execute_only_after_approval"));
  assert.ok(proposal.requiredEvidence.includes("claim_source_pointer"));
  assert.equal(proposal.terminalOutcome, "needs_approval_before_execution");
});

test("bounded OpenClaw task proposal blocks write or external action requests", async () => {
  const registry = await loadOpenClawSkillRegistry();
  const proposal = buildOpenClawBoundedTaskProposal({
    registry,
    workflow: "denial_appeal_preparation",
    dynamicSkillContext: {
      selected: {
        insuranceSkillKey: "insurance_plan_aetna_temporary",
        journeySkillKey: "claim_journey_temporary",
        executionSkillKey: "insurance_portal_browser"
      },
      requiredOpenClawTasks: ["insurance_portal_browser.read_only_claims_observation"]
    },
    task: {
      action: "submit_appeal_form",
      goal: "Submit an appeal to the payer."
    }
  });

  assert.equal(proposal.status, "proposal_blocked");
  assert.equal(proposal.openClawMayExecuteWriteActions, false);
  assert.ok(proposal.blockedActions.includes("blocked_or_controlled_action_requested"));
  assert.equal(proposal.terminalOutcome, "not_possible_policy_or_approval_block");
});
