import { analyzeBillVerificationInput } from "./billVerification.mjs";
import { composeSourcedAnswerWithOpenAI, renderSourcedAnswer } from "./intelligence/sourcedAnswerComposer.mjs";
import { validateSourcedAnswer } from "./intelligence/reasoningValidators.mjs";

export const PHASE72_BILL_SOURCED_ANSWER_VERSION = "2026-06-22.phase72-bill-sourced-answer.v1";

function billPointerId(pointer = {}) {
  return `${pointer.table ?? pointer.kind ?? "source"}/${pointer.id ?? "unknown"}`;
}

function evidenceFieldsFromBillAnalysis(analysis = {}) {
  const detected = analysis.detected ?? {};
  return [
    ["Provider", detected.provider],
    ["Amount due", detected.amount ? `$${detected.amount}` : null],
    ["Bill or service date", detected.date],
    ["Insurance payer", detected.payer],
    ["Claim reference", detected.claim],
    ["Masked bill number", detected.billNumberMasked],
    ["CPT/HCPCS codes", detected.cpt?.length ? detected.cpt.join(", ") : null]
  ]
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([label, value]) => ({ label, value, confidence: "extracted_from_user_supplied_bill_ref" }));
}

function buildBillState(analysis = {}) {
  const pointer = analysis.sourcePointer ?? {};
  return {
    session_id: analysis.sessionId ?? null,
    user_input: "Help me verify this medical bill and explain what can be concluded from the cited evidence.",
    workflow: "bill_verification_flow",
    structured_intent: { reasoning: { primary_intent: "bill_verification" } },
    product_memory_recall: { facts: [] },
    source_pointers: [
      {
        table: pointer.kind ?? "bill_verification_user_supplied_note",
        id: pointer.id,
        sourceUrl: `bill-upload://${pointer.id ?? "unknown"}`,
        summary: analysis.userVisibleSummary,
        evidenceFields: evidenceFieldsFromBillAnalysis(analysis)
      }
    ].filter((item) => item.id)
  };
}

export function deterministicBillAnswer(analysis = {}) {
  const detected = analysis.detected ?? {};
  const missing = analysis.missingEvidence ?? [];
  const facts = [
    detected.provider ? `Provider: ${detected.provider}` : null,
    detected.amount ? `Amount shown: $${detected.amount}` : null,
    detected.date ? `Date shown: ${detected.date}` : null,
    detected.payer ? `Payer/plan hint: ${detected.payer}` : null,
    detected.claim ? `Claim reference: ${detected.claim}` : null
  ].filter(Boolean);
  return [
    facts.length
      ? `I can start the bill check from these extracted bill facts: ${facts.join("; ")}.`
      : "I can start the bill check, but the bill text did not expose enough structured fields yet.",
    missing.length
      ? `I still need: ${missing.join(", ")}.`
      : "The initial bill note has enough basic fields to compare against an EOB, plan document, or user-approved portal observation.",
    analysis.noLoginFallback?.message,
    "This is insurance navigation support, not medical advice. I did not contact the payer, submit a form, enter credentials, or change any account data."
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function validateBillSourcedAnswer(raw, allowedSourcePointerIds = []) {
  const validation = validateSourcedAnswer(raw);
  const allowed = new Set(allowedSourcePointerIds);
  const issues = [...validation.issues];
  for (const [index, claim] of (validation.value?.claims ?? []).entries()) {
    for (const sourceId of claim.source_pointer_ids ?? []) {
      if (!allowed.has(sourceId)) issues.push(`claim_${index}_source_pointer_not_allowed:${sourceId}`);
    }
    if (!claim.unsupported && !claim.source_pointer_ids?.some((sourceId) => allowed.has(sourceId))) {
      issues.push(`claim_${index}_allowed_source_pointer_required`);
    }
  }
  const answerText = validation.value?.answer ?? "";
  if (
    /\b(contacted|submitted|paid|appealed|called|messaged)\s+(the\s+)?(payer|provider|portal|insurance)\b/i.test(answerText) ||
    /\b(payer|provider|portal|insurance)\s+(was\s+)?(contacted|called|messaged|submitted|paid|appealed)\b/i.test(answerText)
  ) {
    issues.push("external_action_claim_detected");
  }
  return {
    ...validation,
    valid: issues.length === 0,
    issues
  };
}

export async function composeBillVerificationFinalAnswer({
  analysis = null,
  text = "",
  filename = "typed-bill-note.txt",
  userId = null,
  sessionId = null,
  payer = null,
  llmDraft = null,
  useLiveModel = false,
  store = null,
  user = null
} = {}) {
  const billAnalysis =
    analysis ??
    analyzeBillVerificationInput({
      text,
      filename,
      userId,
      sessionId,
      payer
    });
  const state = buildBillState(billAnalysis);
  const allowedSourcePointerIds = state.source_pointers.map(billPointerId);
  const deterministicAnswer = deterministicBillAnswer(billAnalysis);

  if (!allowedSourcePointerIds.length) {
    return {
      version: PHASE72_BILL_SOURCED_ANSWER_VERSION,
      status: "phase72_deterministic_fallback_no_source_pointer",
      ok: true,
      mode: "deterministic_fallback",
      usedModelComposedText: false,
      finalResponse: deterministicAnswer,
      analysis: billAnalysis,
      sourcePointerIds: allowedSourcePointerIds,
      validation: { valid: false, issues: ["source_pointer_required"] }
    };
  }

  if (llmDraft) {
    const validation = validateBillSourcedAnswer(llmDraft, allowedSourcePointerIds);
    return {
      version: PHASE72_BILL_SOURCED_ANSWER_VERSION,
      status: validation.valid ? "phase72_validated_llm_sourced_answer_used" : "phase72_deterministic_fallback_validator_rejected",
      ok: true,
      mode: validation.valid ? "validated_llm_sourced_composer" : "deterministic_fallback",
      usedModelComposedText: validation.valid,
      finalResponse: validation.valid ? renderSourcedAnswer(validation.value) : deterministicAnswer,
      answer: validation.valid ? validation.value : null,
      analysis: billAnalysis,
      sourcePointerIds: allowedSourcePointerIds,
      validation
    };
  }

  if (useLiveModel) {
    const live = await composeSourcedAnswerWithOpenAI({
      state,
      deterministicAnswer,
      store,
      sessionId: billAnalysis.sessionId,
      user
    });
    const validation = live.answer ? validateBillSourcedAnswer(live.answer, allowedSourcePointerIds) : { valid: false, issues: live.issues ?? ["live_answer_missing"] };
    return {
      version: PHASE72_BILL_SOURCED_ANSWER_VERSION,
      status: live.valid && validation.valid ? "phase72_live_llm_sourced_answer_used" : `phase72_deterministic_fallback_${live.mode}`,
      ok: true,
      mode: live.valid && validation.valid ? "live_llm_sourced_composer" : "deterministic_fallback",
      usedModelComposedText: Boolean(live.valid && validation.valid),
      finalResponse: live.valid && validation.valid ? live.finalResponse : deterministicAnswer,
      answer: live.valid && validation.valid ? live.answer : null,
      analysis: billAnalysis,
      sourcePointerIds: allowedSourcePointerIds,
      validation,
      live
    };
  }

  return {
    version: PHASE72_BILL_SOURCED_ANSWER_VERSION,
    status: "phase72_deterministic_fallback_live_model_not_requested",
    ok: true,
    mode: "deterministic_fallback",
    usedModelComposedText: false,
    finalResponse: deterministicAnswer,
    analysis: billAnalysis,
    sourcePointerIds: allowedSourcePointerIds,
    validation: { valid: false, issues: ["live_model_not_requested"] }
  };
}

export async function buildPhase72BillSourcedAnswerProof() {
  const analysis = analyzeBillVerificationInput({
    text: "Provider: Example Clinic\nDate: 2026-06-01\nAmount due: $184.22\nPayer: Aetna\nClaim number: CLM-123456",
    filename: "phase72-bill.txt",
    sessionId: "phase72"
  });
  const state = buildBillState(analysis);
  const allowedId = state.source_pointers.map(billPointerId)[0];
  const validDraft = {
    answer:
      "The bill appears to be from Example Clinic for $184.22, and it includes an Aetna payer hint plus claim CLM-123456. To verify whether you owe it, compare the bill with an EOB or approve read-only portal observation.",
    claims: [
      { claim: "The bill shows Example Clinic as the provider.", source_pointer_ids: [allowedId], confidence: 0.93, unsupported: false },
      { claim: "The extracted amount due is $184.22.", source_pointer_ids: [allowedId], confidence: 0.92, unsupported: false },
      { claim: "The bill includes claim reference CLM-123456.", source_pointer_ids: [allowedId], confidence: 0.9, unsupported: false }
    ],
    uncertainties: ["A bill alone does not prove current payer adjudication or final responsibility."],
    next_steps: [
      { label: "Upload the EOB or approve read-only portal observation for current claim status.", type: "retrieve_evidence", requires_approval: true }
    ],
    disclaimers: ["This is insurance navigation support, not medical advice."]
  };
  const invalidDraft = {
    answer: "The payer was contacted and confirmed you owe nothing.",
    claims: [{ claim: "The payer confirmed the balance.", source_pointer_ids: ["source/not-allowed"], confidence: 0.8, unsupported: false }],
    uncertainties: [],
    next_steps: [],
    disclaimers: []
  };
  const valid = await composeBillVerificationFinalAnswer({ analysis, llmDraft: validDraft });
  const invalid = await composeBillVerificationFinalAnswer({ analysis, llmDraft: invalidDraft });
  const fallback = await composeBillVerificationFinalAnswer({ analysis });
  const checks = {
    sourcePointersBuilt: valid.sourcePointerIds.length > 0,
    validModelComposedTextUsed: valid.usedModelComposedText === true && /Example Clinic/.test(valid.finalResponse),
    allowedSourceIdsRequired: valid.answer.claims.every((claim) => claim.source_pointer_ids.includes(allowedId)),
    unsupportedExternalActionRejected: invalid.usedModelComposedText === false && invalid.validation.issues.includes("external_action_claim_detected"),
    unknownSourceRejected: invalid.validation.issues.some((issue) => issue.includes("source_pointer_not_allowed")),
    deterministicFallbackAvailable: fallback.mode === "deterministic_fallback" && fallback.finalResponse.includes("I can start the bill check"),
    noMedicalAdvice: !/diagnose|treatment plan|dosage/i.test(valid.finalResponse),
    citationsVisible: valid.sourcePointerIds.includes(allowedId)
  };
  const passed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  return {
    version: PHASE72_BILL_SOURCED_ANSWER_VERSION,
    status: passed === total ? "phase72_bill_sourced_answer_ready" : "phase72_bill_sourced_answer_attention",
    ok: passed === total,
    score: Math.round((passed / total) * 100),
    target: 100,
    checks,
    endpoint: "/api/bill-verification/final-answer",
    pwaSurface: "/mvp",
    sourcePointerIds: valid.sourcePointerIds,
    valid,
    invalid,
    fallback
  };
}
