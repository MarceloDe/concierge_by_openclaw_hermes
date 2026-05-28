import test from "node:test";
import assert from "node:assert/strict";
import { loadOpenClawSkillArtifact } from "../concierge/openclawSkillArtifacts.mjs";
import { validateOpenClawEnvelopeAgainstSkill } from "../concierge/openclawSkillInvocation.mjs";
import {
  buildLangGraphOpenClawWorkerPlan,
  buildOpenClawWorkerJob,
  buildOpenClawWorkerResultTemplate,
  DEFAULT_OPENCLAW_RUNTIME_TARGET,
  validateOpenClawWorkerPlan
} from "../concierge/openclawWorkerContract.mjs";

function baseEnvelope(overrides = {}) {
  return {
    envelope_type: "openclaw_channel_task",
    user_id: "user_test",
    session_id: "session_test",
    channel: "local_web_chat",
    raw_input: {
      source: "test",
      approvalScope: "read_only_observation"
    },
    user_input: "Review eligibility and benefits in read-only mode.",
    portal_url: "https://www.aetna.com/",
    workflow_architecture: {
      route_candidates: [{ workflowKey: "eligibility_benefits_navigation", journeyStage: "coverage_understanding" }],
      knowledge_sources: [],
      openclaw_skills: [{ skill_key: "insurance_portal_browser" }]
    },
    db_pointers: [],
    approval_policy: {
      external_messaging: "requires_explicit_approval_gate",
      payer_communication: "requires_explicit_approval_gate",
      credential_entry: "user_only",
      medical_advice: "not_allowed"
    },
    ...overrides
  };
}

test("OpenClaw worker job keeps LangGraph as workflow master while empowering task execution", async () => {
  const artifact = await loadOpenClawSkillArtifact("insurance_portal_browser");
  const envelope = baseEnvelope();
  const validation = validateOpenClawEnvelopeAgainstSkill(envelope, artifact);
  const job = buildOpenClawWorkerJob(envelope, validation);

  assert.equal(job.status, "pending_approval");
  assert.equal(job.executionMode, "proposal_only");
  assert.equal(job.orchestrator.owner, "langgraph");
  assert.equal(job.worker.profile, DEFAULT_OPENCLAW_RUNTIME_TARGET.profile);
  assert.equal(job.worker.agentId, DEFAULT_OPENCLAW_RUNTIME_TARGET.agentId);
  assert.equal(job.deterministicControls.workflowMaster, "langgraph");
  assert.equal(job.deterministicControls.workerMayChooseWorkflow, false);
  assert.equal(job.deterministicControls.workerMayCreateSubtasks, true);
  assert.equal(job.deterministicControls.workerMayRunTaskScopedSubagents, true);
  assert.equal(job.deterministicControls.workerMayRetainWorkerMemory, true);
  assert.equal(job.deterministicControls.workerMayUpdateHeartbeat, true);
  assert.equal(job.deterministicControls.workerMayCreateTaskScopedSkills, true);
  assert.equal(job.deterministicControls.workerMayChooseToolPathWithinAssignedTask, true);
  assert.equal(job.deterministicControls.workerMayOpenAdditionalBrowserInstances, true);
  assert.equal(job.deterministicControls.workerMayTryReadOnlyApisAndScrapers, true);
  assert.equal(job.progressProtocol.reportEverySeconds, 30);
  assert.equal(job.progressProtocol.silentFailureAllowed, false);
  assert.equal(job.workerMemoryPolicy.receiveGraphitiMemoryContext, true);
  assert.equal(job.workerMemoryPolicy.finalMemoryWritesRequireLangGraphIngest, true);
  assert.deepEqual(job.actionsTaken, []);
});

test("OpenClaw worker plan is parallel-ready but not dispatched", async () => {
  const artifact = await loadOpenClawSkillArtifact("insurance_portal_browser");
  const envelope = baseEnvelope();
  const validation = validateOpenClawEnvelopeAgainstSkill(envelope, artifact);
  const plan = buildLangGraphOpenClawWorkerPlan(envelope, validation);
  const planValidation = validateOpenClawWorkerPlan(plan);

  assert.equal(planValidation.valid, true, planValidation.issues.join("; "));
  assert.equal(plan.owner, "langgraph");
  assert.equal(plan.dispatchStatus, "not_dispatched");
  assert.equal(plan.fanOut.mode, "langgraph_owned_parallel_ready");
  assert.equal(plan.fanOut.dispatchPolicy, "only_after_validated_proposal_and_explicit_approval");
  assert.equal(plan.fanIn.owner, "langgraph");
  assert.equal(plan.workerJobs.length, 1);
  assert.deepEqual(plan.actionsTaken, []);
});

test("OpenClaw worker result template requires no actions before execution", async () => {
  const artifact = await loadOpenClawSkillArtifact("insurance_portal_browser");
  const envelope = baseEnvelope();
  const validation = validateOpenClawEnvelopeAgainstSkill(envelope, artifact);
  const job = buildOpenClawWorkerJob(envelope, validation);
  const result = buildOpenClawWorkerResultTemplate(job);

  assert.equal(result.status, "not_executed_pending_approval");
  assert.equal(result.jobId, job.jobId);
  assert.equal(result.correlationId, job.correlationId);
  assert.deepEqual(result.statusUpdates, []);
  assert.deepEqual(result.subtasks, []);
  assert.deepEqual(result.workerMemoryUpdates, []);
  assert.deepEqual(result.actionsTaken, []);
  assert.ok(result.risksOrBlockers.includes("official_openclaw_worker_not_dispatched"));
});

test("blocked validation produces blocked worker plan without dispatch", async () => {
  const artifact = await loadOpenClawSkillArtifact("insurance_portal_browser");
  const envelope = baseEnvelope({
    user_input: "Log in with my password and submit this form."
  });
  const validation = validateOpenClawEnvelopeAgainstSkill(envelope, artifact);
  const plan = buildLangGraphOpenClawWorkerPlan(envelope, validation);

  assert.equal(validation.valid, false);
  assert.equal(plan.status, "blocked_contract");
  assert.equal(plan.dispatchStatus, "not_dispatched");
  assert.equal(plan.workerJobs[0].status, "blocked_contract");
  assert.deepEqual(plan.workerJobs[0].actionsTaken, []);
});
