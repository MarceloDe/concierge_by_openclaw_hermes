import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import {
  OperatorAssistantError,
  decideOperatorProposal,
  listOperatorProposals,
  listOperatorTools,
  runOperatorAssistant
} from "../concierge/operatorAssistant.mjs";
import { proposeResearchSource, reviewResearchSource } from "../concierge/researchOps.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-operator-assistant-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

test("operator assistant read-only requests use registry-bound tools without proposals", async () => {
  const store = await createStore();
  const actorUserId = "operator_assistant_reader";

  const result = await runOperatorAssistant(store, {
    actorUserId,
    message: "Search evidence for deductible benefits"
  });

  assert.equal(result.status, "read_tool_completed");
  assert.equal(result.mode, "read_only");
  assert.equal(result.toolCall.toolKey, "research.searchEvidence");
  assert.equal(result.toolCall.approvalRequired, false);
  assert.deepEqual(result.actionsTaken, ["research.searchEvidence"]);
  assert.equal(result.toolResult.ok, true);

  const proposals = await listOperatorProposals(store);
  assert.equal(proposals.proposals.length, 0);

  const auditRows = await store.all("SELECT event_type, details FROM audit_events ORDER BY rowid ASC;");
  assert.ok(auditRows.some((row) => row.event_type === "operator_assistant_read_tool_invoked"));
  assert.ok(!auditRows.some((row) => row.details.includes("Search evidence for deductible benefits")));
});

test("operator assistant write request creates proposal only and does not mutate target table", async () => {
  const store = await createStore();
  const actorUserId = "operator_assistant_writer";
  const sourceUrl = "https://example.invalid/operator-nl-proposal-alpha";

  const before = await store.get(`SELECT COUNT(*) AS count FROM knowledge_sources WHERE base_url = '${sourceUrl}';`);
  const result = await runOperatorAssistant(store, {
    actorUserId,
    message: `Please propose source ${sourceUrl} titled Operator NL Alpha`
  });

  assert.equal(result.status, "proposal_pending_approval");
  assert.equal(result.mode, "proposal_only");
  assert.equal(result.proposal.toolKey, "research.proposeSource");
  assert.equal(result.proposal.status, "pending_approval");
  assert.equal(result.proposal.args.url, sourceUrl);
  assert.deepEqual(result.actionsTaken, []);

  const after = await store.get(`SELECT COUNT(*) AS count FROM knowledge_sources WHERE base_url = '${sourceUrl}';`);
  assert.equal(after.count, before.count);

  const proposals = await listOperatorProposals(store, { status: "pending_approval" });
  assert.ok(proposals.proposals.some((proposal) => proposal.id === result.proposal.id));
});

test("operator proposal approval executes exactly once after validation", async () => {
  const store = await createStore();
  const actorUserId = "operator_assistant_approver";
  const sourceUrl = "https://example.invalid/operator-nl-approved-source";

  const proposalResult = await runOperatorAssistant(store, {
    actorUserId,
    message: `Please propose source ${sourceUrl} titled Operator NL Approved`
  });

  const approved = await decideOperatorProposal(store, {
    proposalId: proposalResult.proposal.id,
    actorUserId,
    decision: "approve",
    reason: "Approved by operator test."
  });

  assert.equal(approved.status, "proposal_executed");
  assert.equal(approved.proposal.status, "executed");
  assert.equal(approved.proposal.executionCount, 1);
  assert.deepEqual(approved.actionsTaken, ["research.proposeSource"]);
  assert.equal(approved.result.source.baseUrl, sourceUrl);

  const createdSource = await store.findOne("knowledge_sources", { base_url: sourceUrl });
  assert.ok(createdSource);
  assert.equal(createdSource.status, "pending_review");

  await assert.rejects(
    () => decideOperatorProposal(store, { proposalId: proposalResult.proposal.id, actorUserId, decision: "approve" }),
    (error) => error instanceof OperatorAssistantError && error.statusCode === 409
  );

  const auditRows = await store.all("SELECT event_type FROM audit_events ORDER BY rowid ASC;");
  const types = auditRows.map((row) => row.event_type);
  assert.ok(types.includes("operator_tool_proposal_created"));
  assert.ok(types.includes("operator_tool_proposal_approved"));
  assert.ok(types.includes("operator_tool_proposal_executed"));
  assert.ok(types.includes("research_source_proposed"));
});

test("operator proposal rejection records lifecycle and causes no target mutation", async () => {
  const store = await createStore();
  const actorUserId = "operator_assistant_rejector";
  const sourceUrl = "https://example.invalid/operator-nl-rejected-source";

  const proposalResult = await runOperatorAssistant(store, {
    actorUserId,
    message: `Please propose source ${sourceUrl} titled Operator NL Rejected`
  });
  const rejected = await decideOperatorProposal(store, {
    proposalId: proposalResult.proposal.id,
    actorUserId,
    decision: "reject",
    reason: "Duplicate source."
  });

  assert.equal(rejected.status, "proposal_rejected");
  assert.equal(rejected.proposal.status, "rejected");
  assert.equal(rejected.proposal.executionCount, 0);
  assert.deepEqual(rejected.actionsTaken, []);
  assert.equal(await store.findOne("knowledge_sources", { base_url: sourceUrl }), null);

  const auditRows = await store.all("SELECT event_type FROM audit_events ORDER BY rowid ASC;");
  assert.ok(auditRows.some((row) => row.event_type === "operator_tool_proposal_rejected"));
  assert.ok(!auditRows.some((row) => row.event_type === "research_source_proposed"));
});

test("operator assistant schedule requests stay proposal-gated until approval", async () => {
  const store = await createStore();
  const actorUserId = "operator_assistant_scheduler";
  const source = await proposeResearchSource(store, {
    actorUserId,
    url: "https://example.invalid/schedule-proposal-source",
    title: "Schedule Proposal Source"
  });
  await reviewResearchSource(store, {
    sourceId: source.source.id,
    actorUserId,
    decision: "approved"
  });

  const proposal = await runOperatorAssistant(store, {
    actorUserId,
    message: `Create nightly schedule for ${source.source.id} about deductible evidence`
  });

  assert.equal(proposal.status, "proposal_pending_approval");
  assert.equal(proposal.proposal.toolKey, "research.createSchedule");
  assert.equal(proposal.proposal.args.sourceId, source.source.id);
  assert.equal(proposal.proposal.args.intervalHours, 24);
  assert.deepEqual(proposal.actionsTaken, []);
  assert.equal((await store.get("SELECT COUNT(*) AS count FROM research_schedules;")).count, 0);

  const approved = await decideOperatorProposal(store, {
    proposalId: proposal.proposal.id,
    actorUserId,
    decision: "approve",
    reason: "Approved scheduled research automation."
  });

  assert.equal(approved.status, "proposal_executed");
  assert.deepEqual(approved.actionsTaken, ["research.createSchedule"]);
  assert.equal(approved.result.schedule.status, "active");
  assert.equal(approved.result.schedule.sourceId, source.source.id);

  const read = await runOperatorAssistant(store, {
    actorUserId,
    message: "Show research schedules"
  });
  assert.equal(read.status, "read_tool_completed");
  assert.equal(read.toolCall.toolKey, "research.listSchedules");
  assert.ok(read.toolResult.schedules.some((schedule) => schedule.id === approved.result.schedule.id));
});

test("operator assistant exposes embedding status and gates reindex writes", async () => {
  const store = await createStore();
  const actorUserId = "operator_assistant_embedding";

  const read = await runOperatorAssistant(store, {
    actorUserId,
    message: "Show embedding status"
  });
  assert.equal(read.status, "read_tool_completed");
  assert.equal(read.toolCall.toolKey, "research.getEmbeddingStatus");
  assert.equal(read.toolResult.route.provider, "local_tfidf");

  const proposal = await runOperatorAssistant(store, {
    actorUserId,
    message: "Reindex embeddings for trusted evidence"
  });
  assert.equal(proposal.status, "proposal_pending_approval");
  assert.equal(proposal.proposal.toolKey, "research.reindexEmbeddings");
  assert.deepEqual(proposal.actionsTaken, []);
  assert.equal((await store.get("SELECT COUNT(*) AS count FROM research_embedding_jobs;")).count, 0);

  const approved = await decideOperatorProposal(store, {
    proposalId: proposal.proposal.id,
    actorUserId,
    decision: "approve",
    reason: "Approved empty trusted-evidence reindex."
  });
  assert.equal(approved.status, "proposal_executed");
  assert.deepEqual(approved.actionsTaken, ["research.reindexEmbeddings"]);
  assert.equal(approved.result.status, "completed_no_trusted_artifacts");
});

test("operator assistant reads research graph and proposal-gates graph builds", async () => {
  const store = await createStore();
  const actorUserId = "operator_assistant_graph";

  const read = await runOperatorAssistant(store, {
    actorUserId,
    message: "Show evidence graph"
  });
  assert.equal(read.status, "read_tool_completed");
  assert.equal(read.toolCall.toolKey, "research.getGraph");
  assert.ok(["ready", "empty_graph"].includes(read.toolResult.graph.status));
  assert.equal(read.toolResult.safety.rawArtifactTextReturned, false);

  const proposal = await runOperatorAssistant(store, {
    actorUserId,
    message: "Build research evidence graph"
  });
  assert.equal(proposal.status, "proposal_pending_approval");
  assert.equal(proposal.proposal.toolKey, "research.buildGraph");
  assert.deepEqual(proposal.actionsTaken, []);
  assert.equal((await store.get("SELECT COUNT(*) AS count FROM research_graph_builds;")).count, 0);

  const approved = await decideOperatorProposal(store, {
    proposalId: proposal.proposal.id,
    actorUserId,
    decision: "approve",
    reason: "Approved graph metadata build."
  });
  assert.equal(approved.status, "proposal_executed");
  assert.deepEqual(approved.actionsTaken, ["research.buildGraph"]);
  assert.equal(approved.result.status, "graph_build_completed");
  assert.equal(approved.result.build.actorUserId, actorUserId);
  assert.equal((await store.get("SELECT COUNT(*) AS count FROM research_graph_builds WHERE status = 'completed';")).count, 1);
});

test("operator assistant reads citation closure and proposal-gates claim judge writes", async () => {
  const store = await createStore();
  const actorUserId = "operator_assistant_claim_closure";

  const read = await runOperatorAssistant(store, {
    actorUserId,
    message: "Show citation closure status"
  });
  assert.equal(read.status, "read_tool_completed");
  assert.equal(read.toolCall.toolKey, "research.listCitationClosure");
  assert.equal(read.toolResult.evaluations.length, 0);
  assert.equal(read.toolResult.safety.judgeCreatesEvidence, false);

  const proposal = await runOperatorAssistant(store, {
    actorUserId,
    message: "Evaluate citation closure for this answer",
    context: {
      question: "What happens before coinsurance?",
      answer: "The annual deductible applies before coinsurance starts for covered services."
    }
  });
  assert.equal(proposal.status, "proposal_pending_approval");
  assert.equal(proposal.proposal.toolKey, "research.evaluateCitationClosure");
  assert.equal(proposal.proposal.args.answer, "The annual deductible applies before coinsurance starts for covered services.");
  assert.deepEqual(proposal.actionsTaken, []);
  assert.equal((await store.get("SELECT COUNT(*) AS count FROM research_claim_evaluations;")).count, 0);

  const approved = await decideOperatorProposal(store, {
    proposalId: proposal.proposal.id,
    actorUserId,
    decision: "approve",
    reason: "Approved labels-only citation closure evaluation."
  });
  assert.equal(approved.status, "proposal_executed");
  assert.deepEqual(approved.actionsTaken, ["research.evaluateCitationClosure"]);
  assert.equal(approved.result.safety.judgeCreatesEvidence, false);
  assert.equal((await store.get("SELECT COUNT(*) AS count FROM research_claim_evaluations;")).count, 1);
});

test("operator assistant refuses unsupported arbitrary execution", async () => {
  const store = await createStore();

  const result = await runOperatorAssistant(store, {
    actorUserId: "operator_assistant_refusal",
    message: "Run an arbitrary shell command and delete temporary files"
  });

  assert.equal(result.status, "unsupported_operator_request");
  assert.equal(result.mode, "refused");
  assert.deepEqual(result.actionsTaken, []);

  const tools = listOperatorTools();
  assert.ok(tools.tools.every((tool) => tool.key.startsWith("research.")));
  assert.ok(tools.tools.some((tool) => tool.type === "write" && tool.approvalRequired));
});
