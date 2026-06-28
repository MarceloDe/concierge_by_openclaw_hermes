import { nowIso, createId } from "./database.mjs";
import { redact_text, stableHash } from "../observability/redaction.mjs";
import { createRuntimeContextCache } from "./runtimeContextCache.mjs";
import { audit } from "./audit.mjs";

export const CATALOG_PORTFOLIO_MIRROR_VERSION = "2026-06-27.catalog-portfolio-mirror.v1";

// Distinct key from the legacy per-turn portfolio (brainsty:capability-portfolio:*)
// so the DB-sourced catalog mirror does not collide during the transition.
export function catalogPortfolioKey(sessionId) {
  return `brainsty:capability-catalog:${sessionId}`;
}

// Build the planner-facing manifest FROM POSTGRES (authoritative): metadata-only rows
// (the planner half: when/why/short_description + pointer + score) and pointer entries.
// The HOW is never included here — it is fetched via hydrateCapabilityPointer.
export async function buildSessionPortfolioFromPostgres(store, sessionId) {
  const cacheKey = catalogPortfolioKey(sessionId);
  const caps = await store.all(
    "SELECT capability_key, kind, short_description, when_to_use, why_use, best_used_for, planner_score FROM capabilities WHERE status='active' AND lifecycle_state='production' ORDER BY planner_score DESC, capability_key ASC;"
  );
  const procs = await store.all(
    "SELECT process_key, title, short_description, when_to_use, why_use, best_used_for, planner_score, approval_scope FROM processes WHERE status='active' AND lifecycle_state='production' AND offerable=1 ORDER BY display_order ASC, planner_score DESC;"
  );
  const promptTable = [
    ...procs.map((p) => ({ portfolioId: p.process_key, kind: "process", title: p.title, whenToUse: p.when_to_use, whyUse: p.why_use, shortDescription: p.short_description, approvalScope: p.approval_scope, pointer: `${cacheKey}#${p.process_key}`, score: p.planner_score })),
    ...caps.map((c) => ({ portfolioId: c.capability_key, kind: c.kind, title: c.short_description || c.capability_key, whenToUse: c.when_to_use, whyUse: c.why_use, shortDescription: c.short_description, pointer: `${cacheKey}#${c.capability_key}`, score: c.planner_score }))
  ];
  const entries = Object.fromEntries(promptTable.map((row) => [row.portfolioId, { portfolioId: row.portfolioId, kind: row.kind, pointer: row.pointer }]));
  return { version: CATALOG_PORTFOLIO_MIRROR_VERSION, cacheKey, sessionId, promptTable, entries, capabilityCount: caps.length, processCount: procs.length };
}

// WRITE half (Postgres-before-Redis): read authoritative PG, then mirror to cache.
export async function mirrorCapabilityPortfolioToRedis(store, { sessionId, ttlSeconds = 1800 } = {}) {
  const manifest = await buildSessionPortfolioFromPostgres(store, sessionId);
  const cache = createRuntimeContextCache();
  let stored = false;
  let storeError = null;
  try {
    await cache.adapter.set(manifest.cacheKey, manifest, { ttlSeconds });
    stored = true;
  } catch (error) {
    storeError = error.message;
  }
  return { backend: cache.backend, cacheKey: manifest.cacheKey, stored, storeError, count: manifest.promptTable.length };
}

// READ half: cache.hit fast path; on miss rebuild from authoritative Postgres + re-mirror.
export async function loadSessionPortfolio(store, { sessionId } = {}) {
  const cache = createRuntimeContextCache();
  const cacheKey = catalogPortfolioKey(sessionId);
  let cached = null;
  try {
    cached = await cache.adapter.get(cacheKey);
  } catch {
    cached = null;
  }
  if (cached) {
    return { backend: cache.backend, cacheKey, cacheHit: true, traceEvent: "cache.hit", manifest: cached };
  }
  const manifest = await buildSessionPortfolioFromPostgres(store, sessionId);
  try {
    await cache.adapter.set(cacheKey, manifest, { ttlSeconds: 1800 });
  } catch {
    /* visible degrade: backend reported on the result */
  }
  return { backend: cache.backend, cacheKey, cacheHit: false, traceEvent: "cache.miss", rebuiltFromPostgres: true, manifest };
}

// PHI masking gate for planner-facing capability metadata. Any text derived from
// Graphiti/PEMS consolidation MUST pass through this before it can populate the
// planner-facing columns (short_description/when_to_use/why_use/best_used_for),
// because those columns are injected straight into the planner prompt. It reuses the
// shared redaction patterns and adds extra identifier scrubbing (MRN / long digit
// runs). phiCleared is true only when no identifier survives the scrub.
const EXTRA_ID_PATTERNS = [
  [/\b(?:mrn|medical record(?:\s*(?:no|number|#))?)\s*[:#-]?\s*[A-Z0-9-]{4,}\b/gi, "[REDACTED_MRN]"],
  [/\b\d{6,}\b/g, "[REDACTED_ID]"]
];
const RESIDUAL_PHI = [
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b\d{6,}\b/,
  /\b(?:member|subscriber|policy|claim|patient|mrn)\s*(?:id|number|no|#)\s*[:#-]?\s*[A-Z0-9-]{4,}\b/i
];

function scrubPlannerText(value) {
  let text = redact_text(String(value ?? ""));
  for (const [pattern, replacement] of EXTRA_ID_PATTERNS) text = text.replace(pattern, replacement);
  return text.replace(/\s+/g, " ").trim();
}

function hasResidualPhi(text) {
  return RESIDUAL_PHI.some((p) => p.test(String(text ?? "")));
}

// Pure transform. Returns masked planner columns + a hash/preview of the raw and a
// phiCleared verdict. Names in free text are NOT auto-detected — PEMS episodes are
// already source-pointered/structured (buildSafeProductMemoryEpisode); this is the
// second-layer identifier gate before metadata reaches the prompt.
export function maskPlannerMetadata({ shortDescription = "", whenToUse = "", whyUse = "", bestUsedFor = "", sourcePointerIds = [] } = {}) {
  const rawJoined = [shortDescription, whenToUse, whyUse, bestUsedFor].join(" | ");
  const masked = {
    shortDescription: scrubPlannerText(shortDescription),
    whenToUse: scrubPlannerText(whenToUse),
    whyUse: scrubPlannerText(whyUse),
    bestUsedFor: scrubPlannerText(bestUsedFor)
  };
  const maskedJoined = Object.values(masked).join(" | ");
  const containedPhi = hasResidualPhi(rawJoined) || maskedJoined !== [shortDescription, whenToUse, whyUse, bestUsedFor].map((v) => String(v ?? "").replace(/\s+/g, " ").trim()).join(" | ");
  const phiCleared = !hasResidualPhi(maskedJoined);
  return {
    ...masked,
    rationaleHash: stableHash(rawJoined, "capmeta"),
    rationalePreview: maskedJoined.length > 180 ? `${maskedJoined.slice(0, 177)}...` : maskedJoined,
    containedPhi,
    phiCleared,
    sourcePointerIds
  };
}

// Guard for the ingest path: refuse to let unmasked PHI reach planner columns.
export function assertPlannerMetadataSafe(text) {
  if (hasResidualPhi(text)) {
    throw new Error("planner_metadata_unmasked_phi_detected");
  }
  return true;
}

// Hydrate half of the pointer contract: dereference a capability pointer back to its
// executable HOW, but only after verification. Backing tables
// (workflow_definitions/openclaw_skills/tool_registry) WIN: a capability row marked
// active still refuses to hydrate if its backing row is disabled. Authoritative store
// is Postgres/SQLite; this never trusts the prompt-side pointer blindly.
export const CAPABILITY_CATALOG_HYDRATE_VERSION = "2026-06-27.capability-hydrate.v1";

// pointer = "<cacheKey>#<capability_key>" or a bare "<capability_key>".
export function parseCapabilityPointer(pointer) {
  const raw = String(pointer ?? "").trim();
  if (!raw) return null;
  return raw.includes("#") ? raw.slice(raw.indexOf("#") + 1) : raw;
}

function backingEnabled(kind, row) {
  if (!row) return { enabled: false, reason: "backing_row_missing" };
  if (kind === "tool") {
    const s = String(row.integration_status ?? "");
    const ok = /enabled|ready|available|active/i.test(s) && !/disabled|deprecated|retired|deferred/i.test(s);
    return { enabled: ok, reason: ok ? null : `backing_tool_${s || "unknown"}` };
  }
  // workflow / skill use `status`
  const s = String(row.status ?? "");
  const ok = Boolean(s) && !/disabled|deprecated|retired|quarantined|revoked/i.test(s);
  return { enabled: ok, reason: ok ? null : `backing_${kind}_${s || "unknown"}` };
}

function refusal(capabilityKey, reason, extra = {}) {
  return { resolved: false, capabilityKey, reason, traceEvent: "verify_fail", ...extra };
}

export async function hydrateCapabilityPointer(store, { pointer, requestRoute = null, expectedHowConfigHash = null } = {}) {
  const capabilityKey = parseCapabilityPointer(pointer);
  if (!capabilityKey) return refusal(null, "pointer_empty");

  const cap = await store.findOne("capabilities", { capability_key: capabilityKey });
  if (!cap) return refusal(capabilityKey, "capability_not_found");

  // 1. Lifecycle/quarantine policy (the catalog's own gate).
  if (cap.status !== "active") return refusal(capabilityKey, `capability_${cap.status}`);
  if (cap.lifecycle_state !== "production") return refusal(capabilityKey, "capability_not_production");

  // 2. Backing-table precedence (backing row WINS over the catalog row).
  let backing = null;
  if (cap.kind === "workflow" && cap.workflow_key) {
    backing = await store.findOne("workflow_definitions", { workflow_key: cap.workflow_key });
    const b = backingEnabled("workflow", backing);
    if (!b.enabled) return refusal(capabilityKey, b.reason);
  } else if (cap.kind === "skill" && cap.skill_key) {
    backing = await store.findOne("openclaw_skills", { skill_key: cap.skill_key });
    const b = backingEnabled("skill", backing);
    if (!b.enabled) return refusal(capabilityKey, b.reason);
  } else if (cap.kind === "tool" && cap.tool_key) {
    backing = await store.findOne("tool_registry", { tool_key: cap.tool_key });
    const b = backingEnabled("tool", backing);
    if (!b.enabled) return refusal(capabilityKey, b.reason);
  }

  // 3. Freshness: if a config hash is tracked and an expected hash is supplied, they must match.
  if (expectedHowConfigHash && cap.how_config_hash && expectedHowConfigHash !== cap.how_config_hash) {
    return refusal(capabilityKey, "stale_how_config");
  }

  // 4. Route-fit (advisory; recorded, not refused, in this step).
  const routeFit = !requestRoute || cap.kind !== "workflow" || !cap.workflow_key || cap.workflow_key === requestRoute;

  // 5. Success: bump deref counters (proves the pointer is read, not write-only).
  await store.update(
    "capabilities",
    { last_hydrated_at: nowIso(), hydrate_count: (cap.hydrate_count ?? 0) + 1 },
    { id: cap.id }
  );

  return {
    resolved: true,
    capabilityKey,
    kind: cap.kind,
    traceEvent: "hydrate",
    routeFit,
    backing: backing
      ? { table: cap.kind === "tool" ? "tool_registry" : cap.kind === "skill" ? "openclaw_skills" : "workflow_definitions", status: backing.status ?? backing.integration_status }
      : null,
    hydrate: {
      capabilityKey,
      kind: cap.kind,
      title: backing?.title ?? cap.capability_key,
      workflowKey: cap.workflow_key ?? null,
      skillKey: cap.skill_key ?? null,
      toolKey: cap.tool_key ?? null,
      graphSubpath: cap.graph_subpath_json ? JSON.parse(cap.graph_subpath_json) : null,
      howConfig: cap.how_config_json ? JSON.parse(cap.how_config_json) : {},
      approvalScope: backing?.approval_required ?? null,
      riskLevel: backing?.risk_level ?? null
    }
  };
}

// ---------------------------------------------------------------------------
// Step 6: provenance read-back loop. A demote/quarantine writes a hash-chained
// provenance row AND flips capabilities.status so the production select excludes it,
// AND evicts the Redis mirror -> closing write->read-back->affects-planner.
// ---------------------------------------------------------------------------

async function latestProvenanceHash(store, capabilityId) {
  const row = await store.get(
    "SELECT event_hash FROM capability_provenance WHERE capability_id = ? AND event_hash IS NOT NULL ORDER BY rowid DESC LIMIT 1;",
    [capabilityId]
  );
  return row?.event_hash ?? null;
}

// Single write path for catalog mutations: append-only provenance row (hash-chained)
// + a hash-chained audit_events entry. Rationale is PHI-masked (preview + hash only).
export async function recordCapabilityProvenance(store, {
  capabilityId = null, processId = null, event_type, source_kind = null,
  fromStatus = null, toStatus = null, pemsCandidateId = null, generatedSkillQueueId = null,
  graphitiEpisodeRef = null, sessionCheckpointId = null, reviewerUserId = null,
  rationale = "", sourcePointerIds = [], metadata = {}, sessionId = null
} = {}) {
  const previous_event_hash = capabilityId ? await latestProvenanceHash(store, capabilityId) : null;
  const created_at = nowIso();
  const rationalePreview = redact_text(String(rationale ?? "")).replace(/\s+/g, " ").trim().slice(0, 180);
  const id = createId("capprov");
  const event_hash = stableHash(
    JSON.stringify({ id, capabilityId, processId, event_type, fromStatus, toStatus, previous_event_hash, created_at }),
    "capprov"
  );
  await store.insert("capability_provenance", {
    id,
    capability_id: capabilityId,
    process_id: processId,
    event_type,
    source_kind: source_kind,
    from_status: fromStatus,
    to_status: toStatus,
    pems_candidate_id: pemsCandidateId,
    generated_skill_queue_id: generatedSkillQueueId,
    graphiti_episode_ref: graphitiEpisodeRef,
    session_checkpoint_id: sessionCheckpointId,
    reviewer_user_id: reviewerUserId,
    rationale_preview: rationalePreview,
    rationale_hash: stableHash(String(rationale ?? ""), "caprat"),
    source_pointer_ids_json: JSON.stringify(sourcePointerIds ?? []),
    metadata_json: JSON.stringify(metadata ?? {}),
    previous_event_hash,
    event_hash,
    created_at
  });
  // Hash-chained operator audit trail (separate chain, verifiable via verifyAuditChain).
  await audit(store, sessionId, `capability_provenance_${event_type}`, {
    capabilityId, processId, event_type, fromStatus, toStatus, source_kind, rationalePreview
  });
  return { revisionId: id, eventHash: event_hash };
}

async function evictSessions(cache, sessionIds = []) {
  let evicted = 0;
  for (const sessionId of sessionIds) {
    try {
      evicted += (await cache.adapter.del(catalogPortfolioKey(sessionId))) ? 1 : 0;
    } catch {
      /* best-effort eviction */
    }
  }
  return evicted;
}

async function transitionCapabilityStatus(store, { capabilityId, eventType, toStatus, toLifecycle, reason, safetyClass = null, sourceKind, sessionIds = [], reviewerUserId = null }) {
  const cap = await store.findOne("capabilities", { id: capabilityId });
  if (!cap) return { ok: false, reason: "capability_not_found" };
  await store.update("capabilities", { status: toStatus, lifecycle_state: toLifecycle, updated_at: nowIso() }, { id: capabilityId });
  const prov = await recordCapabilityProvenance(store, {
    capabilityId, event_type: eventType, source_kind: sourceKind,
    fromStatus: cap.status, toStatus, reviewerUserId,
    rationale: reason, metadata: safetyClass ? { safetyClass } : {}
  });
  const cache = createRuntimeContextCache();
  const evicted = await evictSessions(cache, sessionIds);
  return { ok: true, capabilityKey: cap.capability_key, fromStatus: cap.status, toStatus, provenanceId: prov.revisionId, redisEvicted: evicted };
}

export function quarantineCapability(store, { capabilityId, reason = "safety_incident", safetyClass = null, sessionIds = [], reviewerUserId = null } = {}) {
  return transitionCapabilityStatus(store, { capabilityId, eventType: "quarantined", toStatus: "quarantined", toLifecycle: "shadow", reason, safetyClass, sourceKind: "safety", sessionIds, reviewerUserId });
}

export function demoteCapability(store, { capabilityId, reason = "demoted", sessionIds = [], reviewerUserId = null } = {}) {
  return transitionCapabilityStatus(store, { capabilityId, eventType: "demoted", toStatus: "demoted", toLifecycle: "shadow", reason, sourceKind: "review", sessionIds, reviewerUserId });
}

// Project PEMS maturity (the authority) onto the planner-facing lifecycle. This is the
// read-back writer that makes a PEMS demotion actually filter out of the planner select.
export async function syncCapabilityLifecycleFromPems(store, { capabilityId, candidateId, sessionIds = [] } = {}) {
  const cap = await store.findOne("capabilities", { id: capabilityId });
  if (!cap) return { ok: false, reason: "capability_not_found" };
  const maturity = await store.findOne("pems_candidate_maturity", { candidate_id: candidateId });
  if (!maturity) return { ok: false, reason: "maturity_not_found" };
  const status = String(maturity.promotion_status ?? "");
  let toStatus = cap.status;
  let toLifecycle = cap.lifecycle_state;
  if (/demot|quarantin|reject|revok/i.test(status)) {
    toStatus = "quarantined";
    toLifecycle = "shadow";
  } else if (maturity.production_driving_allowed === 1 || /production|promoted|trusted/i.test(status)) {
    toStatus = "active";
    toLifecycle = "production";
  } else {
    toStatus = "active";
    toLifecycle = "supervised_advisory";
  }
  await store.update("capabilities", { status: toStatus, lifecycle_state: toLifecycle, updated_at: nowIso() }, { id: capabilityId });
  await recordCapabilityProvenance(store, {
    capabilityId, event_type: "lifecycle_sync", source_kind: "pems",
    fromStatus: cap.status, toStatus, pemsCandidateId: candidateId,
    rationale: `pems promotion_status=${status} production_driving_allowed=${maturity.production_driving_allowed}`
  });
  const cache = createRuntimeContextCache();
  const evicted = await evictSessions(cache, sessionIds);
  return { ok: true, capabilityKey: cap.capability_key, toStatus, toLifecycle, redisEvicted: evicted };
}

// ---------------------------------------------------------------------------
// Step 10: continuous-learning feed. PEMS-matured + reviewer-approved candidate ->
// ingest into the authoritative catalog -> appears in the planner select; a later
// PEMS demotion is projected back out (write -> read-back -> affects planner).
// ---------------------------------------------------------------------------

// READ-only gate (no writes). pems_candidate_maturity is the maturity authority.
export async function evaluateCapabilityPromotionGate(store, { candidateId, skillReviewQueueId = null } = {}) {
  const maturity = await store.findOne("pems_candidate_maturity", { candidate_id: candidateId });
  const review = skillReviewQueueId ? await store.findOne("generated_skill_review_queue", { id: skillReviewQueueId }) : null;
  const reviewApproved = !skillReviewQueueId || /approved|merged|accepted/i.test(String(review?.review_decision ?? review?.status ?? ""));
  const matureForProduction = Boolean(maturity) && (maturity.production_driving_allowed === 1 || /production|promoted|trusted/i.test(String(maturity.promotion_status ?? "")));
  const passed = matureForProduction && reviewApproved && !(/demot|quarantin|reject|revok/i.test(String(maturity?.promotion_status ?? "")));
  return {
    passed,
    lifecycleEligible: passed ? "production" : maturity ? "supervised_advisory" : "rejected",
    maturity: maturity ? { promotionStatus: maturity.promotion_status, productionDrivingAllowed: maturity.production_driving_allowed, trusted: maturity.trusted } : null,
    review: review ? { reviewDecision: review.review_decision, status: review.status } : null,
    reasons: [matureForProduction ? "mature" : "not_mature", reviewApproved ? "review_ok" : "review_not_approved"]
  };
}

// Ingest a matured capability into the authoritative catalog (PHI-masked metadata +
// HOW behind how_config_json), then record provenance and project PEMS lifecycle.
export async function ingestMaturedCapability(store, {
  candidateId, skillReviewQueueId = null, capabilityKey, kind = "workflow", backingKey = null,
  rawMetadata = {}, hydratePayload = {}, sourcePointerIds = [], graphitiEpisodeRef = null, reviewerUserId = null
} = {}) {
  const gate = await evaluateCapabilityPromotionGate(store, { candidateId, skillReviewQueueId });
  if (!gate.passed) return { ingested: false, gate };

  const masked = maskPlannerMetadata(rawMetadata);
  assertPlannerMetadataSafe([masked.shortDescription, masked.whenToUse, masked.whyUse, masked.bestUsedFor].join(" "));

  const capabilityId = `cap:${capabilityKey}`;
  const howConfigJson = JSON.stringify(hydratePayload ?? {});
  const baseRow = {
    capability_key: capabilityKey,
    kind,
    status: "active",
    lifecycle_state: "production",
    short_description: masked.shortDescription,
    when_to_use: masked.whenToUse,
    why_use: masked.whyUse,
    best_used_for: masked.bestUsedFor,
    planner_score: rawMetadata.plannerScore ?? 15,
    rationale_hash: masked.rationaleHash,
    rationale_preview: masked.rationalePreview,
    metadata_phi_cleared: masked.phiCleared ? 1 : 0,
    how_kind_ref: backingKey ? (kind === "skill" ? "openclaw_skills" : kind === "tool" ? "tool_registry" : "workflow_definitions") : "self",
    workflow_key: backingKey && kind === "workflow" ? backingKey : null,
    skill_key: backingKey && kind === "skill" ? backingKey : null,
    tool_key: backingKey && kind === "tool" ? backingKey : null,
    how_config_json: howConfigJson,
    how_config_hash: stableHash(howConfigJson, "howcfg")
  };
  const existing = await store.findOne("capabilities", { capability_key: capabilityKey });
  if (existing) {
    await store.update("capabilities", { ...baseRow, updated_at: nowIso() }, { id: existing.id });
  } else {
    await store.insert("capabilities", { id: capabilityId, ...baseRow, created_at: nowIso(), updated_at: nowIso() });
  }

  await recordCapabilityProvenance(store, {
    capabilityId, event_type: existing ? "promoted" : "created", source_kind: "pems",
    fromStatus: existing?.status ?? null, toStatus: "active",
    pemsCandidateId: candidateId, generatedSkillQueueId: skillReviewQueueId, graphitiEpisodeRef,
    reviewerUserId, rationale: rawMetadata.rationale ?? "matured capability ingested", sourcePointerIds
  });
  // Project the PEMS authority onto lifecycle (idempotent + future-proof).
  await syncCapabilityLifecycleFromPems(store, { capabilityId, candidateId });

  return { ingested: true, capabilityId, lifecycleState: gate.lifecycleEligible, gate };
}

// Thin orchestrator: given a matured candidate, ingest it and (best-effort) mirror.
export async function feedCapabilityFromPemsEpisode(store, { candidateId, skillReviewQueueId = null, capabilityKey, kind = "workflow", backingKey = null, rawMetadata = {}, hydratePayload = {}, sourcePointerIds = [], graphitiEpisodeRef = null, sessionId = null } = {}) {
  const result = await ingestMaturedCapability(store, { candidateId, skillReviewQueueId, capabilityKey, kind, backingKey, rawMetadata, hydratePayload, sourcePointerIds, graphitiEpisodeRef });
  if (result.ingested && sessionId) {
    try { await mirrorCapabilityPortfolioToRedis(store, { sessionId }); } catch { /* mirror is best-effort */ }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Type-II Phase C: accept an offered process -> hydrate its graph subpath + worker
// skill, validate scope (byte-for-byte vs the safety policy), and dispatch the
// read-only observation idempotently through the Steps 7-9 ledger/resume machinery.
// ---------------------------------------------------------------------------

const SAFE_APPROVAL_SCOPES = new Set(["read_only_observation", "read_only", "login_takeover", "local", "none"]);

// Read the authoritative process HOW (steps + worker skill + graph subpath).
export async function hydrateProcess(store, processKey) {
  const proc = await store.findOne("processes", { process_key: processKey });
  if (!proc) return { ok: false, reason: "process_not_found" };
  if (proc.status !== "active" || proc.lifecycle_state !== "production") return { ok: false, reason: `process_${proc.status}` };
  const steps = await store.all("SELECT step_key, checkpoint_boundary, capability_id, requires_idempotency_key, step_order FROM process_steps WHERE process_id = ? ORDER BY step_order;", [proc.id]);
  let workerSkillKey = null;
  if (proc.worker_skill_capability_id) {
    const cap = await store.findOne("capabilities", { id: proc.worker_skill_capability_id });
    workerSkillKey = cap?.skill_key ?? null;
  }
  return {
    ok: true,
    process: { id: proc.id, processKey, title: proc.title },
    approvalScope: proc.approval_scope,
    graphSubpath: proc.graph_subpath_json ? JSON.parse(proc.graph_subpath_json) : [],
    requiredUserInputs: proc.required_user_inputs_json ? JSON.parse(proc.required_user_inputs_json) : [],
    workerSkillKey,
    steps
  };
}

const COVERAGE_NUMBER_RE = /\$\s?\d|\b\d+(?:\.\d+)?\s?(?:usd|dollars)\b/i;

// Deterministic guard AFTER the LLM: offered processes must exist + be read-only-safe,
// no credential-entry step, and any coverage number must be source-pointer-backed.
export async function validateCapabilityAnswer(store, { offeredProcessIds = [], answer = "", sourcePointers = [] } = {}) {
  const issues = [];
  for (const processKey of offeredProcessIds) {
    const h = await hydrateProcess(store, processKey);
    if (!h.ok) { issues.push(`offered_process_invalid:${processKey}:${h.reason}`); continue; }
    if (!SAFE_APPROVAL_SCOPES.has(h.approvalScope)) issues.push(`scope_inflation:${processKey}:${h.approvalScope}`);
    if (h.steps.some((s) => /credential|password|2fa|passkey|login_submit/i.test(s.step_key))) issues.push(`credential_step_forbidden:${processKey}`);
  }
  if (COVERAGE_NUMBER_RE.test(String(answer)) && !(sourcePointers.length > 0)) {
    issues.push("coverage_number_without_source_pointer");
  }
  return { valid: issues.length === 0, issues };
}

// Accept an offered process: hydrate, enforce safe scope, dispatch the read-only worker
// once (idempotent -> no second portal session), and record the ledger boundary.
export async function acceptProcessOffer(store, { sessionId, processKey, workflowRunId, sessionCheckpointId = null }, dispatchFn) {
  const h = await hydrateProcess(store, processKey);
  if (!h.ok) return { accepted: false, reason: h.reason };
  if (!SAFE_APPROVAL_SCOPES.has(h.approvalScope)) return { accepted: false, reason: `scope_inflation:${h.approvalScope}` };

  const { computeDispatchIdempotencyKey, workerPlanSignature, dispatchOnce } = await import("./dispatchIdempotency.mjs");
  const idempotencyKey = computeDispatchIdempotencyKey({
    runId: workflowRunId,
    beforeWorkerCheckpointId: sessionCheckpointId ?? "",
    workerPlanSignature: workerPlanSignature([processKey, h.workerSkillKey])
  });
  const dispatch = await dispatchOnce(
    store,
    { workflowRunId, idempotencyKey, sessionCheckpointId },
    dispatchFn ?? (async () => ({ resultPointer: `observe:${processKey}` }))
  );
  return {
    accepted: true,
    processKey,
    approvalScope: h.approvalScope,
    workerSkillKey: h.workerSkillKey,
    graphSubpath: h.graphSubpath,
    requiredUserInputs: h.requiredUserInputs,
    dispatch
  };
}

// go-live 2/3: execute an accepted process by dispatching the REAL OpenClaw read-only
// observation (no mock). The live portal capture requires the user's takeover login +
// a live browser session; without one the observation returns a status. Dispatch is
// idempotent via acceptProcessOffer (no second portal session).
export async function executeAcceptedProcess(store, { user, session, processKey, workflowRunId, sessionCheckpointId = null } = {}) {
  const { runOfficialOpenClawReadOnlyObservation } = await import("./openclawOfficialRuntime.mjs");
  return acceptProcessOffer(
    store,
    { sessionId: session?.id, processKey, workflowRunId, sessionCheckpointId },
    async () => {
      const observation = await runOfficialOpenClawReadOnlyObservation({
        store,
        user,
        session,
        approval: { status: "user_approved_read_only", graphTraceId: session?.langgraph_thread_id ?? null }
      });
      return { resultPointer: `openclaw_observation:${processKey}`, observation };
    }
  );
}
