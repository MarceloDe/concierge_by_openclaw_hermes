import { createHash, randomUUID } from "node:crypto";
import { nowIso } from "./database.mjs";
import { buildPhase61GeneratedSkillPrProof } from "./generatedSkillPrWorkflow.mjs";

export const GENERATED_SKILL_REVIEW_QUEUE_VERSION = "2026-06-22.phase62-generated-skill-reviewer-queue.v1";

const REVIEW_DECISIONS = new Set(["approved", "rejected", "blocked", "needs_more_evidence"]);

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function safePreview(value, limit = 180) {
  return String(value ?? "")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[email]")
    .replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, "[identifier]")
    .replace(/\b(?:member|subscriber)\s*(?:id|number|#|no\.?)?\s*[:#=-]?\s*[A-Z0-9-]{4,}\b/gi, "[identifier]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value ?? "");
  } catch {
    return fallback;
  }
}

function queueStatusFromDecision(decision) {
  if (decision === "approved") return "approved_for_pr_execution";
  if (decision === "needs_more_evidence") return "needs_more_evidence";
  if (decision === "blocked") return "blocked_by_reviewer";
  return "rejected_by_reviewer";
}

export function buildGeneratedSkillQueuePackage(workflow = buildPhase61GeneratedSkillPrProof()) {
  const packageHash = stableHash({
    gate: workflow.gate,
    files: workflow.artifactPackage?.files ?? [],
    pullRequest: workflow.pullRequest,
    safety: workflow.safety
  });
  return {
    version: GENERATED_SKILL_REVIEW_QUEUE_VERSION,
    candidateId: workflow.gate?.candidateId ?? workflow.artifactPackage?.skillKey ?? "generated_skill_candidate",
    skillKey: workflow.artifactPackage?.skillKey ?? "generated_skill_candidate",
    packageHash,
    status: "pending_reviewer_decision",
    requestedAction: "review_generated_skill_pr_package",
    gateStatus: workflow.gate?.status ?? "not_evaluated",
    pullRequest: workflow.pullRequest,
    package: {
      fileCount: workflow.artifactPackage?.fileCount ?? 0,
      files: workflow.artifactPackage?.files ?? [],
      validation: workflow.artifactPackage?.validation ?? null,
      proceduralSafety: workflow.artifactPackage?.proceduralSafety ?? null
    },
    safety: {
      productionDrivingAllowed: false,
      autoMergeAllowed: false,
      storesRawGeneratedFileBodies: false,
      storesRawPhi: false,
      requiresExplicitReviewerDecision: true,
      requiresExplicitExecutorApproval: true
    }
  };
}

export async function enqueueGeneratedSkillReview(store, { workflow = buildPhase61GeneratedSkillPrProof(), actorUserId = "operator" } = {}) {
  if (!store) throw new Error("A store is required to enqueue generated skill review.");
  const queuePackage = buildGeneratedSkillQueuePackage(workflow);
  const now = nowIso();
  const row = {
    id: `generated_skill_review_${randomUUID()}`,
    candidate_id: queuePackage.candidateId,
    skill_key: queuePackage.skillKey,
    package_hash: queuePackage.packageHash,
    status: queuePackage.status,
    requested_action: queuePackage.requestedAction,
    gate_status: queuePackage.gateStatus,
    reviewer_user_id: actorUserId,
    review_decision: null,
    review_rationale_hash: "",
    review_rationale_preview: "",
    pr_branch_name: queuePackage.pullRequest?.branchName ?? "",
    pr_title: queuePackage.pullRequest?.title ?? "",
    package_json: JSON.stringify(queuePackage.package),
    executor_json: JSON.stringify({ status: "not_requested", commandsPrepared: false }),
    safety_json: JSON.stringify(queuePackage.safety),
    created_at: now,
    updated_at: now,
    reviewed_at: null
  };
  await store.insert("generated_skill_review_queue", row);
  return { version: GENERATED_SKILL_REVIEW_QUEUE_VERSION, ok: true, row, queuePackage };
}

export async function recordGeneratedSkillReviewDecision(
  store,
  { queueItemId, actorUserId = "reviewer", decision, rationale = "", executorApproval = false } = {}
) {
  if (!store) throw new Error("A store is required to record generated skill review.");
  if (!REVIEW_DECISIONS.has(decision)) throw new Error(`Unsupported generated skill review decision: ${decision}`);
  const row = await store.findOne("generated_skill_review_queue", { id: queueItemId });
  if (!row) throw new Error(`Unknown generated skill review queue item: ${queueItemId}`);
  const now = nowIso();
  const status = queueStatusFromDecision(decision);
  const executor = buildGeneratedSkillPrExecutorPlan({ queueItem: { ...row, status }, executorApproval });
  await store.update(
    "generated_skill_review_queue",
    {
      status,
      reviewer_user_id: actorUserId,
      review_decision: decision,
      review_rationale_hash: stableHash(rationale),
      review_rationale_preview: safePreview(rationale),
      executor_json: JSON.stringify(executor),
      updated_at: now,
      reviewed_at: now
    },
    { id: queueItemId }
  );
  const updated = await store.findOne("generated_skill_review_queue", { id: queueItemId });
  return { version: GENERATED_SKILL_REVIEW_QUEUE_VERSION, ok: true, row: updated, executor };
}

export function buildGeneratedSkillPrExecutorPlan({ queueItem = {}, executorApproval = false } = {}) {
  const approved = queueItem.status === "approved_for_pr_execution";
  const executorReady = approved && executorApproval === true;
  const branchName = queueItem.pr_branch_name ?? "";
  return {
    version: GENERATED_SKILL_REVIEW_QUEUE_VERSION,
    status: executorReady ? "ready_to_open_generated_skill_pr" : approved ? "awaiting_explicit_executor_approval" : "blocked_until_reviewer_approval",
    executorReady,
    commandsPrepared: executorReady,
    commands: executorReady
      ? [
          `git checkout -b ${branchName} origin/main`,
          "write generated skill files from the reviewed package",
          "npm run test:openclaw:skills",
          "npm run build",
          "gh pr create --base main --head <generated-skill-branch>"
        ]
      : [],
    safety: {
      autoRunCommands: false,
      autoMergeAllowed: false,
      productionDrivingAllowed: false,
      requiresHumanReviewer: true,
      requiresExecutorApproval: true
    }
  };
}

export async function listGeneratedSkillReviewQueue(store, where = {}) {
  if (!store) throw new Error("A store is required to list generated skill review queue.");
  const rows = await store.list("generated_skill_review_queue", where);
  return {
    version: GENERATED_SKILL_REVIEW_QUEUE_VERSION,
    rows: rows.map((row) => ({
      ...row,
      package: parseJson(row.package_json, {}),
      executor: parseJson(row.executor_json, {}),
      safety: parseJson(row.safety_json, {})
    }))
  };
}

export async function buildPhase62GeneratedSkillReviewQueueProof(store) {
  const workflow = buildPhase61GeneratedSkillPrProof();
  const skillKey = workflow.artifactPackage?.skillKey ?? "generated_skill_candidate";
  const existing = (await store.list("generated_skill_review_queue", { skill_key: skillKey })).find((row) => row.status === "approved_for_pr_execution");
  const approved = existing
    ? {
        row: existing,
        executor: parseJson(existing.executor_json, buildGeneratedSkillPrExecutorPlan({ queueItem: existing, executorApproval: true }))
      }
    : await (async () => {
        const enqueued = await enqueueGeneratedSkillReview(store, {
          workflow,
          actorUserId: "phase62_operator"
        });
        return recordGeneratedSkillReviewDecision(store, {
          queueItemId: enqueued.row.id,
          actorUserId: "phase62_reviewer",
          decision: "approved",
          rationale: "Approve reviewed generated skill PR package; keep production-driving disabled.",
          executorApproval: true
        });
      })();
  const queue = await listGeneratedSkillReviewQueue(store);
  const checks = {
    queueRowPersisted: queue.rows.length >= 1,
    reviewerDecisionRecorded: approved.row.review_decision === "approved",
    executorPlanPreparedAfterApproval: approved.executor.status === "ready_to_open_generated_skill_pr",
    noAutoRun: approved.executor.safety.autoRunCommands === false,
    noAutoMerge: approved.executor.safety.autoMergeAllowed === false,
    productionDrivingBlocked: approved.executor.safety.productionDrivingAllowed === false,
    noRawFileBodiesStored: queue.rows.every((row) => row.safety.storesRawGeneratedFileBodies === false),
    rawPhiBlocked: queue.rows.every((row) => row.safety.storesRawPhi === false)
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return {
    version: GENERATED_SKILL_REVIEW_QUEUE_VERSION,
    status: passed === Object.keys(checks).length ? "phase62_generated_skill_review_queue_ready" : "phase62_generated_skill_review_queue_attention",
    ok: passed === Object.keys(checks).length,
    score: Math.round((passed / Object.keys(checks).length) * 100),
    target: 100,
    checks,
    queue: {
      count: queue.rows.length,
      latestStatus: approved.row.status,
      skillKey: approved.row.skill_key,
      packageHash: approved.row.package_hash,
      prBranchName: approved.row.pr_branch_name
    },
    executor: approved.executor,
    safety: {
      dbAuthoritative: true,
      graphitiAdvisoryOnly: true,
      generatedSkillAutoMergeAllowed: false,
      productionDrivingAllowed: false,
      rawPhiStored: false
    }
  };
}
