import { nowIso } from "./database.mjs";

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
