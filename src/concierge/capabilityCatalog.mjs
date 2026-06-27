import { nowIso } from "./database.mjs";
import { redact_text, stableHash } from "../observability/redaction.mjs";
import { createRuntimeContextCache } from "./runtimeContextCache.mjs";

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
