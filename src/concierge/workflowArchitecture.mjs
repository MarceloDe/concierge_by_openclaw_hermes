const WORKFLOW_DEFINITIONS = [
  {
    workflow_key: "eligibility_benefits_navigation",
    title: "Eligibility and benefits navigation",
    journey_stage: "coverage_understanding",
    description: "Confirm plan, eligibility, benefit categories, balances, and source pointers from the payer portal.",
    required_user_fields: ["user.id", "user.email", "portal_account"],
    required_data_pointers: ["portal_accounts"],
    required_tools: ["openclaw_authenticated_browser", "payer_portal_reader", "local_sqlite_memory"],
    memory_scopes: ["session", "episodic", "semantic"]
  },
  {
    workflow_key: "claim_status_navigation",
    title: "Claim status navigation",
    journey_stage: "service_use_claim",
    description: "Find claim records, status, dates, patient responsibility, and next payer/member actions.",
    required_user_fields: ["user.id", "user.email", "portal_account"],
    required_data_pointers: ["claim_items", "eligibility_snapshots"],
    required_tools: ["openclaw_authenticated_browser", "payer_portal_reader", "local_sqlite_memory"],
    memory_scopes: ["episodic", "long_term"]
  },
  {
    workflow_key: "prior_authorization_navigation",
    title: "Prior authorization navigation",
    journey_stage: "service_authorization",
    description: "Review prior authorization status, requirements, payer policy pointers, and approval-gated next steps.",
    required_user_fields: ["user.id", "user.email", "portal_account"],
    required_data_pointers: ["prior_authorizations", "eligibility_snapshots"],
    required_tools: ["openclaw_authenticated_browser", "payer_portal_reader", "aetna_cpb_lookup", "cms_mcd_lookup"],
    memory_scopes: ["episodic", "long_term", "reflection"]
  },
  {
    workflow_key: "denial_appeal_preparation",
    title: "Denial appeal preparation",
    journey_stage: "denial_resolution",
    description: "Assemble denial facts, policy references, evidence checklist, and approval-gated appeal draft support.",
    required_user_fields: ["user.id", "user.email", "portal_account"],
    required_data_pointers: ["claim_items", "eligibility_snapshots"],
    required_tools: ["aetna_cpb_lookup", "cms_mcd_lookup", "cms_icd10_lookup", "web_search_authoritative_sources"],
    memory_scopes: ["episodic", "long_term", "reflection"]
  },
  {
    workflow_key: "payer_portal_read_only_extraction",
    title: "Payer portal read-only extraction",
    journey_stage: "evidence_capture",
    description: "Capture visible payer portal facts, links, screenshots/artifacts, and source pointers without credential entry.",
    required_user_fields: ["user.id", "user.email", "portal_account"],
    required_data_pointers: ["portal_accounts"],
    required_tools: ["openclaw_authenticated_browser", "browser_remote_debugger", "chrome_extension_bridge", "mcp_browser_adapter"],
    memory_scopes: ["session", "episodic"]
  },
  {
    workflow_key: "document_or_trace_review",
    title: "Document or trace review",
    journey_stage: "evidence_review",
    description: "Review uploaded or locally captured artifacts and traces, extract structured evidence, and identify missing data.",
    required_user_fields: ["user.id", "user.email"],
    required_data_pointers: ["extraction_artifacts", "audit_events"],
    required_tools: ["local_sqlite_memory", "document_trace_parser"],
    memory_scopes: ["session", "episodic", "reflection"]
  },
  {
    workflow_key: "human_approval_escalation",
    title: "Human approval escalation",
    journey_stage: "approval_gate",
    description: "Pause execution for user approval, missing credentials handled by the user, or high-risk external actions.",
    required_user_fields: ["user.id", "user.email"],
    required_data_pointers: ["approval_gates"],
    required_tools: ["local_sqlite_memory"],
    memory_scopes: ["session", "episodic"]
  }
];

const TOOL_REGISTRY = [
  {
    tool_key: "openclaw_authenticated_browser",
    tool_type: "openclaw_skill",
    title: "OpenClaw authenticated browser arm",
    risk_level: "high",
    integration_status: "adapter_contract_ready",
    approval_required: "per_browser_action_scope",
    config: { boundary: "user_authenticated_chrome", noCredentialEntry: true }
  },
  {
    tool_key: "browser_remote_debugger",
    tool_type: "browser_control",
    title: "Chrome remote debugger attachment",
    risk_level: "high",
    integration_status: "enabled_local_when_chrome_debugger_running",
    approval_required: "user_opens_and_authenticates_browser",
    config: { fallbackRank: 1 }
  },
  {
    tool_key: "chrome_extension_bridge",
    tool_type: "browser_control",
    title: "Chrome extension bridge",
    risk_level: "high",
    integration_status: "fallback_planned",
    approval_required: "user_installs_and_keeps_session_open",
    config: { fallbackRank: 2 }
  },
  {
    tool_key: "mcp_browser_adapter",
    tool_type: "browser_control",
    title: "MCP browser adapter",
    risk_level: "medium",
    integration_status: "fallback_planned",
    approval_required: "user_approves_tool_connection",
    config: { fallbackRank: 3 }
  },
  {
    tool_key: "payer_portal_reader",
    tool_type: "extraction",
    title: "Payer portal read-only structured extraction",
    risk_level: "medium",
    integration_status: "enabled_local",
    approval_required: "read_only_scope_approval",
    config: { storesSourcePointers: true }
  },
  {
    tool_key: "local_sqlite_memory",
    tool_type: "memory",
    title: "Local SQLite session and memory harness",
    risk_level: "medium",
    integration_status: "enabled_local",
    approval_required: "local_phi_storage_approval",
    config: { storesPhi: true, timestampType: "iso_8601_utc_text" }
  },
  {
    tool_key: "hindsight_memory_adapter",
    tool_type: "memory",
    title: "Hindsight temporal memory adapter",
    risk_level: "medium",
    integration_status: "deferred_until_runtime_approval",
    approval_required: "memory_retention_policy_and_api_setup",
    config: { operations: ["recall", "retain", "reflect"] }
  },
  {
    tool_key: "aetna_cpb_lookup",
    tool_type: "knowledge_source",
    title: "Aetna Clinical Policy Bulletins lookup",
    risk_level: "medium",
    integration_status: "registry_ready_manual_or_web",
    approval_required: "cite_source_and_no_medical_advice",
    config: { sourceKey: "aetna_clinical_policy_bulletins" }
  },
  {
    tool_key: "cms_icd10_lookup",
    tool_type: "knowledge_source",
    title: "CMS ICD-10 official files lookup",
    risk_level: "medium",
    integration_status: "registry_ready_manual_or_web",
    approval_required: "cite_source_and_no_coding_advice_as_medical_advice",
    config: { sourceKey: "cms_icd10_files" }
  },
  {
    tool_key: "cms_mcd_lookup",
    tool_type: "knowledge_source",
    title: "CMS Medicare Coverage Database lookup",
    risk_level: "medium",
    integration_status: "registry_ready_manual_or_web",
    approval_required: "cite_source_and_plan_specific_verification",
    config: { sourceKey: "cms_medicare_coverage_database" }
  },
  {
    tool_key: "web_search_authoritative_sources",
    tool_type: "research",
    title: "Authoritative web source retrieval",
    risk_level: "medium",
    integration_status: "available_through_codex_when_requested",
    approval_required: "source_citation_required",
    config: { allowedDomainsFirst: ["cms.gov", "aetna.com", "healthcare.gov", "ama-assn.org"] }
  },
  {
    tool_key: "document_trace_parser",
    tool_type: "extraction",
    title: "Document and trace parser",
    risk_level: "medium",
    integration_status: "enabled_local",
    approval_required: "artifact_storage_approval",
    config: { storesArtifacts: true }
  },
  {
    tool_key: "gmail_inbox_reader",
    tool_type: "channel",
    title: "Gmail payer-response reader",
    risk_level: "high",
    integration_status: "deferred_until_user_setup",
    approval_required: "user_installs_and_approves_email_scope",
    config: { externalData: true }
  },
  {
    tool_key: "whatsapp_sender",
    tool_type: "channel",
    title: "WhatsApp user notification sender",
    risk_level: "high",
    integration_status: "deferred_until_user_setup",
    approval_required: "explicit_send_approval",
    config: { externalMessaging: true }
  },
  {
    tool_key: "vercel_ai_gateway",
    tool_type: "model_gateway",
    title: "Vercel AI Gateway",
    risk_level: "medium",
    integration_status: "deferred_until_api_setup",
    approval_required: "gateway_credentials_and_spend_policy",
    config: { modelRouting: true }
  }
];

const KNOWLEDGE_SOURCES = [
  {
    source_key: "aetna_clinical_policy_bulletins",
    title: "Aetna Clinical Policy Bulletins",
    source_type: "payer_policy",
    authority_level: "payer_primary",
    base_url: "https://www.aetna.com/health-care-professionals/clinical-policy-bulletins.html",
    workflow_keys: ["prior_authorization_navigation", "denial_appeal_preparation"],
    refresh_policy: "check_at_task_time_policy_can_change",
    access_method: "web_with_source_citation",
    status: "active_registry"
  },
  {
    source_key: "cms_icd10_files",
    title: "CMS ICD-10 official files",
    source_type: "code_set",
    authority_level: "federal_primary",
    base_url: "https://www.cms.gov/medicare/coding-billing/icd-10-codes",
    workflow_keys: ["denial_appeal_preparation", "prior_authorization_navigation"],
    refresh_policy: "check_effective_date_for_service_or_submission",
    access_method: "web_or_downloaded_official_file",
    status: "active_registry"
  },
  {
    source_key: "cms_medicare_coverage_database",
    title: "CMS Medicare Coverage Database",
    source_type: "coverage_policy",
    authority_level: "federal_primary",
    base_url: "https://www.cms.gov/medicare/coverage/center",
    workflow_keys: ["prior_authorization_navigation", "denial_appeal_preparation"],
    refresh_policy: "check_at_task_time_and_match_plan_context",
    access_method: "web_with_source_citation",
    status: "active_registry"
  },
  {
    source_key: "cms_cpt_hcpcs_code_list",
    title: "CMS CPT/HCPCS Code List",
    source_type: "code_set",
    authority_level: "federal_primary_with_ama_cpt_license_boundary",
    base_url: "https://www.cms.gov/medicare/regulations-guidance/physician-self-referral/list-cpt-hcpcs-codes",
    workflow_keys: ["denial_appeal_preparation", "prior_authorization_navigation", "claim_status_navigation"],
    refresh_policy: "annual_or_task_time",
    access_method: "web_with_cpt_license_boundary",
    status: "active_registry"
  },
  {
    source_key: "aetna_member_portal",
    title: "Aetna member portal",
    source_type: "user_authenticated_payer_portal",
    authority_level: "user_account_primary",
    base_url: "https://www.aetna.com/",
    workflow_keys: ["eligibility_benefits_navigation", "claim_status_navigation", "payer_portal_read_only_extraction"],
    refresh_policy: "read_live_visible_state_when_user_logged_in",
    access_method: "user_authenticated_browser_only",
    status: "active_registry"
  }
];

const OPENCLAW_SKILLS = [
  {
    skill_key: "insurance_portal_browser",
    title: "Insurance portal browser",
    description: "Navigate the user-authenticated payer portal, observe visible state, extract facts with source pointers, and stop before any irreversible action.",
    status: "repo_artifact_ready_adapter_execution_gated",
    risk_level: "high",
    allowed_tools: [
      "openclaw_authenticated_browser",
      "openclaw_browser_screenshot",
      "openclaw_visual_ocr",
      "browser_remote_debugger",
      "chrome_extension_bridge",
      "mcp_browser_adapter",
      "payer_portal_reader",
      "public_web_search",
      "website_scraper",
      "configured_read_only_api_client",
      "task_scoped_helper_skill",
      "local_os_automation"
    ],
    fallback_strategy: {
      order: ["browser_remote_debugger", "chrome_extension_bridge", "mcp_browser_adapter", "manual_user_export"],
      stopCondition: "credentials_or_irreversible_action_required",
      artifactPath: "openclaw/skills/insurance-portal-browser",
      requiredCompanionSkills: ["browser-automation", "ocr-local"],
      browserControlSubstrate: "browser-automation",
      visualEvidenceSubstrate: "ocr-local",
      adaptiveWorkerPolicy: "decompose_subtasks_choose_tools_report_every_30_seconds",
      workerMemoryLayer: "openclaw_worker_heartbeat_memory"
    },
    prompt_contract: {
      noCredentialEntry: true,
      sourcePointersRequired: true,
      externalActionsRequireApproval: true,
      browserAutomationRequired: true,
      visualOcrRequired: true,
      adaptiveSubtasksAllowed: true,
      statusSubagentRequired: true,
      progressReportEverySeconds: 30
    }
  },
  {
    skill_key: "insurance_knowledge_research",
    title: "Insurance knowledge research",
    description: "Retrieve payer, CMS, code-set, and authoritative web sources for workflow-specific questions with citation and freshness checks.",
    status: "design_ready",
    risk_level: "medium",
    allowed_tools: ["aetna_cpb_lookup", "cms_icd10_lookup", "cms_mcd_lookup", "web_search_authoritative_sources"],
    fallback_strategy: {
      order: ["payer_policy_source", "cms_source", "healthcare.gov_or_state_source", "ask_user_for_document"],
      stopCondition: "source_not_current_or_not_applicable_to_plan"
    },
    prompt_contract: {
      citeSources: true,
      noMedicalAdvice: true,
      noUnsupportedCoverageGuarantees: true
    }
  },
  {
    skill_key: "heartbeat_followup_planner",
    title: "Heartbeat follow-up planner",
    description: "Inspect pending jobs, due dates, open tasks, last context packet, and propose approval-gated next actions.",
    status: "enabled_local_harness",
    risk_level: "medium",
    allowed_tools: ["local_sqlite_memory", "gmail_inbox_reader", "whatsapp_sender", "openclaw_authenticated_browser"],
    fallback_strategy: {
      order: ["local_sqlite_memory", "approval_request_outbox", "manual_user_followup"],
      stopCondition: "external_adapter_not_approved"
    },
    prompt_contract: {
      inspectAndProposeOnlyByDefault: true,
      scheduleAwarenessRequired: true,
      neverSendWithoutApproval: true
    }
  }
];

function json(value) {
  return JSON.stringify(value);
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function upsert(store, table, keyColumn, row, time, createId) {
  const existing = await store.findOne(table, { [keyColumn]: row[keyColumn] });
  if (existing) {
    const { id, created_at, ...updates } = row;
    await store.update(table, { ...updates, updated_at: time }, { id: existing.id });
    return { ...existing, ...updates, updated_at: time };
  }
  const insert = {
    id: row.id ?? createId(table.replace(/s$/, "")),
    created_at: time,
    updated_at: time,
    ...row
  };
  await store.insert(table, insert);
  return insert;
}

export async function seedRuntimeRegistries(store, { nowIso, createId }) {
  const time = nowIso();
  for (const workflow of WORKFLOW_DEFINITIONS) {
    await upsert(
      store,
      "workflow_definitions",
      "workflow_key",
      {
        workflow_key: workflow.workflow_key,
        title: workflow.title,
        journey_stage: workflow.journey_stage,
        description: workflow.description,
        required_user_fields_json: json(workflow.required_user_fields),
        required_data_pointers_json: json(workflow.required_data_pointers),
        required_tools_json: json(workflow.required_tools),
        memory_scopes_json: json(workflow.memory_scopes),
        status: "active"
      },
      time,
      createId
    );
  }
  for (const tool of TOOL_REGISTRY) {
    await upsert(
      store,
      "tool_registry",
      "tool_key",
      {
        tool_key: tool.tool_key,
        tool_type: tool.tool_type,
        title: tool.title,
        risk_level: tool.risk_level,
        integration_status: tool.integration_status,
        approval_required: tool.approval_required,
        config_json: json(tool.config)
      },
      time,
      createId
    );
  }
  for (const source of KNOWLEDGE_SOURCES) {
    await upsert(
      store,
      "knowledge_sources",
      "source_key",
      {
        source_key: source.source_key,
        title: source.title,
        source_type: source.source_type,
        authority_level: source.authority_level,
        base_url: source.base_url,
        workflow_keys_json: json(source.workflow_keys),
        refresh_policy: source.refresh_policy,
        access_method: source.access_method,
        status: source.status
      },
      time,
      createId
    );
  }
  for (const skill of OPENCLAW_SKILLS) {
    await upsert(
      store,
      "openclaw_skills",
      "skill_key",
      {
        skill_key: skill.skill_key,
        title: skill.title,
        description: skill.description,
        status: skill.status,
        risk_level: skill.risk_level,
        allowed_tools_json: json(skill.allowed_tools),
        fallback_strategy_json: json(skill.fallback_strategy),
        prompt_contract_json: json(skill.prompt_contract)
      },
      time,
      createId
    );
  }

  const requirementRows = [];
  for (const workflow of WORKFLOW_DEFINITIONS) {
    for (const toolKey of workflow.required_tools) {
      requirementRows.push({
        workflow_key: workflow.workflow_key,
        tool_key: toolKey,
        required_for: workflow.journey_stage,
        fallback_tool_keys_json: json(fallbacksForTool(toolKey))
      });
    }
  }
  for (const row of requirementRows) {
    const existing = await store.get(
      `SELECT id FROM workflow_tool_requirements WHERE workflow_key = '${row.workflow_key}' AND tool_key = '${row.tool_key}' LIMIT 1;`
    );
    if (!existing) {
      await store.insert("workflow_tool_requirements", {
        id: createId("wtreq"),
        ...row,
        created_at: time
      });
    }
  }
}

function fallbacksForTool(toolKey) {
  if (toolKey === "openclaw_authenticated_browser") return ["browser_remote_debugger", "chrome_extension_bridge", "mcp_browser_adapter"];
  if (toolKey === "aetna_cpb_lookup") return ["web_search_authoritative_sources", "ask_user_for_plan_document"];
  if (toolKey === "cms_icd10_lookup") return ["web_search_authoritative_sources"];
  if (toolKey === "cms_mcd_lookup") return ["web_search_authoritative_sources"];
  if (toolKey === "gmail_inbox_reader") return ["manual_user_forwarded_email"];
  return [];
}

function normalizeWorkflow(row) {
  return {
    key: row.workflow_key,
    title: row.title,
    journeyStage: row.journey_stage,
    description: row.description,
    requiredUserFields: parseJson(row.required_user_fields_json, []),
    requiredDataPointers: parseJson(row.required_data_pointers_json, []),
    requiredTools: parseJson(row.required_tools_json, []),
    memoryScopes: parseJson(row.memory_scopes_json, []),
    status: row.status
  };
}

function normalizeTool(row) {
  return {
    key: row.tool_key,
    type: row.tool_type,
    title: row.title,
    riskLevel: row.risk_level,
    integrationStatus: row.integration_status,
    approvalRequired: row.approval_required,
    config: parseJson(row.config_json, {})
  };
}

function normalizeSource(row) {
  return {
    key: row.source_key,
    title: row.title,
    type: row.source_type,
    authorityLevel: row.authority_level,
    baseUrl: row.base_url,
    workflowKeys: parseJson(row.workflow_keys_json, []),
    refreshPolicy: row.refresh_policy,
    accessMethod: row.access_method,
    status: row.status
  };
}

function normalizeSkill(row) {
  return {
    key: row.skill_key,
    title: row.title,
    description: row.description,
    status: row.status,
    riskLevel: row.risk_level,
    allowedTools: parseJson(row.allowed_tools_json, []),
    fallbackStrategy: parseJson(row.fallback_strategy_json, {}),
    promptContract: parseJson(row.prompt_contract_json, {})
  };
}

function hasDataPointer(required, pointers) {
  return pointers.some((pointer) => pointer.table === required || pointer.table?.startsWith(required));
}

function fieldIsPresent(field, { user, portal }) {
  if (field === "user.id") return Boolean(user?.id);
  if (field === "user.email") return Boolean(user?.email);
  if (field === "portal_account") return Boolean(portal?.id || portal?.portal_url);
  return false;
}

function toolIsEnabled(tool) {
  return [
    "enabled_local",
    "enabled_local_when_chrome_debugger_running",
    "adapter_contract_ready",
    "registry_ready_manual_or_web",
    "available_through_codex_when_requested"
  ].includes(tool?.integrationStatus);
}

function routeScore(workflow, userInput, memoryItems) {
  const inputText = String(userInput ?? "").toLowerCase();
  const memoryText = memoryItems.map((item) => `${item.type} ${item.content}`).join(" ").toLowerCase();
  const keys = {
    eligibility_benefits_navigation: ["eligibility", "benefit", "coverage", "deductible", "copay", "out-of-pocket", "aetna"],
    claim_status_navigation: ["claim", "eob", "paid", "denied", "status", "patient responsibility"],
    prior_authorization_navigation: ["prior authorization", "precert", "authorization", "approved", "pending"],
    denial_appeal_preparation: ["denial", "appeal", "reconsideration", "medical necessity", "letter"],
    payer_portal_read_only_extraction: ["portal", "browser", "chrome", "extract", "scrape", "logged"],
    document_or_trace_review: ["document", "trace", "screenshot", "audit", "review"],
    human_approval_escalation: ["approve", "permission", "send", "submit", "change", "cancel"]
  };
  return (keys[workflow.key] ?? []).reduce((score, token) => {
    const inputMatch = inputText.includes(token) ? 10 : 0;
    const memoryMatch = memoryText.includes(token) ? 1 : 0;
    return score + inputMatch + memoryMatch;
  }, 0);
}

export async function loadWorkflowArchitecture(store, { user, portal, userInput = "", memoryItems = [], dbPointers = [] }) {
  const [workflowRows, toolRows, sourceRows, skillRows, journeyRows, reflectionRows] = await Promise.all([
    store.all("SELECT * FROM workflow_definitions WHERE status = 'active' ORDER BY workflow_key ASC;"),
    store.all("SELECT * FROM tool_registry ORDER BY tool_key ASC;"),
    store.all("SELECT * FROM knowledge_sources ORDER BY source_key ASC;"),
    store.all("SELECT * FROM openclaw_skills ORDER BY skill_key ASC;"),
    user?.id
      ? store.all(`SELECT * FROM user_journey_events WHERE user_id = '${user.id.replaceAll("'", "''")}' ORDER BY occurred_at DESC LIMIT 20;`)
      : Promise.resolve([]),
    user?.id
      ? store.all(`SELECT * FROM memory_reflections WHERE user_id = '${user.id.replaceAll("'", "''")}' ORDER BY created_at DESC LIMIT 10;`)
      : Promise.resolve([])
  ]);
  const workflows = workflowRows.map(normalizeWorkflow);
  const tools = toolRows.map(normalizeTool);
  const toolsByKey = new Map(tools.map((tool) => [tool.key, tool]));
  const readiness = workflows.map((workflow) => {
    const missingUserFields = workflow.requiredUserFields.filter((field) => !fieldIsPresent(field, { user, portal }));
    const missingDataPointers = workflow.requiredDataPointers.filter((pointer) => !hasDataPointer(pointer, dbPointers));
    const toolStatus = workflow.requiredTools.map((toolKey) => {
      const tool = toolsByKey.get(toolKey);
      return {
        toolKey,
        present: Boolean(tool),
        enabled: toolIsEnabled(tool),
        integrationStatus: tool?.integrationStatus ?? "missing",
        approvalRequired: tool?.approvalRequired ?? "unknown"
      };
    });
    const missingTools = toolStatus.filter((tool) => !tool.present).map((tool) => tool.toolKey);
    const disabledTools = toolStatus.filter((tool) => tool.present && !tool.enabled).map((tool) => tool.toolKey);
    const score = routeScore(workflow, userInput, memoryItems);
    return {
      workflowKey: workflow.key,
      title: workflow.title,
      journeyStage: workflow.journeyStage,
      routeScore: score,
      complete: missingUserFields.length === 0 && missingTools.length === 0,
      executableNow: missingUserFields.length === 0 && missingTools.length === 0 && disabledTools.length === 0,
      missingUserFields,
      missingDataPointers,
      missingTools,
      disabledTools,
      toolStatus,
      memoryScopes: workflow.memoryScopes,
      routeEvidence: {
        userInputMatched: score > 0,
        priorMemoryConsidered: memoryItems.length > 0,
        dataPointersConsidered: dbPointers.length > 0
      }
    };
  });
  const routeCandidates = readiness
    .slice()
    .sort((a, b) => b.routeScore - a.routeScore || Number(b.executableNow) - Number(a.executableNow))
    .slice(0, 5);
  return {
    schemaVersion: 1,
    timestampType: "iso_8601_utc_text",
    workflows,
    tools,
    knowledgeSources: sourceRows.map(normalizeSource),
    openclawSkills: skillRows.map(normalizeSkill),
    readiness,
    routeCandidates,
    journeyEvents: journeyRows.map((row) => ({ ...row, evidence: parseJson(row.evidence_json, {}) })),
    memoryReflections: reflectionRows.map((row) => ({
      ...row,
      memoryItemIds: parseJson(row.memory_item_ids_json, [])
    }))
  };
}
