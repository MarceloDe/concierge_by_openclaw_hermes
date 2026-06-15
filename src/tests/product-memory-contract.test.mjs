import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import {
  buildProductMemoryRetainRepairPlan,
  buildSafeProductMemoryEpisode,
  enqueueProductMemoryRetainReplay,
  getProductMemoryConfig,
  getProductMemoryReplayQueueSummary,
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

test("product memory contract keeps uploaded document retain payload sourced and identifier-safe", () => {
  const episode = buildSafeProductMemoryEpisode({
    user: {
      id: "user_upload_memory",
      name: "Upload Memory User",
      email: "upload-memory@example.com"
    },
    session: { id: "session_upload_memory" },
    state: {
      context_packet: {
        user: {
          id: "user_upload_memory",
          name: "Upload Memory User",
          email: "upload-memory@example.com"
        }
      },
      workflow: "eligibility_benefits_navigation",
      route_reason: "uploaded_document_evidence",
      workflow_outcome: "uploaded_document_explained",
      approval_resume: { status: null },
      evidence_observation: { status: "captured_uploaded_document_extraction" },
      source_pointers: [
        {
          kind: "uploaded_document_extraction",
          table: "uploaded_document_extractions",
          id: "upload_contract",
          displayLabel: "benefits-upload.txt",
          sourceUrl: "upload://upload_contract",
          summary:
            "benefits-upload.txt: extraction completed; member_id_last4=last4:7788; deductible=Deductible $1,500",
          extractionHash: "c".repeat(64),
          evidenceFields: [
            { label: "member_id_last4", value: "ABCD-1234-7788", confidence: "medium" },
            { label: "deductible", value: "Deductible $1,500", confidence: "medium" }
          ],
          citation: {
            sourceKind: "uploaded_document_extraction",
            uploadId: "upload_contract",
            filename: "benefits-upload.txt",
            extractionStatus: "completed",
            extractionMethod: "utf8_text",
            confidence: "medium",
            sourceSpans: [
              {
                spanId: "span_1",
                snippet: "Member ID ABCD-1234-7788 Deductible $1,500 upload-memory@example.com",
                confidence: "medium"
              }
            ]
          }
        }
      ],
      memory_summary:
        "Upload Memory User asked about an uploaded benefits document; source pointers: uploaded_document_extractions/upload_contract."
    },
    localMemoryItems: []
  });

  const serialized = JSON.stringify(episode);
  assert.equal(episode.sourcePointers[0].table, "uploaded_document_extractions");
  assert.equal(episode.sourcePointers[0].kind, "uploaded_document_extraction");
  assert.equal(episode.sourcePointers[0].evidenceFields[0].value, "last4:7788");
  assert.match(serialized, /uploaded_document_extractions\/upload_contract/);
  assert.match(serialized, /Deductible \$1,500/);
  assert.doesNotMatch(serialized, /Upload Memory User|upload-memory@example\.com|ABCD-1234-7788/);
  assert.equal(episode.boundaries.rawPortalTextStored, false);
  assert.equal(episode.boundaries.cortexProductMemory, false);
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

test("product memory replay queue durably stores retryable retain failures", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-product-memory-queue-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  const enrollment = await enrollDefaultMember(store, {
    name: "Replay Queue User",
    email: "replay-queue@example.com",
    payer: "Aetna",
    portalUrl: "https://www.aetna.com/"
  });
  const episode = buildSafeProductMemoryEpisode({
    user: enrollment.user,
    session: enrollment.session,
    state: {
      context_packet: { user: enrollment.user },
      workflow: "eligibility_benefits_navigation",
      workflow_outcome: "evidence_captured",
      evidence_observation: { status: "captured_visible_page" },
      source_pointers: [
        {
          table: "eligibility_snapshots",
          id: "snap_queue",
          summary: "Replay Queue User deductible source pointer"
        }
      ],
      memory_summary: "Replay Queue User captured benefits evidence from eligibility_snapshots/snap_queue."
    },
    localMemoryItems: []
  });
  const repairPlan = buildProductMemoryRetainRepairPlan("Graphiti bridge failed with exit 1: connection refused", {
    sourcePointerCount: episode.sourcePointers.length,
    attempt: 1
  });
  const queued = await enqueueProductMemoryRetainReplay(store, {
    user: enrollment.user,
    session: enrollment.session,
    retainPayload: {
      action: "retain",
      groupId: "brainstyworkers_test",
      name: "queued safe retain",
      episodeBody: episode,
      source: "json",
      sourceDescription: "queued safe product memory retain",
      referenceTime: "2026-06-15T12:00:00.000Z"
    },
    episodeBody: episode,
    error: new Error("Graphiti bridge failed with exit 1: connection refused"),
    repairPlan
  });

  assert.equal(queued.status, "queued");
  assert.equal(queued.sourcePointerCount, 1);
  const summary = await getProductMemoryReplayQueueSummary(store);
  assert.equal(summary.pending, 1);
  assert.equal(summary.available, true);
  assert.equal(summary.oldestPending.id, queued.id);

  const row = await store.findOne("product_memory_replay_queue", { id: queued.id });
  assert.equal(row.status, "queued");
  assert.equal(row.user_id, enrollment.user.id);
  assert.equal(row.session_id, enrollment.session.id);
  assert.equal(row.source_pointer_count, 1);
  assert.doesNotMatch(row.payload_json, /Replay Queue User|replay-queue@example\.com/);
  assert.match(row.payload_json, /eligibility_snapshots\\?":\\?"snap_queue|eligibility_snapshots/);

  const auditRow = await store.findOne("audit_events", {
    session_id: enrollment.session.id,
    event_type: "product_memory_retain_queued_for_replay"
  });
  assert.ok(auditRow?.event_hash);
});
