import { JOURNEY_TO_WORKFLOW } from "./reasoningSchemas.mjs";

export const JOURNEY_PLANNER_VERSION = "2026-06-15.journey-planner.v1";

export function planJourneyFromIntent(reasoning) {
  const primary = reasoning?.primary_intent;
  const candidate = reasoning?.candidate_journeys?.find((item) => item.journey === primary) ?? reasoning?.candidate_journeys?.[0] ?? null;
  return {
    version: JOURNEY_PLANNER_VERSION,
    journey: primary ?? candidate?.journey ?? "benefits_eligibility",
    workflow: JOURNEY_TO_WORKFLOW[primary] ?? JOURNEY_TO_WORKFLOW[candidate?.journey] ?? "eligibility_benefits_navigation",
    confidence: candidate?.confidence ?? 0,
    requiredEvidence: candidate?.required_evidence ?? [],
    missingEvidence: candidate?.missing_evidence ?? [],
    safeNextAction: candidate?.safe_next_action ?? "request_or_retrieve_evidence",
    requiresApproval: Boolean(candidate?.requires_approval),
    requiresHumanHandoff: Boolean(candidate?.requires_human_handoff),
    rationale: candidate?.rationale ?? "No journey rationale was provided."
  };
}

