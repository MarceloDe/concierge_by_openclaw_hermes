import { selectExecutorForAction } from "./executorRegistry.mjs";
import { routeRegistrySkillsForDynamicContext } from "./skillRegistry.mjs";

export const OPENCLAW_WORKER_POLICY_VERSION = "2026-06-15.openclaw-worker-policy.v1";

const BLOCKED_ACTION_RE = /\b(credential|password|passkey|2fa|captcha|ssn|submit|send|message|contact payer|pay|payment|upload|change|cancel|appeal filing|authorization submission)\b/i;

export function evaluateOpenClawWorkerPolicy({ skill, executorSelection, task = {}, approval = null }) {
  const issues = [];
  const actionText = [task.action, task.goal, task.description].filter(Boolean).join(" ").replaceAll("_", " ");
  if (BLOCKED_ACTION_RE.test(actionText)) issues.push("blocked_or_controlled_action_requested");
  if (executorSelection?.approvalRequired && !approval) issues.push("approval_required");
  if (skill?.capabilities?.blockedActions?.some((blocked) => new RegExp(String(blocked).replaceAll("_", " "), "i").test(actionText))) {
    issues.push("skill_blocked_action_requested");
  }
  return {
    version: OPENCLAW_WORKER_POLICY_VERSION,
    allowed: issues.length === 0,
    issues,
    langGraphAuthority: true,
    openClawMayChooseJourney: false,
    openClawMayExecuteWriteActions: false
  };
}

function selectedExecutionSkill(registry, routedSkills, executionSkillKey) {
  return (
    (registry?.skills ?? []).find((skill) => skill.skillKey === executionSkillKey) ??
    (registry?.skills ?? []).find((skill) => routedSkills.some((item) => item.skillKey === skill.skillKey && item.role === "execution")) ??
    (registry?.skills ?? []).find((skill) => /browser|portal|ocr/i.test(JSON.stringify(skill.capabilities?.tools ?? []))) ??
    null
  );
}

function terminalOutcomeForPolicy(policy, executorSelection) {
  if (!executorSelection?.ok) return "not_possible_policy_or_approval_block";
  if (policy.allowed) return "needs_approval_before_execution";
  if (policy.issues.length === 1 && policy.issues.includes("approval_required")) return "needs_approval_before_execution";
  return "not_possible_policy_or_approval_block";
}

export function buildOpenClawBoundedTaskProposal({
  registry,
  dynamicSkillContext = {},
  workflow,
  task = {},
  approval = null,
  readiness = null
} = {}) {
  const routed = routeRegistrySkillsForDynamicContext(registry, dynamicSkillContext);
  const executionSkill = selectedExecutionSkill(registry, routed.routed, routed.executionSkillKey);
  const action = task.action ?? dynamicSkillContext.requiredOpenClawTasks?.[0] ?? "read_only_observation";
  const executorSelection = selectExecutorForAction({
    skill: executionSkill,
    action,
    options: { approvalToken: approval?.token ?? approval?.approvalToken ?? null }
  });
  const policy = evaluateOpenClawWorkerPolicy({ skill: executionSkill, executorSelection, task: { ...task, action }, approval });
  const terminalOutcome = terminalOutcomeForPolicy(policy, executorSelection);
  const requiredEvidence = [
    ...(dynamicSkillContext.requiredEvidence ?? []),
    ...(dynamicSkillContext.missingData ?? []),
    ...(dynamicSkillContext.requiredOpenClawTasks ?? [])
  ].filter(Boolean);
  const proposedSubtasks = [
    {
      subtaskKey: "inspect_available_context",
      label: "Inspect session, memory, source pointers, and selected skill context",
      executorKey: "local_followup_planner",
      approvalRequired: false
    },
    {
      subtaskKey: "prepare_bounded_worker_task",
      label: "Prepare bounded OpenClaw task packet under LangGraph authority",
      executorKey: executorSelection.executorKey ?? null,
      approvalRequired: Boolean(executorSelection.approvalRequired)
    },
    {
      subtaskKey: "execute_only_after_approval",
      label: "Execute only approved read-only observation or return a precise blocker",
      executorKey: executorSelection.executorKey ?? null,
      approvalRequired: Boolean(executorSelection.approvalRequired)
    }
  ];
  return {
    version: OPENCLAW_WORKER_POLICY_VERSION,
    contract: "brainstyworkers.openclaw.bounded_task_proposal.v1",
    status: policy.allowed ? "proposal_ready" : terminalOutcome === "needs_approval_before_execution" ? "proposal_ready_pending_approval" : "proposal_blocked",
    workflow: workflow ?? null,
    selectedSkill: executionSkill
      ? {
          skillKey: executionSkill.skillKey,
          title: executionSkill.title,
          riskLevel: executionSkill.riskLevel,
          status: executionSkill.status
        }
      : null,
    routedSkills: routed.routed,
    selectedExecutor: executorSelection,
    requiredEvidence,
    proposedSubtasks,
    approvalRequired: Boolean(executorSelection.approvalRequired),
    approvalsRequired: executorSelection.approvalRequired ? ["read_only_navigation_scope_approval", "real_openclaw_worker_execution"] : [],
    blockedActions: policy.issues.filter((issue) => issue !== "approval_required"),
    fallbackPath: executionSkill?.manifest?.fallback_strategy?.order ?? ["manual_user_export"],
    readiness: readiness
      ? {
          ready: Boolean(readiness.ready),
          status: readiness.liveReadiness?.status ?? readiness.runtime?.status ?? null,
          userActionRequired: readiness.liveReadiness?.userActionRequired ?? null
        }
      : null,
    terminalOutcome,
    langGraphAuthority: true,
    openClawMayChooseJourney: false,
    openClawMayProposeSubtasks: true,
    openClawMayExecuteWriteActions: false,
    actionsTaken: []
  };
}
