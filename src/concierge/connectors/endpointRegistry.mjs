// Phase 89 shared connector substrate (docs/THREE_LAYER_PLANNER_IMPLEMENTATION_PLAN.md §9, §5.2):
// owner of the connector_endpoints table. Readiness is a PROBED STORED FACT — last_probe_status
// on the connector_status_values enum — never an env switch. The planner feasibility filter
// consumes connectorFeasibility() output, which only ever reads what a real probe stored.

import { createId, nowIso } from "../database.mjs";
import { createFhirClient } from "./fhirClient.mjs";

// Adopted enum (plan §5.2 founder #8): one vocabulary, no local variants.
export const CONNECTOR_STATUS_VALUES = Object.freeze([
  "connected",
  "expired",
  "reauth_required",
  "revoked",
  "unsupported",
  "error"
]);

function requireKeys({ payerKey, connectorKind }) {
  if (!payerKey || !connectorKind) {
    throw new Error("connector_endpoints operations require payerKey and connectorKind");
  }
}

export async function upsertConnectorEndpoint(store, { payerKey, connectorKind, baseUrl, authMode = "none", quirks = {} }) {
  requireKeys({ payerKey, connectorKind });
  if (!baseUrl) throw new Error("upsertConnectorEndpoint requires baseUrl");
  const now = nowIso();
  const existing = await store.findOne("connector_endpoints", { payer_key: payerKey, connector_kind: connectorKind });
  if (existing) {
    await store.update(
      "connector_endpoints",
      { base_url: baseUrl, auth_mode: authMode, quirks_json: JSON.stringify(quirks ?? {}), updated_at: now },
      { id: existing.id }
    );
    return store.findOne("connector_endpoints", { id: existing.id });
  }
  const row = {
    id: createId("endpoint"),
    payer_key: payerKey,
    connector_kind: connectorKind,
    base_url: baseUrl,
    auth_mode: authMode,
    quirks_json: JSON.stringify(quirks ?? {}),
    readiness_label: "unprobed",
    last_probe_at: null,
    last_probe_status: null,
    created_at: now,
    updated_at: now
  };
  await store.insert("connector_endpoints", row);
  return row;
}

export async function listConnectorEndpoints(store, { connectorKind = null, payerKey = null } = {}) {
  const where = {};
  if (connectorKind !== null) where.connector_kind = connectorKind;
  if (payerKey !== null) where.payer_key = payerKey;
  return store.list("connector_endpoints", where);
}

// Live GET {base_url}/metadata. On 2xx: last_probe_status "connected" + readiness_label
// "probed_ok". On failure: last_probe_status "error" — classified and STORED, not thrown.
// A failed probe is a stored fact the planner can read, never an exception in its face.
export async function probeConnectorEndpoint(store, { payerKey, connectorKind }) {
  requireKeys({ payerKey, connectorKind });
  const endpoint = await store.findOne("connector_endpoints", { payer_key: payerKey, connector_kind: connectorKind });
  if (!endpoint) {
    // Probing a nonexistent registration is a caller bug, not a probe result — fail loud.
    throw new Error(`No connector_endpoints row for payerKey=${payerKey} connectorKind=${connectorKind}`);
  }
  const probedAt = nowIso();
  try {
    const client = createFhirClient({ baseUrl: endpoint.base_url, timeoutMs: 20000 });
    const capability = await client.capabilityStatement();
    const capabilityFhirVersion = capability?.fhirVersion ?? null;
    await store.update(
      "connector_endpoints",
      { last_probe_at: probedAt, last_probe_status: "connected", readiness_label: "probed_ok", updated_at: probedAt },
      { id: endpoint.id }
    );
    return { probed: true, status: "connected", httpStatus: 200, capabilityFhirVersion };
  } catch (error) {
    await store.update(
      "connector_endpoints",
      { last_probe_at: probedAt, last_probe_status: "error", readiness_label: "probe_failed", updated_at: probedAt },
      { id: endpoint.id }
    );
    const result = { probed: true, status: "error", failureClass: error?.failureClass ?? "fhir_request_failed" };
    if (typeof error?.httpStatus === "number") result.httpStatus = error.httpStatus;
    return result;
  }
}

// The DATA the planner feasibility filter consumes: reads the stored probe fact only.
export async function connectorFeasibility(store, { payerKey, connectorKind }) {
  requireKeys({ payerKey, connectorKind });
  const endpoint = await store.findOne("connector_endpoints", { payer_key: payerKey, connector_kind: connectorKind });
  if (!endpoint) {
    return { feasible: false, readinessLabel: "missing_endpoint", lastProbeAt: null };
  }
  return {
    feasible: endpoint.last_probe_status === "connected",
    readinessLabel: endpoint.readiness_label,
    lastProbeAt: endpoint.last_probe_at
  };
}
