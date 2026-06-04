import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-uploaded-document-chat-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

function uploadedBenefitsDocument() {
  return {
    uploadId: "upload_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    filename: "benefits-eob.txt",
    contentType: "text/plain",
    byteSize: 220,
    sha256: "b".repeat(64),
    extraction: {
      status: "completed",
      method: "utf8_text",
      extractedAt: "2026-06-01T12:00:00Z",
      textHash: "c".repeat(64),
      safeTextPreview:
        "Summary of Benefits and Coverage Member ID: [redacted-id-last4:9999] [redacted-email] Deductible $1,500 Out-of-pocket max $7,000",
      fields: [
        {
          label: "document_type",
          value: "summary_of_benefits",
          confidence: "high",
          source: { kind: "uploaded_document", snippet: "Summary of Benefits and Coverage" }
        },
        {
          label: "member_id_last4",
          value: "last4:9999",
          confidence: "medium",
          source: { kind: "uploaded_document", snippet: "Member ID: [redacted-id-last4:9999]" }
        },
        {
          label: "deductible",
          value: "Deductible $1,500",
          confidence: "medium",
          source: { kind: "uploaded_document", snippet: "Deductible $1,500" }
        },
        {
          label: "out_of_pocket",
          value: "Out-of-pocket max $7,000",
          confidence: "medium",
          source: { kind: "uploaded_document", snippet: "Out-of-pocket max $7,000" }
        }
      ],
      sourceSpans: [
        {
          span_id: "span_1",
          source: "uploaded_document",
          snippet: "Summary of Benefits and Coverage",
          confidence: "medium"
        }
      ],
      blockers: [],
      pageCount: 1,
      confidence: "medium"
    }
  };
}

test("LangGraph answers from uploaded document extraction with source pointers", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);

  const result = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Please explain this uploaded document and tell me what it says about my deductible.",
    rawMessage: {
      source: "uploaded_document_chat_test",
      useLiveModel: false,
      executeEvidenceObservation: false,
      uploadedDocumentIds: ["upload_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
      uploadedDocuments: [uploadedBenefitsDocument()]
    }
  });

  assert.equal(result.state.evidence_observation.status, "captured_uploaded_document_extraction");
  assert.equal(result.state.uploaded_document_context.documentCount, 1);
  assert.equal(result.state.source_pointers.length, 1);
  assert.equal(result.state.source_pointers[0].table, "uploaded_document_extractions");
  assert.equal(result.state.source_pointers[0].id, "upload_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(result.state.source_pointers[0].kind, "uploaded_document_extraction");
  assert.equal(result.state.source_pointers[0].displayLabel, "benefits-eob.txt");
  assert.equal(result.state.source_pointers[0].citation.sourceKind, "uploaded_document_extraction");
  assert.equal(result.state.source_pointers[0].citation.sourceSpans[0].spanId, "span_1");
  assert.equal(result.state.source_pointers[0].evidenceFields.length, 4);
  assert.match(result.state.final_response, /uploaded document extraction/i);
  assert.match(result.state.final_response, /deductible = Deductible \$1,500/);
  assert.match(result.state.final_response, /uploaded_document_extractions\/upload_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
  assert.doesNotMatch(result.state.final_response, /jane@example\.com|123-45-6789|ABCD-1234-9999/);
  assert.equal(result.state.workflow_outcome, "uploaded_document_explained");

  const audit = await store.get(
    "SELECT * FROM audit_events WHERE session_id = '" +
      session.id.replaceAll("'", "''") +
      "' AND event_type = 'uploaded_document_extraction_observed' LIMIT 1;"
  );
  assert.ok(audit);
  const details = JSON.parse(audit.details);
  assert.equal(details.sourcePointerCount, 1);
  assert.deepEqual(details.actionsTaken, ["read_uploaded_document_extraction"]);
});
