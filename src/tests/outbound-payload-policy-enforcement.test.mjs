import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { recordOutboundPayloadObservation } from "../concierge/outboundPayloadObservability.mjs";

async function testStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-payload-policy-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

test("outbound payload policy blocks direct identifiers before external send", async () => {
  const store = await testStore();
  await assert.rejects(
    recordOutboundPayloadObservation(store, {
      sessionId: null,
      payload: { messages: [{ role: "user", content: "Route Test User needs benefits help." }] },
      payloadType: "openai_chat_messages",
      destination: "openai",
      policyMode: "phi_allowed_identifier_masked_reasoning",
      user: { id: "user_test", name: "Route Test User", email: "route@example.invalid" }
    }),
    /direct_identifier_present/
  );
  const blocked = await store.get("SELECT * FROM audit_events WHERE event_type = 'outbound_payload_blocked' LIMIT 1;");
  assert.ok(blocked);
  const details = JSON.parse(blocked.details);
  assert.deepEqual(details.policyIssues, ["direct_identifier_present"]);
});

test("outbound payload policy blocks raw portal text in memory-bound payloads", async () => {
  const store = await testStore();
  await assert.rejects(
    recordOutboundPayloadObservation(store, {
      sessionId: null,
      payload: {
        action: "retain",
        episodeBody: {
          visible_text: "Claims and benefits page copied verbatim from the portal.",
          sourcePointers: [{ table: "eligibility_snapshots", id: "snap_test" }]
        }
      },
      payloadType: "graphiti_retain",
      destination: "zep_graphiti",
      policyMode: "product_memory_retain"
    }),
    /raw_portal_text_present/
  );
});

test("outbound payload policy allows safe source-pointer summaries and can require source pointers", async () => {
  const store = await testStore();
  const observation = await recordOutboundPayloadObservation(store, {
    sessionId: null,
    payload: {
      action: "retain",
      episodeBody: {
        summary: "The benefits answer should cite stored source pointers.",
        sourcePointers: [{ table: "eligibility_snapshots", id: "snap_test" }]
      }
    },
    payloadType: "graphiti_retain",
    destination: "zep_graphiti",
    policyMode: "product_memory_retain",
    requireSourcePointers: true
  });
  assert.equal(observation.allowedByCurrentPrototypePolicy, true);
  assert.equal(observation.enforcementMode, "enforced");
  assert.equal(observation.containsSourcePointers, true);

  await assert.rejects(
    recordOutboundPayloadObservation(store, {
      sessionId: null,
      payload: { action: "retain", episodeBody: { summary: "No source pointer contract." } },
      payloadType: "graphiti_retain",
      destination: "zep_graphiti",
      policyMode: "product_memory_retain",
      requireSourcePointers: true
    }),
    /required_source_pointer_contract_missing/
  );
});
