import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  buildPhase72BillSourcedAnswerProof,
  composeBillVerificationFinalAnswer,
  validateBillSourcedAnswer
} from "../concierge/billSourcedAnswer.mjs";
import { analyzeBillVerificationInput } from "../concierge/billVerification.mjs";

test("phase 72 uses valid LLM-composed bill answer when every claim cites an allowed source", async () => {
  const analysis = analyzeBillVerificationInput({
    text: "Provider: South Clinic\nDate: 2026-06-04\nAmount due: $72.50\nPayer: Aetna\nClaim number: CLM-909090",
    sessionId: "phase72-valid"
  });
  const allowedId = `${analysis.sourcePointer.kind}/${analysis.sourcePointer.id}`;
  const result = await composeBillVerificationFinalAnswer({
    analysis,
    llmDraft: {
      answer: "South Clinic billed $72.50 and the note includes Aetna plus claim CLM-909090; compare it with an EOB or approved portal observation before deciding whether to pay.",
      claims: [
        { claim: "The bill note shows South Clinic as provider.", source_pointer_ids: [allowedId], confidence: 0.91, unsupported: false },
        { claim: "The amount extracted from the bill note is $72.50.", source_pointer_ids: [allowedId], confidence: 0.91, unsupported: false }
      ],
      uncertainties: ["The bill note alone does not prove current payer adjudication."],
      next_steps: [{ label: "Upload the EOB or approve read-only portal observation.", type: "retrieve_evidence", requires_approval: true }],
      disclaimers: ["This is insurance navigation support, not medical advice."]
    }
  });

  assert.equal(result.usedModelComposedText, true);
  assert.equal(result.mode, "validated_llm_sourced_composer");
  assert.equal(result.validation.valid, true);
  assert.match(result.finalResponse, /South Clinic/);
});

test("phase 72 rejects unsupported or non-allowed bill answer claims and falls back", async () => {
  const analysis = analyzeBillVerificationInput({
    text: "Provider: South Clinic\nDate: 2026-06-04\nAmount due: $72.50\nPayer: Aetna\nClaim number: CLM-909090",
    sessionId: "phase72-invalid"
  });
  const validation = validateBillSourcedAnswer(
    {
      answer: "The payer was contacted and confirmed the user owes nothing.",
      claims: [{ claim: "Payer confirmed zero balance.", source_pointer_ids: ["source/not-allowed"], confidence: 0.8, unsupported: false }],
      uncertainties: [],
      next_steps: [],
      disclaimers: []
    },
    [`${analysis.sourcePointer.kind}/${analysis.sourcePointer.id}`]
  );
  const result = await composeBillVerificationFinalAnswer({
    analysis,
    llmDraft: {
      answer: "The payer was contacted and confirmed the user owes nothing.",
      claims: [{ claim: "Payer confirmed zero balance.", source_pointer_ids: ["source/not-allowed"], confidence: 0.8, unsupported: false }],
      uncertainties: [],
      next_steps: [],
      disclaimers: []
    }
  });

  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.includes("source_pointer_not_allowed")));
  assert.ok(validation.issues.includes("external_action_claim_detected"));
  assert.equal(result.usedModelComposedText, false);
  assert.equal(result.mode, "deterministic_fallback");
  assert.match(result.finalResponse, /I can start the bill check/);
});

test("phase 72 proof and surfaces expose sourced bill answer", async () => {
  const proof = await buildPhase72BillSourcedAnswerProof();
  const server = await readFile(new URL("../server/server.mjs", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../app/app.js", import.meta.url), "utf8");
  const mvp = await readFile(new URL("../app/mvp.js", import.meta.url), "utf8");

  assert.equal(proof.ok, true);
  assert.equal(proof.score, 100);
  assert.equal(proof.checks.validModelComposedTextUsed, true);
  assert.equal(proof.checks.unknownSourceRejected, true);
  assert.equal(proof.checks.deterministicFallbackAvailable, true);
  assert.match(server, /phase72_bill_sourced_answer/);
  assert.match(server, /\/api\/bill-verification\/final-answer/);
  assert.match(dashboard, /Phase 72 Bill Sourced Answer/);
  assert.match(mvp, /latestBillAnswer/);
});
