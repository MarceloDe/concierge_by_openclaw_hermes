import test from "node:test";
import assert from "node:assert/strict";
import { buildOutboundPayloadObservation } from "../concierge/outboundPayloadObservability.mjs";

test("outbound payload observability records exact payload and enforced labels by default", () => {
  const payload = {
    message: "Use [DB_POINTER:users:user_test:name] for benefits.",
    sourcePointers: [{ table: "eligibility_snapshots", id: "snap_test" }],
    nested: {
      visible_text: "Portal page text preview"
    }
  };
  const observation = buildOutboundPayloadObservation(payload, {
    user: { id: "user_test", name: "Payload Test User", email: "payload@example.com" },
    payloadType: "unit_test_payload",
    destination: "test_destination",
    policyMode: "enforced"
  });

  assert.equal(observation.payloadType, "unit_test_payload");
  assert.equal(observation.destination, "test_destination");
  assert.equal(observation.enforcementMode, "enforced");
  assert.equal(observation.allowedByCurrentPrototypePolicy, false);
  assert.deepEqual(observation.policyIssues, ["raw_portal_text_present"]);
  assert.equal(observation.containsPortalText, true);
  assert.equal(observation.containsDirectIdentifier, false);
  assert.equal(observation.containsSourcePointers, true);
  assert.equal(observation.serializedPayload, JSON.stringify(payload));
  assert.match(observation.payloadHash, /^[a-f0-9]{64}$/);

  const instructionOnly = buildOutboundPayloadObservation(
    { message: "Keep patient name, member ID, subscriber ID, and subscription number masked." },
    {
      user: { id: "user_test", name: "Payload Test User", email: "payload@example.com" },
      payloadType: "instruction",
      destination: "openai"
    }
  );
  assert.equal(instructionOnly.containsDirectIdentifier, false);
  assert.equal(instructionOnly.enforcementMode, "enforced");
});

test("outbound payload observability allows hashed Graphiti member namespace but blocks real member identifiers", () => {
  const namespaceOnly = buildOutboundPayloadObservation(
    {
      memoryNamespaces: {
        episodicMember: "episodic:member:dc8d6613f8cc44d6",
        proceduralSkills: "procedural:skills"
      },
      sourcePointers: [{ table: "uploaded_document_extractions", id: "upload_safe" }]
    },
    {
      user: { id: "user_test", name: "Payload Test User", email: "payload@example.com" },
      payloadType: "graphiti_retain",
      destination: "zep_graphiti"
    }
  );
  assert.equal(namespaceOnly.containsDirectIdentifier, false);
  assert.equal(namespaceOnly.containsSourcePointers, true);
  assert.deepEqual(namespaceOnly.policyIssues, []);

  const rawMemberId = buildOutboundPayloadObservation(
    {
      message: "Member ID ABCD-1234-7788",
      sourcePointers: [{ table: "uploaded_document_extractions", id: "upload_unsafe" }]
    },
    {
      user: { id: "user_test", name: "Payload Test User", email: "payload@example.com" },
      payloadType: "graphiti_retain",
      destination: "zep_graphiti"
    }
  );
  assert.equal(rawMemberId.containsDirectIdentifier, true);
  assert.ok(rawMemberId.policyIssues.includes("direct_identifier_present"));
});
