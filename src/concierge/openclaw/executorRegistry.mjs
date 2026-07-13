import { toolExecutorAssignments } from "../workflowArchitecture.mjs";

// Phase 87 (§7): executor selection is an EXPLICIT tool_key -> executorKey map
// materialized from tool_registry rows — the regex classifier is DELETED. An unknown
// or unmapped tool fails LOUD (executor_missing), never a silent bucket. The write
// gate is the tool_registry-declared write_capable flag + a mandatory bound write
// approval — never a verb-string guess (the deterministic BLOCKED_ACTION_RE safety
// net in workerPolicy.mjs is separate and KEPT).
export const OPENCLAW_EXECUTOR_REGISTRY_VERSION = "2026-07-03.openclaw-executor-registry.phase87.v2";

export const DEFAULT_EXECUTORS = Object.freeze({
  read_only_browser: {
    executorKey: "read_only_browser",
    supportedTools: ["openclaw_authenticated_browser", "browser_remote_debugger", "payer_portal_reader", "insurance_portal_browser.read_only_observation"],
    writeActionsEnabled: false,
    approvalRequired: true
  },
  trusted_research: {
    executorKey: "trusted_research",
    supportedTools: ["trusted_research_retrieval", "authoritative_web_source_lookup", "public_web_search"],
    writeActionsEnabled: false,
    approvalRequired: false
  },
  local_followup_planner: {
    executorKey: "local_followup_planner",
    supportedTools: ["postgres_runtime_memory", "approval_request_outbox"],
    writeActionsEnabled: false,
    approvalRequired: true
  },
  // Phase 87 (§7): the declared-only configured_read_only_api_client skill.json entry
  // promoted to a REAL executor — read-only HTTP clients (CMS public data, later the
  // §9 connectors). Write actions stay disabled by construction.
  configured_api: {
    executorKey: "configured_api",
    supportedTools: ["configured_read_only_api_client", "cms_public_data_api"],
    writeActionsEnabled: false,
    approvalRequired: false
  },
  // Phase 87 (§7): the document-download executor — scope-bound single-document
  // capture gated on a CONSUMED single-use approval token (exactly one candidate URL).
  document_download: {
    executorKey: "document_download",
    supportedTools: ["openclaw_document_downloader", "read_only_document_download", "pdf_extraction_analysis"],
    writeActionsEnabled: false,
    approvalRequired: true,
    requiresConsumedGate: "READ_ONLY_DOCUMENT_APPROVAL_GATE"
  }
});

// tool_key -> {executorKey, writeCapable} from LIVE tool_registry rows (the runtime
// authority). The static fallback below derives from the same seed source, so the two
// can only disagree if the DB was mutated after seeding — in which case the DB wins.
export function buildToolExecutorMap(toolRegistryRows = []) {
  const map = {};
  for (const row of toolRegistryRows) {
    if (!row?.tool_key) continue;
    map[row.tool_key] = {
      executorKey: row.executor_key ?? null,
      writeCapable: Number(row.write_capable ?? 0) === 1 ? 1 : 0
    };
  }
  return map;
}

export function staticToolExecutorMap() {
  return toolExecutorAssignments();
}

function lookupTool(toolExecutorMap, toolName) {
  const raw = String(toolName ?? "").trim();
  if (!raw) return null;
  return toolExecutorMap[raw] ?? toolExecutorMap[raw.split(".")[0]] ?? null;
}

// Resolve ONE tool deterministically. Unknown key or a NULL executor_key (the
// signature-gated write workers) fails LOUD — dispatching them is impossible by data.
export function selectExecutorForTool(toolKey, options = {}) {
  const executors = options.executors ?? DEFAULT_EXECUTORS;
  const map = options.toolExecutorMap ?? staticToolExecutorMap();
  const entry = lookupTool(map, toolKey);
  if (!entry || !entry.executorKey || !executors[entry.executorKey]) {
    return {
      ok: false,
      status: "executor_missing",
      version: OPENCLAW_EXECUTOR_REGISTRY_VERSION,
      toolKey: toolKey ?? null,
      executorKey: entry?.executorKey ?? null,
      writeCapable: entry?.writeCapable ?? 0,
      approvalRequired: true,
      writeActionsEnabled: false,
      supportedTools: []
    };
  }
  const executor = executors[entry.executorKey];
  return {
    ok: true,
    status: "executor_selected",
    version: OPENCLAW_EXECUTOR_REGISTRY_VERSION,
    toolKey,
    executorKey: executor.executorKey,
    writeCapable: entry.writeCapable,
    approvalRequired: executor.approvalRequired,
    writeActionsEnabled: executor.writeActionsEnabled,
    requiresConsumedGate: executor.requiresConsumedGate ?? null,
    supportedTools: executor.supportedTools
  };
}

// Resolve a SKILL's executor through its declared tools — the first declared tool with
// a mapped executor wins (declaration order is authored, deterministic). A skill whose
// declared tools map to nothing fails LOUD executor_missing (no regex bucket).
export function selectExecutorForSkill(skill, options = {}) {
  if (!skill?.skillKey) {
    return {
      ok: false,
      status: "skill_missing",
      version: OPENCLAW_EXECUTOR_REGISTRY_VERSION,
      skillKey: null,
      executorKey: null,
      approvalRequired: true,
      writeActionsEnabled: false,
      supportedTools: []
    };
  }
  const map = options.toolExecutorMap ?? staticToolExecutorMap();
  const declaredTools = (skill?.capabilities?.tools ?? []).map((tool) => (typeof tool === "string" ? tool : tool?.tool ?? tool?.key ?? ""));
  for (const toolName of declaredTools) {
    const entry = lookupTool(map, toolName);
    if (entry?.executorKey) {
      const selected = selectExecutorForTool(toolName, options);
      if (selected.ok) {
        return { ...selected, skillKey: skill.skillKey, matchedToolKey: String(toolName).split(".")[0] };
      }
    }
  }
  return {
    ok: false,
    status: "executor_missing",
    version: OPENCLAW_EXECUTOR_REGISTRY_VERSION,
    skillKey: skill.skillKey,
    executorKey: null,
    declaredTools,
    approvalRequired: true,
    writeActionsEnabled: false,
    supportedTools: []
  };
}

export function selectExecutorForAction({ skill, action, options = {} }) {
  const selected = selectExecutorForSkill(skill, options);
  const validation = validateExecutorTask({
    skill,
    executor: selected,
    action,
    approvalToken: options.approvalToken ?? null,
    toolKey: options.toolKey ?? selected.matchedToolKey ?? null,
    toolExecutorMap: options.toolExecutorMap ?? null
  });
  return {
    ...selected,
    action: action ?? null,
    taskValidation: validation
  };
}

// Phase 87 (§7): the write gate reads the tool_registry-declared write_capable flag —
// the verb-string regex is DELETED (it false-blocked read-only actions whose names
// merely contained verbs like "contact"). Deterministic safety stays in
// workerPolicy.BLOCKED_ACTION_RE; the write track itself still terminates at
// execution_v2_no_private_executor.
export function validateExecutorTask({ skill, executor, action, approvalToken = null, toolKey = null, toolExecutorMap = null }) {
  const issues = [];
  if (!executor?.ok) issues.push("executor_not_selected");
  const map = toolExecutorMap ?? staticToolExecutorMap();
  const toolEntry = lookupTool(map, toolKey);
  const writeCapable = (toolEntry?.writeCapable ?? executor?.writeCapable ?? 0) === 1;
  if (writeCapable) {
    if (executor?.writeActionsEnabled !== true) issues.push("write_or_external_action_disabled");
    if (!approvalToken) issues.push("write_action_requires_bound_approval", "approval_required");
  }
  if (executor?.approvalRequired && !approvalToken && !issues.includes("approval_required")) issues.push("approval_required");
  const capabilityText = JSON.stringify(skill?.capabilities?.tools ?? []);
  if (action && capabilityText && !capabilityText.toLowerCase().includes(String(action).split(".")[0].toLowerCase())) {
    issues.push("action_not_declared_by_skill_capability");
  }
  return { ok: issues.length === 0, issues: [...new Set(issues)] };
}
