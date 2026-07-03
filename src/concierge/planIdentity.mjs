import { createId, nowIso } from "./database.mjs";
import { audit } from "./audit.mjs";
import { maskPlannerMetadata } from "./capabilityCatalog.mjs";
import { sha256Hex } from "./secretBackend.mjs";

// member_plan_identities owner (three-layer pivot, plan §5.1). Postgres is
// authoritative; Graphiti's InsurancePlan is a derived projection via
// graphiti_entity_ref, never a second source of truth. Only plan_name_masked /
// plan_type with metadata_phi_cleared=1 may reach the planner payload (through
// maskPlannerMetadata); details_json (raw PHI) is never planner-visible.
export const PLAN_IDENTITY_VERSION = "2026-07-02.plan-identity.v1";

const SOURCE_KINDS = new Set(["portal_extraction", "document", "user_provided"]);

const SOURCE_KIND_LAYER = {
  portal_extraction: "layer_3_portal_control",
  document: "layer_1_public",
  user_provided: null
};

// WRITE path: ingest a plan identity from a REAL extraction/document/user statement,
// anchored by source_pointer_id (logical join to eligibility_snapshots /
// extraction_artifacts). Upserts on UNIQUE(user_id, payer, member_id_hash).
export async function ingestPlanIdentity(store, {
  userId, portalAccountId = null, payer, memberId,
  planExternalId = null, planName = "", planType = null, groupNumber = null,
  coverageStartAt = null, coverageEndAt = null,
  sourceKind, sourcePointerId = null, details = {}, sessionId = null
} = {}) {
  if (!SOURCE_KINDS.has(String(sourceKind))) {
    return { ingested: false, reason: `source_kind_invalid:${sourceKind}` };
  }
  if (!userId || !payer || !memberId) {
    return { ingested: false, reason: "missing_identity_fields" };
  }
  const masked = maskPlannerMetadata({ shortDescription: String(planName ?? "") });
  const memberIdHash = sha256Hex(String(memberId));
  const verificationStatus = sourceKind === "portal_extraction" && sourcePointerId ? "portal_verified" : "unverified";
  const base = {
    user_id: userId,
    portal_account_id: portalAccountId,
    payer: String(payer),
    member_id_hash: memberIdHash,
    plan_external_id: planExternalId,
    plan_name_masked: masked.shortDescription,
    plan_type: planType,
    group_number_hash: groupNumber ? sha256Hex(String(groupNumber)) : null,
    coverage_start_at: coverageStartAt,
    coverage_end_at: coverageEndAt,
    source_kind: String(sourceKind),
    source_pointer_id: sourcePointerId,
    verification_status: verificationStatus,
    metadata_phi_cleared: masked.phiCleared ? 1 : 0,
    details_json: JSON.stringify(details ?? {}),
    updated_at: nowIso()
  };
  const existing = await store.get(
    "SELECT id FROM member_plan_identities WHERE user_id = ? AND payer = ? AND member_id_hash = ?;",
    [userId, base.payer, memberIdHash]
  );
  let id;
  if (existing) {
    id = existing.id;
    await store.update("member_plan_identities", base, { id });
  } else {
    id = createId("planid");
    await store.insert("member_plan_identities", { id, ...base, created_at: nowIso() });
  }
  await audit(store, sessionId, "plan_identity.ingested", {
    planIdentityId: id,
    payer: base.payer,
    sourceKind: base.source_kind,
    sourcePointerId,
    verificationStatus,
    phiCleared: base.metadata_phi_cleared === 1
  }, { layer: SOURCE_KIND_LAYER[sourceKind] ?? null });
  return { ingested: true, planIdentityId: id, verificationStatus, planNameMasked: base.plan_name_masked };
}

// READ path (planner-safe): masked, PHI-cleared, verified rows only — the projection
// that flips the planner's userDataSufficiency when a verified identity exists.
export async function loadPlannerPlanIdentities(store, { userId } = {}) {
  if (!store || !userId) return [];
  const rows = await store.all(
    `SELECT id, payer, plan_name_masked, plan_type, verification_status, coverage_start_at, coverage_end_at, source_pointer_id
     FROM member_plan_identities
     WHERE user_id = ? AND metadata_phi_cleared = 1
     ORDER BY (CASE verification_status WHEN 'portal_verified' THEN 0 WHEN 'unverified' THEN 1 ELSE 2 END), updated_at DESC
     LIMIT 4;`,
    [userId]
  );
  return rows.map((row) => ({
    planIdentityId: row.id,
    payer: row.payer,
    planNameMasked: row.plan_name_masked,
    planType: row.plan_type,
    verificationStatus: row.verification_status,
    coverageStartAt: row.coverage_start_at,
    coverageEndAt: row.coverage_end_at,
    sourcePointerId: row.source_pointer_id
  }));
}

export async function markPlanIdentityStale(store, { planIdentityId, sessionId = null } = {}) {
  const row = await store.findOne("member_plan_identities", { id: planIdentityId });
  if (!row) return { updated: false, reason: "plan_identity_missing" };
  await store.update("member_plan_identities", { verification_status: "stale", updated_at: nowIso() }, { id: planIdentityId });
  await audit(store, sessionId, "plan_identity.marked_stale", { planIdentityId }, { layer: null });
  return { updated: true };
}
