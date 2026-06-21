import { audit } from "./audit.mjs";
import { WRITE_ACTION_EXECUTION_MODE } from "./approvalResume.mjs";
import { evaluatePortalAction } from "./policy.mjs";

export const LLM_MANAGER_WORKER_VERSION = "2026-06-21.execution-v2-llm-manager-worker.v1";

export function getBrainstyWorkerRuntime(env = process.env) {
  const runtime = env.BRAINSTY_WORKER_RUNTIME === "llm_manager" ? "llm_manager" : "deterministic";
  return {
    version: LLM_MANAGER_WORKER_VERSION,
    runtime,
    deterministicDefault: runtime === "deterministic",
    llmManagerEnabled: runtime === "llm_manager",
    writeEnabled: env.WEFELLA_EXECUTION_WRITE_ENABLED === "1",
    killSwitchEngaged: env.BRAINSTY_EXECUTION_KILL_SWITCH === "1",
    executionMode: runtime === "llm_manager" ? "llm_manager_proposal_only_until_write_gate" : "deterministic",
    irreversibleExecutionMode: WRITE_ACTION_EXECUTION_MODE
  };
}

function proposedActionText(proposedAction = {}) {
  return [proposedAction.action, proposedAction.instruction, proposedAction.actionSchema?.actionType].filter(Boolean).join(" ");
}

export async function runLlmManagerWorkerProposal({
  store,
  sessionId,
  taskId = null,
  userId = null,
  workflow = null,
  proposedAction = {},
  approval = null,
  env = process.env
}) {
  const runtime = getBrainstyWorkerRuntime(env);
  const actionText = proposedActionText(proposedAction);
  const policy = evaluatePortalAction({
    action: actionText,
    targetUrl: proposedAction.targetUrl ?? proposedAction.actionSchema?.targetUrl,
    actionSchema: proposedAction.actionSchema,
    approvalToken: approval
  });
  await audit(store, sessionId, "llm_manager_worker_action_proposed", {
    version: LLM_MANAGER_WORKER_VERSION,
    taskId,
    userId,
    workflow,
    runtime: runtime.runtime,
    writeEnabled: runtime.writeEnabled,
    killSwitchEngaged: runtime.killSwitchEngaged,
    actionType: proposedAction.actionSchema?.actionType ?? proposedAction.action ?? null,
    targetUrl: proposedAction.targetUrl ?? proposedAction.actionSchema?.targetUrl ?? null,
    policyAllowed: policy.allowed,
    policyReason: policy.reason,
    actionsTaken: []
  });
  if (runtime.runtime !== "llm_manager") {
    return {
      ok: false,
      status: "deterministic_runtime_no_llm_manager_action",
      runtime,
      policy,
      actionsTaken: []
    };
  }
  if (runtime.killSwitchEngaged) {
    return {
      ok: false,
      status: "llm_manager_kill_switch_engaged",
      runtime,
      policy,
      actionsTaken: []
    };
  }
  if (!policy.allowed) {
    return {
      ok: false,
      status: "llm_manager_write_blocked_by_approval_gate",
      runtime,
      policy,
      actionsTaken: []
    };
  }
  return {
    ok: true,
    status: "llm_manager_action_ready_for_approved_single_write_runtime",
    runtime,
    policy,
    actionsTaken: ["llm_manager_action_policy_passed"]
  };
}
