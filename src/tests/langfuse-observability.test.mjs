import test from "node:test";
import assert from "node:assert/strict";
import {
  flush_langfuse,
  getLangfuseStatus,
  get_langfuse_client,
  is_langfuse_enabled,
  resetLangfuseForTests,
  setLangfuseClientForTests,
  shutdown_langfuse
} from "../observability/langfuseClient.mjs";
import { redact_payload, redact_text, safe_metadata } from "../observability/redaction.mjs";
import { start_checkpoint, withCheckpoint } from "../observability/checkpoints.mjs";
import { classifyFailureClass, FAILURE_CLASSES } from "../observability/failures.mjs";
import { createTieredChatModel, resetTieredChatModelFactoryForTests, setTieredChatModelFactoryForTests } from "../concierge/modelTierPolicy.mjs";

test("Langfuse disabled or missing keys returns no-op client and does not crash", async () => {
  resetLangfuseForTests();
  const env = { LANGFUSE_ENABLED: "false" };
  assert.equal(is_langfuse_enabled(env), false);
  assert.equal(getLangfuseStatus(env).mode, "langfuse_disabled");
  const client = await get_langfuse_client(env);
  assert.equal(client.__noop, true);
  await flush_langfuse();
  await shutdown_langfuse();

  resetLangfuseForTests();
  assert.equal(getLangfuseStatus({ LANGFUSE_ENABLED: "true" }).mode, "langfuse_disabled_missing_keys");
});

test("redaction removes direct identifiers and raw sensitive fields", () => {
  const text = redact_text(
    "Email marcelo@example.com phone 305-555-1212 SSN 123-45-6789 member id ABCD-123456 diagnosis: asthma flare"
  );
  assert.doesNotMatch(text, /marcelo@example\.com|305-555-1212|123-45-6789|ABCD-123456|asthma flare/);
  assert.match(text, /REDACTED_EMAIL/);

  const payload = redact_payload({
    claimId: "CLM-123456",
    rawText: "portal says email marcelo@example.com",
    screenshotPath: "/tmp/secret.png",
    safe: "route claim status"
  });
  assert.equal(payload.rawText, "[REDACTED_RAWTEXT]");
  assert.equal(payload.screenshotPath, "[REDACTED_SCREENSHOT]");
  assert.match(payload.claimId, /REDACTED_ID/);

  const metadata = safe_metadata({
    session_id: "sess_1",
    workflow: "claim_status_navigation",
    unknownPatientName: "Marcelo Felix",
    user_id: "user-secret-123"
  });
  assert.equal(metadata.session_id, "sess_1");
  assert.equal(metadata.workflow, "claim_status_navigation");
  assert.ok(metadata.user_id_hash);
  assert.ok(metadata.unknownPatientName_summary);
});

test("checkpoint emits safe planner/router metadata and failure classes", async () => {
  const spans = [];
  setLangfuseClientForTests({
    trace: ({ id, name, metadata }) => ({
      id,
      name,
      metadata,
      span: (spanInput) => {
        const span = { spanInput, ended: null, end(value) { this.ended = value; } };
        spans.push(span);
        return span;
      }
    }),
    async flushAsync() {},
    async shutdownAsync() {}
  });

  const checkpoint = await start_checkpoint(
    "router.route_selected",
    "router.route_selected",
    { trace_id: "trace_1", session_id: "sess_1", route: "claim_status_navigation", node_name: "workflow_router" },
    { input: "claim id CLM-123456 email marcelo@example.com" }
  );
  checkpoint.end_checkpoint({ selectedRoute: "claim_status_navigation", claimId: "CLM-123456" });
  assert.equal(spans.length, 1);
  assert.equal(spans[0].spanInput.metadata.checkpoint_name, "router.route_selected");
  assert.doesNotMatch(JSON.stringify(spans[0]), /marcelo@example\.com|CLM-123456/);

  await assert.rejects(
    withCheckpoint("tool.call", { kind: "tool.call", metadata: { trace_id: "trace_2", tool_name: "payer_lookup" } }, async () => {
      const error = new Error("tool timeout");
      error.code = "ETIMEDOUT";
      throw error;
    }),
    /tool timeout/
  );
  assert.equal(spans[1].ended.metadata.failure_class, FAILURE_CLASSES.TOOL_TIMEOUT);
  resetLangfuseForTests();
});

test("failure taxonomy maps OpenClaw approval and worker timeout classes", () => {
  assert.equal(classifyFailureClass(new Error("OpenClaw approval required before dispatch")), FAILURE_CLASSES.OPENCLAW_APPROVAL_REQUIRED);
  assert.equal(classifyFailureClass(new Error("worker timeout waiting for browser")), FAILURE_CLASSES.WORKER_TIMEOUT);
});

test("model wrapper invokes underlying model and records sanitized checkpoint", async () => {
  const spans = [];
  setLangfuseClientForTests({
    trace: () => ({
      span: (spanInput) => {
        const span = { spanInput, ended: null, end(value) { this.ended = value; } };
        spans.push(span);
        return span;
      }
    }),
    async flushAsync() {},
    async shutdownAsync() {}
  });
  setTieredChatModelFactoryForTests(() => ({
    async invoke(messages) {
      assert.equal(messages[0].role, "user");
      return { content: "{\"ok\":true}" };
    }
  }));
  const { llm } = createTieredChatModel("llm_orchestration_decision", {
    traceId: "trace_model",
    sessionId: "sess_model",
    workflow: "claim_status_navigation"
  });
  const response = await llm.invoke([{ role: "user", content: "email marcelo@example.com claim id CLM-123456" }]);
  assert.equal(response.content, "{\"ok\":true}");
  assert.equal(spans[0].spanInput.name, "model.llm_orchestration_decision");
  assert.doesNotMatch(JSON.stringify(spans[0]), /marcelo@example\.com|CLM-123456/);
  resetTieredChatModelFactoryForTests();
  resetLangfuseForTests();
});
