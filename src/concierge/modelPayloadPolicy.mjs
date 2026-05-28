export const MODEL_PAYLOAD_POLICY_VERSION = "2026-05-18.model-payload-policy.v2";

function pickRoute(route) {
  if (!route) return null;
  return {
    workflowKey: route.workflowKey,
    journeyStage: route.journeyStage,
    executableNow: route.executableNow,
    routeScore: route.routeScore,
    missingUserFields: route.missingUserFields ?? [],
    missingDataPointers: route.missingDataPointers ?? [],
    disabledTools: route.disabledTools ?? []
  };
}

function summarizeToolStatus(route) {
  return (route?.toolStatus ?? []).map((tool) => ({
    toolKey: tool.toolKey,
    present: tool.present,
    enabled: tool.enabled,
    integrationStatus: tool.integrationStatus,
    approvalRequired: tool.approvalRequired
  }));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function directIdentifierPointers(state) {
  const user = state.context_packet?.user ?? {};
  return {
    patientName: user.name ? `[DB_POINTER:users:${user.id ?? "current"}:name]` : "[DB_POINTER:users:current:name]",
    patientEmail: user.email ? `[DB_POINTER:users:${user.id ?? "current"}:email]` : "[DB_POINTER:users:current:email]",
    ssn: "[DB_POINTER:sensitive_identifiers:ssn:not_stored]",
    subscription: "[DB_POINTER:insurance_identifiers:member_or_subscriber_id]"
  };
}

export function maskDirectIdentifiers(value, state) {
  let text = String(value ?? "");
  const user = state.context_packet?.user ?? {};
  const pointers = directIdentifierPointers(state);
  if (user.name) {
    text = text.replace(new RegExp(escapeRegex(user.name), "gi"), pointers.patientName);
    for (const part of user.name.split(/\s+/).filter((item) => item.length > 2)) {
      text = text.replace(new RegExp(`\\b${escapeRegex(part)}\\b`, "gi"), pointers.patientName);
    }
  }
  if (user.email) {
    text = text.replace(new RegExp(escapeRegex(user.email), "gi"), pointers.patientEmail);
  }
  text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, pointers.ssn);
  text = text.replace(/\b\d{9}\b/g, pointers.ssn);
  text = text.replace(
    /\b(member|subscriber|subscription)\s*(id|number|#|no\.?)?\s*(?:[:#=-]\s*)?(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{4,}\b/gi,
    (match) => {
      const label = match.match(/^(member|subscriber|subscription)/i)?.[0] ?? "member";
      return `${label} identifier ${pointers.subscription}`;
    }
  );
  return text;
}

function maskObject(value, state) {
  if (typeof value === "string") return maskDirectIdentifiers(value, state);
  if (Array.isArray(value)) return value.map((item) => maskObject(item, state));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, maskObject(entry, state)]));
  }
  return value;
}

export function buildRouteProofPayload(state) {
  const route = pickRoute(state.workflow_route);
  return {
    policyVersion: MODEL_PAYLOAD_POLICY_VERSION,
    disclosureMode: "route_proof_only",
    workflow: state.workflow,
    route,
    toolStatus: summarizeToolStatus(state.workflow_route),
    safety: {
      policyAllowed: state.safety?.policyAllowed,
      approvalRequired: state.safety?.approvalRequired,
      failedChecks: (state.safety?.checks ?? []).filter((check) => !check.passed).map((check) => check.name)
    },
    decisionPoints: [
      {
        key: "input_policy",
        owner: "langgraph",
        status: state.safety?.policyAllowed ? "allowed" : "blocked_or_gated"
      },
      {
        key: "workflow_router",
        owner: "langgraph",
        status: state.workflow ?? "not_selected",
        reason: state.route_reason ?? null
      },
      {
        key: "openclaw_worker_plan",
        owner: "langgraph",
        status: state.openclaw_worker_plan?.dispatchStatus ?? "not_prepared"
      }
    ],
    openclawWorkerPlan: state.openclaw_worker_plan
      ? {
          planId: state.openclaw_worker_plan.planId,
          owner: state.openclaw_worker_plan.owner,
          status: state.openclaw_worker_plan.status,
          dispatchStatus: state.openclaw_worker_plan.dispatchStatus,
          workerJobs: state.openclaw_worker_plan.workerJobs.map((job) => ({
            jobId: job.jobId,
            correlationId: job.correlationId,
            profile: job.worker.profile,
            agentId: job.worker.agentId,
            workflowMaster: job.deterministicControls.workflowMaster,
            workerMayChooseWorkflow: job.deterministicControls.workerMayChooseWorkflow,
            workerMayCreateSubtasks: job.deterministicControls.workerMayCreateSubtasks
          }))
        }
      : null,
    proofInstruction:
      "Confirm whether the route proof is internally consistent. Do not claim external action was performed."
  };
}

export function buildPhiAllowedReasoningPayload(state) {
  const pointers = directIdentifierPointers(state);
  return {
    ...buildRouteProofPayload(state),
    disclosureMode: "phi_allowed_identifier_masked_reasoning",
    consentBasis:
      "Patient-approved product scope allows insurance, portal, and clinical context to be sent to the company LLM provider for reasoning. Direct patient identifiers are masked as database pointers.",
    identifierMasking: {
      masked: ["patient_name", "patient_email", "ssn", "member_id", "subscriber_id", "subscription_number"],
      pointers
    },
    userInput: maskDirectIdentifiers(state.user_input, state),
    memoryContext: maskDirectIdentifiers(state.memory_context, state),
    openTasks: maskObject(state.context_packet?.openTasks ?? [], state),
    scheduledJobs: maskObject(state.context_packet?.scheduledJobs ?? [], state),
    dbPointers: state.context_packet?.dbPointers ?? [],
    workflowArchitecture: {
      routeCandidates: state.context_packet?.workflowArchitecture?.routeCandidates ?? [],
      readiness: state.context_packet?.workflowArchitecture?.readiness ?? [],
      knowledgeSources: state.context_packet?.workflowArchitecture?.knowledgeSources ?? [],
      openclawSkills: state.context_packet?.workflowArchitecture?.openclawSkills ?? []
    },
    reasoningInstruction:
      "Use the PHI-bearing insurance and clinical context for healthcare insurance navigation reasoning only. Do not provide diagnosis, treatment, dosage, or clinical care decisions. Keep direct identifiers masked in the response."
  };
}

export function selectModelPayload(state, { payloadMode = "phi_allowed_identifier_masked_reasoning" } = {}) {
  if (payloadMode === "route_proof_only") {
    return {
      allowed: true,
      mode: "route_proof_only",
      payload: buildRouteProofPayload(state),
      warning: null
    };
  }
  return {
    allowed: true,
    mode: "phi_allowed_identifier_masked_reasoning",
    payload: buildPhiAllowedReasoningPayload(state),
    warning: "Payload may include insurance, portal, and clinical PHI context, with direct patient identifiers masked as database pointers."
  };
}
