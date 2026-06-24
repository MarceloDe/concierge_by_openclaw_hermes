import { composeSourcedAnswerWithOpenAI, renderSourcedAnswer } from "./intelligence/sourcedAnswerComposer.mjs";
import { validateSourcedAnswer } from "./intelligence/reasoningValidators.mjs";

export const REMOTE_PORTAL_OBSERVATION_ANSWER_VERSION = "2026-06-22.remote-portal-observation-answer.v1";

function pointerId(pointer = {}) {
  return pointer.id ? `${pointer.table ?? pointer.kind ?? "source"}/${pointer.id}` : null;
}

function allowedIds(sourcePointers = []) {
  return sourcePointers.map(pointerId).filter(Boolean);
}

function deterministicPortalAnswer({ observation = {} } = {}) {
  const claims = observation.claim_rows ?? observation.claimRows ?? [];
  const pointerCount = allowedIds(observation.source_pointers ?? observation.sourcePointers ?? []).length;
  if (!claims.length) {
    return [
      "I could not extract claim rows from the current Aetna page yet.",
      observation.status === "human_login_required"
        ? "Please take over the remote browser, complete login or captcha yourself, then return control so I can continue read-only observation."
        : "You can navigate to the claims page in the live browser or upload an EOB/bill so I can compare evidence.",
      "This is insurance navigation support, not medical advice. I did not enter credentials, submit forms, contact the payer, or change account data."
    ].join("\n\n");
  }
  const preview = claims.slice(0, 4).map((claim) => {
    const share = claim.share_amount !== null && claim.share_amount !== undefined ? `$${claim.share_amount}` : "share not shown";
    return `${claim.description ?? "Claim"} on ${claim.service_date ?? "date not shown"} (${share})`;
  });
  return [
    `I found ${claims.length} claim row(s) in the user-authenticated Aetna portal and built ${pointerCount} source pointer(s).`,
    `Visible claim preview: ${preview.join("; ")}.`,
    "Use the cited portal source pointer to verify current status before relying on payment or balance details.",
    "This is insurance navigation support, not medical advice. I did not enter credentials, submit forms, contact the payer, or change account data."
  ].join("\n\n");
}

function buildState({ observation = {}, userMessage = "" } = {}) {
  const sourcePointers = observation.source_pointers ?? observation.sourcePointers ?? [];
  const claimRows = observation.claim_rows ?? observation.claimRows ?? [];
  return {
    session_id: observation.session_id ?? observation.sessionId ?? null,
    user_input: userMessage || "Summarize the read-only Aetna claims observation with citations.",
    workflow: "claim_status_navigation",
    structured_intent: { reasoning: { primary_intent: "claim_status_navigation" } },
    product_memory_recall: { facts: [] },
    source_pointers: sourcePointers.map((pointer) => ({
      table: pointer.table ?? "portal_page_snapshots",
      id: pointer.id,
      sourceUrl: pointer.sourceUrl,
      summary: pointer.summary,
      evidenceFields: pointer.evidenceFields ?? claimRows.slice(0, 8).map((claim) => ({
        label: "Claim row",
        value: `${claim.description ?? "Claim"} | ${claim.service_date ?? "date not shown"} | share ${claim.share_amount ?? "not shown"}`,
        confidence: "remote_cdp_structured_extraction"
      }))
    }))
  };
}

export function validatePortalObservationAnswer(raw, sourcePointers = []) {
  const validation = validateSourcedAnswer(raw);
  const allowed = new Set(allowedIds(sourcePointers));
  const issues = [...validation.issues];
  for (const [index, claim] of (validation.value?.claims ?? []).entries()) {
    for (const sourceId of claim.source_pointer_ids ?? []) {
      if (!allowed.has(sourceId)) issues.push(`claim_${index}_source_pointer_not_allowed:${sourceId}`);
    }
    if (!claim.unsupported && !claim.source_pointer_ids?.some((sourceId) => allowed.has(sourceId))) {
      issues.push(`claim_${index}_allowed_source_pointer_required`);
    }
  }
  if (
    /\b(contacted|submitted|paid|appealed|called|messaged)\b.{0,80}\b(payer|provider|portal|insurance)\b/i.test(validation.value?.answer ?? "") ||
    /\b(payer|provider|portal|insurance)\b.{0,80}\b(contacted|submitted|paid|appealed|called|messaged)\b/i.test(validation.value?.answer ?? "")
  ) {
    issues.push("external_action_claim_detected");
  }
  return { ...validation, valid: issues.length === 0, issues };
}

export async function composePortalObservationFinalAnswer({
  observation = {},
  userMessage = "",
  llmDraft = null,
  useLiveModel = false,
  store = null,
  user = null
} = {}) {
  const sourcePointers = observation.source_pointers ?? observation.sourcePointers ?? [];
  const sourcePointerIds = allowedIds(sourcePointers);
  const deterministicAnswer = deterministicPortalAnswer({ observation });
  if (!sourcePointerIds.length) {
    return {
      version: REMOTE_PORTAL_OBSERVATION_ANSWER_VERSION,
      status: "remote_portal_deterministic_fallback_no_source_pointer",
      ok: true,
      mode: "deterministic_fallback",
      usedModelComposedText: false,
      finalResponse: deterministicAnswer,
      sourcePointerIds,
      validation: { valid: false, issues: ["source_pointer_required"] }
    };
  }
  if (llmDraft) {
    const validation = validatePortalObservationAnswer(llmDraft, sourcePointers);
    return {
      version: REMOTE_PORTAL_OBSERVATION_ANSWER_VERSION,
      status: validation.valid ? "remote_portal_validated_llm_sourced_answer_used" : "remote_portal_deterministic_fallback_validator_rejected",
      ok: true,
      mode: validation.valid ? "validated_llm_sourced_composer" : "deterministic_fallback",
      usedModelComposedText: validation.valid,
      finalResponse: validation.valid ? renderSourcedAnswer(validation.value) : deterministicAnswer,
      answer: validation.valid ? validation.value : null,
      sourcePointerIds,
      validation
    };
  }
  if (useLiveModel) {
    const live = await composeSourcedAnswerWithOpenAI({
      state: buildState({ observation, userMessage }),
      deterministicAnswer,
      store,
      sessionId: observation.session_id ?? observation.sessionId,
      user
    });
    const validation = live.answer ? validatePortalObservationAnswer(live.answer, sourcePointers) : { valid: false, issues: live.issues ?? ["live_answer_missing"] };
    return {
      version: REMOTE_PORTAL_OBSERVATION_ANSWER_VERSION,
      status: live.valid && validation.valid ? "remote_portal_live_llm_sourced_answer_used" : `remote_portal_deterministic_fallback_${live.mode}`,
      ok: true,
      mode: live.valid && validation.valid ? "live_llm_sourced_composer" : "deterministic_fallback",
      usedModelComposedText: Boolean(live.valid && validation.valid),
      finalResponse: live.valid && validation.valid ? live.finalResponse : deterministicAnswer,
      answer: live.valid && validation.valid ? live.answer : null,
      sourcePointerIds,
      validation,
      live
    };
  }
  return {
    version: REMOTE_PORTAL_OBSERVATION_ANSWER_VERSION,
    status: "remote_portal_deterministic_fallback_live_model_not_requested",
    ok: true,
    mode: "deterministic_fallback",
    usedModelComposedText: false,
    finalResponse: deterministicAnswer,
    sourcePointerIds,
    validation: { valid: false, issues: ["live_model_not_requested"] }
  };
}
