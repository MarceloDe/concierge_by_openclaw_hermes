import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStore } from "../concierge/database.mjs";
import {
  buildGeneratedSkillPrExecutorPlan,
  buildPhase62GeneratedSkillReviewQueueProof,
  enqueueGeneratedSkillReview,
  listGeneratedSkillReviewQueue,
  recordGeneratedSkillReviewDecision
} from "../concierge/generatedSkillReviewQueue.mjs";
import { buildPhase61GeneratedSkillPrProof } from "../concierge/generatedSkillPrWorkflow.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-generated-skill-queue-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

test("generated skill review queue persists PR package metadata without raw file bodies", async () => {
  const store = await createStore();
  const enqueued = await enqueueGeneratedSkillReview(store, {
    workflow: buildPhase61GeneratedSkillPrProof(),
    actorUserId: "operator"
  });

  assert.equal(enqueued.ok, true);
  assert.equal(enqueued.row.status, "pending_reviewer_decision");
  assert.equal(enqueued.row.gate_status, "generated_skill_pr_gate_passed");

  const queue = await listGeneratedSkillReviewQueue(store);
  assert.equal(queue.rows.length, 1);
  assert.equal(queue.rows[0].package.fileCount, 3);
  assert.equal(queue.rows[0].safety.storesRawGeneratedFileBodies, false);
  assert.equal(queue.rows[0].safety.storesRawPhi, false);
  assert.doesNotMatch(queue.rows[0].package_json, /Generated Skill User|skill-user@example\.com|Phase Sixty One|phase61@example\.com/);
});

test("review approval records decision and prepares executor only with explicit executor approval", async () => {
  const store = await createStore();
  const { row } = await enqueueGeneratedSkillReview(store, { workflow: buildPhase61GeneratedSkillPrProof() });

  const approvedWithoutExecutor = await recordGeneratedSkillReviewDecision(store, {
    queueItemId: row.id,
    actorUserId: "reviewer",
    decision: "approved",
    rationale: "Approved for PR package, not yet executor-approved.",
    executorApproval: false
  });
  assert.equal(approvedWithoutExecutor.row.status, "approved_for_pr_execution");
  assert.equal(approvedWithoutExecutor.executor.status, "awaiting_explicit_executor_approval");
  assert.equal(approvedWithoutExecutor.executor.commandsPrepared, false);

  const approvedWithExecutor = await recordGeneratedSkillReviewDecision(store, {
    queueItemId: row.id,
    actorUserId: "reviewer",
    decision: "approved",
    rationale: "Explicitly approve bounded PR executor plan.",
    executorApproval: true
  });
  assert.equal(approvedWithExecutor.executor.status, "ready_to_open_generated_skill_pr");
  assert.equal(approvedWithExecutor.executor.commandsPrepared, true);
  assert.equal(approvedWithExecutor.executor.safety.autoRunCommands, false);
  assert.equal(approvedWithExecutor.executor.safety.autoMergeAllowed, false);
  assert.equal(approvedWithExecutor.executor.safety.productionDrivingAllowed, false);
});

test("review queue supports reject, block, and request-more-evidence decisions without executor readiness", async () => {
  for (const [decision, expectedStatus] of [
    ["rejected", "rejected_by_reviewer"],
    ["blocked", "blocked_by_reviewer"],
    ["needs_more_evidence", "needs_more_evidence"]
  ]) {
    const store = await createStore();
    const { row } = await enqueueGeneratedSkillReview(store, { workflow: buildPhase61GeneratedSkillPrProof() });
    const reviewed = await recordGeneratedSkillReviewDecision(store, {
      queueItemId: row.id,
      decision,
      rationale: `${decision} this package for now.`,
      executorApproval: true
    });
    assert.equal(reviewed.row.status, expectedStatus);
    assert.equal(reviewed.executor.executorReady, false);
    assert.equal(reviewed.executor.commands.length, 0);
  }
});

test("executor plan is blocked unless queue item is reviewer-approved and executor-approved", () => {
  const pending = buildGeneratedSkillPrExecutorPlan({
    queueItem: { status: "pending_reviewer_decision", pr_branch_name: "generated-skill/example" },
    executorApproval: true
  });
  assert.equal(pending.status, "blocked_until_reviewer_approval");
  assert.equal(pending.executorReady, false);

  const approved = buildGeneratedSkillPrExecutorPlan({
    queueItem: { status: "approved_for_pr_execution", pr_branch_name: "generated-skill/example" },
    executorApproval: true
  });
  assert.equal(approved.status, "ready_to_open_generated_skill_pr");
  assert.equal(approved.commands.some((command) => command.includes("gh pr create")), true);
  assert.equal(approved.safety.autoRunCommands, false);
});

test("Phase 62 proof scores durable generated-skill review queue at target", async () => {
  const store = await createStore();
  const proof = await buildPhase62GeneratedSkillReviewQueueProof(store);

  assert.equal(proof.status, "phase62_generated_skill_review_queue_ready");
  assert.equal(proof.ok, true);
  assert.equal(proof.score, 100);
  assert.equal(proof.checks.queueRowPersisted, true);
  assert.equal(proof.checks.executorPlanPreparedAfterApproval, true);
  assert.equal(proof.safety.generatedSkillAutoMergeAllowed, false);
  assert.equal(proof.safety.productionDrivingAllowed, false);
});
