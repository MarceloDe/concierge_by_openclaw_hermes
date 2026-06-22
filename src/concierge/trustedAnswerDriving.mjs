import { createHash } from "node:crypto";
import { maskDirectIdentifiers } from "./modelPayloadPolicy.mjs";
import { validateSourcedAnswer } from "./intelligence/reasoningValidators.mjs";
import { renderSourcedAnswer } from "./intelligence/sourcedAnswerComposer.mjs";
import { PEMS_TRUSTED_ANSWER_DRIVING_VERSION } from "./continuousIntelligence.mjs";

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function pointerId(pointer) {
  if (typeof pointer === "string") return pointer;
  if (pointer?.id && pointer?.table) return `${pointer.table}/${pointer.id}`;
  return pointer?.id ?? pointer?.sourcePointerId ?? null;
}

function safeText(value, state = {}) {
  return maskDirectIdentifiers(String(value ?? ""), state)
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[email]")
    .replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, "[identifier]")
    .replace(/\b\d{8,}\b/g, "[identifier]")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateDrivingAllowed(candidate = {}) {
  return (
    candidate.production_driving_allowed === 1 ||
    candidate.productionDrivingAllowed === true ||
    candidate.promotion_status === "trusted_answer_driving" ||
    candidate.promotionStatus === "trusted_answer_driving"
  );
}

export function buildGraphitiMemoryNamespaces({ userId, planId = "plan", scenarioKey = "general" } = {}) {
  const memberHash = stableHash({ userId: userId ?? "anonymous" }).slice(0, 16);
  return {
    semanticPlan: `semantic:plan:${safeText(planId) || "plan"}`,
    episodicMember: `episodic:member:${memberHash}`,
    proceduralSkills: "procedural:skills",
    collectivePatterns: "collective:patterns",
    safety: {
      episodicUserScoped: true,
      proceduralUserAgnostic: true,
      rawMemberIdStoredInProcedural: false,
      scenarioKey: safeText(scenarioKey) || "general"
    }
  };
}

export function assertProceduralSkillIsUserAgnostic(skill = {}) {
  const text = JSON.stringify(skill);
  const issues = [];
  if (/"?(userId|user_id|memberId|member_id|sessionId|session_id)"?\s*:/i.test(text)) issues.push("user_scoped_key_present");
  if (/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/.test(text)) issues.push("email_present");
  if (/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/.test(text)) issues.push("ssn_present");
  if (/member[_\s-]?(id|number)|subscriber[_\s-]?(id|number)/i.test(text)) issues.push("member_identifier_present");
  if (issues.length) {
    const error = new Error(`Procedural skill is not user-agnostic: ${issues.join(",")}`);
    error.issues = issues;
    throw error;
  }
  return {
    ok: true,
    issues: [],
    proceduralUserAgnostic: true
  };
}

export function buildTrustedAnswerDrivingScenario({
  candidate = {},
  sourcePointers = [],
  question = "",
  structuredFacts = [],
  userId = null,
  planId = "plan"
} = {}) {
  const allowedSourcePointerIds = sourcePointers.map(pointerId).filter(Boolean);
  const scenarioKey = candidate.selected_skill_key ?? candidate.selectedSkillKey ?? candidate.candidate_id ?? candidate.candidateId ?? "trusted_skill";
  const proceduralFragments = asArray(candidate.proceduralFragments ?? candidate.procedural_fragments ?? []).map((fragment, index) => ({
    cue: safeText(fragment.cue ?? fragment.tag ?? `fragment_${index}`),
    tag: safeText(fragment.tag ?? scenarioKey),
    content: safeText(fragment.content ?? fragment.summary ?? fragment)
  }));
  const namespaces = buildGraphitiMemoryNamespaces({ userId, planId, scenarioKey });
  return {
    version: PEMS_TRUSTED_ANSWER_DRIVING_VERSION,
    mode: "reconstruct_not_retrieve",
    candidateId: candidate.candidate_id ?? candidate.candidateId ?? null,
    selectedSkillKey: candidate.selected_skill_key ?? candidate.selectedSkillKey ?? null,
    questionHash: stableHash({ question }).slice(0, 16),
    allowedSourcePointerIds,
    structuredFacts: asArray(structuredFacts).map((fact) => ({
      label: safeText(fact.label ?? fact.key ?? "fact"),
      value: safeText(fact.value ?? fact.text ?? fact.summary ?? ""),
      sourcePointerIds: asArray(fact.sourcePointerIds ?? fact.source_pointer_ids).map(String).filter(Boolean)
    })),
    proceduralFragments,
    namespaces,
    safety: {
      rawQuestionStored: false,
      rawSourceStored: false,
      memoryAsAdvisoryOnlyUnlessTrusted: true,
      productionDrivingAllowed: candidateDrivingAllowed(candidate)
    }
  };
}

export function composeTrustedSkillDrivenAnswer({
  candidate = {},
  sourcePointers = [],
  question = "",
  structuredFacts = [],
  unverifiedItems = [],
  user = null,
  planId = "plan"
} = {}) {
  const stateForMasking = { context_packet: { user: user ?? {} } };
  const scenario = buildTrustedAnswerDrivingScenario({
    candidate,
    sourcePointers,
    question,
    structuredFacts,
    userId: user?.id ?? null,
    planId
  });
  const allowed = new Set(scenario.allowedSourcePointerIds);
  const verifiedFacts = scenario.structuredFacts.filter((fact) => fact.sourcePointerIds.some((id) => allowed.has(id)));
  const claims = verifiedFacts.map((fact) => ({
    claim: `${fact.label}: ${fact.value}`,
    source_pointer_ids: fact.sourcePointerIds.filter((id) => allowed.has(id)),
    confidence: 0.86,
    unsupported: false
  }));
  const unsupportedClaims = asArray(unverifiedItems).map((item) => ({
    claim: safeText(item, stateForMasking),
    source_pointer_ids: [],
    confidence: 0.2,
    unsupported: true
  }));
  const answer = verifiedFacts.length
    ? `Reviewer-approved skill ${scenario.selectedSkillKey ?? scenario.candidateId ?? "candidate"} can answer using ${verifiedFacts.length} cited fact${verifiedFacts.length === 1 ? "" : "s"}.`
    : "The trusted skill did not find enough cited facts to drive this answer.";
  const raw = {
    answer: safeText(answer, stateForMasking),
    claims: [...claims, ...unsupportedClaims],
    uncertainties: unsupportedClaims.length ? ["Some requested details remain unverified and were labeled unsupported."] : [],
    next_steps: [
      {
        label: unsupportedClaims.length ? "Retrieve missing source pointers before relying on unsupported details" : "Keep cited source pointers attached to the answer",
        type: unsupportedClaims.length ? "retrieve_evidence" : "ask_user",
        requires_approval: false
      }
    ],
    disclaimers: ["This is insurance navigation support, not medical advice."]
  };
  const validation = validateSourcedAnswer(raw);
  const sourceIssues = validation.value.claims.flatMap((claim, index) => {
    if (claim.unsupported) return [];
    const invalid = claim.source_pointer_ids.filter((id) => !allowed.has(id));
    return invalid.length ? [`claim_${index}_source_pointer_not_allowed`] : [];
  });
  const productionDrivingAllowed = candidateDrivingAllowed(candidate) && validation.valid && sourceIssues.length === 0;
  return {
    version: PEMS_TRUSTED_ANSWER_DRIVING_VERSION,
    mode: "trusted_answer_driving",
    status: productionDrivingAllowed ? "trusted_answer_driving_validated" : "trusted_answer_driving_blocked",
    scenario,
    answer: validation.value,
    finalResponse: productionDrivingAllowed ? renderSourcedAnswer(validation.value) : "",
    validation: {
      valid: validation.valid && sourceIssues.length === 0,
      issues: [...validation.issues, ...sourceIssues]
    },
    productionDrivingAllowed,
    safety: {
      reviewerApprovedTrustedPathRequired: true,
      citationRailsPassed: validation.valid && sourceIssues.length === 0,
      unsupportedItemsLabeled: unsupportedClaims.every((claim) => claim.unsupported),
      rawQuestionStored: false,
      rawSourceStored: false,
      medicalAdviceAllowed: false
    }
  };
}

export function buildResolvedCaseCandidateSeed({ caseState = {}, workerMemoryRecord = null } = {}) {
  return {
    version: PEMS_TRUSTED_ANSWER_DRIVING_VERSION,
    path: "resolved_case_plus_worker_procedural_memory",
    candidateOnly: true,
    productionDrivingAllowed: false,
    workflow: caseState.decision?.workflow ?? workerMemoryRecord?.workflow ?? null,
    selectedSkillKey: caseState.skill?.selected?.executionSkillKey ?? workerMemoryRecord?.selected_skill_key ?? null,
    sourcePointerIds: [
      ...asArray(caseState.evidence?.sourcePointerRefs).map((pointer) => pointer.id).filter(Boolean),
      ...asArray(workerMemoryRecord?.sourcePointerIds ?? workerMemoryRecord?.source_pointer_ids).filter(Boolean)
    ],
    safety: {
      writesCandidateOnly: true,
      rawEpisodeStored: false,
      proceduralUserAgnostic: true
    }
  };
}

export function buildNightlyResearchChangeCandidateSeed({ sourceRef = null, workflow = "general_research", topic = "" } = {}) {
  return {
    version: PEMS_TRUSTED_ANSWER_DRIVING_VERSION,
    path: "nightly_external_research_change_detector",
    candidateOnly: true,
    productionDrivingAllowed: false,
    workflow,
    topic: safeText(topic),
    sourceRef: sourceRef
      ? {
          id: sourceRef.id ?? null,
          hostHash: stableHash(sourceRef.host ?? sourceRef.url ?? sourceRef.id ?? "source").slice(0, 16)
        }
      : null,
    safety: {
      writesCandidateOnly: true,
      trustedRetrievalRequiredBeforeUse: true,
      rawExternalDocumentStored: false
    }
  };
}
