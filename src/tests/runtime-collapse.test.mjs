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

test("public chat supports compact PWA responses without debug graph payloads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-runtime-compact-"));
  process.env.BRAINSTY_DB_PATH = join(dir, "test.sqlite");
  const { server } = await import("../server/server.mjs");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        member: {
          name: "Compact Chat Member",
          email: "compact-chat@example.com",
          payer: "Aetna",
          portalUrl: "https://member.aetna.com/"
        },
        message: "Help me understand my Aetna portal options.",
        recentMessages: [{ role: "assistant", text: "Option B is read-only extraction after you approve it." }],
        executeEvidenceObservation: false,
        useLiveModel: false,
        compact: true,
        responseMode: "compact",
        includeDebug: false,
        interactiveFastPath: true
      })
    });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.graphRun, undefined);
    assert.equal(payload.trace, undefined);
    assert.equal(payload.counts, undefined);
    assert.ok(payload.graphSummary);
    assert.equal(payload.graphSummary.llmDecisionMode, "not_requested");
    assert.ok(Array.isArray(payload.graphSummary.proofSteps));
    assert.ok(typeof payload.finalResponse === "string" && payload.finalResponse.length > 0);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("public chat rehydrates same-session context for auth guidance follow-ups", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-runtime-session-context-"));
  process.env.BRAINSTY_DB_PATH = join(dir, "test.sqlite");
  const { server } = await import("../server/server.mjs");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const member = {
      name: "Session Context Member",
      email: "session-context@example.com",
      payer: "Aetna",
      portalUrl: "https://member.aetna.com/"
    };
    const first = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        member,
        message: "Can you help me to log in to my insurance portal?",
        executeEvidenceObservation: false,
        useLiveModel: false,
        compact: true
      })
    });
    const firstPayload = await first.json();
    assert.equal(first.status, 200, JSON.stringify(firstPayload));

    const second = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        member,
        sessionId: firstPayload.session.id,
        message: "but you can guide me and i put the password?",
        executeEvidenceObservation: false,
        useLiveModel: false,
        compact: true,
        interactiveFastPath: true
      })
    });
    const secondPayload = await second.json();
    assert.equal(second.status, 200, JSON.stringify(secondPayload));
    assert.equal(secondPayload.policyResult.allowed, true);
    assert.equal(secondPayload.policyResult.checks.find((check) => check.name === "credential_boundary").severity, "user_controlled_auth_guidance");
    assert.notEqual(secondPayload.intent, "refuse_credential_entry");
    assert.doesNotMatch(secondPayload.finalResponse, /cannot enter or request passwords/i);
    assert.match(secondPayload.finalResponse, /I can guide you while you type your own Aetna password/i);
    assert.match(secondPayload.finalResponse, /If you prefer not to log in/i);
    assert.equal(secondPayload.graphRun, undefined);
    assert.equal(secondPayload.trace, undefined);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
