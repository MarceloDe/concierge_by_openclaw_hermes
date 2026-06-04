import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { getProductMemoryStatus, probeProductMemory } from "../concierge/productMemory.mjs";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";

function configureLiveGraphitiGroup(suffix) {
  process.env.BRAINSTY_PRODUCT_MEMORY_ADAPTER = "graphiti";
  process.env.GRAPHITI_BACKEND = "falkordb";
  process.env.FALKORDB_HOST = process.env.FALKORDB_HOST ?? "localhost";
  process.env.FALKORDB_PORT = process.env.FALKORDB_PORT ?? "6380";
  process.env.GRAPHITI_GROUP_ID = `brainstyworkers_test_${suffix}_${Date.now()}`;
  process.env.GRAPHITI_STORE_RAW_EPISODES = "0";
}

function uploadedBenefitsDocument(uploadId = "upload_graphiti_doc") {
  return {
    uploadId,
    filename: "graphiti-benefits-summary.txt",
    contentType: "text/plain",
    byteSize: 280,
    sha256: "d".repeat(64),
    extraction: {
      status: "completed",
      method: "utf8_text",
      extractedAt: "2026-06-01T12:30:00Z",
      textHash: "e".repeat(64),
      safeTextPreview:
        "Summary of Benefits and Coverage Member ID: [redacted-id-last4:7788] [redacted-email] Deductible $1,500 Out-of-pocket max $7,000",
      fields: [
        {
          label: "document_type",
          value: "summary_of_benefits",
          confidence: "high",
          source: { kind: "uploaded_document", snippet: "Summary of Benefits and Coverage" }
        },
        {
          label: "member_id_last4",
          value: "last4:7788",
          confidence: "medium",
          source: { kind: "uploaded_document", snippet: "Member ID: [redacted-id-last4:7788]" }
        },
        {
          label: "deductible",
          value: "Deductible $1,500",
          confidence: "medium",
          source: { kind: "uploaded_document", snippet: "Deductible $1,500" }
        }
      ],
      sourceSpans: [
        {
          span_id: "span_1",
          source: "uploaded_document",
          snippet: "Summary of Benefits and Coverage",
          confidence: "medium"
        },
        {
          span_id: "span_2",
          source: "uploaded_document",
          snippet: "Deductible $1,500",
          confidence: "medium"
        }
      ],
      blockers: [],
      pageCount: 1,
      confidence: "medium"
    }
  };
}

test("real Graphiti/FalkorDB product memory schema retains and recalls safe facts", async (t) => {
  if (process.env.BRAINSTY_GRAPHITI_LIVE !== "1") {
    t.skip("Set BRAINSTY_GRAPHITI_LIVE=1 and run npm run graphiti:falkordb first.");
    return;
  }
  await loadLocalEnvOnce();
  configureLiveGraphitiGroup("schema");

  const dir = await mkdtemp(join(tmpdir(), "brainsty-graphiti-memory-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  const enrollment = await enrollDefaultMember(store, {
    name: "Graphiti Memory Member",
    email: "graphiti-memory@example.com",
    payer: "Aetna",
    portalUrl: "https://www.aetna.com/"
  });

  const status = await getProductMemoryStatus({
    requireEnabled: true,
    store,
    sessionId: enrollment.session.id,
    user: enrollment.user
  });
  assert.equal(status.schemaReady, true);
  assert.equal(status.backend, "falkordb");
  assert.equal(status.rawEpisodeStorage, false);

  const probe = await probeProductMemory({
    store,
    user: enrollment.user,
    session: enrollment.session,
    query: "BrainstyMember deductible remaining EligibilitySnapshot source pointer"
  });
  assert.ok(probe.retained.episodeUuid);
  assert.ok(probe.recalled.facts.length >= 1, JSON.stringify(probe.recalled));
  assert.equal(probe.rawPortalTextStored, false);
  assert.equal(probe.cortexProductMemory, false);

  const graphRun = await runLangGraphOrchestration(store, {
    user: enrollment.user,
    session: enrollment.session,
    channel: enrollment.session.channel,
    userInput: "Do I still owe anything before insurance starts paying?",
    rawMessage: {
      source: "product_memory_graphiti_test",
      executeEvidenceObservation: false,
      useLiveModel: false
    }
  });

  assert.equal(graphRun.productMemory.recall.adapter, "graphiti");
  assert.equal(graphRun.productMemory.retain.adapter, "graphiti");
  assert.equal(graphRun.productMemory.retain.retained, true, JSON.stringify(graphRun.productMemory.retain));
  assert.ok(graphRun.productMemory.retain.episodeUuid);
  assert.match(graphRun.state.memory_context, /Graphiti memory fact/);

  const payloadAudits = await store.all(
    `SELECT * FROM audit_events WHERE session_id = '${enrollment.session.id.replaceAll("'", "''")}' AND event_type = 'outbound_payload_observed';`
  );
  const details = payloadAudits.map((row) => JSON.parse(row.details));
  assert.ok(details.some((item) => item.payloadType === "graphiti_probe_retain"));
  assert.ok(details.some((item) => item.payloadType === "graphiti_probe_recall"));
  assert.ok(details.some((item) => item.payloadType === "graphiti_recall"));
  assert.ok(details.some((item) => item.payloadType === "graphiti_retain"));
  const retainAudit = details.find((item) => item.payloadType === "graphiti_retain");
  assert.equal(retainAudit.destination, "zep_graphiti");
  assert.equal(retainAudit.containsSourcePointers, true);
  assert.equal(retainAudit.containsDirectIdentifier, false);
  assert.equal(retainAudit.containsPortalText, false);
  assert.equal(retainAudit.allowedByCurrentPrototypePolicy, true);
  assert.equal(retainAudit.enforcementMode, "enforced");
  assert.deepEqual(retainAudit.policyIssues, []);
  assert.ok(retainAudit.serializedPayload.includes("episodeBody"));
});

test("real Graphiti/FalkorDB recalls a safe uploaded-document source pointer across sessions", async (t) => {
  if (process.env.BRAINSTY_GRAPHITI_LIVE !== "1") {
    t.skip("Set BRAINSTY_GRAPHITI_LIVE=1 and run npm run graphiti:falkordb first.");
    return;
  }
  await loadLocalEnvOnce();
  configureLiveGraphitiGroup("uploaded_document");

  const dir = await mkdtemp(join(tmpdir(), "brainsty-graphiti-uploaded-document-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  const member = {
    name: "Graphiti Upload Member",
    email: "graphiti-upload-memory@example.com",
    payer: "Aetna",
    portalUrl: "https://www.aetna.com/"
  };
  const first = await enrollDefaultMember(store, member, { title: "Uploaded document source session" });
  const uploadId = `upload_${"f".repeat(32)}`;
  const firstRun = await runLangGraphOrchestration(store, {
    user: first.user,
    session: first.session,
    channel: first.session.channel,
    userInput: "Please explain this uploaded benefits document and tell me what it says about the deductible.",
    rawMessage: {
      source: "product_memory_uploaded_document_graphiti_test",
      executeEvidenceObservation: false,
      useLiveModel: false,
      uploadedDocumentIds: [uploadId],
      uploadedDocuments: [uploadedBenefitsDocument(uploadId)]
    }
  });

  assert.equal(firstRun.state.evidence_observation.status, "captured_uploaded_document_extraction");
  assert.equal(firstRun.state.source_pointers[0].table, "uploaded_document_extractions");
  assert.equal(firstRun.productMemory.retain.retained, true, JSON.stringify(firstRun.productMemory.retain));
  assert.ok(firstRun.productMemory.retain.episodeUuid);

  const retainAudits = await store.all(
    `SELECT * FROM audit_events WHERE session_id = '${first.session.id.replaceAll("'", "''")}' AND event_type = 'outbound_payload_observed';`
  );
  const retainDetails = retainAudits.map((row) => JSON.parse(row.details)).filter((item) => item.payloadType === "graphiti_retain");
  assert.ok(retainDetails.length);
  const firstRetain = retainDetails.at(-1);
  assert.equal(firstRetain.containsSourcePointers, true);
  assert.equal(firstRetain.containsDirectIdentifier, false);
  assert.equal(firstRetain.containsPortalText, false);
  assert.equal(firstRetain.allowedByCurrentPrototypePolicy, true);
  assert.match(firstRetain.serializedPayload, /uploaded_document_extractions\/upload_/);
  assert.doesNotMatch(firstRetain.serializedPayload, /Graphiti Upload Member|graphiti-upload-memory@example\\.com|ABCD-1234-7788/);

  const second = await enrollDefaultMember(store, member, { title: "Uploaded document recall session" });
  assert.notEqual(second.session.id, first.session.id);
  const secondRun = await runLangGraphOrchestration(store, {
    user: second.user,
    session: second.session,
    channel: second.session.channel,
    userInput: "In a new session, what source pointer do you remember for my uploaded benefits deductible document?",
    rawMessage: {
      source: "product_memory_uploaded_document_recall_graphiti_test",
      executeEvidenceObservation: false,
      useLiveModel: false
    }
  });

  assert.equal(secondRun.productMemory.recall.adapter, "graphiti");
  assert.ok(secondRun.productMemory.recall.factCount >= 1, JSON.stringify(secondRun.productMemory.recall));
  assert.match(secondRun.state.memory_context, /Graphiti memory fact/);
});
