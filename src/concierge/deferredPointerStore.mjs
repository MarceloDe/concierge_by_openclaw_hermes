import { assertSafeTableName } from "./database.mjs";
import { audit } from "./audit.mjs";

export const DEFERRED_POINTER_STORE_VERSION = "2026-07-12.postgres-deferred-pointer.v1";

const PUBLIC_POINTER_TABLES = new Set([
  "rag_chunks",
  "mrf_price_observations",
  "provider_directory_entries",
  "pdp_plans",
  "pdp_formulary",
  "pdp_pharmacy_network",
  "pdp_pricing"
]);
const SESSION_POINTER_TABLES = new Set(["eligibility_snapshots"]);
const SNAPSHOT_POINTER_TABLES = new Set(["coverage_balances", "claim_items", "prior_authorizations"]);

export function parseDeferredPointer(pointer) {
  const value = String(pointer ?? "").trim();
  const separator = value.indexOf("#");
  if (separator <= 0 || separator === value.length - 1) {
    const error = new Error(`Deferred pointer '${value || "empty"}' must use table#id.`);
    error.failureClass = "deferred_pointer_invalid";
    throw error;
  }
  const table = assertSafeTableName(value.slice(0, separator));
  const id = value.slice(separator + 1);
  return { pointer: value, table, id };
}

export async function dereferenceDeferredPointer(store, pointer, { sessionId = null } = {}) {
  if (store?.driver !== "postgres") {
    const error = new Error("Deferred pointers may be dereferenced only through the authoritative PostgreSQL store.");
    error.failureClass = "deferred_pointer_non_postgres_store";
    throw error;
  }
  const parsed = parseDeferredPointer(pointer);
  if (![...PUBLIC_POINTER_TABLES, ...SESSION_POINTER_TABLES, ...SNAPSHOT_POINTER_TABLES].includes(parsed.table)) {
    const error = new Error(`Table '${parsed.table}' is not an approved deferred-pointer evidence surface.`);
    error.failureClass = "deferred_pointer_table_forbidden";
    throw error;
  }
  if ((SESSION_POINTER_TABLES.has(parsed.table) || SNAPSHOT_POINTER_TABLES.has(parsed.table)) && !sessionId) {
    const error = new Error(`Deferred pointer '${parsed.pointer}' requires a session authorization boundary.`);
    error.failureClass = "deferred_pointer_session_required";
    throw error;
  }

  let row;
  if (SESSION_POINTER_TABLES.has(parsed.table)) {
    row = await store.get(`SELECT * FROM ${parsed.table} WHERE id = ? AND session_id = ? LIMIT 1;`, [parsed.id, sessionId]);
  } else if (SNAPSHOT_POINTER_TABLES.has(parsed.table)) {
    row = await store.get(
      `SELECT child.* FROM ${parsed.table} child
       JOIN eligibility_snapshots snapshot ON snapshot.id = child.snapshot_id
       WHERE child.id = ? AND snapshot.session_id = ? LIMIT 1;`,
      [parsed.id, sessionId]
    );
  } else {
    row = await store.findOne(parsed.table, { id: parsed.id });
  }
  if (!row) {
    await audit(store, sessionId, "deferred_pointer_missing", { pointer: parsed.pointer, table: parsed.table });
    const error = new Error(`Deferred pointer '${parsed.pointer}' does not resolve in PostgreSQL.`);
    error.failureClass = "deferred_pointer_missing";
    throw error;
  }

  const backingPointers = [];
  if (parsed.table === "rag_chunks") {
    if (Number(row.phi_allowed) !== 0) {
      const error = new Error(`Deferred pointer '${parsed.pointer}' is not cleared for public RAG dereference.`);
      error.failureClass = "deferred_pointer_phi_forbidden";
      throw error;
    }
    const artifact = await store.findOne("extraction_artifacts", { id: row.artifact_id });
    if (!artifact) {
      await audit(store, sessionId, "deferred_pointer_backing_missing", {
        pointer: parsed.pointer,
        backingTable: "extraction_artifacts",
        backingId: row.artifact_id
      });
      const error = new Error(`Deferred pointer '${parsed.pointer}' has no backing extraction artifact.`);
      error.failureClass = "deferred_pointer_backing_missing";
      throw error;
    }
    backingPointers.push(`extraction_artifacts#${artifact.id}`);
  }

  return {
    version: DEFERRED_POINTER_STORE_VERSION,
    authority: "postgres",
    pointer: parsed.pointer,
    table: parsed.table,
    id: parsed.id,
    row,
    backingPointers
  };
}
