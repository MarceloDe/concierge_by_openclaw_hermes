import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { createReadOnlyObservationApproval } from "../concierge/approvalResume.mjs";
import { verifyAuthenticatedPortalEvidence } from "../concierge/portalEvidenceVerifier.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-portal-proof-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

async function approvedProposal(store) {
  const { user, session } = await enrollDefaultMember(store, {
    name: "Portal Proof Member",
    email: `portal-proof-${crypto.randomUUID()}@example.com`,
    payer: "Aetna",
    portalUrl: "https://health.aetna.com/"
  });
  const proposalRun = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Use my Aetna portal memory to check eligibility and benefits.",
    rawMessage: { source: "test", executeEvidenceObservation: false, useLiveModel: false }
  });
  const approval = await createReadOnlyObservationApproval(store, {
    taskId: proposalRun.state.openclaw_skill_proposal.task.id,
    sessionId: session.id,
    userId: user.id,
    decision: "approved",
    expiresInMinutes: 15
  });
  return { user, session, proposalRun, approval };
}

test("portal evidence verifier rejects public Aetna marketing content", () => {
  const verification = verifyAuthenticatedPortalEvidence({
    portal: { id: "portal_1", payer: "Aetna" },
    page: {
      title: "Aetna health insurance plans",
      url: "https://www.aetna.com/",
      text: "Shop health insurance plans and learn about Aetna."
    }
  });

  assert.equal(verification.valid, false);
  assert.equal(verification.status, "blocked_unverified_portal_evidence");
  assert.ok(verification.issues.some((issue) => issue.includes("public Aetna marketing")));
});

test("live portal proof requires explicit BRAINSTY_PORTAL_LIVE flag before creating evidence", async () => {
  const previous = process.env.BRAINSTY_PORTAL_LIVE;
  delete process.env.BRAINSTY_PORTAL_LIVE;
  try {
    const store = await createStore();
    const { user, session, proposalRun, approval } = await approvedProposal(store);
    const result = await runLangGraphOrchestration(store, {
      user,
      session,
      channel: session.channel,
      userInput: "Use my Aetna portal memory to check eligibility and benefits.",
      rawMessage: {
        source: "test",
        requireLivePortalProof: true,
        approvalToken: approval.approvalToken,
        approvalTaskId: proposalRun.state.openclaw_skill_proposal.task.id,
        browserSnapshot: {
          title: "Aetna Member Benefits",
          url: "https://health.aetna.com/member/benefits",
          text: "Welcome member plan benefits coverage deductible out-of-pocket",
          links: []
        },
        useLiveModel: false
      }
    });

    assert.equal(result.state.evidence_observation.status, "blocked_live_portal_verification_failed");
    assert.match(result.state.evidence_observation.reason, /BRAINSTY_PORTAL_LIVE=1/);
    assert.deepEqual(result.state.evidence_observation.actionsTaken, []);
    assert.equal((await store.list("eligibility_snapshots", { session_id: session.id })).length, 0);
  } finally {
    if (previous === undefined) delete process.env.BRAINSTY_PORTAL_LIVE;
    else process.env.BRAINSTY_PORTAL_LIVE = previous;
  }
});

test("live portal proof blocks public page without creating false healthcare evidence", async () => {
  const previous = process.env.BRAINSTY_PORTAL_LIVE;
  process.env.BRAINSTY_PORTAL_LIVE = "1";
  try {
    const store = await createStore();
    const { user, session, proposalRun, approval } = await approvedProposal(store);
    const result = await runLangGraphOrchestration(store, {
      user,
      session,
      channel: session.channel,
      userInput: "Use my Aetna portal memory to check eligibility and benefits.",
      rawMessage: {
        source: "test",
        requireLivePortalProof: true,
        approvalToken: approval.approvalToken,
        approvalTaskId: proposalRun.state.openclaw_skill_proposal.task.id,
        browserSnapshot: {
          title: "Aetna Health Insurance",
          url: "https://www.aetna.com/",
          text: "Shop plans and learn about health insurance coverage.",
          links: []
        },
        useLiveModel: false
      }
    });

    assert.equal(result.state.evidence_observation.status, "blocked_live_portal_verification_failed");
    assert.ok(result.state.evidence_observation.verification.issues.some((issue) => issue.includes("public Aetna marketing")));
    assert.deepEqual(result.state.evidence_observation.actionsTaken, []);
    assert.equal((await store.list("eligibility_snapshots", { session_id: session.id })).length, 0);
    assert.equal((await store.list("browser_runs", { session_id: session.id })).at(-1).status, "blocked_live_portal_verification_failed");
  } finally {
    if (previous === undefined) delete process.env.BRAINSTY_PORTAL_LIVE;
    else process.env.BRAINSTY_PORTAL_LIVE = previous;
  }
});

test("live portal proof stores source pointer hashes for verified authenticated member page", async () => {
  const previous = process.env.BRAINSTY_PORTAL_LIVE;
  process.env.BRAINSTY_PORTAL_LIVE = "1";
  try {
    const store = await createStore();
    const { user, session, proposalRun, approval } = await approvedProposal(store);
    const result = await runLangGraphOrchestration(store, {
      user,
      session,
      channel: session.channel,
      userInput: "Use my Aetna portal memory to check eligibility and benefits.",
      rawMessage: {
        source: "test",
        requireLivePortalProof: true,
        approvalToken: approval.approvalToken,
        approvalTaskId: proposalRun.state.openclaw_skill_proposal.task.id,
        browserSnapshot: {
          title: "Aetna Member Benefits",
          url: "https://health.aetna.com/member/benefits",
          text: "Welcome member plan benefits coverage deductible out-of-pocket copay coinsurance",
          links: []
        },
        useLiveModel: false
      }
    });

    assert.equal(result.state.evidence_observation.status, "captured_visible_page");
    assert.equal(result.state.evidence_observation.livePortalProof, "verified");
    const verifiedPointer = result.state.source_pointers.find((item) => item.table === "extraction_artifacts");
    assert.ok(verifiedPointer);
    assert.equal(verifiedPointer.sourceUrl, "https://health.aetna.com/member/benefits");
    assert.equal(verifiedPointer.evidenceFields.hasMemberSignal, true);
    assert.equal(verifiedPointer.evidenceFields.hasBenefitsSignal, true);
    assert.match(verifiedPointer.domHash, /^[a-f0-9]{64}$/);
    assert.match(verifiedPointer.extractionHash, /^[a-f0-9]{64}$/);
    assert.equal((await store.list("eligibility_snapshots", { session_id: session.id })).length, 1);
  } finally {
    if (previous === undefined) delete process.env.BRAINSTY_PORTAL_LIVE;
    else process.env.BRAINSTY_PORTAL_LIVE = previous;
  }
});
