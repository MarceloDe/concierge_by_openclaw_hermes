import test from "node:test";
import assert from "node:assert/strict";
import { maskDirectIdentifiers } from "../concierge/modelPayloadPolicy.mjs";

test("PHI direct identifier masking preserves insurance reasoning context", () => {
  const state = {
    context_packet: {
      user: { id: "user_phi", name: "Marcelo Felix", email: "mocfelix@gmail.com" }
    }
  };
  const masked = maskDirectIdentifiers(
    "Marcelo Felix at mocfelix@gmail.com has Aetna claim CPT 99213 diagnosis E11.9 member ID W123456789 and SSN 123-45-6789.",
    state
  );
  assert.doesNotMatch(masked, /Marcelo|Felix|mocfelix@gmail\.com|W123456789|123-45-6789/);
  assert.match(masked, /CPT 99213/);
  assert.match(masked, /E11\.9/);
});

