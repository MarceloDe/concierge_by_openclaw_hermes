import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProductMemoryRetainRepairPlan,
  buildSafeProductMemoryEpisode,
  getProductMemoryConfig,
  isRetryableGraphitiRetainError
} from "../concierge/productMemory.mjs";

test("product memory contract builds safe source-pointer summaries without raw direct identifiers", () => {
  const episode = buildSafeProductMemoryEpisode({
    user: {
      id: "user_contract",
      name: "Safe Contract User",
      email: "safe-contract@example.com"
    },
    session: { id: "session_contract" },
    state: {
      context_packet: {
        user: {
          id: "user_contract",
          name: "Safe Contract User",
          email: "safe-contract@example.com"
        }
      },
      workflow: "eligibility_benefits_navigation",
      route_reason: "structured_intent_classifier",
      workflow_outcome: "evidence_captured",
      approval_resume: { status: "approved" },
      evidence_observation: { status: "captured_visible_page" },
      source_pointers: [
        {
          table: "eligibility_snapshots",
          id: "snap_contract",
          sourceUrl: "https://health.aetna.com/member",
          summary: "Safe Contract User deductible source pointer"
        }
      ],
      memory_summary: "Safe Contract User captured benefits evidence from eligibility_snapshots/snap_contract."
    },
    localMemoryItems: [
      {
        id: "mem_contract",
        memory_type: "eligibility_snapshot_pointer",
        sensitivity: "phi_summary_and_pointer"
      }
    ]
  });

  const serialized = JSON.stringify(episode);
  assert.equal(episode.boundaries.rawPortalTextStored, false);
  assert.equal(episode.boundaries.directIdentifiersMasked, true);
  assert.equal(episode.boundaries.cortexProductMemory, false);
  assert.match(serialized, /\[DB_POINTER:users:user_contract:name\]/);
  assert.doesNotMatch(serialized, /Safe Contract User/);
  assert.equal(episode.sourcePointers[0].table, "eligibility_snapshots");
  assert.equal(episode.localMemoryItemPointers[0].table, "memory_items");
});

test("product memory config defaults to disabled unless Graphiti is explicitly selected", () => {
  const previous = process.env.BRAINSTY_PRODUCT_MEMORY_ADAPTER;
  delete process.env.BRAINSTY_PRODUCT_MEMORY_ADAPTER;
  try {
    const config = getProductMemoryConfig();
    assert.equal(config.enabled, false);
    assert.equal(config.provider, "zep_graphiti");
  } finally {
    if (previous === undefined) delete process.env.BRAINSTY_PRODUCT_MEMORY_ADAPTER;
    else process.env.BRAINSTY_PRODUCT_MEMORY_ADAPTER = previous;
  }
});

test("product memory retain repair plan distinguishes runtime failures from policy failures", () => {
  const runtimePlan = buildProductMemoryRetainRepairPlan("Graphiti bridge failed with exit 1: connection refused", {
    sourcePointerCount: 2,
    attempt: 1
  });

  assert.equal(isRetryableGraphitiRetainError(runtimePlan.error), true);
  assert.equal(runtimePlan.retryable, true);
  assert.equal(runtimePlan.status, "retryable_retain_failed");
  assert.match(runtimePlan.nextAction, /Retry Graphiti retain/);

  const timeoutPlan = buildProductMemoryRetainRepairPlan("Graphiti bridge timed out after 120s", {
    sourcePointerCount: 2,
    attempt: 1
  });
  assert.equal(timeoutPlan.retryable, true);
  assert.equal(timeoutPlan.timeout, true);
  assert.equal(timeoutPlan.status, "retry_deferred_timeout");
  assert.match(timeoutPlan.nextAction, /product memory probe/);

  const policyPlan = buildProductMemoryRetainRepairPlan("raw portal text blocked by policy", {
    sourcePointerCount: 2,
    attempt: 1
  });
  assert.equal(policyPlan.retryable, false);
  assert.equal(policyPlan.status, "manual_repair_required");
  assert.match(policyPlan.nextAction, /payload policy/);
});
