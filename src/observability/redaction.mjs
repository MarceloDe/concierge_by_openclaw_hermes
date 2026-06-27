import { createHash } from "node:crypto";

export const REDACTION_VERSION = "2026-06-27.langfuse-redaction.v1";

const SAFE_METADATA_FIELDS = new Set([
  "app_name",
  "environment",
  "release",
  "workflow",
  "tenant_id",
  "session_id",
  "trace_id",
  "user_hash",
  "agent_version",
  "route",
  "planner_version",
  "router_version",
  "profile_name",
  "langchain_runtime",
  "openclaw_enabled",
  "safety_mode",
  "phi_redaction_enabled",
  "checkpoint_name",
  "checkpoint_kind",
  "node_name",
  "status",
  "latency_ms",
  "failure_class",
  "retry_count",
  "input_summary",
  "output_summary",
  "tool_name",
  "worker_name",
  "prompt_name",
  "prompt_version",
  "prompt_label",
  "prompt_role",
  "model",
  "token_count",
  "escalation_required",
  "approval_required",
  "approval_status",
  "openclaw_profile",
  "channel",
  "skill_name",
  "command_type",
  "sandbox_mode",
  "read_only_mode",
  "timeout_ms",
  "result_status",
  "route_candidates_count",
  "plan_step_count",
  "tool_candidate_count",
  "selected_tool_count",
  "source_pointer_count",
  "worker_job_count",
  "cache_key",
  "manifest_hash",
  "portfolio_hash",
  "trace_url"
]);

const REDACTION_PATTERNS = [
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED_SSN]"],
  [/\b(?:dob|date of birth)\s*[:#-]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi, "[REDACTED_DOB]"],
  [/\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/g, "[REDACTED_DATE]"],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]"],
  [/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[REDACTED_PHONE]"],
  [/\b(?:member|subscriber|policy|claim|authorization|auth|patient|account)\s*(?:id|number|no|#)\s*[:#-]?\s*[A-Z0-9-]{4,}\b/gi, "[REDACTED_ID]"],
  [/\b\d{1,6}\s+[A-Z][A-Za-z0-9.'-]*(?:\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Court|Ct)\b\.?)/g, "[REDACTED_ADDRESS]"],
  [/\b(?:diagnosis|condition|symptoms?|medication|procedure|surgery|therapy)\s*[:#-]\s*[^.;\n]{4,160}/gi, "[REDACTED_MEDICAL_DETAIL]"]
];

export function stableHash(value, prefix = "hash") {
  const digest = createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, 18);
  return `${prefix}_${digest}`;
}

export function redact_text(value) {
  if (value === null || value === undefined) return value;
  let text = String(value);
  for (const [pattern, replacement] of REDACTION_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

export function summarizeValue(value, limit = 240) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const redacted = redact_text(value).replace(/\s+/g, " ").trim();
    return redacted.length > limit ? `${redacted.slice(0, limit - 3)}...` : redacted;
  }
  if (Array.isArray(value)) return { type: "array", count: value.length };
  if (typeof value === "object") return { type: "object", keys: Object.keys(value).slice(0, 20), hash: stableHash(JSON.stringify(value)) };
  return value;
}

export function redact_payload(payload, depth = 0) {
  if (payload === null || payload === undefined) return payload;
  if (typeof payload === "string") return redact_text(payload);
  if (typeof payload !== "object") return payload;
  if (depth > 5) return summarizeValue(payload);
  if (Array.isArray(payload)) return payload.slice(0, 20).map((item) => redact_payload(item, depth + 1));
  const result = {};
  for (const [key, value] of Object.entries(payload)) {
    const lower = key.toLowerCase();
    if (/(password|passkey|credential|secret|token|authorization|cookie|screenshot|frame|portaltext|rawtext|ocrtext|fulltext)/.test(lower)) {
      const label = /screenshot/.test(lower)
        ? "SCREENSHOT"
        : /rawtext/.test(lower)
          ? "RAWTEXT"
          : /ocrtext/.test(lower)
            ? "OCRTEXT"
            : lower.replace(/[^a-z0-9]+/g, "_").toUpperCase();
      result[key] = value === null || value === undefined ? value : `[REDACTED_${label}]`;
      continue;
    }
    if (/(member|subscriber|policy|claim|authorization|auth|patient|account).*id$/.test(lower) && typeof value === "string") {
      result[key] = "[REDACTED_ID]";
      continue;
    }
    result[key] = redact_payload(value, depth + 1);
  }
  return result;
}

export function safe_metadata(metadata = {}) {
  const result = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (SAFE_METADATA_FIELDS.has(key)) {
      result[key] = redact_payload(value);
    } else if (/(_id|id)$/.test(key) && typeof value === "string") {
      result[`${key}_hash`] = stableHash(value, key);
    } else if (typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
    } else if (value !== undefined && value !== null) {
      result[`${key}_summary`] = summarizeValue(value);
    }
  }
  return { ...result, phi_redaction_enabled: true };
}

export function safeSummaryFromPayload(payload, label = "payload") {
  const redacted = redact_payload(payload);
  if (typeof redacted === "string") return summarizeValue(redacted);
  if (Array.isArray(redacted)) return `${label}: array(${redacted.length})`;
  if (redacted && typeof redacted === "object") return `${label}: keys(${Object.keys(redacted).slice(0, 12).join(",")}) hash=${stableHash(JSON.stringify(redacted))}`;
  return String(redacted ?? "");
}
