import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { SCHEMA_SQL, TABLES } from "../concierge/schema.mjs";
import { AUDIT_CHAIN_VERSION } from "../concierge/audit.mjs";
import { describeLangGraphScope } from "../concierge/langgraphScope.mjs";
import { createBrainstyLangGraph, LANGGRAPH_RUNNER_VERSION } from "../concierge/langgraphRunner.mjs";
import { auditPromptContractSafety, buildPromptBundle } from "../concierge/promptContracts.mjs";
import { buildRuntimeCompatibilityBundle } from "../concierge/runtimeAdapters.mjs";
import { loadOpenClawSkillArtifact } from "../concierge/openclawSkillArtifacts.mjs";
import { validateOpenClawEnvelopeAgainstSkill } from "../concierge/openclawSkillInvocation.mjs";
import { buildLangGraphOpenClawWorkerPlan, validateOpenClawWorkerPlan } from "../concierge/openclawWorkerContract.mjs";
import { buildOutboundPayloadObservation, OUTBOUND_PAYLOAD_OBSERVABILITY_VERSION } from "../concierge/outboundPayloadObservability.mjs";
import { ORCHESTRATOR_FLOW_CASES } from "../concierge/orchestratorDemo.mjs";

const requiredFiles = [
  "src/app/index.html",
  "src/app/app.js",
  "src/app/styles.css",
  "src/server/server.mjs",
  "src/concierge/engine.mjs",
  "src/concierge/openclawSkillInvocation.mjs",
  "src/concierge/openclawWorkerContract.mjs",
  "src/concierge/orchestratorDemo.mjs",
  "src/concierge/outboundPayloadObservability.mjs",
  "src/concierge/productMemory.mjs",
  "src/concierge/llmOrchestrationDecision.mjs",
  "src/concierge/runtimeEvents.mjs",
  "tools/graphiti/graphiti_bridge.py",
  "vendor/getzep-graphiti/pyproject.toml",
  "openclaw/skills/insurance-portal-browser/SKILL.md",
  "openclaw/skills/insurance-portal-browser/skill.json"
];

for (const file of requiredFiles) {
  await access(resolve(file));
}

if (!TABLES.includes("eligibility_snapshots")) {
  throw new Error("Database schema is missing eligibility_snapshots");
}

if (!TABLES.includes("portal_page_snapshots")) {
  throw new Error("Database schema is missing portal_page_snapshots");
}

if (!TABLES.includes("session_checkpoints")) {
  throw new Error("Database schema is missing session_checkpoints");
}

if (!TABLES.includes("memory_items") || !TABLES.includes("scheduled_jobs") || !TABLES.includes("openclaw_instances")) {
  throw new Error("Database schema is missing memory harness tables");
}

if (
  !TABLES.includes("workflow_definitions") ||
  !TABLES.includes("tool_registry") ||
  !TABLES.includes("knowledge_sources") ||
  !TABLES.includes("openclaw_skills") ||
  !TABLES.includes("workflow_runs") ||
  !TABLES.includes("user_journey_events")
) {
  throw new Error("Database schema is missing workflow architecture registry tables");
}

if (!SCHEMA_SQL.includes("CREATE TABLE IF NOT EXISTS audit_events")) {
  throw new Error("Database schema is missing audit_events table");
}

if (!TABLES.includes("runtime_events") || !TABLES.includes("runtime_hook_subscriptions")) {
  throw new Error("Database schema is missing Phase 8 runtime event/hook tables");
}

if (!TABLES.includes("worker_continuations") || !SCHEMA_SQL.includes("CREATE TABLE IF NOT EXISTS worker_continuations")) {
  throw new Error("Database schema is missing Phase 8E worker continuation table");
}

if (!SCHEMA_SQL.includes("event_hash TEXT") || !SCHEMA_SQL.includes("previous_event_hash TEXT")) {
  throw new Error("Database schema is missing audit hash-chain columns");
}

const scope = describeLangGraphScope();
if (!scope.activeHarness.includes("hook-style recall before orchestration")) {
  throw new Error("LangGraph/Hindsight hook harness scope description is incomplete");
}

if (!scope.activeHarness.includes("real Zep Graphiti product-memory retain/recall when explicitly enabled")) {
  throw new Error("Real Zep Graphiti product memory runtime is not described");
}

const promptAudit = auditPromptContractSafety(buildPromptBundle({ user: { name: "Test", email: "test@example.com" } }));
if (!Object.values(promptAudit).every(Boolean)) {
  throw new Error("Prompt contract safety audit is incomplete");
}

const runtimeBundle = buildRuntimeCompatibilityBundle({
  schemaVersion: 1,
  user: { id: "user_test", name: "Test", email: "test@example.com" },
  currentSession: {
    id: "session_test",
    threadId: "thread:user_test:session_test",
    channel: "local_web_chat",
    currentStep: "created",
    stateVersion: 1
  },
  request: { channel: "local_web_chat", userInput: "Review Aetna benefits." },
  memoryItems: [],
  dbPointers: [],
  userProfileCompleteness: { present: { "user.id": true, "user.email": true, portal_account: true } },
  workflowArchitecture: {
    readiness: [
      {
        workflowKey: "eligibility_benefits_navigation",
        journeyStage: "coverage_understanding",
        executableNow: true,
        routeScore: 2
      }
    ],
    routeCandidates: [
      {
        workflowKey: "eligibility_benefits_navigation",
        journeyStage: "coverage_understanding",
        executableNow: true,
        routeScore: 2
      }
    ],
    knowledgeSources: [],
    openclawSkills: []
  },
  openTasks: [],
  scheduledJobs: [],
  openclaw: { instanceId: "openclaw_test", status: "always_on_local_harness", channel: "local_web_chat" },
  safety: {
    externalMessaging: "requires_explicit_approval_gate",
    payerCommunication: "requires_explicit_approval_gate",
    credentialEntry: "user_only",
    medicalAdvice: "not_allowed"
  },
  promptBundle: buildPromptBundle({ user: { id: "user_test", name: "Test", email: "test@example.com" } })
});
if (!runtimeBundle.validation.compatible) {
  throw new Error(`Runtime adapter compatibility failed: ${runtimeBundle.validation.issues.join("; ")}`);
}

if (!LANGGRAPH_RUNNER_VERSION.includes("langgraph-runner")) {
  throw new Error("LangGraph runner version is missing.");
}

const outboundObservation = buildOutboundPayloadObservation(
  { messages: [{ role: "user", content: "Use dbPointers [] and keep member ID masked." }] },
  { payloadType: "build_check", destination: "openai", user: { id: "user_test", name: "Build Check", email: "build@example.com" } }
);
if (
  !AUDIT_CHAIN_VERSION.includes("audit-chain") ||
  outboundObservation.version !== OUTBOUND_PAYLOAD_OBSERVABILITY_VERSION ||
  outboundObservation.enforcementMode !== "observe_only" ||
  outboundObservation.containsDirectIdentifier
) {
  throw new Error("Outbound payload observability contract is incomplete.");
}

if (!createBrainstyLangGraph()) {
  throw new Error("LangGraph runner failed to compile.");
}

const insurancePortalSkill = await loadOpenClawSkillArtifact("insurance_portal_browser");
if (!insurancePortalSkill.validation.valid) {
  throw new Error(`OpenClaw skill artifact validation failed: ${insurancePortalSkill.validation.issues.join("; ")}`);
}

const skillProposalValidation = validateOpenClawEnvelopeAgainstSkill(runtimeBundle.openclaw.channelEnvelope, insurancePortalSkill, {
  portalUrl: "https://www.aetna.com/",
  approvalScope: "read_only_observation"
});
if (!skillProposalValidation.valid || skillProposalValidation.executionMode !== "proposal_only") {
  throw new Error(`OpenClaw skill envelope proposal validation failed: ${skillProposalValidation.issues.join("; ")}`);
}

const workerPlan = buildLangGraphOpenClawWorkerPlan(runtimeBundle.openclaw.channelEnvelope, skillProposalValidation);
const workerPlanValidation = validateOpenClawWorkerPlan(workerPlan);
if (!workerPlanValidation.valid) {
  throw new Error(`OpenClaw worker plan validation failed: ${workerPlanValidation.issues.join("; ")}`);
}

if (ORCHESTRATOR_FLOW_CASES.length < 7 || !ORCHESTRATOR_FLOW_CASES.some((item) => item.expectedWorkflow === "human_approval_escalation")) {
  throw new Error("Orchestrator flow cases do not cover all planned workflow journeys.");
}

console.log("Build check passed: files, schema, LangGraph scope, Graphiti memory, outbound payload policy, and audit integrity are present.");
