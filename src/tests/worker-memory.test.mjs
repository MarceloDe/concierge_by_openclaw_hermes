import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import {
  buildWorkerProceduralMemoryRecord,
  getWorkerProceduralMemoryStatus,
  recordWorkerProceduralMemory
} from "../concierge/workerMemory.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-worker-memory-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

test("worker procedural memory record is masked, source-pointered, and non-driving", async () => {
  const record = buildWorkerProceduralMemoryRecord({
    user: { id: "user_memory" },
    session: { id: "session_memory" },
    workflow: "claim_status_navigation",
    selectedSkillKey: "insurance_portal_browser",
    selectedExecutorKey: "read_only_browser",
    terminalOutcome: "completed_with_sourced_result",
    workerResult: {
      answer: "Claim status for member 123456789 is complete; contact me@example.com if needed.",
      sourcePointers: [{ id: "sp_claim_1" }],
      subtasks: [{ subtaskKey: "inspect_claims", status: "completed" }],
      actionsTaken: ["snapshot_accessibility_tree"]
    },
    dynamicSkillContext: {
      requiredOpenClawTasks: ["insurance_portal_browser.read_only_claims_observation"]
    }
  });

  assert.equal(record.production_driving_allowed, 0);
  assert.equal(record.cortex_product_memory, 0);
  assert.equal(JSON.parse(record.source_pointer_ids_json)[0], "sp_claim_1");
  assert.match(record.masked_preview, /masked_identifier/);
  assert.doesNotMatch(record.masked_preview, /123456789|me@example\.com/);
});

test("successful worker task writes procedural memory and PEMS candidate without answer driving", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const result = await recordWorkerProceduralMemory(store, {
    user,
    session,
    workflow: "claim_status_navigation",
    selectedSkillKey: "insurance_portal_browser",
    selectedExecutorKey: "read_only_browser",
    terminalOutcome: "completed_with_sourced_result",
    workerResult: {
      answer: "Sourced claim result.",
      sourcePointers: [{ id: "sp_claim_2" }],
      subtasks: [{ subtaskKey: "inspect_claims", status: "completed" }]
    },
    dynamicSkillContext: {
      requiredOpenClawTasks: ["insurance_portal_browser.read_only_claims_observation"]
    }
  });

  const row = await store.findOne("worker_procedural_memory", { id: result.record.id });
  const candidate = await store.findOne("pems_candidate_maturity", { candidate_id: result.pemsCandidateId });
  const status = await getWorkerProceduralMemoryStatus(store);

  assert.equal(row.production_driving_allowed, 0);
  assert.equal(row.cortex_product_memory, 0);
  assert.equal(candidate.production_driving_allowed, 0);
  assert.equal(candidate.trusted, 0);
  assert.equal(candidate.supervised_advisory_allowed, 0);
  assert.equal(status.recordCount, 1);
  assert.equal(status.safety.answerDriving, false);
  assert.equal(result.safety.sourcePointerIdsOnly, true);
});
