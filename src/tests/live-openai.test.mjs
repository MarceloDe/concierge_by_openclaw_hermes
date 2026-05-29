import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";

test("live OpenAI smoke test uses PHI-allowed identifier-masked reasoning payload", async () => {
  await loadLocalEnvOnce();
  assert.ok(process.env.OPENAI_API_KEY, "OPENAI_API_KEY must be set for live OpenAI proof.");
  assert.notEqual(process.env.OPENAI_API_KEY, "local", "OPENAI_API_KEY placeholder must not be used for live OpenAI proof.");
  const dir = await mkdtemp(join(tmpdir(), "brainsty-live-openai-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  const { user, session } = await enrollDefaultMember(store, {
    name: "Route Test User",
    email: "route-test@example.invalid"
  });

  const result = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput:
      "Route Test User asks about an Aetna claim with CPT 99213, ICD-10 E11.9, member ID W123456789, and deductible status. Stay within insurance navigation.",
    rawMessage: {
      source: "live_openai_test",
      useLiveModel: true,
      payloadMode: "phi_allowed_identifier_masked_reasoning"
    }
  });

  assert.equal(result.state.llm_orchestration_decision.mode, "openai_chatopenai_invoked");
  assert.equal(result.state.llm_orchestration_decision.valid, true);
  assert.equal(result.state.llm_orchestration_decision.usedByRouter, true);
  assert.equal(result.state.model_invocation.mode, "openai_chatopenai_invoked");
  assert.equal(result.state.model_invocation.payloadMode, "phi_allowed_identifier_masked_reasoning");
  assert.equal(result.state.model_invocation.externalPhiDisclosureAllowed, true);
  assert.equal(result.state.model_invocation.outboundPayloadObservation?.eventType, "outbound_payload_observed");
  assert.equal(result.state.model_invocation.outboundPayloadObservation?.containsDirectIdentifier, false);
  assert.equal(result.state.model_invocation.outboundPayloadObservation?.containsSourcePointers, true);
  assert.equal(result.state.model_invocation.outboundPayloadObservation?.enforcementMode, "enforced");
  assert.ok(result.state.model_invocation.response);
  assert.ok(!JSON.stringify(result.state.model_invocation).includes("sk-"));

  const payloadAudits = await store.all(
    `SELECT * FROM audit_events WHERE session_id = '${session.id.replaceAll("'", "''")}' AND event_type = 'outbound_payload_observed';`
  );
  const openAiAudit = payloadAudits.map((row) => JSON.parse(row.details)).find((details) => details.payloadType === "openai_chat_messages");
  assert.ok(openAiAudit, "OpenAI invocation should record an outbound payload audit event.");
  assert.equal(openAiAudit.payloadType, "openai_chat_messages");
  assert.equal(openAiAudit.policyMode, "phi_allowed_identifier_masked_reasoning");
  assert.equal(openAiAudit.allowedByCurrentPrototypePolicy, true);
  assert.deepEqual(openAiAudit.policyIssues, []);
  assert.ok(openAiAudit.serializedPayload.includes("messages"));
  assert.ok(!openAiAudit.serializedPayload.includes("Route Test User"));
  assert.ok(!openAiAudit.serializedPayload.includes("route-test@example.invalid"));
  assert.ok(!openAiAudit.serializedPayload.includes("sk-"));
});
