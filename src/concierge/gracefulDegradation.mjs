import { maskDirectIdentifiers } from "./modelPayloadPolicy.mjs";
import { createTieredChatModel, selectModelForStep } from "./modelTierPolicy.mjs";
import { recordOutboundPayloadObservation } from "./outboundPayloadObservability.mjs";
import { renderSourcedAnswer } from "./intelligence/sourcedAnswerComposer.mjs";
import { validateSourcedAnswer } from "./intelligence/reasoningValidators.mjs";

export const GRACEFUL_DEGRADATION_VERSION = "2026-06-22.phase54-graceful-degradation.v1";

export const SANDBOX_PRIVACY_COPY =
  "Your data is not stored -- it runs in an isolated sandbox and is erased after use; you complete login/2FA yourself in the remote browser, and it is never stored.";

function compact(value, limit = 500) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [String(value)].filter(Boolean);
}

function missingEvidenceFromState(state, missingEvidence = []) {
  return [
    ...asArray(missingEvidence),
    ...asArray(state.evidence_observation?.missingEvidence),
    ...asArray(state.structured_intent?.missingEvidence),
    ...asArray(state.structured_intent?.reasoning?.candidate_journeys?.[0]?.missing_evidence),
    ...asArray(state.llm_orchestration_decision?.missingEvidence)
  ].filter(Boolean);
}

function reasonLabel(state, reason) {
  return (
    reason ??
    state.evidence_observation?.reason ??
    state.evidence_observation?.status ??
    state.route_reason ??
    "missing_or_untrusted_evidence"
  );
}

function buildFallbackAnswer(state, { reason, missingEvidence = [] } = {}) {
  const resolvedReason = reasonLabel(state, reason);
  const missing = [...new Set(missingEvidenceFromState(state, missingEvidence))].slice(0, 6);
  const workflow = state.workflow ?? "insurance_navigation";
  const unverified = missing.length
    ? missing
    : [
        "current plan-specific evidence",
        "reviewed source pointers",
        "authenticated portal or uploaded document evidence"
      ];
  const answer = [
    `I can still help with ${workflow}, but I do not have enough trusted evidence to make plan-specific factual claims yet.`,
    `What I can say safely: the next useful step is to verify the missing evidence before relying on coverage, cost, claim, provider, pharmacy, or document details.`,
    `Unverified: ${unverified.join("; ")}.`
  ].join("\n\n");
  return {
    answer,
    claims: [
      {
        claim: `Evidence is insufficient for a plan-specific ${workflow} answer.`,
        source_pointer_ids: [],
        confidence: 0.72,
        unsupported: true
      }
    ],
    uncertainties: unverified,
    next_steps: [
      { label: "Verify the missing evidence yourself", type: "ask_user", requires_approval: false },
      { label: "Approve a read-only observation if the portal or document is ready", type: "prepare_approval", requires_approval: true },
      { label: "Provide more plan, claim, provider, pharmacy, or document details", type: "ask_user", requires_approval: false }
    ],
    disclaimers: [
      "This is insurance navigation support, not medical advice.",
      "Unverified items are not plan guarantees."
    ],
    mode: "deterministic_graceful_degradation_fallback",
    reason: resolvedReason
  };
}

export function buildGracefulDegradationMessages(state, { reason, missingEvidence = [] } = {}) {
  const missing = [...new Set(missingEvidenceFromState(state, missingEvidence))].slice(0, 10);
  const payload = {
    contractVersion: GRACEFUL_DEGRADATION_VERSION,
    task:
      "Write a concise best-effort healthcare insurance navigation answer when trusted evidence is missing. Do not refuse for missing evidence. Mark every plan-specific factual claim as unsupported unless an allowed source pointer is cited.",
    safe_user_question: maskDirectIdentifiers(state.user_input, state),
    selected_workflow: state.workflow,
    selected_journey: state.structured_intent?.primary_intent ?? state.structured_intent?.reasoning?.primary_intent ?? null,
    reason: reasonLabel(state, reason),
    missing_evidence: missing,
    route_reason: state.route_reason ?? null,
    evidence_status: state.evidence_observation?.status ?? "not_requested",
    available_source_pointer_ids: (state.source_pointers ?? []).map((pointer) => `${pointer.table ?? pointer.kind ?? "source"}/${pointer.id ?? pointer.rowId ?? "unknown"}`),
    advisory_memory_facts: (state.product_memory_recall?.facts ?? []).slice(0, 5).map((fact) => compact(fact.fact ?? fact.name ?? fact.uuid, 240)),
    required_behavior: [
      "Answer with practical insurance-navigation guidance.",
      "Do not claim coverage, cost, network, pharmacy, claim, authorization, or document facts unless cited.",
      "Put missing or uncited facts in uncertainties and mark corresponding claims unsupported.",
      "Offer verify-myself, let-concierge-check with approval, and provide-more-info next steps when applicable.",
      "Do not provide medical advice, external messaging, payer contact, form submission, credential entry, or account changes."
    ],
    output_schema: {
      answer: "string",
      claims: [{ claim: "string", source_pointer_ids: [], confidence: "0..1", unsupported: true }],
      uncertainties: ["string"],
      next_steps: [{ label: "string", type: "ask_user|retrieve_evidence|prepare_approval|human_handoff", requires_approval: false }],
      disclaimers: ["string"]
    }
  };
  return [
    {
      role: "system",
      content: [
        "You are the graceful degradation answer composer inside Brainstyworkers LangGraph.",
        "Return strict JSON only.",
        "Missing evidence is not a safety refusal. Give best-effort guidance, but label unsupported or unverified facts clearly.",
        "Every confident factual insurance claim must cite an allowed source pointer id. If there is no source pointer, mark the claim unsupported.",
        "Do not provide medical advice or claim any external/write action happened."
      ].join("\n")
    },
    { role: "user", content: JSON.stringify(payload) }
  ];
}

export async function composeBestEffortAnswer(state, { reason, missingEvidence = [], store = null, sessionId = null, user = null } = {}) {
  const fallback = buildFallbackAnswer(state, { reason, missingEvidence });
  const selection = selectModelForStep("graceful_degradation", { tier: "reasoner" });
  if (state.raw_message?.useLiveModel === false) {
    const validation = validateSourcedAnswer(fallback);
    return {
      mode: "deterministic_graceful_degradation_fallback",
      modelTier: selection,
      valid: validation.valid,
      issues: validation.issues,
      answer: validation.value,
      finalResponse: renderSourcedAnswer(validation.value),
      unverified: validation.value.uncertainties,
      reason: fallback.reason
    };
  }
  if (!process.env.OPENAI_API_KEY) {
    const validation = validateSourcedAnswer(fallback);
    return {
      mode: "skipped_missing_openai_api_key",
      modelTier: selection,
      valid: validation.valid,
      issues: validation.issues,
      answer: validation.value,
      finalResponse: renderSourcedAnswer(validation.value),
      unverified: validation.value.uncertainties,
      reason: fallback.reason
    };
  }
  const messages = buildGracefulDegradationMessages(state, { reason, missingEvidence });
  const observation = store
    ? await recordOutboundPayloadObservation(store, {
        sessionId,
        payload: { model: selection.model, baseURL: selection.baseURL, messages },
        payloadType: "openai_graceful_degradation_messages",
        destination: "openai",
        policyMode: "phi_allowed_identifier_masked_reasoning",
        user,
        requireSourcePointers: false
      })
    : null;
  try {
    const { llm } = createTieredChatModel("graceful_degradation", {
      tier: "reasoner",
      timeout: 60000,
      maxRetries: 1
    });
    const response = await llm.invoke(messages);
    const validation = validateSourcedAnswer(response.content);
    if (!validation.valid) {
      const fallbackValidation = validateSourcedAnswer(fallback);
      return {
        mode: "openai_graceful_degradation_rejected",
        modelTier: selection,
        valid: fallbackValidation.valid,
        issues: validation.issues,
        answer: fallbackValidation.value,
        finalResponse: renderSourcedAnswer(fallbackValidation.value),
        response: response.content,
        unverified: fallbackValidation.value.uncertainties,
        reason: fallback.reason,
        outboundPayloadObservation: observation
          ? {
              payloadHash: observation.payloadHash,
              containsDirectIdentifier: observation.containsDirectIdentifier,
              containsPortalText: observation.containsPortalText,
              enforcementMode: observation.enforcementMode
            }
          : null
      };
    }
    return {
      mode: "openai_graceful_degradation_invoked",
      modelTier: selection,
      valid: true,
      issues: [],
      answer: validation.value,
      finalResponse: renderSourcedAnswer(validation.value),
      response: response.content,
      unverified: validation.value.uncertainties,
      reason: reasonLabel(state, reason),
      outboundPayloadObservation: observation
        ? {
            payloadHash: observation.payloadHash,
            containsDirectIdentifier: observation.containsDirectIdentifier,
            containsPortalText: observation.containsPortalText,
            enforcementMode: observation.enforcementMode
          }
        : null
    };
  } catch (error) {
    const validation = validateSourcedAnswer(fallback);
    return {
      mode: "openai_graceful_degradation_failed",
      modelTier: selection,
      valid: validation.valid,
      issues: [error.message],
      answer: validation.value,
      finalResponse: renderSourcedAnswer(validation.value),
      unverified: validation.value.uncertainties,
      reason: fallback.reason
    };
  }
}

export function proposeBasicClarification(state = {}) {
  const missing = [...new Set(missingEvidenceFromState(state))].slice(0, 2);
  const questionByEvidence = (item) => {
    const text = String(item).replaceAll("_", " ");
    if (/provider|facility|network/.test(text)) return "Which provider or facility should I verify?";
    if (/claim|eob|payment|bill/.test(text)) return "Which claim, EOB, bill, or visit date should I focus on?";
    if (/pharmacy|formulary|medication|drug/.test(text)) return "Which medication or pharmacy benefit should I check?";
    if (/authorization|procedure|service/.test(text)) return "Which service, procedure, or authorization are you asking about?";
    if (/document|source/.test(text)) return "Can you upload or point me to the relevant document?";
    return `Can you clarify the missing detail: ${text}?`;
  };
  const questions = missing.length
    ? missing.map(questionByEvidence)
    : ["Which insurance question should I help with first?", "Do you want to verify this from a plan document, portal, or reviewed source?"];
  return {
    status: state.route_reason === "low_confidence_clarify" ? "clarification_suggested" : "not_required",
    questions: questions.slice(0, 2),
    terminal: false
  };
}
