// Phase 84: the deterministic structured-intent reasoner, curated classifier, and
// journey planner are DELETED (plan §10.3-.5) — the planner decision is the single
// classification authority. What survives here is the sourced-answer validator
// contract (layer-agnostic claim/source safety, plan §8.6).
import test from "node:test";
import assert from "node:assert/strict";
import { validateSourcedAnswer } from "../concierge/intelligence/reasoningValidators.mjs";

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
