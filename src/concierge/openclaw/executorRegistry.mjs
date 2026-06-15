export const OPENCLAW_EXECUTOR_REGISTRY_VERSION = "2026-06-15.openclaw-executor-registry.v1";

export const DEFAULT_EXECUTORS = Object.freeze({
  read_only_browser: {
    executorKey: "read_only_browser",
    supportedTools: ["openclaw_authenticated_browser", "browser_remote_debugger", "payer_portal_reader", "insurance_portal_browser.read_only_observation"],
    writeActionsEnabled: false,
    approvalRequired: true
  },
  trusted_research: {
    executorKey: "trusted_research",
    supportedTools: ["trusted_research_retrieval", "authoritative_web_source_lookup", "web_search_authoritative_sources"],
    writeActionsEnabled: false,
    approvalRequired: false
  },
  local_followup_planner: {
    executorKey: "local_followup_planner",
    supportedTools: ["local_sqlite_memory", "approval_request_outbox"],
    writeActionsEnabled: false,
    approvalRequired: true
  }
});

export function selectExecutorForSkill(skill, options = {}) {
  const executors = options.executors ?? DEFAULT_EXECUTORS;
  const toolText = JSON.stringify(skill?.capabilities?.tools ?? []).toLowerCase();
  const key = /browser|portal|ocr/.test(toolText)
    ? "read_only_browser"
    : /research|source|cms|aetna/.test(toolText)
      ? "trusted_research"
      : "local_followup_planner";
  const executor = executors[key];
  if (!executor) return { ok: false, status: "executor_missing", skillKey: skill?.skillKey ?? null, executorKey: key };
  return {
    ok: true,
    status: "executor_selected",
    version: OPENCLAW_EXECUTOR_REGISTRY_VERSION,
    skillKey: skill.skillKey,
    executorKey: executor.executorKey,
    approvalRequired: executor.approvalRequired,
    writeActionsEnabled: executor.writeActionsEnabled,
    supportedTools: executor.supportedTools
  };
}

export function selectExecutorForAction({ skill, action, options = {} }) {
  const selected = selectExecutorForSkill(skill, options);
  const validation = validateExecutorTask({ skill, executor: selected, action, approvalToken: options.approvalToken ?? null });
  return {
    ...selected,
    action: action ?? null,
    taskValidation: validation
  };
}

export function validateExecutorTask({ skill, executor, action, approvalToken = null }) {
  const issues = [];
  const normalizedAction = String(action ?? "").replaceAll("_", " ");
  if (!executor?.ok) issues.push("executor_not_selected");
  if (executor?.writeActionsEnabled !== true && /\b(submit|send|message|contact|pay|upload|change|cancel)\b/i.test(normalizedAction)) {
    issues.push("write_or_external_action_disabled");
  }
  if (executor?.approvalRequired && !approvalToken) issues.push("approval_required");
  const capabilityText = JSON.stringify(skill?.capabilities?.tools ?? []);
  if (action && capabilityText && !capabilityText.toLowerCase().includes(String(action).split(".")[0].toLowerCase())) {
    issues.push("action_not_declared_by_skill_capability");
  }
  return { ok: issues.length === 0, issues };
}
