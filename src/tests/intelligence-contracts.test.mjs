import test from "node:test";
import assert from "node:assert/strict";
import { buildDeterministicStructuredReasoning } from "../concierge/intelligence/structuredIntentReasoner.mjs";
import { planJourneyFromIntent } from "../concierge/intelligence/journeyPlanner.mjs";
import { validateSourcedAnswer, validateStructuredIntentReasoning } from "../concierge/intelligence/reasoningValidators.mjs";
import { evaluateInputPolicy } from "../concierge/policy.mjs";
import { classifyHealthcareIntent } from "../concierge/structuredIntentClassifier.mjs";

function reason(message) {
  const policyResult = evaluateInputPolicy(message);
  const curatedIntent = classifyHealthcareIntent({
    message,
    policyResult,
    contextPacket: { portalAccount: { id: "portal_1" }, dbPointers: [] }
  });
  return buildDeterministicStructuredReasoning({ message, policyResult, curatedIntent, contextPacket: { dbPointers: [] } });
}

test("structured intent reasoning covers non-keyword healthcare journey families", () => {
  const cases = [
    ["My doctor says the scan needs approval before scheduling.", "prior_authorization"],
    ["The insurance paid nothing on my visit and I do not understand why.", "claims_eob_payment"],
    ["They said no. What do I need to send to fight it?", "denial_appeal"],
    ["Will my plan help with physical therapy or am I still paying everything myself?", "benefits_eligibility"],
    ["Is this medication on my plan or do I need a different one?", "pharmacy_formulary"],
    ["Can you make an administrative checklist before my imaging appointment?", "procedure_admin_checklist"],
    ["Is this provider in network?", "provider_network"],
    ["What would this covered service cost at a lower-cost facility?", "cost_estimate"],
    ["I uploaded this SBC; what matters for an MRI?", "document_review"],
    ["What does CMS say about ICD-10 coding here?", "general_research"],
    ["I think this is urgent and I need medical help now.", "urgent_handoff"]
  ];

  for (const [message, journey] of cases) {
    const result = reason(message);
    const validated = validateStructuredIntentReasoning(result);
    assert.equal(validated.valid, true, validated.issues.join("; "));
    assert.equal(validated.value.primary_intent, journey);
    assert.equal(planJourneyFromIntent(validated.value).journey, journey);
  }
});

test("sourced answer validator rejects unsupported factual claims without source pointers", () => {
  const invalid = validateSourcedAnswer({
    answer: "Your plan covers the MRI.",
    claims: [{ claim: "The plan covers the MRI.", source_pointer_ids: [], confidence: 0.9, unsupported: false }],
    uncertainties: [],
    next_steps: [],
    disclaimers: ["Insurance navigation only."]
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.includes("claim_0_source_pointer_required"));

  const valid = validateSourcedAnswer({
    answer: "The uploaded SBC lists MRI as imaging evidence.",
    claims: [{ claim: "The SBC includes MRI imaging evidence.", source_pointer_ids: ["uploaded_document_extractions/upload_1"], confidence: 0.84, unsupported: false }],
    uncertainties: ["Accumulator data is missing."],
    next_steps: [{ label: "Retrieve accumulator evidence", type: "retrieve_evidence", requires_approval: false }],
    disclaimers: ["This is insurance navigation support, not medical advice."]
  });
  assert.equal(valid.valid, true, valid.issues.join("; "));
});
