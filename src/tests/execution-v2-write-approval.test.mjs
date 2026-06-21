import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import {
  consumeWriteActionApproval,
  createWriteActionApproval,
  WRITE_ACTION_EXECUTION_MODE
} from "../concierge/approvalResume.mjs";
import { evaluatePortalAction } from "../concierge/policy.mjs";
import { runOfficialOpenClawApprovedWriteAction } from "../concierge/openclawOfficialRuntime.mjs";
import { runLlmManagerWorkerProposal } from "../concierge/llmManagerWorker.mjs";
import {
  buildLangGraphOpenClawWorkerPlan,
  buildOpenClawWorkerJob,
  validateOpenClawWorkerPlan
} from "../concierge/openclawWorkerContract.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-execution-v2-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

async function createTask(store, { user, session, workflow = "eligibility_benefits_navigation" }) {
  const now = nowIso();
  const task = {
    id: createId("task"),
    user_id: user.id,
    session_id: session.id,
    workflow_key: workflow,
    journey_stage: "coverage_understanding",
    task_type: "openclaw_execution_v2_write_action",
    status: "pending_write_approval",
    priority: "high",
    description: "Synthetic Execution V2 write action approval task.",
    source_table: null,
    source_id: null,
    scheduled_job_id: null,
    due_at: null,
    metadata_json: "{}",
    created_at: now,
    updated_at: now
  };
  await store.insert("agent_tasks", task);
  return task;
}

function submitAction(overrides = {}) {
  return {
    actionType: "submit_prior_authorization_form",
    targetUrl: "https://portal.example.test/prior-auth/submit",
    method: "POST",
    fields: {
      diagnosisCode: "safe_pointer:diagnosis",
      procedureCode: "safe_pointer:procedure"
    },
    humanReadableSummary: "Submit one prior authorization form from reviewed source-pointer fields.",
    ...overrides
  };
}

test("Execution V2 write approval is exact-url, exact-action, expiring, and single-use", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const workflow = "prior_authorization";
  const task = await createTask(store, { user, session, workflow });
  const approval = await createWriteActionApproval(store, {
    taskId: task.id,
    sessionId: session.id,
    userId: user.id,
    workflow,
    actionSchema: submitAction(),
    expiresInMinutes: 15
  });
  assert.equal(approval.ok, true);
  assert.equal(approval.approval.executionMode, WRITE_ACTION_EXECUTION_MODE);

  const wrongUrl = await consumeWriteActionApproval(store, {
    approvalToken: approval.approvalToken,
    taskId: task.id,
    sessionId: session.id,
    userId: user.id,
    workflow,
    actionSchema: submitAction({ targetUrl: "https://portal.example.test/prior-auth/other" })
  });
  assert.equal(wrongUrl.ok, false);
  assert.equal(wrongUrl.status, "approval_binding_mismatch");

  const consumed = await consumeWriteActionApproval(store, {
    approvalToken: approval.approvalToken,
    taskId: task.id,
    sessionId: session.id,
    userId: user.id,
    workflow,
    actionSchema: submitAction()
  });
  assert.equal(consumed.ok, true);
  assert.equal(consumed.status, "approved_consumed");
  assert.deepEqual(consumed.actionsTaken, ["approved_single_write_action_token_consumed"]);

  const replay = await consumeWriteActionApproval(store, {
    approvalToken: approval.approvalToken,
    taskId: task.id,
    sessionId: session.id,
    userId: user.id,
    workflow,
    actionSchema: submitAction()
  });
  assert.equal(replay.ok, false);
  assert.equal(replay.status, "approval_already_consumed");

  const expiredApproval = await createWriteActionApproval(store, {
    taskId: task.id,
    sessionId: session.id,
    userId: user.id,
    workflow,
    actionSchema: submitAction({ targetUrl: "https://portal.example.test/prior-auth/expired" }),
    expiresInMinutes: -1
  });
  const expired = await consumeWriteActionApproval(store, {
    approvalToken: expiredApproval.approvalToken,
    taskId: task.id,
    sessionId: session.id,
    userId: user.id,
    workflow,
    actionSchema: submitAction({ targetUrl: "https://portal.example.test/prior-auth/expired" })
  });
  assert.equal(expired.ok, false);
  assert.equal(expired.status, "approval_expired");

  const auditRows = await store.all("SELECT event_type FROM audit_events WHERE session_id = ? ORDER BY rowid ASC;", [session.id]);
  const auditTypes = auditRows.map((row) => row.event_type);
  assert.ok(auditTypes.includes("openclaw_single_write_action_approval_recorded"));
  assert.ok(auditTypes.includes("openclaw_single_write_action_approval_blocked"));
  assert.ok(auditTypes.includes("openclaw_single_write_action_approval_consumed"));
});

test("portal action policy fails closed unless consumed write approval matches exact action", async () => {
  assert.equal(evaluatePortalAction("submit prior authorization").allowed, false);
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const workflow = "prior_authorization";
  const task = await createTask(store, { user, session, workflow });
  const approval = await createWriteActionApproval(store, {
    taskId: task.id,
    sessionId: session.id,
    userId: user.id,
    workflow,
    actionSchema: submitAction()
  });
  const consumed = await consumeWriteActionApproval(store, {
    approvalToken: approval.approvalToken,
    taskId: task.id,
    sessionId: session.id,
    userId: user.id,
    workflow,
    actionSchema: submitAction()
  });
  const policy = evaluatePortalAction({
    action: "submit prior authorization",
    targetUrl: submitAction().targetUrl,
    actionSchema: submitAction(),
    approvalToken: consumed
  });
  assert.equal(policy.allowed, true);
  assert.equal(policy.executionMode, WRITE_ACTION_EXECUTION_MODE);
});

test("official approved-write runtime is off by default and llm manager cannot bypass gate", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const workflow = "prior_authorization";
  const task = await createTask(store, { user, session, workflow });
  const blockedRuntime = await runOfficialOpenClawApprovedWriteAction({
    store,
    session,
    taskId: task.id,
    userId: user.id,
    workflow,
    approvalToken: null,
    actionSchema: submitAction(),
    executionV2: {
      workerRuntime: "deterministic",
      writeEnabled: false,
      killSwitchEngaged: false
    }
  });
  assert.equal(blockedRuntime.ok, false);
  assert.equal(blockedRuntime.status, "execution_v2_write_gate_disabled");

  const llmBlocked = await runLlmManagerWorkerProposal({
    store,
    sessionId: session.id,
    taskId: task.id,
    userId: user.id,
    workflow,
    proposedAction: {
      action: "submit prior authorization",
      targetUrl: submitAction().targetUrl,
      actionSchema: submitAction()
    },
    env: {
      BRAINSTY_WORKER_RUNTIME: "llm_manager",
      WEFELLA_EXECUTION_WRITE_ENABLED: "1"
    }
  });
  assert.equal(llmBlocked.ok, false);
  assert.equal(llmBlocked.status, "llm_manager_write_blocked_by_approval_gate");
  assert.equal(llmBlocked.policy.allowed, false);

  const auditRows = await store.all("SELECT event_type FROM audit_events WHERE session_id = ? ORDER BY rowid ASC;", [session.id]);
  assert.ok(auditRows.some((row) => row.event_type === "official_openclaw_single_write_action_attempted"));
  assert.ok(auditRows.some((row) => row.event_type === "official_openclaw_single_write_action_blocked"));
  assert.ok(auditRows.some((row) => row.event_type === "llm_manager_worker_action_proposed"));
});

test("OpenClaw worker contract grants submit only per job with a bound write approval", () => {
  const validation = {
    valid: true,
    executionMode: "proposal_only",
    skillKey: "insurance_portal_browser",
    requiredInputs: {
      workflow_key: "prior_authorization",
      approval_scope: "approved_single_write_action",
      portal_url: "https://portal.example.test/"
    },
    approvalGates: {},
    approvalsRequired: [],
    fallbackPath: [],
    stopConditions: [],
    risksOrBlockers: []
  };
  const envelope = {
    user_id: "user_test",
    session_id: "session_test",
    channel: "local_web_chat",
    user_input: "Submit the reviewed prior authorization.",
    portal_url: "https://portal.example.test/",
    raw_input: {}
  };
  const defaultJob = buildOpenClawWorkerJob(envelope, validation);
  assert.equal(defaultJob.deterministicControls.workerMayEnterCredentials, false);
  assert.equal(defaultJob.deterministicControls.workerMayContactPayer, false);
  assert.equal(defaultJob.deterministicControls.workerMaySubmitForms, false);

  const writeJob = buildOpenClawWorkerJob(envelope, validation, {
    boundWriteApproval: {
      approvalGateId: "gate_write_1",
      actionSchemaDigest: "digest_1",
      targetUrl: "https://portal.example.test/prior-auth/submit",
      executionMode: WRITE_ACTION_EXECUTION_MODE
    }
  });
  assert.equal(writeJob.deterministicControls.workerMayEnterCredentials, false);
  assert.equal(writeJob.deterministicControls.workerMayContactPayer, false);
  assert.equal(writeJob.deterministicControls.workerMaySubmitForms, true);
  assert.equal(writeJob.writeControls.writeCapabilityScope, "per_job_single_approved_action");
  const plan = buildLangGraphOpenClawWorkerPlan(envelope, validation, {
    boundWriteApproval: writeJob.writeControls.boundApproval
  });
  const planValidation = validateOpenClawWorkerPlan(plan);
  assert.equal(planValidation.valid, true, planValidation.issues.join("; "));
});

test("committed Execution V2 and provider write flags default off", async () => {
  const envExample = await readFile(new URL("../../project/deployment/browser-sandbox-provider.private-launch-execution.example.env", import.meta.url), "utf8");
  const steelOps = await readFile(new URL("../../project/deployment/browser-sandbox-provider.steel-operations.example.json", import.meta.url), "utf8");
  assert.match(envExample, /BRAINSTY_WORKER_RUNTIME=deterministic/);
  assert.match(envExample, /WEFELLA_EXECUTION_WRITE_ENABLED=0/);
  assert.match(envExample, /WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=0/);
  assert.match(steelOps, /"status": "operations_contract_only"/);
  assert.match(steelOps, /"acceptedProductionCandidateStrategy": true/);
});
