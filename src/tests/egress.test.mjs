import test from "node:test";
import assert from "node:assert/strict";
import { buildOutboundPayloadObservation } from "../concierge/outboundPayloadObservability.mjs";

test("egress classifier detects direct identifiers, raw portal text, and source pointer contracts", () => {
  const direct = buildOutboundPayloadObservation(
    { messages: [{ role: "user", content: "Marcelo Felix member ID W123456789" }] },
    { user: { name: "Marcelo Felix" }, payloadType: "openai", destination: "openai", enforcementMode: "enforced" }
  );
  assert.equal(direct.containsDirectIdentifier, true);
  assert.equal(direct.allowedByCurrentPrototypePolicy, false);

  const portal = buildOutboundPayloadObservation(
    { visible_text: "Raw portal text" },
    { payloadType: "graphiti", destination: "zep_graphiti", enforcementMode: "enforced" }
  );
  assert.equal(portal.containsPortalText, true);

  const sourced = buildOutboundPayloadObservation(
    { sourcePointers: [{ table: "eligibility_snapshots", id: "snap_1" }] },
    { payloadType: "openai_sourced_answer", destination: "openai", requireSourcePointers: true, enforcementMode: "enforced" }
  );
  assert.equal(sourced.allowedByCurrentPrototypePolicy, true);
  assert.equal(sourced.containsSourcePointers, true);
});

