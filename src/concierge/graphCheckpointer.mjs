import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { MemorySaver } from "@langchain/langgraph";

export const GRAPH_CHECKPOINTER_VERSION = "2026-06-22.phase56-encrypted-hitl-checkpointer.v2";
export const GRAPH_CHECKPOINTER_CIPHER = "aes-256-gcm";

function expandHome(path) {
  if (!path) return path;
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return resolve(path);
}

function defaultCheckpointPath(env = process.env) {
  return expandHome(
    env.BRAINSTY_GRAPH_CHECKPOINTER_PATH ??
      "~/.config/workerprototype_openclaw/langgraph-checkpoints/brainstyworkers-checkpoints.json"
  );
}

function decodeEncryptionKey(rawKey) {
  const value = String(rawKey ?? "").trim();
  if (!value) return null;
  if (/^[a-f0-9]{64}$/i.test(value)) return { key: Buffer.from(value, "hex"), keySource: "hex_256" };
  try {
    const decoded = Buffer.from(value, "base64");
    if (decoded.length === 32) return { key: decoded, keySource: "base64_256" };
  } catch {
    // Fall through to passphrase hashing.
  }
  return { key: createHash("sha256").update(value).digest(), keySource: "sha256_passphrase" };
}

function encryptionConfigFromEnv(env = process.env) {
  const decoded = decodeEncryptionKey(env.BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY);
  if (decoded) return decoded;
  if (env.BRAINSTY_GRAPH_CHECKPOINTER_ALLOW_TEST_KEY === "1") {
    return {
      key: createHash("sha256").update("brainstyworkers-phase56-test-only-checkpointer-key").digest(),
      keySource: "test_only_sha256"
    };
  }
  return null;
}

function nullObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const target = Object.create(null);
  for (const [key, nested] of Object.entries(value)) {
    target[key] = nullObject(nested);
  }
  return target;
}

function encodeCheckpointValue(value) {
  if (value instanceof Uint8Array) {
    return {
      __brainstyEncoded: "uint8array-base64",
      data: Buffer.from(value).toString("base64")
    };
  }
  if (Array.isArray(value)) return value.map(encodeCheckpointValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, encodeCheckpointValue(nested)]));
}

function decodeCheckpointValue(value) {
  if (value?.__brainstyEncoded === "uint8array-base64") {
    return new Uint8Array(Buffer.from(value.data, "base64"));
  }
  if (Array.isArray(value)) return value.map(decodeCheckpointValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, decodeCheckpointValue(nested)]));
}

function encryptCheckpointPayload(payload, encryptionKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(GRAPH_CHECKPOINTER_CIPHER, encryptionKey, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    version: GRAPH_CHECKPOINTER_VERSION,
    encrypted: true,
    cipher: GRAPH_CHECKPOINTER_CIPHER,
    persistedAt: payload.persistedAt,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

function decryptCheckpointPayload(wrapper, encryptionKey) {
  const decipher = createDecipheriv(
    wrapper.cipher ?? GRAPH_CHECKPOINTER_CIPHER,
    encryptionKey,
    Buffer.from(wrapper.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(wrapper.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(wrapper.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
  return JSON.parse(plaintext);
}

export class FileBackedMemorySaver extends MemorySaver {
  constructor({ path, encryptionKey, allowPlaintextMigration = true }) {
    super();
    if (!encryptionKey) throw new Error("File-backed LangGraph checkpointer requires BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY.");
    this.path = path;
    this.encryptionKey = encryptionKey;
    this.allowPlaintextMigration = allowPlaintextMigration;
    this.loaded = false;
    this.persisting = Promise.resolve();
    this.lastReadEncrypted = false;
  }

  async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = JSON.parse(raw);
      const payload = parsed.encrypted
        ? decryptCheckpointPayload(parsed, this.encryptionKey)
        : this.allowPlaintextMigration
          ? parsed
          : (() => {
              throw new Error("Plaintext LangGraph checkpoint file is not allowed.");
            })();
      this.lastReadEncrypted = Boolean(parsed.encrypted);
      this.storage = nullObject(decodeCheckpointValue(payload.storage ?? {}));
      this.writes = nullObject(decodeCheckpointValue(payload.writes ?? {}));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  async persist() {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const tmpPath = `${this.path}.tmp`;
    const payload = {
        version: GRAPH_CHECKPOINTER_VERSION,
        persistedAt: new Date().toISOString(),
        storage: encodeCheckpointValue(this.storage),
        writes: encodeCheckpointValue(this.writes)
      };
    const encryptedPayload = encryptCheckpointPayload(payload, this.encryptionKey);
    const serializedPayload = JSON.stringify(encryptedPayload, null, 2);
    await writeFile(tmpPath, serializedPayload, { mode: 0o600 });
    await rename(tmpPath, this.path);
    this.lastReadEncrypted = true;
  }

  async getTuple(config) {
    await this.load();
    return super.getTuple(config);
  }

  async *list(config, options) {
    await this.load();
    yield* super.list(config, options);
  }

  async put(config, checkpoint, metadata) {
    await this.load();
    const result = await super.put(config, checkpoint, metadata);
    this.persisting = this.persisting.then(() => this.persist());
    await this.persisting;
    return result;
  }

  async putWrites(config, writes, taskId) {
    await this.load();
    const result = await super.putWrites(config, writes, taskId);
    this.persisting = this.persisting.then(() => this.persist());
    await this.persisting;
    return result;
  }

  async deleteThread(threadId) {
    await this.load();
    const result = await super.deleteThread(threadId);
    this.persisting = this.persisting.then(() => this.persist());
    await this.persisting;
    return result;
  }
}

export function createGraphCheckpointer(env = process.env) {
  const mode = String(env.BRAINSTY_GRAPH_CHECKPOINTER ?? "memory").trim().toLowerCase();
  if (["file", "local_file", "durable_file"].includes(mode)) {
    const path = defaultCheckpointPath(env);
    const encryption = encryptionConfigFromEnv(env);
    if (!encryption) {
      throw new Error(
        "BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY is required when BRAINSTY_GRAPH_CHECKPOINTER=file."
      );
    }
    return {
      checkpointer: new FileBackedMemorySaver({ path, encryptionKey: encryption.key }),
      readiness: {
        version: GRAPH_CHECKPOINTER_VERSION,
        mode: "file",
        durable: true,
        path,
        phiAtRest: "encrypted_at_rest_aes_256_gcm",
        encryption: {
          required: true,
          configured: true,
          keySource: encryption.keySource,
          rawKeyReturned: false
        },
        status: "ready"
      }
    };
  }
  return {
    checkpointer: new MemorySaver(),
    readiness: {
      version: GRAPH_CHECKPOINTER_VERSION,
      mode: "memory",
      durable: false,
      path: null,
      phiAtRest: "process_memory_only",
      status: "ready"
    }
  };
}
