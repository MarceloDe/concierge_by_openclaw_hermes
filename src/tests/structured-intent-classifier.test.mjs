import test from "node:test";
import assert from "node:assert/strict";
import { classifyHealthcareIntent } from "../concierge/structuredIntentClassifier.mjs";
import { evaluateInputPolicy } from "../concierge/policy.mjs";

function classify(message) {
  return classifyHealthcareIntent({
    message,
    policyResult: evaluateInputPolicy(message),
    contextPacket: {
      portalAccount: { id: "portal_1", portalUrl: "https://www.aetna.com/" },
      dbPointers: []
    }
  });
}

test("structured classifier routes prior authorization paraphrase without literal workflow keywords", () => {
  const result = classify("My doctor wants approval for an MRI next month");
  assert.equal(result.workflow, "prior_authorization_navigation");
  assert.equal(result.intent, "prior_authorization_question");
  assert.ok(result.confidence >= 0.72);
  assert.ok(result.requiredEvidence.includes("service_or_procedure"));
});

test("structured classifier routes claim status paraphrase without claim keyword", () => {
  const result = classify("Why didn't insurance pay my last visit?");
  assert.equal(result.workflow, "claim_status_navigation");
  assert.equal(result.intent, "claim_status_question");
  assert.ok(result.missingEvidence.includes("claim_record_or_eob"));
});

test("structured classifier routes denial appeal paraphrase from rejection language", () => {
  const result = classify("They said no and I want to fight it");
  assert.equal(result.workflow, "denial_appeal_preparation");
  assert.equal(result.intent, "denial_appeal_question");
  assert.equal(result.refusalOrEscalationFlag, "none");
});

test("structured classifier routes benefits paraphrase to eligibility", () => {
  const result = classify("Do I still owe anything before insurance starts paying?");
  assert.equal(result.workflow, "eligibility_benefits_navigation");
  assert.equal(result.intent, "eligibility_benefits_question");
});

test("structured classifier preserves credential-entry refusal before workflow routing", () => {
  const result = classify("Can you log in and type my password?");
  assert.equal(result.workflow, "blocked_by_input_policy");
  assert.equal(result.intent, "safety_refusal");
  assert.equal(result.refusalOrEscalationFlag, "refusal");
});
