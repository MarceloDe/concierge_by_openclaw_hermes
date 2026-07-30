import { TABLES } from "./schema.mjs";

const TABLE_ALLOWLIST = new Set(TABLES);
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function assertSafeSqlIdentifier(identifier, kind = "identifier") {
  const value = String(identifier ?? "");
  if (!IDENTIFIER_RE.test(value)) throw new Error(`Unsafe SQL ${kind}: ${value || "empty"}`);
  return value;
}

export function assertSafeTableName(table) {
  const value = assertSafeSqlIdentifier(table, "table");
  if (!TABLE_ALLOWLIST.has(value)) throw new Error(`SQL table is not allowlisted: ${value}`);
  return value;
}

// Authoritative, ordered conversation insert. Computes the next per-session ordinal inside a
// PostgreSQL transaction with a dedicated pooled client so
// the timeline is monotonic even under rapid turns. Works for both stores (transaction(callback)
// passes a store-like object exposing get/insert). Returns the inserted row.
export async function insertConversationMessage(store, { sessionId, role, content }) {
  return store.transaction(async (tx) => {
    const row = await tx.get(
      "SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next FROM conversation_messages WHERE session_id = ?;",
      [sessionId]
    );
    const seq = Number(row?.next ?? 1);
    const values = {
      id: createId("msg"),
      session_id: sessionId,
      role,
      content,
      created_at: nowIso(),
      sequence_number: seq
    };
    await tx.insert("conversation_messages", values);
    return values;
  });
}
