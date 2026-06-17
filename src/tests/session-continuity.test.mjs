import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import {
  SessionContinuityError,
  buildSessionExport,
  getSessionContinuity,
  recordSessionFeedback
} from "../concierge/sessionContinuity.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-session-continuity-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

function uploadedDocument() {
  return {
    uploadId: "upload_session_continuity",
    filename: "benefits-continuity.txt",
    contentType: "text/plain",
    byteSize: 180,
    sha256: "d".repeat(64),
    extraction: {
      status: "completed",
      method: "utf8_text",
      extractedAt: "2026-06-01T12:00:00Z",
      textHash: "e".repeat(64),
      safeTextPreview: "Summary of Benefits Deductible $1,500 Out-of-pocket max $7,000",
      fields: [
        {
          label: "deductible",
          value: "Deductible $1,500",
          confidence: "medium",
          source: { kind: "uploaded_document", snippet: "Deductible $1,500" }
        }
      ],
      sourceSpans: [
        {
          span_id: "span_deductible",
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

test("session continuity loads protected history, source pointers, feedback, and export", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const run = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Please explain this uploaded document and tell me what it says about my deductible.",
    rawMessage: {
      source: "session_continuity_test",
      useLiveModel: false,
      executeEvidenceObservation: false,
      uploadedDocumentIds: ["upload_session_continuity"],
      uploadedDocuments: [uploadedDocument()]
    }
  });

  const history = await getSessionContinuity(store, { sessionId: session.id, userId: user.id });
  assert.equal(history.session.id, session.id);
  assert.equal(history.messages.length, 2);
  assert.equal(history.sourcePointerCount, 1);
  assert.equal(history.sourcePointers[0].id, "upload_session_continuity");
  assert.equal(history.exportAvailable, true);
  assert.doesNotMatch(JSON.stringify(history.messages), /mocfelix@gmail\.com/);

  const assistantMessage = history.messages.find((message) => message.role === "assistant");
  const feedback = await recordSessionFeedback(store, {
    sessionId: session.id,
    userId: user.id,
    messageId: assistantMessage.id,
    taskId: run.state.openclaw_skill_proposal?.task?.id ?? null,
    rating: "needs_follow_up",
    comment: "Please double check Marcelo Felix at mocfelix@gmail.com before tomorrow."
  });
  assert.equal(feedback.ok, true);
  assert.equal(feedback.feedback.rating, "needs_follow_up");
  assert.doesNotMatch(feedback.feedback.comment, /mocfelix@gmail\.com|Marcelo Felix/);

  const afterFeedback = await getSessionContinuity(store, { sessionId: session.id, userId: user.id });
  assert.equal(afterFeedback.feedback.length, 1);
  assert.equal(afterFeedback.feedback[0].sourcePointerCount, 1);

  const exported = await buildSessionExport(store, { sessionId: session.id, userId: user.id });
  assert.equal(exported.ok, true);
  assert.match(exported.content, /Latest Answer/);
  assert.match(exported.content, /Stored Source Pointers/);
  assert.match(exported.content, /uploaded_document_extractions/);
  assert.doesNotMatch(exported.content, /mocfelix@gmail\.com|Marcelo Felix/);
});

test("session continuity rejects cross-user history and feedback", async () => {
  const store = await createStore();
  const { session } = await enrollDefaultMember(store);

  await assert.rejects(
    () => getSessionContinuity(store, { sessionId: session.id, userId: "other_user" }),
    (error) => error instanceof SessionContinuityError && error.statusCode === 403
  );
  await assert.rejects(
    () =>
      recordSessionFeedback(store, {
        sessionId: session.id,
        userId: "other_user",
        rating: "useful",
        comment: "Looks good."
      }),
    (error) => error instanceof SessionContinuityError && error.statusCode === 403
  );
});
