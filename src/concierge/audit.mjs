import { createHash } from "node:crypto";
import { createId, nowIso } from "./database.mjs";

export const AUDIT_CHAIN_VERSION = "2026-05-27.audit-chain.v1";

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

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

async function latestHash(store, sessionId) {
  const row = await store.get(
    `SELECT event_hash FROM audit_events WHERE ${sessionId ? `session_id = ${sql(sessionId)}` : "session_id IS NULL"} AND event_hash IS NOT NULL ORDER BY rowid DESC LIMIT 1;`
  );
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
  const rows = await store.all(
    `SELECT rowid, * FROM audit_events WHERE ${sessionId ? `session_id = ${sql(sessionId)}` : "session_id IS NULL"} ORDER BY rowid ASC;`
  );
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
