import { enrollDefaultMember } from "./enrollment.mjs";
import { runLangGraphOrchestration } from "./langgraphRunner.mjs";
import { getOpenAiConfig } from "./secrets.mjs";

export const ORCHESTRATOR_DEMO_VERSION = "2026-05-27.orchestrator-demo.v1";

export const ORCHESTRATOR_FLOW_CASES = [
  {
    id: "eligibility_benefits",
    title: "Eligibility and benefits",
    journeyStage: "coverage_understanding",
    expectedWorkflow: "eligibility_benefits_navigation",
    message: "Review my Aetna eligibility, benefits, deductible, copay, and out-of-pocket status from the member portal."
  },
  {
    id: "claim_status",
    title: "Claim status",
    journeyStage: "service_use_claim",
    expectedWorkflow: "claim_status_navigation",
    message: "Check the status of my recent Aetna claim and show patient responsibility, service date, and next steps."
  },
  {
    id: "prior_authorization",
    title: "Prior authorization",
    journeyStage: "service_authorization",
    expectedWorkflow: "prior_authorization_navigation",
    message: "Review the prior authorization status for an upcoming service and identify payer policy evidence needed."
  },
  {
    id: "denial_appeal",
    title: "Denial appeal preparation",
    journeyStage: "denial_resolution",
    expectedWorkflow: "denial_appeal_preparation",
    message: "Prepare a denial appeal reconsideration checklist and medical necessity letter outline for an Aetna denial, without sending or filing anything."
  },
  {
    id: "portal_extraction",
    title: "Read-only portal extraction",
    journeyStage: "evidence_capture",
    expectedWorkflow: "payer_portal_read_only_extraction",
    message: "Use the logged Chrome portal in read-only mode to extract visible payer portal facts with source pointers."
  },
  {
    id: "document_trace_review",
    title: "Document and trace review",
    journeyStage: "evidence_review",
    expectedWorkflow: "document_or_trace_review",
    message: "Review the portal trace and captured document evidence to identify missing insurance data."
  },
  {
    id: "human_approval_gate",
    title: "Human approval gate",
    journeyStage: "approval_gate",
    expectedWorkflow: "human_approval_escalation",
    message: "Before any send, submit, payer contact, or appeal filing, pause and show what needs explicit approval."
  }
];

function publicOpenAIConfig() {
  const { configured, model, baseURL } = getOpenAiConfig();
  return { configured, model, baseURL };
}

function summarizeChecks(checks = []) {
  return checks.map((check) => ({
    name: check.name,
    passed: check.passed,
    severity: check.severity
  }));
}

export function summarizeOrchestratorRun(caseSpec, graphRun) {
  const state = graphRun.state;
  const workerPlan = state.openclaw_worker_plan;
  const firstJob = workerPlan?.workerJobs?.[0] ?? null;
  return {
    caseId: caseSpec.id,
    title: caseSpec.title,
    expectedWorkflow: caseSpec.expectedWorkflow,
    actualWorkflow: state.workflow,
    workflowMatched: state.workflow === caseSpec.expectedWorkflow,
    journeyStage: state.workflow_route?.journeyStage ?? null,
    routeReason: state.route_reason,
    routeScore: state.workflow_route?.routeScore ?? null,
    policy: {
      allowed: state.policy_result?.allowed ?? null,
      approvalRequired: state.policy_result?.approvalRequired ?? null,
      checks: summarizeChecks(state.policy_result?.checks)
    },
    decisionPoints: [
      {
        key: "input_policy",
        status: state.policy_result?.allowed ? "allowed" : "blocked_or_gated",
        detail: state.policy_result?.approvalRequired ? "approval_required" : "no_external_action_gate"
      },
      {
        key: "workflow_router",
        status: state.workflow,
        detail: state.route_reason
      },
      {
        key: "openclaw_skill_validation",
        status: state.openclaw_skill_validation?.status ?? "not_prepared",
        detail: (state.openclaw_skill_validation?.issues ?? []).join("; ") || "no validation issues"
      },
      {
        key: "worker_plan",
        status: workerPlan?.dispatchStatus ?? "not_prepared",
        detail: firstJob ? `${firstJob.worker.agentId}:${firstJob.jobId}` : "no worker job"
      },
      {
        key: "model_invocation",
        status: state.model_invocation?.mode ?? "not_run",
        detail: state.model_invocation?.model ?? null
      }
    ],
    openclawJobs: (workerPlan?.workerJobs ?? []).map((job) => ({
      jobId: job.jobId,
      correlationId: job.correlationId,
      status: job.status,
      executionMode: job.executionMode,
      profile: job.worker.profile,
      agentId: job.worker.agentId,
      workspace: job.worker.workspace,
      mayChooseWorkflow: job.deterministicControls.workerMayChooseWorkflow,
      mayCreateSubtasks: job.deterministicControls.workerMayCreateSubtasks,
      allowedActions: job.allowedWork.allowedActions,
      fallbackPath: job.allowedWork.fallbackPath,
      actionsTaken: job.actionsTaken
    })),
    workerPlan: workerPlan
      ? {
          planId: workerPlan.planId,
          owner: workerPlan.owner,
          status: workerPlan.status,
          dispatchStatus: workerPlan.dispatchStatus,
          fanOutMode: workerPlan.fanOut.mode,
          fanInOwner: workerPlan.fanIn.owner,
          actionsTaken: workerPlan.actionsTaken
        }
      : null,
    proposal: state.openclaw_skill_proposal
      ? {
          taskId: state.openclaw_skill_proposal.task.id,
          taskType: state.openclaw_skill_proposal.task.task_type,
          status: state.openclaw_skill_proposal.task.status,
          executionMode: state.openclaw_skill_proposal.executionMode,
          actionsTaken: state.openclaw_skill_proposal.actionsTaken
        }
      : null,
    modelInvocation: {
      mode: state.model_invocation?.mode ?? null,
      provider: state.model_invocation?.provider ?? null,
      model: state.model_invocation?.model ?? null,
      payloadMode: state.model_invocation?.payloadMode ?? null,
      responsePreview: String(state.model_invocation?.response ?? "").slice(0, 500)
    },
    finalResponse: state.final_response
  };
}

export async function authenticatePlannedUser(store, { member = {}, sessionId = null, resumeLatestSession = false } = {}) {
  const enrollment = await enrollDefaultMember(store, member, {
    sessionId,
    resumeLatestSession,
    title: "Orchestrator demo session"
  });
  return {
    version: ORCHESTRATOR_DEMO_VERSION,
    auth: {
      status: "local_planned_user_authenticated",
      method: "local_demo_member_profile",
      userId: enrollment.user.id,
      sessionId: enrollment.session.id,
      langgraphThreadId: enrollment.session.langgraph_thread_id,
      externalIdentityProvider: "not_configured",
      credentialHandling: "user_only"
    },
    user: enrollment.user,
    portal: enrollment.portal,
    session: enrollment.session
  };
}

export async function runOrchestratorChat(store, options = {}) {
  const requireLiveModel = options.requireLiveModel ?? true;
  const useLiveModel = options.useLiveModel ?? true;
  const openAI = publicOpenAIConfig();
  if (requireLiveModel && (!useLiveModel || !openAI.configured)) {
    throw new Error("Real OpenAI model invocation is required for this orchestrator proof. Configure OPENAI_API_KEY and keep live model enabled.");
  }
  const auth = await authenticatePlannedUser(store, {
    member: options.member ?? {},
    sessionId: options.sessionId ?? null,
    resumeLatestSession: Boolean(options.resumeLatestSession)
  });
  const graphRun = await runLangGraphOrchestration(store, {
    user: auth.user,
    session: auth.session,
    channel: auth.session.channel,
    userInput: options.message ?? "Start the Brainstyworkers orchestrator and choose the best workflow.",
    rawMessage: {
      source: "api_orchestrator_chat",
      authStatus: auth.auth.status,
      useLiveModel: Boolean(useLiveModel),
      payloadMode: options.payloadMode ?? "phi_allowed_identifier_masked_reasoning",
      requestedAt: new Date().toISOString()
    }
  });
  const caseSpec = {
    id: "interactive_chat",
    title: "Interactive LangGraph chat",
    expectedWorkflow: graphRun.state.workflow
  };
  return {
    version: ORCHESTRATOR_DEMO_VERSION,
    auth: auth.auth,
    user: auth.user,
    portal: auth.portal,
    session: auth.session,
    openAI,
    run: summarizeOrchestratorRun(caseSpec, graphRun),
    graphRun
  };
}

export async function runOrchestratorFlowCases(store, options = {}) {
  const requireLiveModel = options.requireLiveModel ?? true;
  const useLiveModel = options.useLiveModel ?? true;
  const openAI = publicOpenAIConfig();
  if (requireLiveModel && (!useLiveModel || !openAI.configured)) {
    throw new Error("Real OpenAI model invocation is required for flow cases. Configure OPENAI_API_KEY and keep live model enabled.");
  }
  const auth = await authenticatePlannedUser(store, {
    member: options.member ?? {},
    sessionId: options.sessionId ?? null,
    resumeLatestSession: Boolean(options.resumeLatestSession)
  });
  const selectedCaseIds = options.caseIds?.length ? new Set(options.caseIds) : null;
  const cases = ORCHESTRATOR_FLOW_CASES.filter((item) => !selectedCaseIds || selectedCaseIds.has(item.id));
  const runs = [];
  for (const caseSpec of cases) {
    const graphRun = await runLangGraphOrchestration(store, {
      user: auth.user,
      session: auth.session,
      channel: auth.session.channel,
      userInput: caseSpec.message,
      rawMessage: {
        source: "api_orchestrator_flow_cases",
        caseId: caseSpec.id,
        authStatus: auth.auth.status,
        useLiveModel: Boolean(useLiveModel),
        payloadMode: options.payloadMode ?? "phi_allowed_identifier_masked_reasoning",
        requestedAt: new Date().toISOString()
      }
    });
    runs.push(summarizeOrchestratorRun(caseSpec, graphRun));
  }
  return {
    version: ORCHESTRATOR_DEMO_VERSION,
    auth: auth.auth,
    user: auth.user,
    portal: auth.portal,
    session: auth.session,
    openAI,
    requestedLiveModel: Boolean(useLiveModel),
    cases: runs,
    aggregate: {
      total: runs.length,
      matched: runs.filter((run) => run.workflowMatched).length,
      pendingApproval: runs.filter((run) => run.proposal?.status === "pending_approval").length,
      pendingIntegration: runs.filter((run) => run.proposal?.status === "pending_integration").length,
      notDispatched: runs.every((run) => run.workerPlan?.dispatchStatus === "not_dispatched"),
      actionsTaken: runs.flatMap((run) => run.workerPlan?.actionsTaken ?? [])
    }
  };
}
