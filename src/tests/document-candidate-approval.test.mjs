import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createReadOnlyObservationApproval, consumeReadOnlyObservationApproval } from "../concierge/approvalResume.mjs";
import { SqliteStore } from "../concierge/database.mjs";
import {
  DOCUMENT_CANDIDATE_TASK_TYPE,
  READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
  candidateIdFor,
  createDocumentCandidateProposal,
  latestDocumentDiscovery,
  normalizeDocumentCandidate
} from "../concierge/documentCandidateApproval.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { publishRuntimeEvent } from "../concierge/runtimeEvents.mjs";
import { createWorkerContinuation, validateWorkerContinuationForDispatch } from "../concierge/workerContinuations.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-document-candidate-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

function discoveryReport(candidates) {
  return {
    version: "test.discovery.v1",
    portalSearch: { status: "portal_search_available_not_submitted" },
    documentDiscovery: {
      attempted: true,
      status: "document_candidates_recorded",
      candidateCount: candidates.length,
      readOnlyCandidateCount: candidates.filter((candidate) => candidate.readOnlyOpenAllowed).length,
      blockedCandidateCount: candidates.filter((candidate) => !candidate.readOnlyOpenAllowed).length,
      sbcPdfCandidateCount: candidates.filter((candidate) => candidate.sbcOrPdf).length,
      candidates,
      policy: {
        downloadAttempted: false,
        pdfAnalysisAttempted: false,
        rawDocumentDumpAllowed: false
      }
    },
    fallbackChain: ["same_site_navigation", "official_document_or_pdf_if_needed", "manual_user_export"]
  };
}

async function seedDiscovery(store, { user, session, candidates }) {
  return publishRuntimeEvent(store, {
    userId: user.id,
    sessionId: session.id,
    source: "test",
    eventType: "worker.status.updated",
    payload: {
      status: "completed_with_sourced_result",
      discoveryReport: discoveryReport(candidates),
      actionsTaken: []
    }
  });
}

test("document candidate IDs are stable for URL/type/label/source", () => {
  const candidate = {
    type: "plan_document",
    label: "Plan document",
    url: "https://health.aetna.com/member/documents/plan",
    source: "cdp_dom_link"
  };
  assert.equal(candidateIdFor(candidate), candidateIdFor({ ...candidate }));
  assert.notEqual(candidateIdFor(candidate), candidateIdFor({ ...candidate, label: "ID card" }));
});

test("blocked document candidates cannot become approval tasks", async () => {
  const store = await createStore();
  const { user, session, portal } = await enrollDefaultMember(store, {
    email: "document-blocked@example.com",
    portalUrl: "https://health.aetna.com/member/home"
  });
  const rawCandidate = {
    type: "document_center",
    label: "Documents and forms",
    url: "https://health.aetna.com/member/documents-and-forms",
    source: "cdp_dom_link",
    readOnlyOpenAllowed: true
  };
  const candidate = normalizeDocumentCandidate(rawCandidate, { portalUrl: portal.portal_url });
  await seedDiscovery(store, { user, session, candidates: [rawCandidate] });

  const proposal = await createDocumentCandidateProposal(store, {
    userId: user.id,
    sessionId: session.id,
    workflow: "eligibility_benefits_navigation",
    candidateId: candidate.candidateId,
    portalUrl: portal.portal_url
  });

  assert.equal(proposal.ok, false);
  assert.equal(proposal.status, "candidate_blocked");
  assert.deepEqual(proposal.actionsTaken, []);
  assert.equal((await store.list("agent_tasks", { session_id: session.id })).length, 0);
});

test("document candidate approval binds task, session, user, workflow, candidate ID, and URL", async () => {
  const store = await createStore();
  const { user, session, portal } = await enrollDefaultMember(store, {
    email: "document-approval@example.com",
    portalUrl: "https://health.aetna.com/member/home"
  });
  const rawCandidate = {
    type: "plan_document",
    label: "Plan document",
    url: "https://health.aetna.com/member/documents/plan",
    source: "cdp_dom_link",
    readOnlyOpenAllowed: true,
    sbcOrPdf: false
  };
  const candidateId = candidateIdFor(rawCandidate);
  await seedDiscovery(store, { user, session, candidates: [rawCandidate] });

  const proposal = await createDocumentCandidateProposal(store, {
    userId: user.id,
    sessionId: session.id,
    workflow: "eligibility_benefits_navigation",
    candidateId,
    portalUrl: portal.portal_url
  });
  assert.equal(proposal.ok, true);
  assert.equal(proposal.task.task_type, DOCUMENT_CANDIDATE_TASK_TYPE);
  assert.equal(proposal.task.status, "pending_approval");
  assert.equal(proposal.candidate.candidateId, candidateId);

  const approval = await createReadOnlyObservationApproval(store, {
    taskId: proposal.task.id,
    sessionId: session.id,
    userId: user.id,
    approvalScope: READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
    allowedAction: READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
    expiresInMinutes: 15
  });
  assert.equal(approval.ok, true);
  assert.equal(approval.approval.candidateId, candidateId);
  assert.equal(approval.approval.candidateUrl, "https://health.aetna.com/member/documents/plan");
  assert.deepEqual(approval.approval.actionsTaken, []);

  const mismatch = await consumeReadOnlyObservationApproval(store, {
    approvalToken: approval.approvalToken,
    taskId: proposal.task.id,
    sessionId: session.id,
    userId: user.id,
    workflow: "eligibility_benefits_navigation",
    approvalScope: READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
    allowedAction: READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
    candidateId,
    candidateUrl: "https://health.aetna.com/member/documents/other"
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.status, "approval_binding_mismatch");
  assert.deepEqual(mismatch.actionsTaken, []);

  const consumed = await consumeReadOnlyObservationApproval(store, {
    approvalToken: approval.approvalToken,
    taskId: proposal.task.id,
    sessionId: session.id,
    userId: user.id,
    workflow: "eligibility_benefits_navigation",
    approvalScope: READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
    allowedAction: READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
    candidateId,
    candidateUrl: "https://health.aetna.com/member/documents/plan"
  });
  assert.equal(consumed.ok, true);
  assert.deepEqual(consumed.actionsTaken, ["approved_read_only_document_observation"]);

  const reused = await consumeReadOnlyObservationApproval(store, {
    approvalToken: approval.approvalToken,
    taskId: proposal.task.id,
    sessionId: session.id,
    userId: user.id,
    workflow: "eligibility_benefits_navigation",
    approvalScope: READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
    allowedAction: READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
    candidateId,
    candidateUrl: "https://health.aetna.com/member/documents/plan"
  });
  assert.equal(reused.status, "approval_already_consumed");
  assert.deepEqual(reused.actionsTaken, []);
});

test("document candidate continuations carry candidate scope and validate for dispatch", async () => {
  const store = await createStore();
  const { user, session, portal } = await enrollDefaultMember(store, {
    email: "document-continuation@example.com",
    portalUrl: "https://health.aetna.com/member/home"
  });
  const rawCandidate = {
    type: "benefits_summary",
    label: "Benefits summary",
    url: "https://health.aetna.com/member/documents/benefits",
    source: "cdp_dom_link",
    readOnlyOpenAllowed: true
  };
  await seedDiscovery(store, { user, session, candidates: [rawCandidate] });
  const proposal = await createDocumentCandidateProposal(store, {
    userId: user.id,
    sessionId: session.id,
    workflow: "eligibility_benefits_navigation",
    candidateId: candidateIdFor(rawCandidate),
    portalUrl: portal.portal_url
  });

  const continuation = await createWorkerContinuation(store, {
    taskId: proposal.task.id,
    sessionId: session.id,
    userId: user.id,
    approvalScope: READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
    allowedAction: READ_ONLY_DOCUMENT_APPROVAL_SCOPE
  });
  assert.equal(continuation.ok, true);
  assert.equal(continuation.continuation.approvalScope, READ_ONLY_DOCUMENT_APPROVAL_SCOPE);
  assert.equal(continuation.continuation.metadata.candidate.candidateId, candidateIdFor(rawCandidate));

  const ready = await validateWorkerContinuationForDispatch(store, {
    continuationId: continuation.continuation.id,
    sessionId: session.id,
    userId: user.id,
    taskId: proposal.task.id,
    workflow: "eligibility_benefits_navigation"
  });
  assert.equal(ready.ok, true);
  assert.equal(ready.status, "ready_for_approved_dispatch");
});

test("latest discovery returns normalized candidates with manual export fallback", async () => {
  const store = await createStore();
  const { user, session, portal } = await enrollDefaultMember(store, {
    email: "document-discovery@example.com",
    portalUrl: "https://health.aetna.com/member/home"
  });
  await seedDiscovery(store, {
    user,
    session,
    candidates: [
      {
        type: "summary_of_benefits_and_coverage",
        label: "Summary of Benefits and Coverage",
        url: "https://health.aetna.com/member/documents/sbc.pdf",
        source: "cdp_dom_link",
        readOnlyOpenAllowed: true,
        sbcOrPdf: true
      }
    ]
  });
  const discovery = await latestDocumentDiscovery(store, { sessionId: session.id, portalUrl: portal.portal_url });
  assert.equal(discovery.ok, true);
  assert.equal(discovery.candidates.length, 1);
  assert.equal(discovery.candidates[0].sbcOrPdf, true);
  assert.ok(discovery.discoveryReport.fallbackChain.includes("manual_user_export"));
});

