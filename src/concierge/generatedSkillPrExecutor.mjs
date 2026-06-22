import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { nowIso } from "./database.mjs";
import { buildPhase61GeneratedSkillPrMaterializationPackage } from "./generatedSkillPrWorkflow.mjs";
import { buildPhase62GeneratedSkillReviewQueueProof, listGeneratedSkillReviewQueue } from "./generatedSkillReviewQueue.mjs";

export const GENERATED_SKILL_PR_EXECUTOR_VERSION = "2026-06-22.phase63-generated-skill-pr-executor.v1";

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value ?? "");
  } catch {
    return fallback;
  }
}

function hashWorkflowPackage(workflow = {}) {
  return stableHash({
    gate: workflow.gate,
    files: workflow.artifactPackage?.files ?? [],
    pullRequest: workflow.pullRequest,
    safety: workflow.safety
  });
}

function sanitizeRelativePath(path) {
  const normalized = String(path ?? "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("..")) {
    throw new Error(`Unsafe generated skill output path: ${path}`);
  }
  if (!normalized.startsWith("openclaw/skills/")) {
    throw new Error(`Generated skill output path must stay under openclaw/skills: ${path}`);
  }
  return normalized;
}

function buildSafety() {
  return {
    requiresHumanReviewer: true,
    requiresOperatorApproval: true,
    dryRunDefault: true,
    autoRunCommands: false,
    autoMergeAllowed: false,
    productionDrivingAllowed: false,
    credentialEntryAllowed: false,
    externalWriteAllowed: false,
    rawPhiStored: false
  };
}

export function buildGeneratedSkillPrExecutorSurface({
  queueItem = {},
  materializationPackage = buildPhase61GeneratedSkillPrMaterializationPackage(),
  operatorApproval = false,
  dryRun = true,
  openPullRequest = false
} = {}) {
  const workflow = materializationPackage.workflow;
  const executor = parseJson(queueItem.executor_json, queueItem.executor ?? {});
  const computedPackageHash = hashWorkflowPackage(workflow);
  const queueApproved = queueItem.status === "approved_for_pr_execution";
  const executorReady = executor.executorReady === true;
  const packageHashMatches = queueItem.package_hash === computedPackageHash;
  const files = (materializationPackage.files ?? []).map((file) => ({
    path: sanitizeRelativePath(file.path),
    hash: file.hash,
    content: file.content
  }));
  const executionAllowed = queueApproved && executorReady && packageHashMatches && operatorApproval === true;
  const branchName = queueItem.pr_branch_name || workflow.pullRequest?.branchName || "";
  const commands = executionAllowed
    ? [
        `git checkout -b ${branchName} origin/main`,
        "write reviewed generated skill files",
        "npm run test:openclaw:skills",
        "npm run build",
        `gh pr create --base main --head ${branchName}`
      ]
    : [];
  const checks = {
    queueApproved,
    executorReady,
    packageHashMatches,
    operatorApprovalRecorded: operatorApproval === true,
    outputPathBounded: files.every((file) => file.path.startsWith("openclaw/skills/")),
    fileHashClosure: files.every((file) => workflow.artifactPackage?.files?.some((expected) => expected.path === file.path && expected.hash === file.hash)),
    dryRunDefault: dryRun === true || executionAllowed,
    prRequiresExplicitRequest: openPullRequest === true ? executionAllowed : true,
    autoMergeBlocked: true,
    productionDrivingBlocked: true
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return {
    version: GENERATED_SKILL_PR_EXECUTOR_VERSION,
    status: executionAllowed ? (dryRun ? "phase63_executor_dry_run_ready" : "phase63_executor_materialization_allowed") : "phase63_executor_blocked",
    ok: executionAllowed && passed === Object.keys(checks).length,
    score: Math.round((passed / Object.keys(checks).length) * 100),
    target: 100,
    checks,
    queueItemId: queueItem.id,
    packageHash: computedPackageHash,
    branchName,
    dryRun,
    openPullRequest,
    files: files.map(({ path, hash }) => ({ path, hash })),
    commands,
    safety: buildSafety()
  };
}

export async function executeGeneratedSkillPrExecutorRun(
  store,
  {
    queueItemId,
    actorUserId = "operator",
    operatorApproval = false,
    dryRun = true,
    repoRoot = process.cwd(),
    createBranch = false,
    openPullRequest = false,
    materializationPackage = buildPhase61GeneratedSkillPrMaterializationPackage(),
    runCommand = async () => ({ ok: true, stdout: "", stderr: "" })
  } = {}
) {
  if (!store) throw new Error("A store is required to execute generated skill PR executor run.");
  const queueItem = await store.findOne("generated_skill_review_queue", { id: queueItemId });
  if (!queueItem) throw new Error(`Unknown generated skill review queue item: ${queueItemId}`);
  const surface = buildGeneratedSkillPrExecutorSurface({
    queueItem,
    materializationPackage,
    operatorApproval,
    dryRun,
    openPullRequest
  });
  const output = {
    commands: surface.commands,
    files: surface.files,
    dryRun,
    branchCreated: false,
    filesWritten: false,
    pullRequestOpened: false
  };

  if (surface.ok && dryRun === false) {
    if (createBranch) {
      await runCommand("git", ["checkout", "-b", surface.branchName, "origin/main"], { cwd: repoRoot });
      output.branchCreated = true;
    }
    for (const file of materializationPackage.files ?? []) {
      const relativePath = sanitizeRelativePath(file.path);
      const absolutePath = resolve(repoRoot, relativePath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, file.content, "utf8");
    }
    output.filesWritten = true;
    if (openPullRequest) {
      await runCommand("gh", ["pr", "create", "--base", "main", "--head", surface.branchName, "--title", materializationPackage.workflow.pullRequest?.title ?? "generated skill", "--body", "Generated skill PR opened by explicit operator execution."], {
        cwd: repoRoot
      });
      output.pullRequestOpened = true;
    }
  }

  const status = surface.ok ? (dryRun ? "dry_run_recorded" : "materialization_recorded") : "blocked";
  const row = {
    id: `generated_skill_pr_executor_${randomUUID()}`,
    queue_item_id: queueItem.id,
    status,
    actor_user_id: actorUserId,
    operator_approval: operatorApproval ? 1 : 0,
    dry_run: dryRun ? 1 : 0,
    package_hash: surface.packageHash,
    branch_name: surface.branchName,
    files_written: output.filesWritten ? 1 : 0,
    git_branch_created: output.branchCreated ? 1 : 0,
    pr_open_requested: openPullRequest ? 1 : 0,
    pr_opened: output.pullRequestOpened ? 1 : 0,
    output_json: JSON.stringify(output),
    safety_json: JSON.stringify(surface.safety),
    created_at: nowIso()
  };
  await store.insert("generated_skill_pr_executor_runs", row);
  return {
    version: GENERATED_SKILL_PR_EXECUTOR_VERSION,
    ok: surface.ok,
    surface,
    row: {
      ...row,
      output,
      safety: surface.safety
    }
  };
}

export async function listGeneratedSkillPrExecutorRuns(store, where = {}) {
  if (!store) throw new Error("A store is required to list generated skill PR executor runs.");
  const rows = await store.list("generated_skill_pr_executor_runs", where);
  return {
    version: GENERATED_SKILL_PR_EXECUTOR_VERSION,
    rows: rows.map((row) => ({
      ...row,
      output: parseJson(row.output_json, {}),
      safety: parseJson(row.safety_json, {})
    }))
  };
}

export async function buildPhase63GeneratedSkillPrExecutorProof(store) {
  await buildPhase62GeneratedSkillReviewQueueProof(store);
  const queue = await listGeneratedSkillReviewQueue(store);
  const queueItem = queue.rows.find((row) => row.status === "approved_for_pr_execution");
  const run = await executeGeneratedSkillPrExecutorRun(store, {
    queueItemId: queueItem?.id,
    actorUserId: "phase63_operator",
    operatorApproval: true,
    dryRun: true,
    openPullRequest: false
  });
  const runs = await listGeneratedSkillPrExecutorRuns(store, { queue_item_id: queueItem.id });
  const checks = {
    queueItemApproved: run.surface.checks.queueApproved,
    executorReady: run.surface.checks.executorReady,
    packageHashMatches: run.surface.checks.packageHashMatches,
    operatorApprovalRecorded: run.surface.checks.operatorApprovalRecorded,
    dryRunRecorded: run.row.dry_run === 1 && run.row.files_written === 0,
    writePlanHasFiles: run.surface.files.length >= 3,
    branchCommandVisible: run.surface.commands.some((command) => command.includes("git checkout -b")),
    prCommandVisible: run.surface.commands.some((command) => command.includes("gh pr create")),
    autoMergeBlocked: run.surface.safety.autoMergeAllowed === false,
    productionDrivingBlocked: run.surface.safety.productionDrivingAllowed === false,
    runPersisted: runs.rows.length >= 1
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return {
    version: GENERATED_SKILL_PR_EXECUTOR_VERSION,
    status: passed === Object.keys(checks).length ? "phase63_generated_skill_pr_executor_ready" : "phase63_generated_skill_pr_executor_attention",
    ok: passed === Object.keys(checks).length,
    score: Math.round((passed / Object.keys(checks).length) * 100),
    target: 100,
    checks,
    queue: {
      queueItemId: queueItem.id,
      skillKey: queueItem.skill_key,
      status: queueItem.status,
      packageHash: queueItem.package_hash
    },
    executor: {
      status: run.surface.status,
      branchName: run.surface.branchName,
      dryRun: run.surface.dryRun,
      files: run.surface.files,
      commands: run.surface.commands
    },
    run: {
      id: run.row.id,
      status: run.row.status,
      filesWritten: run.row.files_written === 1,
      pullRequestOpened: run.row.pr_opened === 1
    },
    safety: run.surface.safety
  };
}
