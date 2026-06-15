import { createHash } from "node:crypto";
import { audit } from "./audit.mjs";

export const OUTBOUND_PAYLOAD_OBSERVABILITY_VERSION = "2026-05-27.outbound-payload-observability.v1";
export const OUTBOUND_PAYLOAD_POLICY_VERSION = "2026-05-27.outbound-payload-policy.v1";

function safeStringify(value) {
  return JSON.stringify(value ?? null);
}

function inspectKeys(value, predicate) {
  if (Array.isArray(value)) return value.some((item) => inspectKeys(item, predicate));
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, entry]) => predicate(key, entry) || inspectKeys(entry, predicate));
  }
  return false;
}

function directIdentifierPatterns(user = {}) {
  const patterns = [
    /\b\d{3}-\d{2}-\d{4}\b/,
    /\b(member|subscriber|subscription)\s*(id|number|#|no\.?)?\s*(?:[:#=-]\s*)?(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{4,}\b/i
  ];
  if (user.name) patterns.push(new RegExp(String(user.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  if (user.email) patterns.push(new RegExp(String(user.email).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  return patterns;
}

export function classifyOutboundPayload(payload, { user = {}, payloadType, destination, policyMode = "observe_only" } = {}) {
  const serializedPayload = safeStringify(payload);
  const containsDirectIdentifier = directIdentifierPatterns(user).some((pattern) => pattern.test(serializedPayload));
  const containsSourcePointers =
    inspectKeys(payload, (key) => ["sourcePointers", "source_pointers", "allowed_source_pointers", "dbPointers", "db_pointers"].includes(key)) ||
    /\b(sourcePointers|source_pointers|allowed_source_pointers|dbPointers|db_pointers)\b/.test(serializedPayload) ||
    /\b(eligibility_snapshots|coverage_balances|claim_items|prior_authorizations|extraction_artifacts|memory_items)\/[A-Za-z0-9_-]+/.test(serializedPayload);
  const containsPortalText = inspectKeys(payload, (key, value) => {
    const normalized = key.toLowerCase();
    if (["raw_text", "rawtext", "visible_text", "visibletext", "portaltext", "pagetext"].includes(normalized)) return Boolean(value);
    if (["browserSnapshot", "portalPageSnapshots"].includes(key)) return true;
    return false;
  });
  return {
    version: OUTBOUND_PAYLOAD_OBSERVABILITY_VERSION,
    policyVersion: OUTBOUND_PAYLOAD_POLICY_VERSION,
    payloadType,
    destination,
    policyMode,
    containsPortalText,
    containsDirectIdentifier,
    containsSourcePointers,
    allowedByCurrentPrototypePolicy: true,
    enforcementMode: "observe_only",
    policyIssues: []
  };
}

export function evaluateOutboundPayloadPolicy(
  classification,
  { allowDirectIdentifiers = false, allowPortalText = false, requireSourcePointers = false } = {}
) {
  const issues = [];
  if (classification.containsDirectIdentifier && !allowDirectIdentifiers) {
    issues.push("direct_identifier_present");
  }
  if (classification.containsPortalText && !allowPortalText) {
    issues.push("raw_portal_text_present");
  }
  if (requireSourcePointers && !classification.containsSourcePointers) {
    issues.push("required_source_pointer_contract_missing");
  }
  return {
    policyVersion: OUTBOUND_PAYLOAD_POLICY_VERSION,
    allowed: issues.length === 0,
    issues,
    allowDirectIdentifiers,
    allowPortalText,
    requireSourcePointers
  };
}

export function buildOutboundPayloadObservation(payload, options = {}) {
  const serializedPayload = safeStringify(payload);
  const classification = classifyOutboundPayload(payload, options);
  const policy = evaluateOutboundPayloadPolicy(classification, options);
  return {
    ...classification,
    allowedByCurrentPrototypePolicy: policy.allowed,
    enforcementMode: options.enforcementMode ?? "observe_only",
    policyIssues: policy.issues,
    policyRequirements: {
      allowDirectIdentifiers: policy.allowDirectIdentifiers,
      allowPortalText: policy.allowPortalText,
      requireSourcePointers: policy.requireSourcePointers
    },
    payloadHash: createHash("sha256").update(serializedPayload).digest("hex"),
    serializedPayload
  };
}

export async function recordOutboundPayloadObservation(store, { sessionId, payload, ...options }) {
  const enforcementMode = options.enforcementMode ?? "enforced";
  const observation = buildOutboundPayloadObservation(payload, { ...options, enforcementMode });
  if (store) {
    await audit(store, sessionId ?? null, "outbound_payload_observed", observation);
  }
  if (enforcementMode === "enforced" && !observation.allowedByCurrentPrototypePolicy) {
    if (store) {
      await audit(store, sessionId ?? null, "outbound_payload_blocked", {
        payloadHash: observation.payloadHash,
        destination: observation.destination,
        payloadType: observation.payloadType,
        policyMode: observation.policyMode,
        policyIssues: observation.policyIssues,
        enforcementMode: "enforced"
      });
    }
    throw new Error(`Outbound payload blocked by policy: ${observation.policyIssues.join(", ")}`);
  }
  return observation;
}
