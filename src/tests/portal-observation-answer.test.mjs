import assert from "node:assert/strict";
import test from "node:test";

import {
  composePortalObservationFinalAnswer,
  validatePortalObservationAnswer
} from "../concierge/portalObservationAnswer.mjs";

const observation = {
  session_id: "session_remote_claims",
  status: "claims_observed_with_source_pointers",
  source_pointers: [
    {
      table: "portal_page_snapshots",
      id: "aetna-portal-claims:abc123",
      sourceUrl: "aetna-portal://member.aetna.com/claims",
      summary: "Read-only Aetna claims observation; 1 claim row detected.",
      evidenceFields: [
        { label: "Claim row", value: "Example Clinic | June 1, 2026 | share $12.34", confidence: "remote_cdp_structured_extraction" }
      ]
    }
  ],
  claim_rows: [
    {
      description: "Example Clinic",
      service_date: "June 1, 2026",
      share_amount: 12.34
    }
  ]
};

test("portal observation final answer uses validated sourced composition", async () => {
  const draft = {
    answer: "The Aetna portal shows one visible claim row for Example Clinic on June 1, 2026.",
    claims: [
      {
        claim: "The portal shows a claim row for Example Clinic on June 1, 2026.",
        source_pointer_ids: ["portal_page_snapshots/aetna-portal-claims:abc123"],
        confidence: 0.91,
        unsupported: false
      }
    ],
    uncertainties: ["Portal details can change and should be verified against the current page."],
    next_steps: [{ label: "Compare with the bill or EOB.", type: "retrieve_evidence", requires_approval: false }],
    disclaimers: ["This is insurance navigation support, not medical advice."]
  };
  const result = await composePortalObservationFinalAnswer({ observation, llmDraft: draft });
  assert.equal(result.usedModelComposedText, true);
  assert.equal(result.mode, "validated_llm_sourced_composer");
  assert.match(result.finalResponse, /Example Clinic/);
  assert.deepEqual(result.sourcePointerIds, ["portal_page_snapshots/aetna-portal-claims:abc123"]);
});

test("portal observation rejects uncited or external-action claims", () => {
  const invalid = {
    answer: "The payer was contacted and confirmed the claim is fully paid.",
    claims: [
      {
        claim: "The claim is fully paid.",
        source_pointer_ids: ["portal_page_snapshots/not-allowed"],
        confidence: 0.8,
        unsupported: false
      }
    ],
    uncertainties: [],
    next_steps: [],
    disclaimers: []
  };
  const validation = validatePortalObservationAnswer(invalid, observation.source_pointers);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.includes("source_pointer_not_allowed")));
  assert.ok(validation.issues.includes("external_action_claim_detected"));
});
