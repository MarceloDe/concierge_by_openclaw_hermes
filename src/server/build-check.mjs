import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildAi2UiBlocksFromState, normalizeAi2UiBlocks } from "../concierge/ai2uiBlocks.mjs";
import { SCHEMA_SQL, TABLES } from "../concierge/schema.mjs";
import { AUDIT_CHAIN_VERSION, AUDIT_LOG_API_VERSION } from "../concierge/audit.mjs";
import { describeLangGraphScope } from "../concierge/langgraphScope.mjs";
import { createBrainstyLangGraph, LANGGRAPH_RUNNER_VERSION } from "../concierge/langgraphRunner.mjs";
import {
  buildContinuousIntelligencePersistenceReadinessProof,
  buildContinuousIntelligenceReadinessProof,
  buildPemsLiveClaimCitationClosureProof,
  buildPemsLiveEvaluatorFilteringProof,
  buildPemsPromotionReadinessProof,
  buildPemsReviewerClaimRevisionProof,
  buildPemsReviewerComparisonProvenance,
  buildPemsReviewerFollowUpProof,
  buildPemsReviewerHistoryExportProof,
  buildPemsReviewerHistoryReviewProof,
  buildPemsReviewerWorkbenchReadinessProof,
  PEMS_LIVE_CLAIM_CITATION_CLOSURE_VERSION,
  PEMS_LIVE_EVALUATOR_FILTERING_VERSION,
  PEMS_REVIEWER_CLAIM_REVISION_VERSION,
  PEMS_REVIEWER_COMPARISON_VERSION,
  PEMS_REVIEWER_FOLLOW_UP_VERSION,
  PEMS_REVIEWER_HISTORY_EXPORT_VERSION,
  PEMS_REVIEWER_HISTORY_REVIEW_VERSION,
  PEMS_REVIEW_WORKBENCH_VERSION,
  PEMS_PROMOTION_GATE_VERSION
} from "../concierge/continuousIntelligence.mjs";
import { auditPromptContractSafety, buildPromptBundle } from "../concierge/promptContracts.mjs";
import { buildRuntimeCompatibilityBundle } from "../concierge/runtimeAdapters.mjs";
import { loadOpenClawSkillArtifact } from "../concierge/openclawSkillArtifacts.mjs";
import { validateOpenClawEnvelopeAgainstSkill } from "../concierge/openclawSkillInvocation.mjs";
import { buildLangGraphOpenClawWorkerPlan, validateOpenClawWorkerPlan } from "../concierge/openclawWorkerContract.mjs";
import { buildOutboundPayloadObservation, OUTBOUND_PAYLOAD_OBSERVABILITY_VERSION } from "../concierge/outboundPayloadObservability.mjs";
import { ORCHESTRATOR_FLOW_CASES } from "../concierge/orchestratorDemo.mjs";
import { listOperatorTools, OPERATOR_ASSISTANT_VERSION } from "../concierge/operatorAssistant.mjs";
import { getResearchWorkerStatus } from "../concierge/researchOps.mjs";
import { RESEARCH_SCHEDULER_DAEMON_VERSION } from "../concierge/researchScheduler.mjs";
import { loadDynamicSkillDefinitions, resolveDynamicSkillContext } from "../concierge/dynamicSkillServer.mjs";

const requiredFiles = [
  "src/app/index.html",
  "src/app/app.js",
  "src/app/styles.css",
  "src/app/mvp.html",
  "src/app/mvp.js",
  "src/app/mvp.css",
  "apps/mobile-next/package.json",
  "apps/mobile-next/app/page.jsx",
  "apps/mobile-next/app/globals.css",
  "apps/mobile-next/lib/api.js",
  "apps/mobile-next/next.config.mjs",
  ".dockerignore",
  "Dockerfile.node",
  "Dockerfile.api",
  "apps/mobile-next/Dockerfile",
  "compose.yaml",
  "compose.postgres.yaml",
  "scripts/compose-contract.mjs",
  "scripts/browser-sandbox-provider-contract.mjs",
  "scripts/browser-sandbox-provider-selection-smoke.mjs",
  "scripts/browser-sandbox-provider-live-preflight-smoke.mjs",
  "scripts/browser-sandbox-provider-live-verification-smoke.mjs",
  "scripts/browser-sandbox-provider-webrtc-signaling-smoke.mjs",
  "scripts/browser-sandbox-provider-visual-ocr-replay-smoke.mjs",
  "scripts/browser-sandbox-adapter-harness.mjs",
  "scripts/browser-sandbox-provider-resolver.mjs",
  "scripts/browser-sandbox-provider-adapter-smoke.mjs",
  "scripts/browser-sandbox-provider-http-adapter-harness-smoke.mjs",
  "scripts/browser-sandbox-provider-live-lifecycle-harness-smoke.mjs",
  "scripts/browser-sandbox-provider-steel-ops-drills-smoke.mjs",
  "infra/steel/remote/ops-drills.example.json",
  "infra/steel/remote/patching.md",
  "infra/steel/remote/backup-restore-drill.sh",
  "infra/steel/remote/health-alerts.example.json",
  "infra/steel/remote/oncall-handoff.md",
  "scripts/storage-contract.mjs",
  "scripts/postgres-runtime-smoke.mjs",
  "scripts/postgres-production-readiness-smoke.mjs",
  "scripts/postgres-default-rollout-smoke.mjs",
  "scripts/postgres-production-profile-contract.mjs",
  "scripts/postgres-endpoint-regression-smoke.mjs",
  "scripts/postgres-production-profile-live-smoke.mjs",
  "scripts/postgres-backup-runbook-smoke.mjs",
  "scripts/postgres-provider-backup-policy-smoke.mjs",
  "docs/POSTGRES_BACKUP_RESTORE_RUNBOOK.md",
  "project/deployment/postgres-provider-backup-policy.example.json",
  "project/deployment/browser-sandbox-provider.example.json",
  "project/deployment/browser-sandbox-provider.selection.example.json",
  "project/deployment/browser-sandbox-provider.live-preflight.example.env",
  "project/deployment/browser-sandbox-provider.live-verification.example.env",
  "project/deployment/browser-sandbox-provider.webrtc-signaling.example.env",
  "project/deployment/browser-sandbox-provider.visual-ocr-replay.example.env",
  "project/deployment/browser-sandbox-provider.contract-harness.json",
  "project/deployment/browser-sandbox-provider.hosted-provider.example.json",
  "project/deployment/secrets/README.md",
  "project/deployment/secrets/database-url.example",
  "scripts/compose-memory-smoke.mjs",
  "project/db/postgres-init/001_storage_readiness.sql",
  "src/concierge/databaseFactory.mjs",
  "src/concierge/databaseSecretProfile.mjs",
  "src/concierge/postgresStore.mjs",
  "src/concierge/workerLeases.mjs",
  "src/concierge/storageReadiness.mjs",
  "src/tests/deployment-compose.test.mjs",
  "src/tests/deployment-graphiti-compose.test.mjs",
  "src/tests/deployment-storage.test.mjs",
  "src/tests/browser-sandbox-provider-contract.test.mjs",
  "src/tests/postgres-store-contract.test.mjs",
  "src/tests/postgres-production-readiness-contract.test.mjs",
  "src/tests/postgres-production-profile-contract.test.mjs",
  "src/tests/postgres-production-profile-live-contract.test.mjs",
  "src/tests/postgres-backup-runbook-contract.test.mjs",
  "src/tests/postgres-provider-backup-policy-contract.test.mjs",
  "src/tests/worker-leases.test.mjs",
  "src/server/server.mjs",
  "src/concierge/engine.mjs",
  "src/concierge/openclawSkillInvocation.mjs",
  "src/concierge/openclawWorkerContract.mjs",
  "src/concierge/ai2uiBlocks.mjs",
  "src/concierge/orchestratorDemo.mjs",
  "src/concierge/outboundPayloadObservability.mjs",
  "src/concierge/productMemory.mjs",
  "src/concierge/continuousIntelligence.mjs",
  "src/concierge/llmOrchestrationDecision.mjs",
  "src/concierge/runtimeEvents.mjs",
  "src/concierge/researchOps.mjs",
  "src/concierge/researchScheduler.mjs",
  "src/concierge/dynamicSkillServer.mjs",
  "src/concierge/operatorAssistant.mjs",
  "src/concierge/humanHandoffs.mjs",
  "src/tests/research-scheduler.test.mjs",
  "src/tests/final-system-verification-report.test.mjs",
  "docs/FINAL_SYSTEM_VERIFICATION_REPORT.md",
  "docs/goal_final_system.md",
  "project/api/main.py",
  "project/api/browser_sandbox.py",
  "project/api/auth.py",
  "project/api/node_client.py",
  "project/api/task_registry.py",
  "project/requirements.txt",
  "tools/graphiti/graphiti_bridge.py",
  "vendor/getzep-graphiti/pyproject.toml",
  "openclaw/skills/insurance-portal-browser/SKILL.md",
  "openclaw/skills/insurance-portal-browser/skill.json",
  "openclaw/skills/insurance-plan-aetna-temporary/SKILL.md",
  "openclaw/skills/insurance-plan-aetna-temporary/skill-server.json",
  "openclaw/skills/claim-journey-temporary/SKILL.md",
  "openclaw/skills/claim-journey-temporary/skill-server.json"
];

for (const file of requiredFiles) {
  await access(resolve(file));
}

const finalVerificationReport = await readFile(resolve("docs/FINAL_SYSTEM_VERIFICATION_REPORT.md"), "utf8");
const appHtml = await readFile(resolve("src/app/index.html"), "utf8");
const appJs = await readFile(resolve("src/app/app.js"), "utf8");
const appCss = await readFile(resolve("src/app/styles.css"), "utf8");
for (const requiredFragment of [
  "Phase 10S AI2UI modes update",
  "Phase 10T research scheduler daemon update",
  "FAILING / NEEDS FIX",
  "BLOCKED BY EXTERNAL DEPENDENCY",
  "Chat/Split/Guided/Bento",
  "typed AI2UI block contract",
  "research knowledge-base PDF upload",
  "always-on approved-schedule daemon"
]) {
  if (!finalVerificationReport.includes(requiredFragment)) {
    throw new Error(`Final system verification report is missing required fragment: ${requiredFragment}`);
  }
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

if (!TABLES.includes("worker_leases") || !SCHEMA_SQL.includes("CREATE TABLE IF NOT EXISTS worker_leases")) {
  throw new Error("Database schema is missing production worker lease table");
}

if (!TABLES.includes("research_runs") || !TABLES.includes("research_run_events") || !TABLES.includes("research_artifacts") || !TABLES.includes("research_schedules")) {
  throw new Error("Database schema is missing Phase 10G operator research execution tables");
}

if (!TABLES.includes("research_scheduler_daemon_state") || !SCHEMA_SQL.includes("CREATE TABLE IF NOT EXISTS research_scheduler_daemon_state")) {
  throw new Error("Database schema is missing Phase 10T research scheduler daemon state table");
}

if (
  !TABLES.includes("continuous_intelligence_shadow_runs") ||
  !TABLES.includes("pems_candidate_maturity") ||
  !TABLES.includes("pems_candidate_promotion_reviews") ||
  !TABLES.includes("pems_candidate_evaluator_drafts") ||
  !TABLES.includes("pems_candidate_claim_revisions") ||
  !TABLES.includes("pems_candidate_review_followups") ||
  !TABLES.includes("pems_candidate_review_history_exports") ||
  !SCHEMA_SQL.includes("CREATE TABLE IF NOT EXISTS continuous_intelligence_shadow_runs") ||
  !SCHEMA_SQL.includes("CREATE TABLE IF NOT EXISTS pems_candidate_maturity") ||
  !SCHEMA_SQL.includes("CREATE TABLE IF NOT EXISTS pems_candidate_promotion_reviews") ||
  !SCHEMA_SQL.includes("CREATE TABLE IF NOT EXISTS pems_candidate_evaluator_drafts") ||
  !SCHEMA_SQL.includes("CREATE TABLE IF NOT EXISTS pems_candidate_claim_revisions") ||
  !SCHEMA_SQL.includes("CREATE TABLE IF NOT EXISTS pems_candidate_review_followups") ||
  !SCHEMA_SQL.includes("CREATE TABLE IF NOT EXISTS pems_candidate_review_history_exports")
) {
  throw new Error("Database schema is missing Phase 43 continuous-intelligence review workbench tables");
}

const pemsPromotionProof = buildPemsPromotionReadinessProof({
  ok: true,
  candidateCount: 1,
  reviewCount: 4,
  humanApprovalCount: 2,
  validatorPassCount: 1,
  citationPassCount: 1,
  supervisedAdvisoryCandidateCount: 1
});
if (
  pemsPromotionProof.version !== PEMS_PROMOTION_GATE_VERSION ||
  pemsPromotionProof.status !== "phase35_supervised_promotion_gate_active" ||
  pemsPromotionProof.score !== 80 ||
  pemsPromotionProof.productionDrivingAllowed !== false
) {
  throw new Error("Phase 35 PEMS supervised promotion proof contract is incomplete.");
}

const pemsWorkbenchProof = buildPemsReviewerWorkbenchReadinessProof({
  ok: true,
  candidateCount: 1,
  draftCount: 1,
  llmAssistedDraftCount: 1,
  consistencyTraceDraftCount: 1,
  advisoryLinkedReviewCount: 1
});
if (
  pemsWorkbenchProof.version !== PEMS_REVIEW_WORKBENCH_VERSION ||
  pemsWorkbenchProof.status !== "phase36_reviewer_evaluator_workbench_active" ||
  pemsWorkbenchProof.score !== 85 ||
  pemsWorkbenchProof.productionDrivingAllowed !== false
) {
  throw new Error("Phase 36 PEMS reviewer/evaluator workbench proof contract is incomplete.");
}

const pemsComparisonProof = buildPemsReviewerComparisonProvenance({
  latestDraft: {
    id: "draft_1",
    candidateId: "candidate_1",
    evaluatorMode: "llm_assisted_advisory",
    status: "draft_ready_for_human_review",
    deterministicValidatorStatus: "pass",
    suggestedDecision: "pass",
    metadata: {
      sourcePointerIds: ["source_pointer_1"],
      evaluatorModelRef: "model-ref",
      egressTraceRef: "egress-trace",
      liveLlmEvaluatorUsed: true,
      egressObserved: true,
      mockedLlmOutput: true
    }
  },
  latestCandidate: { candidateId: "candidate_1" },
  latestGate: {
    status: "shadow_review_required",
    productionDrivingAllowed: false,
    requirements: [{ key: "citation_evidence_refs", actual: 1, target: 1 }]
  }
});
if (
  pemsComparisonProof.version !== PEMS_REVIEWER_COMPARISON_VERSION ||
  pemsComparisonProof.status !== "phase38_reviewer_comparison_provenance_ready" ||
  pemsComparisonProof.score !== 90 ||
  pemsComparisonProof.evaluatorProvenance.liveProofClaimed !== false ||
  pemsComparisonProof.safety.productionDrivingAllowed !== false
) {
  throw new Error("Phase 38 PEMS reviewer comparison/provenance proof contract is incomplete.");
}

const pemsLiveEvaluatorProof = buildPemsLiveEvaluatorFilteringProof(
  {
    draftCount: 2,
    filteredDraftCount: 1,
    liveGeneratedDraftCount: 1,
    liveProofDraftCount: 1,
    mockedDraftCount: 0,
    appliedFilters: { draftStatus: "draft_ready_for_human_review", evaluatorMode: "llm_assisted_advisory", candidateId: null, liveOnly: true },
    filterOptions: {
      draftStatuses: ["all", "draft_ready_for_human_review", "needs_reviewer_attention", "blocked_by_validator"],
      evaluatorModes: ["all", "deterministic_validator_advisory", "llm_assisted_advisory", "nestr_consistency_trace"],
      liveOnly: [false, true]
    }
  },
  { openAiConfigured: true }
);
if (
  pemsLiveEvaluatorProof.version !== PEMS_LIVE_EVALUATOR_FILTERING_VERSION ||
  pemsLiveEvaluatorProof.status !== "phase39_live_evaluator_filtering_ready" ||
  pemsLiveEvaluatorProof.score !== 92 ||
  pemsLiveEvaluatorProof.liveProofClaimed !== true ||
  pemsLiveEvaluatorProof.safety.mockedLlmOutputCountsAsProof !== false ||
  pemsLiveEvaluatorProof.safety.productionDrivingAllowed !== false
) {
  throw new Error("Phase 39 PEMS live evaluator/filtering proof contract is incomplete.");
}

const pemsClaimCitationClosureProof = buildPemsLiveClaimCitationClosureProof({
  liveProofDraftCount: 1,
  latestDraft: {
    id: "draft_1",
    candidateId: "candidate_1",
    metadata: {
      liveEvaluatorGeneration: true,
      liveLlmEvaluatorUsed: true,
      egressObserved: true,
      mockedLlmOutput: false,
      sourcePointerIds: ["source_pointer_1"],
      claimCitationClosure: [
        {
          claimPreview: "The benefit is supported by the source pointer.",
          status: "supported",
          sourcePointerIds: ["source_pointer_1"]
        },
        {
          claimPreview: "The deductible is definitely waived.",
          status: "unsupported",
          sourcePointerIds: [],
          suggestedEditPreview: "Remove the unsupported deductible waiver claim."
        }
      ]
    }
  }
});
if (
  pemsClaimCitationClosureProof.version !== PEMS_LIVE_CLAIM_CITATION_CLOSURE_VERSION ||
  pemsClaimCitationClosureProof.status !== "phase40_claim_citation_closure_veto_visible" ||
  pemsClaimCitationClosureProof.score !== 94 ||
  pemsClaimCitationClosureProof.unsupportedCount !== 1 ||
  pemsClaimCitationClosureProof.safety.unsupportedClaimsVetoApproval !== true ||
  pemsClaimCitationClosureProof.productionDrivingAllowed !== false
) {
  throw new Error("Phase 40 PEMS claim citation closure proof contract is incomplete.");
}

const pemsClaimRevisionProof = buildPemsReviewerClaimRevisionProof({
  claimRevisionCount: 1,
  claimRevisionReclosedCount: 1,
  latestClaimRevision: {
    id: "revision_1",
    originalClaimHash: "original_hash",
    revisedClaimHash: "revised_hash",
    sourcePointerIds: ["source_pointer_1"],
    deterministicReclosure: {
      status: "phase41_revision_reclosure_passed",
      sourcePointerBounded: true
    }
  }
});
if (
  pemsClaimRevisionProof.version !== PEMS_REVIEWER_CLAIM_REVISION_VERSION ||
  pemsClaimRevisionProof.status !== "phase41_reviewer_claim_revision_ready" ||
  pemsClaimRevisionProof.score !== 96 ||
  pemsClaimRevisionProof.deterministicReclosurePassed !== true ||
  pemsClaimRevisionProof.preservesOriginalAndRevisedHashes !== true ||
  pemsClaimRevisionProof.safety.revisionCreatesEvidence !== false ||
  pemsClaimRevisionProof.productionDrivingAllowed !== false
) {
  throw new Error("Phase 41 PEMS reviewer claim revision proof contract is incomplete.");
}

const pemsReviewerFollowUpProof = buildPemsReviewerFollowUpProof({
  reviewerFollowUpCount: 1,
  reviewerFollowUpResolvedCount: 1,
  latestReviewerFollowUp: {
    id: "followup_1",
    claimRevisionId: "revision_1",
    promotionReviewId: "review_1",
    followupStatus: "resolved",
    workflowStatus: "advisory_closed",
    revisionOutcome: "revision_reclosure_passed"
  },
  latestPromotionReview: {
    id: "review_1",
    decision: "approved"
  }
});
if (
  pemsReviewerFollowUpProof.version !== PEMS_REVIEWER_FOLLOW_UP_VERSION ||
  pemsReviewerFollowUpProof.status !== "phase42_reviewer_follow_up_workflow_ready" ||
  pemsReviewerFollowUpProof.score !== 98 ||
  pemsReviewerFollowUpProof.bindsRevision !== true ||
  pemsReviewerFollowUpProof.bindsReviewDecision !== true ||
  pemsReviewerFollowUpProof.revisionResolvedVeto !== true ||
  pemsReviewerFollowUpProof.safety.followUpCreatesEvidence !== false ||
  pemsReviewerFollowUpProof.productionDrivingAllowed !== false
) {
  throw new Error("Phase 42 PEMS reviewer follow-up proof contract is incomplete.");
}

const pemsReviewerHistoryExportProof = buildPemsReviewerHistoryExportProof({
  reviewerHistoryExportCount: 1,
  safeHistoryExportCount: 1,
  latestReviewerHistoryExport: {
    id: "history_export_1",
    exportRef: "pems_review_history_export_ref",
    exportHash: "export_hash",
    historySnapshotHash: "snapshot_hash",
    historySnapshotPreview: {
      counts: {
        historyRowCount: 4,
        claimRevisionCount: 1,
        promotionReviewCount: 1,
        reviewerFollowUpCount: 1,
        resolvedFollowUpCount: 1
      },
      latestRefs: [
        { type: "claim_revision", id: "revision_1", status: "revision_reclosure_passed" },
        { type: "promotion_review", id: "review_1", decision: "approved" },
        { type: "review_followup", id: "followup_1", followupStatus: "resolved" }
      ]
    },
    safety: {
      rawHistoryStored: false,
      rawRevisionStored: false,
      rawReviewStored: false,
      rawSourceStored: false,
      exportCreatesEvidence: false,
      exportBypassesHumanReview: false,
      productionDrivingAllowed: false
    }
  }
});
if (
  pemsReviewerHistoryExportProof.version !== PEMS_REVIEWER_HISTORY_EXPORT_VERSION ||
  pemsReviewerHistoryExportProof.status !== "phase43_reviewer_history_audit_export_ready" ||
  pemsReviewerHistoryExportProof.score !== 99 ||
  pemsReviewerHistoryExportProof.hasExportRef !== true ||
  pemsReviewerHistoryExportProof.hasExportHash !== true ||
  pemsReviewerHistoryExportProof.hasSnapshotHash !== true ||
  pemsReviewerHistoryExportProof.safety.exportCreatesEvidence !== false ||
  pemsReviewerHistoryExportProof.productionDrivingAllowed !== false
) {
  throw new Error("Phase 43 PEMS reviewer history audit export proof contract is incomplete.");
}

const pemsReviewerHistoryReviewProof = buildPemsReviewerHistoryReviewProof({
  reviewerHistoryExportReview: {
    exportCount: 2,
    appliedFilters: { followupStatus: "resolved", sortBy: "history_row_count", sortDirection: "desc" },
    filterOptions: {
      followupStatuses: ["all", "open", "resolved", "blocked"],
      sortBy: ["created_at", "history_row_count", "export_ref", "snapshot_hash"],
      sortDirection: ["desc", "asc"]
    },
    rows: [
      {
        id: "history_export_2",
        exportRef: "pems_review_history_export_new",
        historySnapshotHash: "snapshot_hash_new",
        counts: { historyRowCount: 5, claimRevisionCount: 2, promotionReviewCount: 1, reviewerFollowUpCount: 1 },
        latestRefs: [{ type: "review_followup", id: "followup_2", followupStatus: "resolved" }],
        safety: { rawHistoryStored: false, rawSourceStored: false },
        productionDrivingAllowed: false
      },
      {
        id: "history_export_1",
        exportRef: "pems_review_history_export_old",
        historySnapshotHash: "snapshot_hash_old",
        counts: { historyRowCount: 4, claimRevisionCount: 1, promotionReviewCount: 1, reviewerFollowUpCount: 1 },
        latestRefs: [{ type: "review_followup", id: "followup_1", followupStatus: "resolved" }],
        safety: { rawHistoryStored: false, rawSourceStored: false },
        productionDrivingAllowed: false
      }
    ],
    safety: {
      rawHistoryStored: false,
      rawRevisionStored: false,
      rawReviewStored: false,
      rawSourceStored: false,
      searchCreatesEvidence: false,
      searchBypassesHumanReview: false,
      productionDrivingAllowed: false
    }
  },
  reviewerHistoryExportComparison: {
    ok: true,
    baseline: { id: "history_export_1", historySnapshotHash: "snapshot_hash_old" },
    comparison: { id: "history_export_2", historySnapshotHash: "snapshot_hash_new" },
    safety: {
      comparisonCreatesEvidence: false,
      comparisonBypassesHumanReview: false,
      automaticProductionRecommendation: false,
      productionDrivingAllowed: false
    }
  }
});
if (
  pemsReviewerHistoryReviewProof.version !== PEMS_REVIEWER_HISTORY_REVIEW_VERSION ||
  pemsReviewerHistoryReviewProof.status !== "phase44_reviewer_history_review_refinement_ready" ||
  pemsReviewerHistoryReviewProof.score !== 100 ||
  pemsReviewerHistoryReviewProof.filteredExportCount !== 2 ||
  pemsReviewerHistoryReviewProof.safety.searchCreatesEvidence !== false ||
  pemsReviewerHistoryReviewProof.safety.comparisonCreatesEvidence !== false ||
  pemsReviewerHistoryReviewProof.productionDrivingAllowed !== false
) {
  throw new Error("Phase 44 PEMS reviewer history review refinement proof contract is incomplete.");
}

for (const requiredFragment of [
  "PEMS Reviewer Workbench",
  "pemsWorkbench",
  "data-pems-review-action=\"approved\"",
  "data-pems-review-action=\"rejected\"",
  "data-pems-review-action=\"blocked\"",
  "generatePemsLiveDraft",
  "pemsDraftStatusFilter",
  "pemsEvaluatorModeFilter",
  "pemsLiveOnlyFilter",
  "pemsHistoryFollowupFilter",
  "pemsHistoryExportRefFilter",
  "pemsHistorySnapshotHashFilter",
  "pemsHistorySortBy",
  "pemsHistorySortDirection",
  "recordPemsClaimRevision",
  "pemsClaimRevisionText",
  "recordPemsFollowUp",
  "pemsFollowUpRationale",
  "recordPemsHistoryExport",
  "pemsHistoryExportReason",
  "Phase 44"
]) {
  if (!appHtml.includes(requiredFragment)) {
    throw new Error(`Phase 37 PEMS reviewer UI is missing required HTML fragment: ${requiredFragment}`);
  }
}
for (const requiredFragment of [
  "loadPemsWorkbench",
  "renderPemsWorkbench",
  "submitPemsWorkbenchReview",
  "/api/continuous-intelligence/pems/workbench",
  "/api/continuous-intelligence/pems/reviews",
  "advisoryDraftId",
  "rawAdvisoryNoteStored",
  "rawConsistencyTraceStored",
  "Deterministic Vs Advisory Comparison",
  "Evaluator Provenance",
  "liveProofClaimed",
  "generatePemsLiveEvaluatorDraft",
  "/api/continuous-intelligence/pems/live-evaluator-drafts",
  "currentPemsWorkbenchQuery",
  "renderPemsDraftQueue",
  "Mocked output proof",
  "renderPemsClaimCitationClosure",
  "renderPemsClaimRevision",
  "liveClaimCitationClosure",
  "reviewerClaimRevisions",
  "reviewerFollowUps",
  "submitPemsClaimRevision",
  "submitPemsReviewerFollowUp",
  "submitPemsReviewerHistoryExport",
  "/api/continuous-intelligence/pems/claim-revisions",
  "/api/continuous-intelligence/pems/follow-ups",
  "/api/continuous-intelligence/pems/history-exports",
  "Reviewer Follow-Up Workflow",
  "Reviewer History Audit Export",
  "Reviewer History Search And Snapshot Diff",
  "reviewerHistoryExports",
  "reviewerHistoryReview",
  "renderPemsReviewerHistoryReview",
  "phase44_reviewer_history_review_refinement",
  "pemsClaimClosureVetoed",
  "Claim citation closure requires reviewer edits before approval"
]) {
  if (!appJs.includes(requiredFragment)) {
    throw new Error(`Phase 42 PEMS reviewer UI is missing required JS fragment: ${requiredFragment}`);
  }
}
for (const requiredFragment of ["pems-workbench-grid", "pems-filter-bar", "pems-draft-queue", "pems-review-form", "pems-review-actions", "pems-comparison-table", "pems-claim-closure-table", "pems-revision-diff", "pems-followup-chain", "pems-history-export", "pems-history-review", "pems-evidence-chips"]) {
  if (!appCss.includes(requiredFragment)) {
    throw new Error(`Phase 42 PEMS reviewer UI is missing required CSS fragment: ${requiredFragment}`);
  }
}

if (!TABLES.includes("research_embedding_routes") || !TABLES.includes("research_embedding_jobs") || !TABLES.includes("research_embedding_index")) {
  throw new Error("Database schema is missing Phase 10M research embedding route/index tables");
}

if (!TABLES.includes("research_graph_builds") || !SCHEMA_SQL.includes("CREATE TABLE IF NOT EXISTS research_graph_builds")) {
  throw new Error("Database schema is missing Phase 10O research graph build table");
}

if (!TABLES.includes("research_claim_evaluations") || !SCHEMA_SQL.includes("CREATE TABLE IF NOT EXISTS research_claim_evaluations")) {
  throw new Error("Database schema is missing Phase 10P claim citation closure table");
}

if (!TABLES.includes("operator_tool_proposals") || !SCHEMA_SQL.includes("CREATE TABLE IF NOT EXISTS operator_tool_proposals")) {
  throw new Error("Database schema is missing Phase 10J operator proposal gate table");
}

if (!TABLES.includes("worker_continuations") || !SCHEMA_SQL.includes("CREATE TABLE IF NOT EXISTS worker_continuations")) {
  throw new Error("Database schema is missing Phase 8E worker continuation table");
}

if (!TABLES.includes("human_handoff_items") || !SCHEMA_SQL.includes("CREATE TABLE IF NOT EXISTS human_handoff_items")) {
  throw new Error("Database schema is missing Phase 10R human handoff table");
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

const buildCheckContextPacket = {
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
};
const runtimeBundle = buildRuntimeCompatibilityBundle(buildCheckContextPacket);
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
  !AUDIT_LOG_API_VERSION.includes("audit-log-api") ||
  outboundObservation.version !== OUTBOUND_PAYLOAD_OBSERVABILITY_VERSION ||
  outboundObservation.enforcementMode !== "observe_only" ||
  outboundObservation.containsDirectIdentifier
) {
  throw new Error("Outbound payload observability or audit log API contract is incomplete.");
}

if (!createBrainstyLangGraph()) {
  throw new Error("LangGraph runner failed to compile.");
}

const continuousIntelligenceProof = buildContinuousIntelligenceReadinessProof();
const continuousIntelligencePersistenceProof = buildContinuousIntelligencePersistenceReadinessProof({
  ok: true,
  shadowRunCount: 1,
  candidateCount: 1,
  pemsTrusted: false
});
if (
  !continuousIntelligenceProof.ok ||
  continuousIntelligenceProof.mode !== "shadow_only" ||
  continuousIntelligenceProof.productionDrivingAllowed !== false ||
  continuousIntelligenceProof.gateIds.join(",") !== "G0,G1,G2,G3,G4,G5,G6,G7,G8" ||
  continuousIntelligenceProof.pemsTrusted !== false ||
  continuousIntelligencePersistenceProof.status !== "phase34_shadow_persistence_active" ||
  continuousIntelligencePersistenceProof.productionDrivingAllowed !== false
) {
  throw new Error("Phase 33/34 continuous intelligence shadow scaffold or persistence proof is incomplete.");
}

const dynamicSkills = await loadDynamicSkillDefinitions();
if (
  !dynamicSkills.definitions.some((item) => item.skillKey === "insurance_plan_aetna_temporary" && item.validation.valid) ||
  !dynamicSkills.definitions.some((item) => item.skillKey === "claim_journey_temporary" && item.validation.valid)
) {
  throw new Error("Dynamic skill server did not load the temporary Aetna and claim skills.");
}

const dynamicSkillContext = await resolveDynamicSkillContext(null, {
  user_id: "user_test",
  session_id: "session_test",
  graph_trace_id: "thread:user_test:session_test",
  channel: "local_web_chat",
  user_input: "Why did Aetna not pay my last visit claim?",
  context_packet: buildCheckContextPacket,
  workflow: "claim_status_navigation",
  structured_intent: {
    intent: "claim_status_question",
    workflow: "claim_status_navigation"
  }
});
if (
  dynamicSkillContext.selected.insuranceSkillKey !== "insurance_plan_aetna_temporary" ||
  dynamicSkillContext.selected.journeySkillKey !== "claim_journey_temporary" ||
  dynamicSkillContext.selected.executionSkillKey !== "insurance_portal_browser"
) {
  throw new Error("Dynamic skill resolver did not select the expected insurance/journey/execution skills.");
}

const ai2uiBlocks = buildAi2UiBlocksFromState({
  graph_trace_id: "build_check_trace",
  workflow: "eligibility_benefits_navigation",
  final_response: "Build check answer.",
  source_pointers: [],
  evidence_observation: { status: "waiting_for_approval", actionsTaken: [] },
  product_memory_retain: { adapter: "graphiti", status: "not_reported" }
});
const unknownAi2ui = normalizeAi2UiBlocks([{ type: "future_block", payload: { ok: true } }]);
if (!ai2uiBlocks.some((block) => block.type === "answer_markdown") || unknownAi2ui[0]?.type !== "unknown") {
  throw new Error("AI2UI block contract or unknown-block fallback is incomplete.");
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

const operatorTools = listOperatorTools();
const researchWorkerStatus = getResearchWorkerStatus();
if (!RESEARCH_SCHEDULER_DAEMON_VERSION.includes("phase10t-research-scheduler-daemon")) {
  throw new Error("Research scheduler daemon version is not the Phase 10T contract.");
}
if (
  !OPERATOR_ASSISTANT_VERSION.includes("claim-citation-closure-proposals") ||
  !operatorTools.tools.some((tool) => tool.key === "research.searchEvidence" && tool.type === "read" && tool.approvalRequired === false) ||
  !operatorTools.tools.some((tool) => tool.key === "research.proposeSource" && tool.type === "write" && tool.approvalRequired === true) ||
  !operatorTools.tools.some((tool) => tool.key === "research.createSchedule" && tool.type === "write" && tool.approvalRequired === true) ||
  !operatorTools.tools.some((tool) => tool.key === "research.getEmbeddingStatus" && tool.type === "read" && tool.approvalRequired === false) ||
  !operatorTools.tools.some((tool) => tool.key === "research.reindexEmbeddings" && tool.type === "write" && tool.approvalRequired === true) ||
  !operatorTools.tools.some((tool) => tool.key === "research.getGraph" && tool.type === "read" && tool.approvalRequired === false) ||
  !operatorTools.tools.some((tool) => tool.key === "research.buildGraph" && tool.type === "write" && tool.approvalRequired === true) ||
  !operatorTools.tools.some((tool) => tool.key === "research.listCitationClosure" && tool.type === "read" && tool.approvalRequired === false) ||
  !operatorTools.tools.some((tool) => tool.key === "research.evaluateCitationClosure" && tool.type === "write" && tool.approvalRequired === true) ||
  !operatorTools.tools.some((tool) => tool.key === "research.executeRun" && tool.type === "write" && tool.approvalRequired === true) ||
  researchWorkerStatus.modes?.openclaw?.typedEnvelope !== "brainstyworkers.research_worker_task.v1" ||
  researchWorkerStatus.modes?.hermes?.typedEnvelope !== "brainstyworkers.research_worker_task.v1"
) {
  throw new Error("Operator assistant registry-bound tool/proposal contract is incomplete.");
}

console.log("Build check passed: files, schema, LangGraph scope, Graphiti memory, Phase 33 continuous-intelligence shadow scaffold, Phase 34 shadow persistence, Phase 35 PEMS supervised promotion gate, Phase 36 reviewer/evaluator workbench, Phase 37 PEMS reviewer UI, Phase 38 reviewer comparison/provenance, Phase 39 live evaluator/filtering, Phase 40 live claim citation closure, Phase 41 reviewer claim revisions, Phase 42 reviewer follow-up workflows, Phase 43 reviewer history audit exports, Phase 44 reviewer history review refinement, urgent human handoff, operator research execution/citation-review/claim-citation-closure/grounded-answer/proposal-gate/scheduler daemon/audit API/embedding route/adaptive worker dispatch/research graph, outbound payload policy, and audit integrity are present.");
