import { createHash } from "node:crypto";
import { createId, nowIso } from "./database.mjs";
import { maskDirectIdentifiers } from "./modelPayloadPolicy.mjs";

export const AUDIT_CHAIN_VERSION = "2026-05-27.audit-chain.v1";
export const AUDIT_LOG_API_VERSION = "2026-06-01.phase10l-audit-log-api.v1";

function eventHashMaterial(row) {
  return JSON.stringify({
    id: row.id,
    session_id: row.session_id ?? null,
    event_type: row.event_type,
    details: row.details,
    previous_event_hash: row.previous_event_hash ?? null,
    chain_version: row.chain_version,
    created_at: row.created_at
  });
}

function hashAuditEvent(row) {
  return createHash("sha256").update(eventHashMaterial(row)).digest("hex");
}

function hashValue(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function clampLimit(value, fallback = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(500, Math.trunc(parsed)));
}

function clampOffset(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function escapeLike(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function redactAuditPreview(value) {
  return maskDirectIdentifiers(String(value ?? ""), {})
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[redacted-email]")
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, "[redacted-phone]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[redacted-ssn]")
    .replace(/\b\d{9,}\b/g, "[redacted-number]");
}

function detailsPreview(details) {
  let serialized = String(details ?? "");
  try {
    serialized = JSON.stringify(JSON.parse(serialized));
  } catch {
    // Keep the stored audit details as plain text when legacy rows are not JSON.
  }
  return redactAuditPreview(serialized).slice(0, 900);
}

function auditActionKind(eventType) {
  const value = String(eventType ?? "");
  if (/blocked|refused|failed|quarantined|rejected|expired/i.test(value)) return "blocked_or_rejected";
  if (/approved|approval|consumed/i.test(value)) return "approval";
  if (/proposal|proposed/i.test(value)) return "proposal";
  if (/schedule|heartbeat|followup|cron/i.test(value)) return "scheduled_work";
  if (/research|artifact|source|evidence|retrieval/i.test(value)) return "research_evidence";
  if (/openclaw|worker|continuation/i.test(value)) return "worker";
  if (/feedback|export|session|message/i.test(value)) return "user_session";
  if (/outbound|payload|model|llm/i.test(value)) return "model_payload";
  return "runtime";
}

function auditWhereClause(filters = {}) {
  const clauses = [];
  const params = [];
  const sessionId = filters.sessionId ?? null;
  if (sessionId) {
    clauses.push("session_id = ?");
    params.push(sessionId);
  }
  else if (truthy(filters.rootOnly)) clauses.push("session_id IS NULL");
  if (filters.eventType) {
    clauses.push("event_type = ?");
    params.push(filters.eventType);
  }
  if (filters.eventPrefix) {
    clauses.push("event_type LIKE ? ESCAPE '\\'");
    params.push(`${escapeLike(filters.eventPrefix)}%`);
  }
  if (filters.since) {
    clauses.push("created_at >= ?");
    params.push(filters.since);
  }
  if (filters.until) {
    clauses.push("created_at <= ?");
    params.push(filters.until);
  }
  if (filters.query) {
    const pattern = `%${escapeLike(filters.query)}%`;
    clauses.push("(id LIKE ? ESCAPE '\\' OR event_type LIKE ? ESCAPE '\\' OR session_id LIKE ? ESCAPE '\\')");
    params.push(pattern, pattern, pattern);
  }
  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params
  };
}

function normalizeAuditRow(row) {
  return {
    id: row.id,
    sessionId: row.session_id ?? null,
    eventType: row.event_type,
    actionKind: auditActionKind(row.event_type),
    createdAt: row.created_at,
    detailsHash: hashValue(row.details),
    detailsPreview: detailsPreview(row.details),
    previousEventHash: row.previous_event_hash ?? null,
    eventHash: row.event_hash ?? null,
    chainVersion: row.chain_version ?? null,
    hashChained: Boolean(row.event_hash)
  };
}

async function latestHash(store, sessionId) {
  const row = sessionId
    ? await store.get("SELECT event_hash FROM audit_events WHERE session_id = ? AND event_hash IS NOT NULL ORDER BY rowid DESC LIMIT 1;", [sessionId])
    : await store.get("SELECT event_hash FROM audit_events WHERE session_id IS NULL AND event_hash IS NOT NULL ORDER BY rowid DESC LIMIT 1;");
  return row?.event_hash ?? null;
}

export async function audit(store, sessionId, eventType, details) {
  const row = {
    id: createId("audit"),
    session_id: sessionId ?? null,
    event_type: eventType,
    details: JSON.stringify(details),
    previous_event_hash: await latestHash(store, sessionId ?? null),
    chain_version: AUDIT_CHAIN_VERSION,
    created_at: nowIso()
  };
  row.event_hash = hashAuditEvent(row);
  await store.insert("audit_events", row);
  return row;
}

export async function verifyAuditChain(store, { sessionId = null } = {}) {
  const rows = sessionId
    ? await store.all("SELECT rowid, * FROM audit_events WHERE session_id = ? ORDER BY rowid ASC;", [sessionId])
    : await store.all("SELECT rowid, * FROM audit_events WHERE session_id IS NULL ORDER BY rowid ASC;");
  const issues = [];
  let previousHash = null;
  let hashedCount = 0;
  let legacyUnhashedCount = 0;
  for (const row of rows) {
    if (!row.event_hash) {
      legacyUnhashedCount += 1;
      continue;
    }
    hashedCount += 1;
    const expectedPreviousHash = previousHash;
    if ((row.previous_event_hash ?? null) !== expectedPreviousHash) {
      issues.push({
        auditEventId: row.id,
        issue: "previous_hash_mismatch",
        expected: expectedPreviousHash,
        actual: row.previous_event_hash ?? null
      });
    }
    const expectedHash = hashAuditEvent(row);
    if (row.event_hash !== expectedHash) {
      issues.push({
        auditEventId: row.id,
        issue: "event_hash_mismatch",
        expected: expectedHash,
        actual: row.event_hash
      });
    }
    previousHash = row.event_hash;
  }
  return {
    valid: issues.length === 0,
    chainVersion: AUDIT_CHAIN_VERSION,
    sessionId,
    eventCount: rows.length,
    hashedCount,
    legacyUnhashedCount,
    terminalHash: previousHash,
    issues
  };
}

export async function verifyAuditChains(store, { sessionIds = null } = {}) {
  let resolvedSessionIds = sessionIds;
  if (!Array.isArray(resolvedSessionIds)) {
    const rows = await store.all("SELECT DISTINCT session_id FROM audit_events ORDER BY session_id ASC;");
    resolvedSessionIds = rows.map((row) => row.session_id ?? null);
  }
  if (!resolvedSessionIds.includes(null)) resolvedSessionIds.unshift(null);
  const uniqueSessionIds = [...new Set(resolvedSessionIds)];
  const chains = [];
  for (const sessionId of uniqueSessionIds) {
    chains.push(await verifyAuditChain(store, { sessionId }));
  }
  return {
    version: AUDIT_LOG_API_VERSION,
    valid: chains.every((chain) => chain.valid),
    checkedChains: chains.length,
    eventCount: chains.reduce((sum, chain) => sum + chain.eventCount, 0),
    hashedCount: chains.reduce((sum, chain) => sum + chain.hashedCount, 0),
    legacyUnhashedCount: chains.reduce((sum, chain) => sum + chain.legacyUnhashedCount, 0),
    issues: chains.flatMap((chain) => chain.issues.map((issue) => ({ ...issue, sessionId: chain.sessionId }))),
    chains
  };
}

export async function listAuditEvents(store, filters = {}) {
  const limit = clampLimit(filters.limit, 100);
  const offset = clampOffset(filters.offset);
  const where = auditWhereClause(filters);
  const rows = await store.all(
    `SELECT * FROM audit_events ${where.sql} ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?;`,
    [...where.params, limit, offset]
  );
  const countRow = await store.get(`SELECT COUNT(*) AS count FROM audit_events ${where.sql};`, where.params);
  const typeRows = await store.all(
    `SELECT event_type, COUNT(*) AS count FROM audit_events ${where.sql} GROUP BY event_type ORDER BY count DESC, event_type ASC LIMIT ?;`,
    [...where.params, 20]
  );
  const visibleSessionIds = [...new Set(rows.map((row) => row.session_id ?? null))].slice(0, 20);
  const chain = await verifyAuditChains(store, {
    sessionIds: filters.sessionId ? [filters.sessionId] : visibleSessionIds
  });
  return {
    version: AUDIT_LOG_API_VERSION,
    status: chain.valid ? "audit_visible_and_chain_valid" : "audit_visible_chain_attention",
    filters: {
      sessionId: filters.sessionId ?? null,
      rootOnly: truthy(filters.rootOnly),
      eventType: filters.eventType ?? null,
      eventPrefix: filters.eventPrefix ?? null,
      query: filters.query ?? null,
      since: filters.since ?? null,
      until: filters.until ?? null
    },
    pagination: {
      limit,
      offset,
      total: countRow?.count ?? rows.length,
      returned: rows.length
    },
    eventTypes: typeRows.map((row) => ({ eventType: row.event_type, count: row.count })),
    chain,
    events: rows.map(normalizeAuditRow),
    safety: {
      rawDetailsReturned: false,
      detailsPreview: "redacted_and_truncated",
      detailsHash: "sha256_of_stored_details"
    }
  };
}

export async function approvalGate(store, sessionId, gateType, decision, details) {
  const row = {
    id: createId("gate"),
    session_id: sessionId,
    gate_type: gateType,
    decision,
    details: JSON.stringify(details),
    created_at: nowIso()
  };
  await store.insert("approval_gates", row);
  await audit(store, sessionId, "approval_gate", { gateType, decision, details });
  return row;
}
