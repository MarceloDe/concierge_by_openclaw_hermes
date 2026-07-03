import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

// Secret-backend INTERFACE (three-layer pivot, plan §5.2 — founder decision #5,
// spine YAML secret_vault_policy). One abstraction behind which
// credential_session_vault.secret_pointer/envelope_json resolve; no module
// dereferences a secret except through it. Backend classes follow the existing
// databaseSecretProfile source-classification conventions: the local secret-file
// class is allowed for dev/closed-pilot profiles ONLY; a managed KMS/Vault backend is
// REQUIRED before broad external users, long-lived Layer-2 tokens, or production PHI
// token storage (a named late work item — this interface is where it plugs in).
// Invariants regardless of backend: raw passwords never stored; ciphertext lives in
// the backend, table columns carry metadata only; every dereference is caller-audited.
export const SECRET_BACKEND_VERSION = "2026-07-02.secret-backend.v1";
export const SECRET_CIPHER = "aes-256-gcm";

// Reuses the graph-checkpointer key convention (no new env flag): base64/hex 32-byte
// key. Absent key => deterministic dev-only key, classified default_dev (never
// production; the boot durability gate and this classification keep it honest).
function decodeKey(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  try {
    const b64 = Buffer.from(text, "base64");
    if (b64.length === 32) return b64;
  } catch { /* fall through */ }
  try {
    const hex = Buffer.from(text, "hex");
    if (hex.length === 32) return hex;
  } catch { /* fall through */ }
  const utf8 = Buffer.from(text, "utf8");
  return utf8.length >= 32 ? utf8.subarray(0, 32) : null;
}

export function resolveSecretBackend(env = process.env) {
  const configured = decodeKey(env.BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY);
  if (configured) {
    return { backendClass: "secret_file", allowedForProduction: false, kekId: "graph-checkpointer-key", key: configured };
  }
  // Dev-only derived key: loud classification, never a production posture.
  const devKey = createHash("sha256").update("brainsty-dev-secret-backend").digest();
  return { backendClass: "default_dev", allowedForProduction: false, kekId: "default-dev-derived", key: devKey };
}

function secretStoreDir(env = process.env) {
  const dbPath = String(env.BRAINSTY_DB_PATH ?? "data/brainsty.sqlite");
  return join(dirname(dbPath), "secret-store");
}

export function sha256Hex(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

// putSecret: encrypt + persist ciphertext in the backend; return the pointer +
// envelope metadata + plaintext hash (the read-back proof handle, plan §5.1).
export function putSecret(plaintext, { env = process.env, scope = [] } = {}) {
  const backend = resolveSecretBackend(env);
  const dir = secretStoreDir(env);
  mkdirSync(dir, { recursive: true });
  const id = `sec_${randomBytes(12).toString("hex")}`;
  const iv = randomBytes(12);
  const cipher = createCipheriv(SECRET_CIPHER, backend.key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(String(plaintext), "utf8")), cipher.final()]);
  const authTag = cipher.getAuthTag();
  writeFileSync(join(dir, `${id}.bin`), Buffer.concat([iv, authTag, ciphertext]));
  return {
    secretPointer: `secretfile:${id}`,
    envelope: {
      version: SECRET_BACKEND_VERSION,
      alg: SECRET_CIPHER,
      kekId: backend.kekId,
      backendClass: backend.backendClass,
      scope
    },
    secretHash: sha256Hex(plaintext)
  };
}

// dereferenceSecret: resolve a pointer back to plaintext, or throw the classified
// vault_pointer_unresolvable failure (plan §5.5 negative arm) — never a silent null.
export function dereferenceSecret(secretPointer, envelope = {}, { env = process.env } = {}) {
  const pointer = String(secretPointer ?? "");
  if (!pointer.startsWith("secretfile:")) {
    const error = new Error(`vault_pointer_unresolvable:unknown_backend:${pointer.split(":")[0] || "empty"}`);
    error.failureClass = "vault_pointer_unresolvable";
    throw error;
  }
  const id = pointer.slice("secretfile:".length);
  const file = join(secretStoreDir(env), `${id}.bin`);
  if (!existsSync(file)) {
    const error = new Error("vault_pointer_unresolvable:secret_backend_missing");
    error.failureClass = "vault_pointer_unresolvable";
    throw error;
  }
  try {
    const backend = resolveSecretBackend(env);
    const blob = readFileSync(file);
    const iv = blob.subarray(0, 12);
    const authTag = blob.subarray(12, 28);
    const ciphertext = blob.subarray(28);
    const decipher = createDecipheriv(envelope.alg ?? SECRET_CIPHER, backend.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (cause) {
    const error = new Error(`vault_pointer_unresolvable:decrypt_failed:${cause.message}`);
    error.failureClass = "vault_pointer_unresolvable";
    throw error;
  }
}

export function destroySecret(secretPointer, { env = process.env } = {}) {
  const pointer = String(secretPointer ?? "");
  if (!pointer.startsWith("secretfile:")) return false;
  const file = join(secretStoreDir(env), `${pointer.slice("secretfile:".length)}.bin`);
  try {
    unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}
