import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStore } from "../concierge/database.mjs";
import { buildPhase61GeneratedSkillPrMaterializationPackage, buildPhase61GeneratedSkillPrProof } from "../concierge/generatedSkillPrWorkflow.mjs";
import { enqueueGeneratedSkillReview, recordGeneratedSkillReviewDecision } from "../concierge/generatedSkillReviewQueue.mjs";
import {
  buildGeneratedSkillPrExecutorSurface,
  buildPhase63GeneratedSkillPrExecutorProof,
  executeGeneratedSkillPrExecutorRun,
  listGeneratedSkillPrExecutorRuns
} from "../concierge/generatedSkillPrExecutor.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-generated-skill-executor-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

async function createApprovedQueueItem(store) {
  const enqueued = await enqueueGeneratedSkillReview(store, { workflow: buildPhase61GeneratedSkillPrProof() });
  const reviewed = await recordGeneratedSkillReviewDecision(store, {
    queueItemId: enqueued.row.id,
    actorUserId: "reviewer",
    decision: "approved",
    rationale: "Explicitly approve bounded PR executor plan.",
    executorApproval: true
  });
  return reviewed.row;
}

test("generated skill PR executor blocks without explicit operator approval", async () => {
  const store = await createStore();
  const queueItem = await createApprovedQueueItem(store);
  const surface = buildGeneratedSkillPrExecutorSurface({ queueItem, operatorApproval: false });

  assert.equal(surface.status, "phase63_executor_blocked");
  assert.equal(surface.ok, false);
  assert.equal(surface.checks.queueApproved, true);
  assert.equal(surface.checks.executorReady, true);
  assert.equal(surface.checks.operatorApprovalRecorded, false);
  assert.deepEqual(surface.commands, []);
});

test("generated skill PR executor dry-run records a human-operated plan without writing files", async () => {
  const store = await createStore();
  const queueItem = await createApprovedQueueItem(store);
  const run = await executeGeneratedSkillPrExecutorRun(store, {
    queueItemId: queueItem.id,
    actorUserId: "operator",
    operatorApproval: true,
    dryRun: true
  });

  assert.equal(run.ok, true);
  assert.equal(run.row.status, "dry_run_recorded");
  assert.equal(run.row.files_written, 0);
  assert.equal(run.row.pr_opened, 0);
  assert.equal(run.surface.files.length, 3);
  assert.equal(run.surface.safety.autoMergeAllowed, false);
  assert.equal(run.surface.safety.productionDrivingAllowed, false);

  const runs = await listGeneratedSkillPrExecutorRuns(store);
  assert.equal(runs.rows.length, 1);
  assert.equal(runs.rows[0].output.filesWritten, false);
});

test("generated skill PR executor materializes files only for explicit non-dry-run execution", async () => {
  const store = await createStore();
  const queueItem = await createApprovedQueueItem(store);
  const repoRoot = await mkdtemp(join(tmpdir(), "brainsty-generated-skill-repo-"));
  const materializationPackage = buildPhase61GeneratedSkillPrMaterializationPackage();
  const commands = [];
  const run = await executeGeneratedSkillPrExecutorRun(store, {
    queueItemId: queueItem.id,
    actorUserId: "operator",
    operatorApproval: true,
    dryRun: false,
    repoRoot,
    createBranch: false,
    openPullRequest: false,
    materializationPackage,
    runCommand: async (command, args) => {
      commands.push([command, args]);
      return { ok: true, stdout: "", stderr: "" };
    }
  });

  assert.equal(run.ok, true);
  assert.equal(run.row.status, "materialization_recorded");
  assert.equal(run.row.files_written, 1);
  assert.equal(run.row.git_branch_created, 0);
  assert.equal(run.row.pr_opened, 0);
  assert.deepEqual(commands, []);

  for (const file of materializationPackage.files) {
    await access(join(repoRoot, file.path));
  }
  const skillMarkdown = await readFile(join(repoRoot, materializationPackage.files.find((file) => file.path.endsWith("/SKILL.md")).path), "utf8");
  assert.match(skillMarkdown, /Production answer-driving remains disabled/);
});

test("generated skill PR executor can request PR opening only after explicit execution flags", async () => {
  const store = await createStore();
  const queueItem = await createApprovedQueueItem(store);
  const repoRoot = await mkdtemp(join(tmpdir(), "brainsty-generated-skill-pr-"));
  const commands = [];
  const run = await executeGeneratedSkillPrExecutorRun(store, {
    queueItemId: queueItem.id,
    operatorApproval: true,
    dryRun: false,
    repoRoot,
    createBranch: true,
    openPullRequest: true,
    runCommand: async (command, args) => {
      commands.push([command, args]);
      return { ok: true, stdout: "", stderr: "" };
    }
  });

  assert.equal(run.row.git_branch_created, 1);
  assert.equal(run.row.pr_open_requested, 1);
  assert.equal(run.row.pr_opened, 1);
  assert.equal(commands.some(([command]) => command === "git"), true);
  assert.equal(commands.some(([command]) => command === "gh"), true);
  assert.equal(run.surface.safety.autoMergeAllowed, false);
});

test("Phase 63 proof scores generated skill PR executor at target", async () => {
  const store = await createStore();
  const proof = await buildPhase63GeneratedSkillPrExecutorProof(store);

  assert.equal(proof.status, "phase63_generated_skill_pr_executor_ready");
  assert.equal(proof.ok, true);
  assert.equal(proof.score, 100);
  assert.equal(proof.checks.queueItemApproved, true);
  assert.equal(proof.checks.dryRunRecorded, true);
  assert.equal(proof.run.filesWritten, false);
  assert.equal(proof.run.pullRequestOpened, false);
  assert.equal(proof.safety.autoMergeAllowed, false);
  assert.equal(proof.safety.productionDrivingAllowed, false);
});
