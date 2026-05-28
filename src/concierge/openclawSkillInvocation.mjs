import { audit } from "./audit.mjs";
import { createId, nowIso } from "./database.mjs";

export const OPENCLAW_SKILL_INVOCATION_VERSION = "2026-05-26.openclaw-skill-invocation.v1";
export const DEFAULT_OPENCLAW_SKILL_KEY = "insurance_portal_browser";
export const OPENCLAW_PROPOSAL_TASK_TYPE = "openclaw_skill_invocation_proposal";

const BLOCKED_ACTION_PATTERNS = [
  {
    key: "credential_entry",
    pattern: /\b(password|passcode|passkey|2fa|two[-\s]?factor|mfa|login|log in|sign in|credential|ssn|social security)\b/i,
    issue: "Credential, SSN, passkey, or 2FA handling is user-only and blocked for OpenClaw."
  },
  {
    key: "external_message_send",
    pattern: /\b(send|email|text|sms|whatsapp|telegram|message)\b.*\b(payer|aetna|insurance|doctor|provider|clinic)\b/i,
    issue: "External messaging requires explicit per-message approval and is blocked in proposal-only mode."
  },
  {
    key: "payer_contact",
    pattern: /\b(call|contact|reach out|talk to|chat with)\b.*\b(payer|aetna|insurance|representative|support)\b/i,
    issue: "Payer contact requires explicit per-action approval and is blocked in proposal-only mode."
  },
  {
    key: "form_submit_or_record_change",
    pattern: /\b(submit|file|upload|change|update|cancel|pay|authorize|approve)\b/i,
    issue: "Form submission, upload, payment, authorization, cancellation, or record change is blocked without explicit approval."
  },
  {
    key: "medical_advice",
    pattern: /\b(diagnose|treat|treatment|dosage|prescribe|medical advice|should i take|clinical advice)\b/i,
    issue: "Medical advice is not allowed."
  }
];

function firstPresent(values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() ?? null;
}

function deriveWorkflowKey(envelope, options = {}) {
  return firstPresent([
    options.workflowKey,
    envelope?.workflow_key,
    envelope?.workflow,
    envelope?.raw_input?.workflowKey,
    envelope?.raw_input?.workflow,
    envelope?.workflow_architecture?.route_candidates?.[0]?.workflowKey
  ]);
}

function derivePortalUrl(envelope, options = {}) {
  const knowledgeSource = (envelope?.workflow_architecture?.knowledge_sources ?? []).find(
    (source) => source.source_type === "user_authenticated_payer_portal" || source.source_key?.includes("portal")
  );
  const pointer = (envelope?.db_pointers ?? []).find((item) => item.sourceUrl || item.source_url);
  return firstPresent([
    options.portalUrl,
    envelope?.portal_url,
    envelope?.raw_input?.portalUrl,
    envelope?.raw_input?.member?.portalUrl,
    envelope?.raw_input?.member?.portal_url,
    knowledgeSource?.base_url,
    pointer?.sourceUrl,
    pointer?.source_url
  ]);
}

function deriveApprovalScope(envelope, options = {}) {
  return firstPresent([
    options.approvalScope,
    envelope?.approval_scope,
    envelope?.raw_input?.approvalScope,
    envelope?.raw_input?.approval_scope,
    envelope?.approval_policy?.read_only_navigation === "approved" ? "read_only_observation" : null,
    "read_only_observation"
  ]);
}

function collectBlockedActions(envelope) {
  const requestedText = [
    envelope?.user_input,
    envelope?.raw_input?.message,
    envelope?.raw_input?.userInput,
    envelope?.raw_input?.instruction
  ]
    .filter(Boolean)
    .join("\n");
  return BLOCKED_ACTION_PATTERNS.filter((item) => item.pattern.test(requestedText)).map((item) => ({
    key: item.key,
    issue: item.issue
  }));
}

function requiredInputMap(envelope, options = {}) {
  return {
    user_id: envelope?.user_id ?? null,
    session_id: envelope?.session_id ?? null,
    workflow_key: deriveWorkflowKey(envelope, options),
    portal_url: derivePortalUrl(envelope, options),
    approval_scope: deriveApprovalScope(envelope, options)
  };
}

export function validateOpenClawEnvelopeAgainstSkill(envelope, artifact, options = {}) {
  const issues = [];
  const warnings = [];
  const manifest = artifact?.manifest ?? {};
  const skillValidation = artifact?.validation ?? { valid: false, issues: ["Skill artifact was not validated."] };
  const requiredInputs = requiredInputMap(envelope, options);
  const blockedActions = collectBlockedActions(envelope);
  const allowedWorkflows = manifest.allowed_workflows ?? [];
  const approvalGates = manifest.approval_gates ?? {};
  const fallbackPath = manifest.fallback_strategy?.order ?? [];
  const stopConditions = [manifest.fallback_strategy?.stop_condition, ...(manifest.must_never ?? [])].filter(Boolean);

  if (!skillValidation.valid) {
    issues.push(...skillValidation.issues.map((issue) => `Skill artifact invalid: ${issue}`));
  }
  if (artifact?.skillKey !== DEFAULT_OPENCLAW_SKILL_KEY || manifest.skill_key !== DEFAULT_OPENCLAW_SKILL_KEY) {
    issues.push("Only the repo-scoped insurance_portal_browser skill may be proposed in this slice.");
  }
  if (envelope?.envelope_type !== "openclaw_channel_task") {
    issues.push("Envelope type must be openclaw_channel_task.");
  }
  for (const input of manifest.inputs?.required ?? []) {
    if (!requiredInputs[input]) issues.push(`Missing required OpenClaw skill input: ${input}.`);
  }
  if (requiredInputs.workflow_key && !allowedWorkflows.includes(requiredInputs.workflow_key)) {
    issues.push(`Workflow ${requiredInputs.workflow_key} is not allowed by ${manifest.skill_key}.`);
  }
  if (envelope?.approval_policy?.credential_entry !== "user_only") {
    issues.push("Envelope approval policy must keep credential_entry as user_only.");
  }
  if (envelope?.approval_policy?.medical_advice !== "not_allowed") {
    issues.push("Envelope approval policy must keep medical_advice as not_allowed.");
  }
  if (!fallbackPath.includes("manual_user_export")) {
    warnings.push("Manual user export is not available as a fallback.");
  }
  if (requiredInputs.approval_scope !== "read_only_observation") {
    warnings.push(`Approval scope ${requiredInputs.approval_scope} is not the default read_only_observation scope.`);
  }
  for (const blocked of blockedActions) {
    issues.push(blocked.issue);
  }

  const risksOrBlockers = [
    ...issues,
    ...(blockedActions.length ? blockedActions.map((item) => `blocked_action:${item.key}`) : []),
    "real_openclaw_worker_execution_gated",
    "credential_entry_user_only",
    "no_external_action_performed"
  ];
  const approvalsRequired = [
    "read_only_navigation_scope_approval",
    "real_openclaw_worker_execution",
    ...Object.entries(approvalGates)
      .filter(([, value]) => value && value !== "not_allowed")
      .map(([key, value]) => `${key}:${value}`)
  ];

  return {
    version: OPENCLAW_SKILL_INVOCATION_VERSION,
    skillKey: DEFAULT_OPENCLAW_SKILL_KEY,
    executionMode: "proposal_only",
    valid: issues.length === 0,
    status: issues.length === 0 ? "validated_proposal_not_executed" : "blocked_proposal_not_executed",
    issues,
    warnings: [...warnings, ...(skillValidation.warnings ?? [])],
    requiredInputs,
    workflowAllowed: requiredInputs.workflow_key ? allowedWorkflows.includes(requiredInputs.workflow_key) : false,
    blockedActions,
    approvalGates,
    approvalsRequired,
    fallbackPath,
    stopConditions,
    returnFormat: manifest.outputs?.required ?? [],
    actionsTaken: [],
    risksOrBlockers
  };
}

export async function recordOpenClawSkillInvocationProposal(store, { user, session, contextPacketId, envelope, validation, workerPlan = null }) {
  const createdAt = nowIso();
  const metadata = {
    version: OPENCLAW_SKILL_INVOCATION_VERSION,
    skillKey: validation.skillKey,
    executionMode: validation.executionMode,
    validation,
    workerPlan,
    envelopeSummary: {
      envelopeType: envelope?.envelope_type ?? null,
      channel: envelope?.channel ?? null,
      workflowKey: validation.requiredInputs.workflow_key,
      portalUrl: validation.requiredInputs.portal_url,
      userInputPreview: String(envelope?.user_input ?? "").slice(0, 240)
    },
    sourceContextPacketId: contextPacketId ?? null,
    notExecuted: true,
    actionsTaken: []
  };
  const task = {
    id: createId("task"),
    user_id: user.id,
    session_id: session?.id ?? null,
    workflow_key: validation.requiredInputs.workflow_key,
    journey_stage: envelope?.workflow_architecture?.route_candidates?.[0]?.journeyStage ?? null,
    task_type: OPENCLAW_PROPOSAL_TASK_TYPE,
    status: validation.valid ? "pending_approval" : "pending_integration",
    priority: validation.valid ? "medium" : "high",
    description: validation.valid
      ? "Review and approve the proposed read-only OpenClaw insurance portal browser task before any worker execution."
      : "Resolve OpenClaw skill proposal blockers before any insurance portal browser worker can run.",
    source_table: "context_packets",
    source_id: contextPacketId ?? null,
    scheduled_job_id: null,
    due_at: null,
    metadata_json: JSON.stringify(metadata),
    created_at: createdAt,
    updated_at: createdAt
  };
  await store.insert("agent_tasks", task);
  const auditEvent = await audit(store, session?.id ?? null, "openclaw_skill_invocation_proposed", {
    taskId: task.id,
    skillKey: validation.skillKey,
    executionMode: validation.executionMode,
    workerPlanId: workerPlan?.planId ?? null,
    workerJobIds: workerPlan?.workerJobs?.map((job) => job.jobId) ?? [],
    status: validation.status,
    valid: validation.valid,
    workflowKey: validation.requiredInputs.workflow_key,
    approvalsRequired: validation.approvalsRequired,
    fallbackPath: validation.fallbackPath,
    actionsTaken: []
  });
  return {
    task,
    auditEvent,
    executionMode: validation.executionMode,
    actionsTaken: []
  };
}
