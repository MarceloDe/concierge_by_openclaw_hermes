import { COMPLEXITIES, INTELLIGENCE_CONTRACT_VERSION, JOURNEY_LIST, SAFE_NEXT_ACTIONS } from "./reasoningSchemas.mjs";

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function numberBetweenZeroAndOne(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1;
}

export function parseJsonObject(value) {
  if (value && typeof value === "object") return value;
  const text = String(value ?? "").trim();
  if (!text) throw new Error("empty_json_response");
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) return JSON.parse(fenced);
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(text.slice(first, last + 1));
    throw new Error("json_object_not_found");
  }
}

export function validateStructuredIntentReasoning(raw) {
  const issues = [];
  const value = parseJsonObject(raw);
  const primaryIntent = String(value.primary_intent ?? "");
  if (!JOURNEY_LIST.includes(primaryIntent)) issues.push(`primary_intent_not_allowed:${primaryIntent || "missing"}`);
  const candidates = asArray(value.candidate_journeys);
  if (!candidates.length) issues.push("candidate_journeys_required");
  for (const [index, candidate] of candidates.entries()) {
    const journey = String(candidate?.journey ?? "");
    if (!JOURNEY_LIST.includes(journey)) issues.push(`candidate_${index}_journey_not_allowed:${journey || "missing"}`);
    if (!numberBetweenZeroAndOne(candidate?.confidence)) issues.push(`candidate_${index}_confidence_required`);
    if (!String(candidate?.rationale ?? "").trim()) issues.push(`candidate_${index}_rationale_required`);
    if (!SAFE_NEXT_ACTIONS.includes(candidate?.safe_next_action)) issues.push(`candidate_${index}_safe_next_action_not_allowed`);
    if (candidate?.unsafe_action_requested === true || value.unsafe_action_requested === true) {
      issues.push("unsafe_action_requested");
    }
  }
  if (!COMPLEXITIES.includes(value.complexity)) issues.push(`complexity_not_allowed:${value.complexity ?? "missing"}`);
  return {
    contractVersion: value.contractVersion ?? INTELLIGENCE_CONTRACT_VERSION,
    valid: issues.length === 0,
    issues,
    value: {
      contractVersion: value.contractVersion ?? INTELLIGENCE_CONTRACT_VERSION,
      primary_intent: primaryIntent,
      candidate_journeys: candidates.map((candidate) => ({
        journey: String(candidate.journey ?? ""),
        confidence: Math.max(0, Math.min(1, Number(candidate.confidence ?? 0))),
        rationale: String(candidate.rationale ?? ""),
        required_evidence: asArray(candidate.required_evidence).map(String),
        missing_evidence: asArray(candidate.missing_evidence).map(String),
        safe_next_action: String(candidate.safe_next_action ?? "request_or_retrieve_evidence"),
        requires_approval: Boolean(candidate.requires_approval),
        requires_human_handoff: Boolean(candidate.requires_human_handoff)
      })),
      complexity: value.complexity ?? "moderate",
      ambiguities: asArray(value.ambiguities).map(String),
      policy_flags: asArray(value.policy_flags).map(String),
      unsafe_action_requested: Boolean(value.unsafe_action_requested)
    }
  };
}

export function validateSourcedAnswer(raw) {
  const issues = [];
  const value = parseJsonObject(raw);
  if (!String(value.answer ?? "").trim()) issues.push("answer_required");
  const claims = asArray(value.claims);
  for (const [index, claim] of claims.entries()) {
    if (!String(claim?.claim ?? "").trim()) issues.push(`claim_${index}_text_required`);
    const sourceIds = asArray(claim?.source_pointer_ids).map(String).filter(Boolean);
    if (!claim?.unsupported && !sourceIds.length) issues.push(`claim_${index}_source_pointer_required`);
    if (!numberBetweenZeroAndOne(claim?.confidence)) issues.push(`claim_${index}_confidence_required`);
  }
  const answerText = String(value.answer ?? "");
  if (/\b(diagnose|diagnosis is|take \d+|dosage|treatment plan|you should start|stop taking)\b/i.test(answerText)) {
    issues.push("medical_advice_detected");
  }
  return {
    valid: issues.length === 0,
    issues,
    value: {
      answer: answerText,
      claims: claims.map((claim) => ({
        claim: String(claim.claim ?? ""),
        source_pointer_ids: asArray(claim.source_pointer_ids).map(String).filter(Boolean),
        confidence: Math.max(0, Math.min(1, Number(claim.confidence ?? 0))),
        unsupported: Boolean(claim.unsupported)
      })),
      uncertainties: asArray(value.uncertainties).map(String),
      next_steps: asArray(value.next_steps).map((step) => ({
        label: String(step?.label ?? ""),
        type: String(step?.type ?? "ask_user"),
        requires_approval: Boolean(step?.requires_approval)
      })),
      disclaimers: asArray(value.disclaimers).map(String)
    }
  };
}

