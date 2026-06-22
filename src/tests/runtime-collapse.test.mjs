import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("public chat endpoints share the LangGraph product runtime contract", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-runtime-collapse-"));
  process.env.BRAINSTY_DB_PATH = join(dir, "test.sqlite");
  const { server } = await import("../server/server.mjs");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const member = {
      name: "Runtime Collapse Member",
      email: "runtime-collapse@example.com",
      payer: "Aetna",
      portalUrl: "https://www.aetna.com/"
    };
    const body = {
      member,
      message: "Use my Aetna portal memory to check eligibility and benefits.",
      executeEvidenceObservation: false,
      useLiveModel: false
    };
    const chatResponse = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const chatPayload = await chatResponse.json();
    assert.equal(chatResponse.status, 200, JSON.stringify(chatPayload));

    const graphResponse = await fetch(`http://127.0.0.1:${port}/api/langgraph/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...body,
        sessionId: chatPayload.session.id
      })
    });
    const graphPayload = await graphResponse.json();
    assert.equal(graphResponse.status, 200, JSON.stringify(graphPayload));

    assert.equal(chatPayload.graphRun.state.schema_version, graphPayload.graphRun.state.schema_version);
    assert.equal(chatPayload.graphRun.state.graph_trace_id, graphPayload.graphRun.state.graph_trace_id);
    assert.equal(chatPayload.graphRun.state.workflow, graphPayload.graphRun.state.workflow);
    assert.equal(chatPayload.graphRun.state.evidence_observation.status, "blocked_no_trusted_research_evidence");
    assert.equal(graphPayload.graphRun.state.evidence_observation.status, "blocked_no_trusted_research_evidence");
    assert.deepEqual(chatPayload.graphRun.state.source_pointers, []);
    assert.deepEqual(graphPayload.graphRun.state.source_pointers, []);
    assert.equal(chatPayload.graphRun.state.openclaw_skill_proposal.task.status, "pending_approval");
    assert.equal(graphPayload.graphRun.state.openclaw_skill_proposal.task.status, "pending_approval");
    assert.equal(chatPayload.graphRun.state.workflow_outcome, "best_effort_degraded");
    assert.equal(graphPayload.graphRun.state.workflow_outcome, "best_effort_degraded");
    assert.match(chatPayload.finalResponse, /Unverified:/);
    assert.match(graphPayload.graphRun.state.final_response, /Unverified:/);
    assert.ok(chatPayload.graphRun.state.ai2ui_blocks.some((block) => block.type === "degraded_answer_with_options"));
    assert.ok(graphPayload.graphRun.state.ai2ui_blocks.some((block) => block.type === "degraded_answer_with_options"));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
