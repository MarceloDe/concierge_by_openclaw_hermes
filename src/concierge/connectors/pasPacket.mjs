import { createId, nowIso } from "../database.mjs";
import { audit } from "../audit.mjs";
import { searchResearchEvidence } from "../researchOps.mjs";
import { loadPlannerPlanIdentities } from "../planIdentity.mjs";

// PA packet preparation — Part 1 (Phase 89, plan §9/§7 mcp_document_generation row).
// PREPARE-ONLY: assembles a prior-authorization support packet from STORED, CITED
// evidence (crawled payer-policy artifacts + the masked plan identity) into an
// agent_tasks row phrased "prepared for review/submission". Part 2 (Da Vinci PAS
// Claim/$submit) is Phase 92 signature-gated — nothing here submits anything, ever.
export const PAS_PACKET_VERSION = "2026-07-03.pas-packet-part1.v1";

export async function buildPaPacketPreparation(store, {
  userId,
  sessionId,
  workflow = "prior_authorization_navigation",
  procedureText,
  limit = 3
} = {}) {
  if (!store || !userId || !procedureText) {
    const error = new Error("PA packet preparation requires store, userId, and the procedure question.");
    error.failureClass = "pa_packet_missing_inputs";
    throw error;
  }
  // 1. CITED policy evidence only — the same trusted search the runner uses; no
  //    trusted artifact means an HONEST empty packet skeleton, never invented criteria.
  const evidence = await searchResearchEvidence(store, { query: procedureText, includePending: false, limit });
  const policyPointers = (evidence.results ?? []).map((result) => ({
    table: "research_artifacts",
    id: result.artifactId ?? result.id,
    title: result.title ?? result.sourceUrl ?? "policy artifact",
    sourceUrl: result.sourceUrl ?? null,
    contentHash: result.contentHash ?? null
  }));
  // 2. Masked plan identity (PHI-cleared planner surface — never raw member ids).
  const planIdentities = await loadPlannerPlanIdentities(store, { userId });

  const packet = {
    version: PAS_PACKET_VERSION,
    status: "prepared_for_review",
    disposition: "This packet was PREPARED for your review — nothing has been submitted, and submission stays gated behind the signature-gated write track.",
    procedureText: String(procedureText).slice(0, 300),
    planIdentity: planIdentities[0] ?? null,
    policyEvidence: policyPointers,
    checklist: [
      "Confirm the payer's documented criteria against the cited policy artifacts.",
      "Gather the conservative-treatment records the policy names.",
      "Obtain the ordering clinician's medical-necessity statement.",
      "Review this packet with your provider's office — they submit prior authorizations today."
    ],
    preparedAt: nowIso()
  };

  const taskId = createId("task");
  await store.insert("agent_tasks", {
    id: taskId,
    user_id: userId,
    session_id: sessionId ?? null,
    workflow_key: workflow,
    task_type: "pa_packet_preparation",
    status: "prepared_for_review",
    priority: "normal",
    description: `Prior-authorization support packet prepared for review: ${packet.procedureText}`,
    metadata_json: JSON.stringify(packet),
    created_at: nowIso(),
    updated_at: nowIso()
  });
  await audit(store, sessionId ?? null, "pa_packet.prepared_for_review", {
    taskId,
    userId,
    workflow,
    policyEvidenceCount: policyPointers.length,
    hasPlanIdentity: Boolean(packet.planIdentity)
  }, { layer: "layer_1_public" });
  return { taskId, packet, evidenceStatus: evidence.status ?? null };
}
