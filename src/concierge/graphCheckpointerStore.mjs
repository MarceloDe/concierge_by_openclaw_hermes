import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  BaseCheckpointSaver,
  WRITES_IDX_MAP,
  copyCheckpoint,
  getCheckpointId
} from "@langchain/langgraph-checkpoint";
import { INTERRUPT_SCHEMA_VERSION } from "./approvalResume.mjs";
import { LLM_ORCHESTRATION_DECISION_VERSION } from "./llmOrchestrationDecision.mjs";

// Phase 91 (plan §4.3, founder #4): the DURABLE store-backed LangGraph checkpointer —
// the declared production target. Written against the store ABSTRACTION, not a raw pg
// Pool, so the identical code path is proven on mkdtemp SQLite and on live Postgres.
//
// Graph state carries PHI (user_input, memory_context). The upstream Postgres saver
// persists checkpoints as plaintext JSONB; that is a downgrade from the file-mode saver
// this replaces, so every checkpoint/metadata/write payload here is AES-256-GCM
// ciphertext in its column. A decrypt failure is a LOUD classified failure
// (checkpoint_ciphertext_unresolvable), never a silent null (§5.5 negative arm).
export const STORE_CHECKPOINTER_VERSION = "2026-07-09.store-backed-checkpointer.v1";
export const STORE_CHECKPOINTER_CIPHER = "aes-256-gcm";

// Stamped onto every checkpoint row. A resume across a deploy that changed any of these
// is NOT auto-resumed (#17): the pending interrupt is expired and re-asked.
export const CHECKPOINT_RUNTIME_VERSIONS = Object.freeze({
  checkpointer: STORE_CHECKPOINTER_VERSION,
  interruptSchema: INTERRUPT_SCHEMA_VERSION,
  plannerSchema: LLM_ORCHESTRATION_DECISION_VERSION
});

function newRowId(prefix) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function encryptBytes(bytes, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(STORE_CHECKPOINTER_CIPHER, key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(bytes)), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  };
}

function decryptBytes({ ciphertext, iv, tag }, key) {
  try {
    const decipher = createDecipheriv(STORE_CHECKPOINTER_CIPHER, key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return new Uint8Array(
      Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()])
    );
  } catch (cause) {
    // Tamper, key rotation, or truncation — all classified, never a silent null.
    const error = new Error(`checkpoint_ciphertext_unresolvable:decrypt_failed:${cause.message}`);
    error.failureClass = "checkpoint_ciphertext_unresolvable";
    throw error;
  }
}

function assertThreadId(threadId) {
  if (typeof threadId !== "string" || !threadId) {
    const error = new Error("Durable checkpointer requires a string thread_id in config.configurable.");
    error.failureClass = "checkpoint_thread_id_missing";
    throw error;
  }
  return threadId;
}

// Cross-version resume policy (§4.3 deploy acceptance, founder #17). Pure function so it
// is provable without a store. `stored` is the runtime_versions_json of the pending
// checkpoint; `current` is CHECKPOINT_RUNTIME_VERSIONS at the resuming process.
export function resumeCompatibility(stored, current = CHECKPOINT_RUNTIME_VERSIONS) {
  if (!stored || typeof stored !== "object" || !Object.keys(stored).length) {
    // No stamp: a pre-Phase-91 checkpoint. Never guess — expire and re-ask.
    return { compatible: false, action: "expire_and_reissue", reason: "checkpoint_runtime_versions_absent" };
  }
  const mismatched = Object.keys(current).filter((key) => stored[key] !== current[key]);
  if (mismatched.length) {
    return {
      compatible: false,
      action: "expire_and_reissue",
      reason: "checkpoint_runtime_version_changed",
      mismatched
    };
  }
  return { compatible: true, action: "resume", reason: "checkpoint_runtime_versions_match" };
}

export class StoreBackedCheckpointSaver extends BaseCheckpointSaver {
  constructor({ storeFactory, encryptionKey, runtimeVersions = CHECKPOINT_RUNTIME_VERSIONS, serde } = {}) {
    super(serde);
    if (typeof storeFactory !== "function") {
      throw new Error("StoreBackedCheckpointSaver requires a storeFactory() returning an initialized store.");
    }
    if (!encryptionKey) {
      throw new Error(
        "StoreBackedCheckpointSaver requires an encryption key (BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY) — graph state carries PHI."
      );
    }
    this.storeFactory = storeFactory;
    this.encryptionKey = encryptionKey;
    this.runtimeVersions = runtimeVersions;
    this.storePromise = null;
  }

  async store() {
    this.storePromise ??= Promise.resolve(this.storeFactory());
    return this.storePromise;
  }

  async #pendingWrites(store, threadId, checkpointNs, checkpointId) {
    const rows = await store.all(
      `SELECT task_id, channel, value_serde_type, value_ciphertext, value_iv, value_tag
         FROM langgraph_checkpoint_writes
        WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?
        ORDER BY write_idx ASC;`,
      [threadId, checkpointNs, checkpointId]
    );
    return Promise.all(
      rows.map(async (row) => [
        row.task_id,
        row.channel,
        await this.serde.loadsTyped(
          row.value_serde_type,
          decryptBytes(
            { ciphertext: row.value_ciphertext, iv: row.value_iv, tag: row.value_tag },
            this.encryptionKey
          )
        )
      ])
    );
  }

  async #tupleFromRow(row, config = null) {
    const store = await this.store();
    const checkpoint = await this.serde.loadsTyped(
      row.checkpoint_serde_type,
      decryptBytes(
        { ciphertext: row.checkpoint_ciphertext, iv: row.checkpoint_iv, tag: row.checkpoint_tag },
        this.encryptionKey
      )
    );
    const metadata = await this.serde.loadsTyped(
      row.metadata_serde_type,
      decryptBytes(
        { ciphertext: row.metadata_ciphertext, iv: row.metadata_iv, tag: row.metadata_tag },
        this.encryptionKey
      )
    );
    const tuple = {
      config:
        config ??
        {
          configurable: {
            thread_id: row.thread_id,
            checkpoint_ns: row.checkpoint_ns,
            checkpoint_id: row.checkpoint_id
          }
        },
      checkpoint,
      metadata,
      pendingWrites: await this.#pendingWrites(store, row.thread_id, row.checkpoint_ns, row.checkpoint_id)
    };
    if (row.parent_checkpoint_id) {
      tuple.parentConfig = {
        configurable: {
          thread_id: row.thread_id,
          checkpoint_ns: row.checkpoint_ns,
          checkpoint_id: row.parent_checkpoint_id
        }
      };
    }
    return tuple;
  }

  async getTuple(config) {
    const store = await this.store();
    const threadId = config.configurable?.thread_id;
    if (threadId === undefined) return undefined;
    const checkpointNs = config.configurable?.checkpoint_ns ?? "";
    const checkpointId = getCheckpointId(config);

    const row = checkpointId
      ? await store.get(
          `SELECT * FROM langgraph_checkpoints
            WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ? LIMIT 1;`,
          [threadId, checkpointNs, checkpointId]
        )
      : await store.get(
          `SELECT * FROM langgraph_checkpoints
            WHERE thread_id = ? AND checkpoint_ns = ?
            ORDER BY checkpoint_id DESC LIMIT 1;`,
          [threadId, checkpointNs]
        );
    if (!row) return undefined;
    // When the caller pinned a checkpoint_id, echo their config back (MemorySaver parity).
    return this.#tupleFromRow(row, checkpointId ? config : null);
  }

  async *list(config, options) {
    const store = await this.store();
    const { before, limit, filter } = options ?? {};
    const clauses = [];
    const params = [];
    if (config.configurable?.thread_id !== undefined) {
      clauses.push("thread_id = ?");
      params.push(config.configurable.thread_id);
    }
    if (config.configurable?.checkpoint_ns !== undefined) {
      clauses.push("checkpoint_ns = ?");
      params.push(config.configurable.checkpoint_ns);
    }
    if (config.configurable?.checkpoint_id) {
      clauses.push("checkpoint_id = ?");
      params.push(config.configurable.checkpoint_id);
    }
    if (before?.configurable?.checkpoint_id) {
      clauses.push("checkpoint_id < ?");
      params.push(before.configurable.checkpoint_id);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await store.all(
      `SELECT * FROM langgraph_checkpoints ${where} ORDER BY thread_id ASC, checkpoint_ns ASC, checkpoint_id DESC;`,
      params
    );

    let remaining = limit;
    for (const row of rows) {
      if (remaining !== undefined && remaining <= 0) break;
      const tuple = await this.#tupleFromRow(row);
      // metadata filter is applied post-decrypt: metadata is ciphertext at rest.
      if (filter && !Object.entries(filter).every(([key, value]) => tuple.metadata?.[key] === value)) continue;
      if (remaining !== undefined) remaining -= 1;
      yield tuple;
    }
  }

  async put(config, checkpoint, metadata) {
    const store = await this.store();
    const threadId = assertThreadId(config.configurable?.thread_id);
    const checkpointNs = config.configurable?.checkpoint_ns ?? "";
    const prepared = copyCheckpoint(checkpoint);
    const [[checkpointType, checkpointBytes], [metadataType, metadataBytes]] = await Promise.all([
      this.serde.dumpsTyped(prepared),
      this.serde.dumpsTyped(metadata)
    ]);
    const checkpointCipher = encryptBytes(checkpointBytes, this.encryptionKey);
    const metadataCipher = encryptBytes(metadataBytes, this.encryptionKey);
    const now = new Date().toISOString();

    const values = {
      thread_id: threadId,
      checkpoint_ns: checkpointNs,
      checkpoint_id: checkpoint.id,
      parent_checkpoint_id: config.configurable?.checkpoint_id ?? null,
      checkpoint_serde_type: checkpointType,
      checkpoint_ciphertext: checkpointCipher.ciphertext,
      checkpoint_iv: checkpointCipher.iv,
      checkpoint_tag: checkpointCipher.tag,
      metadata_serde_type: metadataType,
      metadata_ciphertext: metadataCipher.ciphertext,
      metadata_iv: metadataCipher.iv,
      metadata_tag: metadataCipher.tag,
      runtime_versions_json: JSON.stringify(this.runtimeVersions),
      updated_at: now
    };

    const existing = await store.get(
      `SELECT id FROM langgraph_checkpoints
        WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ? LIMIT 1;`,
      [threadId, checkpointNs, checkpoint.id]
    );
    if (existing) {
      await store.update("langgraph_checkpoints", values, { id: existing.id });
    } else {
      await store.insert("langgraph_checkpoints", {
        id: newRowId("ckpt"),
        ...values,
        created_at: now
      });
    }
    return {
      configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: checkpoint.id }
    };
  }

  async putWrites(config, writes, taskId) {
    const store = await this.store();
    const threadId = assertThreadId(config.configurable?.thread_id);
    const checkpointNs = config.configurable?.checkpoint_ns ?? "";
    const checkpointId = config.configurable?.checkpoint_id;
    if (checkpointId === undefined) {
      const error = new Error("Durable checkpointer requires checkpoint_id to persist pending writes.");
      error.failureClass = "checkpoint_id_missing";
      throw error;
    }

    for (const [idx, [channel, value]] of writes.entries()) {
      const writeIdx = WRITES_IDX_MAP[channel] ?? idx;
      // Special channels (negative idx) always overwrite; positional writes are
      // insert-once, matching MemorySaver's dedupe so a replayed task cannot double-append.
      const existing = await store.get(
        `SELECT id FROM langgraph_checkpoint_writes
          WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ? AND task_id = ? AND write_idx = ?
          LIMIT 1;`,
        [threadId, checkpointNs, checkpointId, taskId, writeIdx]
      );
      if (existing && writeIdx >= 0) continue;

      const [valueType, valueBytes] = await this.serde.dumpsTyped(value);
      const cipher = encryptBytes(valueBytes, this.encryptionKey);
      const values = {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpointId,
        task_id: taskId,
        write_idx: writeIdx,
        channel,
        value_serde_type: valueType,
        value_ciphertext: cipher.ciphertext,
        value_iv: cipher.iv,
        value_tag: cipher.tag
      };
      if (existing) {
        await store.update("langgraph_checkpoint_writes", values, { id: existing.id });
      } else {
        await store.insert("langgraph_checkpoint_writes", {
          id: newRowId("ckw"),
          ...values,
          created_at: new Date().toISOString()
        });
      }
    }
  }

  async deleteThread(threadId) {
    const store = await this.store();
    assertThreadId(threadId);
    await store.all("DELETE FROM langgraph_checkpoint_writes WHERE thread_id = ?;", [threadId]);
    await store.all("DELETE FROM langgraph_checkpoints WHERE thread_id = ?;", [threadId]);
  }

  // Resume-gate support (#17): the runtime_versions stamped on the newest checkpoint of a
  // thread. Returns null when the thread has no checkpoint.
  async runtimeVersionsForThread(threadId, checkpointNs = "") {
    const store = await this.store();
    const row = await store.get(
      `SELECT runtime_versions_json FROM langgraph_checkpoints
        WHERE thread_id = ? AND checkpoint_ns = ?
        ORDER BY checkpoint_id DESC LIMIT 1;`,
      [threadId, checkpointNs]
    );
    if (!row) return null;
    try {
      return JSON.parse(row.runtime_versions_json || "{}");
    } catch {
      return {};
    }
  }
}
