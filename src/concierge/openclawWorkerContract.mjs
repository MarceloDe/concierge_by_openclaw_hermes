import { createHash } from "node:crypto";

export const OPENCLAW_WORKER_CONTRACT_VERSION = "2026-05-28.openclaw-worker-contract.v2";

export const DEFAULT_OPENCLAW_RUNTIME_TARGET = {
  runtime: "official_openclaw_cli",
  profile: "brainstyworkers",
  agentId: "brainstyworkers-insurance-browser",
  workspace: "~/.openclaw-brainstyworkers/workspace-brainstyworkers",
  commandPrefix: "openclaw --profile brainstyworkers"
};

export const OPENCLAW_PORTAL_SECTION_HINTS = [
  "Benefits",
  "Coverage",
  "Plan details",
  "Deductible",
  "Claims",
  "ID card",
  "Documents",
  "Summary of Benefits and Coverage",
  "Pharmacy",
  "Find care",
  "Network",
  "Costs",
  "Member profile"
];

export const OPENCLAW_DATA_COLLECTION_FIELDS = [
  "plan_name",
  "member_name",
  "member_id_last4_or_safe_identifier",
  "effective_dates",
  "plan_type",
  "network",
  "deductible",
  "out_of_pocket_max",
  "copays",
  "coinsurance",
  "pharmacy_benefits",
  "claims_summary",
  "documents_found",
  "other_relevant_details"
];

function emptyDataCollected() {
  return {
    plan_name: null,
    member_name: null,
    member_id_last4_or_safe_identifier: null,
    effective_dates: null,
    plan_type: null,
    network: null,
    deductible: null,
    out_of_pocket_max: null,
    copays: [],
    coinsurance: [],
    pharmacy_benefits: null,
    claims_summary: [],
    documents_found: [],
    other_relevant_details: []
  };
}

function stableId(prefix, values) {
  const digest = createHash("sha256")
    .update(JSON.stringify(values))
    .digest("hex")
    .slice(0, 18);
  return `${prefix}_${digest}`;
}

function workflowFrom(validation, envelope) {
  return validation?.requiredInputs?.workflow_key ?? envelope?.workflow_architecture?.route_candidates?.[0]?.workflowKey ?? null;
}

function approvalScopeFrom(validation, envelope) {
  return validation?.requiredInputs?.approval_scope ?? envelope?.approval_scope ?? envelope?.raw_input?.approvalScope ?? "read_only_observation";
}

export function buildOpenClawWorkerJob(envelope, validation, options = {}) {
  const runtimeTarget = {
    ...DEFAULT_OPENCLAW_RUNTIME_TARGET,
    ...(options.runtimeTarget ?? {})
  };
  const workflowKey = workflowFrom(validation, envelope);
  const approvalScope = approvalScopeFrom(validation, envelope);
  const correlationId =
    options.correlationId ??
    stableId("occorr", {
      userId: envelope?.user_id,
      sessionId: envelope?.session_id,
      workflowKey,
      skillKey: validation?.skillKey
    });
  const jobId =
    options.jobId ??
    stableId("ocjob", {
      correlationId,
      workerAgentId: runtimeTarget.agentId,
      skillKey: validation?.skillKey,
      workflowKey
    });

  return {
    schemaVersion: OPENCLAW_WORKER_CONTRACT_VERSION,
    jobId,
    correlationId,
    jobType: "openclaw_read_only_worker_job",
    status: validation?.valid ? "pending_approval" : "blocked_contract",
    executionMode: validation?.executionMode ?? "proposal_only",
    orchestrator: {
      owner: "langgraph",
      workflowKey,
      sessionId: envelope?.session_id ?? null,
      userId: envelope?.user_id ?? null,
      channel: envelope?.channel ?? null,
      sourceEnvelopeType: envelope?.envelope_type ?? null
    },
    worker: {
      runtime: runtimeTarget.runtime,
      profile: runtimeTarget.profile,
      agentId: runtimeTarget.agentId,
      workspace: runtimeTarget.workspace,
      commandPrefix: runtimeTarget.commandPrefix,
      skillKey: validation?.skillKey ?? "insurance_portal_browser",
      skillInstallMode: "workspace_scoped"
    },
    input: {
      required: validation?.requiredInputs ?? {},
      portalUrl: validation?.requiredInputs?.portal_url ?? envelope?.portal_url ?? null,
      approvalScope,
      dbPointers: envelope?.db_pointers ?? [],
      memoryContext: envelope?.memory_context ?? "",
      productMemory: envelope?.product_memory ?? null,
      priorSessions: envelope?.prior_sessions ?? [],
      openTasks: envelope?.open_tasks ?? [],
      scheduledJobs: envelope?.scheduled_jobs ?? [],
      sourceContextPacketId: envelope?.raw_input?.sourceContextPacketId ?? null,
      userInputPreview: String(envelope?.user_input ?? "").slice(0, 240)
    },
    deterministicControls: {
      workflowMaster: "langgraph",
      workerMayChooseWorkflow: false,
      workerMayCreateSubtasks: true,
      workerMayRunTaskScopedSubagents: true,
      workerMayRetainWorkerMemory: true,
      workerMayUpdateHeartbeat: true,
      workerMayCreateTaskScopedSkills: true,
      workerMayChooseToolPathWithinAssignedTask: true,
      workerMayOpenAdditionalBrowserInstances: true,
      workerMayTryReadOnlyApisAndScrapers: true,
      workerMayUsePortalSearch: true,
      workerMayReadOfficialDocumentsWhenNeeded: true,
      workerMayAnalyzePdfDocumentsWhenNeeded: true,
      workerMayExtractStructuredInsuranceData: true,
      workerMayUseLocalOsAutomationWithinTaskScope: true,
      workerMayUsePasswordManagerOrHandleAuthChallenges: false,
      workerMayContactPayer: false,
      workerMaySendExternalMessage: false,
      workerMaySubmitForms: false,
      workerMayEnterCredentials: false,
      workerMayProvideMedicalAdvice: false
    },
    insuranceSitePlaybook: {
      taskUnderstandingRequired: true,
      portalSectionHints: OPENCLAW_PORTAL_SECTION_HINTS,
      dataCollectionFields: OPENCLAW_DATA_COLLECTION_FIELDS,
      evidenceFields: ["source", "details", "confidence"],
      authBoundary: "user_completes_login_passkey_2fa_captcha_then_worker_resumes",
      documentPolicy: {
        readOnlyDocumentsAllowedWhenNeeded: true,
        documentTypes: [
          "summary_of_benefits_and_coverage",
          "plan_documents",
          "id_cards",
          "eob_pdfs",
          "claims_pdfs",
          "benefits_summaries"
        ],
        preferOfficialCurrentPortalDocuments: true,
        rawDocumentDumpAllowed: false
      },
      toolingStrategy: [
        "reuse authenticated project browser tab or open the approved portal URL",
        "ask the user to complete login, passkey, 2FA, captcha, or session challenges themselves",
        "inspect rendered DOM, accessibility tree, links, buttons, forms, tabs, and safe read-only JavaScript text",
        "capture screenshot OCR for visual tables, cards, modals, canvas, images, and PDF viewers",
        "use portal search and likely sections before reporting missing data",
        "read needed SBCs, plan documents, ID cards, EOBs, claims PDFs, and benefits summaries only in read-only mode",
        "prefer official current portal documents over marketing pages",
        "reconcile conflicting evidence and report uncertainty"
      ],
      qualityBar: [
        "try multiple read-only approaches before reporting failure",
        "do not stop after one failed click, one missing selector, or one empty page",
        "if browser automation fails, try fresh DOM or accessibility inspection",
        "if DOM or accessibility is insufficient, try screenshot OCR",
        "if OCR is insufficient and exact benefits are required, look for official PDFs or documents",
        "if the portal blocks access, report exactly where and why with the next safest user-controlled step"
      ]
    },
    allowedWork: {
      objective:
        "Use OpenClaw's adaptive worker intelligence to complete the assigned LangGraph task as well as possible, returning sourced results, blockers, or precise missing-data requests.",
      allowedActions: [
        "decompose_assigned_task_into_subtasks",
        "run_task_scoped_status_subagent",
        "choose_best_available_browser_automation",
        "open_additional_browser_instances_when_useful",
        "scrape_or_read_public_web_sources",
        "try_read_only_api_access_when_configured",
        "use_portal_search_when_available",
        "inspect_likely_portal_sections",
        "read_needed_plan_documents_or_pdfs",
        "create_task_scoped_helper_skill_or_script",
        "use_local_os_automation_within_task_scope",
        "observe_authenticated_pages",
        "select_safe_same_site_read_only_navigation_targets",
        "capture_per_page_dom_and_ocr_evidence",
        "extract_structured_plan_claims_and_benefit_data",
        "extract_visible_facts",
        "reconcile_conflicting_sources",
        "return_source_pointers",
        "return_uncertainties_and_next_steps",
        "report_blockers",
        "update_worker_heartbeat_memory"
      ],
      approvalGates: validation?.approvalGates ?? {},
      approvalsRequired: validation?.approvalsRequired ?? [],
      fallbackPath: validation?.fallbackPath ?? [],
      stopConditions: validation?.stopConditions ?? []
    },
    progressProtocol: {
      statusSubagentRequired: true,
      reportEverySeconds: 30,
      reportTo: "langgraph",
      silentFailureAllowed: false,
      longTaskEscalation:
        "If the task becomes long or complex, report elapsed time, current blocker, next attempt, and ask LangGraph whether to continue synchronously or convert to an async follow-up."
    },
    workerMemoryPolicy: {
      receiveGraphitiMemoryContext: true,
      receivePriorSessionContext: true,
      mayRetainWorkerLessons: true,
      heartbeatMemoryLayer: "openclaw_worker_task_memory",
      productMemoryOwner: "langgraph",
      finalMemoryWritesRequireLangGraphIngest: true
    },
    terminalOutcomePolicy: {
      allowedFinalStatuses: [
        "completed_with_sourced_result",
        "not_possible_missing_user_data",
        "not_possible_insurance_or_portal_block",
        "not_possible_policy_or_approval_block",
        "needs_long_running_followup",
        "partial_result_with_blockers"
      ],
      finalAnswerMustExplain: [
        "what_was_attempted",
        "what_was_found",
        "source_pointers_or_absence_reason",
        "missing_user_data_or_external_blocker",
        "recommended_next_step"
      ]
    },
    expectedResult: {
      schemaVersion: OPENCLAW_WORKER_CONTRACT_VERSION,
      requiredFields: [
        "jobId",
        "correlationId",
        "status",
        "authenticated",
        "dataCollected",
        "answer",
        "sourcePointers",
        "evidence",
        "readOnlyNavigationPlan",
        "pageObservations",
        "structuredExtraction",
        "statusUpdates",
        "subtasks",
        "workerMemoryUpdates",
        "actionsTaken",
        "approvalsRequired",
        "risksOrBlockers",
        "uncertainties",
        "recommendedNextSteps"
      ],
      actionsTakenMustBeEmptyUntilExecution: true
    },
    parallelization: {
      eligible: true,
      groupId: stableId("ocgroup", { sessionId: envelope?.session_id, workflowKey }),
      dependencies: [],
      fanInOwner: "langgraph",
      fanInRule: "collect_worker_results_by_correlation_id_before_response"
    },
    risksOrBlockers: validation?.risksOrBlockers ?? [],
    actionsTaken: []
  };
}

export function buildOpenClawWorkerResultTemplate(job) {
  return {
    schemaVersion: OPENCLAW_WORKER_CONTRACT_VERSION,
    jobId: job?.jobId ?? null,
    correlationId: job?.correlationId ?? null,
    workerAgentId: job?.worker?.agentId ?? null,
    status: "not_executed_pending_approval",
    authenticated: "unknown",
    dataCollected: emptyDataCollected(),
    answer: null,
    sourcePointers: [],
    evidence: [],
    readOnlyNavigationPlan: null,
    pageObservations: [],
    structuredExtraction: null,
    statusUpdates: [],
    subtasks: [],
    workerMemoryUpdates: [],
    actionsTaken: [],
    approvalsRequired: job?.allowedWork?.approvalsRequired ?? [],
    risksOrBlockers: [
      ...(job?.risksOrBlockers ?? []),
      "official_openclaw_worker_not_dispatched"
    ],
    uncertainties: [],
    recommendedNextSteps: [],
    auditEventIds: []
  };
}

export function buildLangGraphOpenClawWorkerPlan(envelope, validation, options = {}) {
  const job = buildOpenClawWorkerJob(envelope, validation, options);
  const resultTemplate = buildOpenClawWorkerResultTemplate(job);
  return {
    schemaVersion: OPENCLAW_WORKER_CONTRACT_VERSION,
    planId:
      options.planId ??
      stableId("ocplan", {
        correlationId: job.correlationId,
        sessionId: envelope?.session_id,
        workflowKey: job.orchestrator.workflowKey
      }),
    owner: "langgraph",
    status: validation?.valid ? "pending_approval" : "blocked_contract",
    executionMode: validation?.executionMode ?? "proposal_only",
    dispatchStatus: "not_dispatched",
    workerJobs: [job],
    fanOut: {
      mode: "langgraph_owned_parallel_ready",
      dispatchPolicy: "only_after_validated_proposal_and_explicit_approval",
      parallelGroups: [
        {
          groupId: job.parallelization.groupId,
          jobIds: [job.jobId],
          dependencies: [],
          maxConcurrency: 1
        }
      ]
    },
    fanIn: {
      owner: "langgraph",
      requiredResultFields: resultTemplate.schemaVersion ? resultTemplate : null,
      mergePolicy: "reject_missing_job_id_or_correlation_id",
      responsePolicy: "compose_only_after_worker_results_or_blockers"
    },
    resultTemplates: [resultTemplate],
    actionsTaken: []
  };
}

export function validateOpenClawWorkerPlan(plan) {
  const issues = [];
  const warnings = [];
  const jobs = plan?.workerJobs ?? [];

  if (plan?.schemaVersion !== OPENCLAW_WORKER_CONTRACT_VERSION) issues.push("OpenClaw worker plan schema version is invalid.");
  if (plan?.owner !== "langgraph") issues.push("OpenClaw worker plan owner must be langgraph.");
  if (plan?.executionMode !== "proposal_only") issues.push("Worker plan must remain proposal_only in this slice.");
  if (plan?.dispatchStatus !== "not_dispatched") issues.push("Worker plan must not dispatch real OpenClaw workers in this slice.");
  if (!Array.isArray(jobs) || !jobs.length) issues.push("Worker plan must contain at least one worker job.");

  for (const job of jobs) {
    if (!job.jobId) issues.push("Worker job is missing jobId.");
    if (!job.correlationId) issues.push("Worker job is missing correlationId.");
    if (job.orchestrator?.owner !== "langgraph") issues.push("Worker job orchestrator owner must be langgraph.");
    if (job.deterministicControls?.workerMayChooseWorkflow !== false) issues.push("Worker must not choose workflow.");
    if (job.deterministicControls?.workerMayCreateSubtasks !== true) issues.push("Worker must be allowed to create subtasks inside its assigned task.");
    if (job.deterministicControls?.workerMayRunTaskScopedSubagents !== true) issues.push("Worker must run a task-scoped status subagent.");
    if (job.deterministicControls?.workerMayChooseToolPathWithinAssignedTask !== true) issues.push("Worker must be allowed to choose the best tool path inside its assigned task.");
    if (job.deterministicControls?.workerMayUsePortalSearch !== true) issues.push("Worker must be allowed to use portal search inside its assigned task.");
    if (job.deterministicControls?.workerMayReadOfficialDocumentsWhenNeeded !== true) issues.push("Worker must be allowed to read needed official documents in read-only mode.");
    if (job.deterministicControls?.workerMayAnalyzePdfDocumentsWhenNeeded !== true) issues.push("Worker must be allowed to analyze needed PDFs in read-only mode.");
    if (job.deterministicControls?.workerMayExtractStructuredInsuranceData !== true) issues.push("Worker must be allowed to extract structured insurance data.");
    if (job.deterministicControls?.workerMayUsePasswordManagerOrHandleAuthChallenges !== false) issues.push("Worker must not use password managers or handle auth challenges.");
    if (!job.allowedWork?.allowedActions?.includes("read_needed_plan_documents_or_pdfs")) issues.push("Worker allowed work must include read-only document/PDF handling.");
    if (!job.allowedWork?.allowedActions?.includes("use_portal_search_when_available")) issues.push("Worker allowed work must include portal search.");
    if (!job.allowedWork?.allowedActions?.includes("extract_structured_plan_claims_and_benefit_data")) issues.push("Worker allowed work must include structured insurance extraction.");
    if (!job.insuranceSitePlaybook?.portalSectionHints?.includes("Summary of Benefits and Coverage")) {
      issues.push("Worker insurance-site playbook must include Summary of Benefits and Coverage.");
    }
    if (!job.insuranceSitePlaybook?.dataCollectionFields?.includes("out_of_pocket_max")) {
      issues.push("Worker insurance-site playbook must include out_of_pocket_max.");
    }
    if (job.insuranceSitePlaybook?.documentPolicy?.rawDocumentDumpAllowed !== false) {
      issues.push("Worker document policy must reject raw document dumps.");
    }
    if (job.progressProtocol?.reportEverySeconds !== 30 || job.progressProtocol?.silentFailureAllowed !== false) {
      issues.push("Worker progress protocol must require non-silent 30-second reports.");
    }
    if (job.deterministicControls?.workerMayEnterCredentials !== false) issues.push("Worker must not enter credentials.");
    if (job.deterministicControls?.workerMayContactPayer !== false) issues.push("Worker payer contact still requires a separate explicit approval gate.");
    if (job.deterministicControls?.workerMaySubmitForms !== false) issues.push("Worker form submission still requires a separate explicit approval gate.");
    if (job.executionMode !== "proposal_only") issues.push("Worker job must remain proposal_only in this slice.");
    if ((job.actionsTaken ?? []).length) issues.push("Worker job actionsTaken must be empty before execution.");
    if (!job.worker?.profile || !job.worker?.agentId || !job.worker?.workspace) {
      warnings.push("Worker runtime target is incomplete.");
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    checkedJobs: jobs.length
  };
}
