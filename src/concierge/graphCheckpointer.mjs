import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { MemorySaver } from "@langchain/langgraph";

export const GRAPH_CHECKPOINTER_VERSION = "2026-06-21.phase55-native-hitl-checkpointer.v1";

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

export class FileBackedMemorySaver extends MemorySaver {
  constructor({ path }) {
    super();
    this.path = path;
    this.loaded = false;
    this.persisting = Promise.resolve();
  }

  async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = JSON.parse(raw);
      this.storage = nullObject(decodeCheckpointValue(parsed.storage ?? {}));
      this.writes = nullObject(decodeCheckpointValue(parsed.writes ?? {}));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  async persist() {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const tmpPath = `${this.path}.tmp`;
    const payload = JSON.stringify(
      {
        version: GRAPH_CHECKPOINTER_VERSION,
        persistedAt: new Date().toISOString(),
        storage: encodeCheckpointValue(this.storage),
        writes: encodeCheckpointValue(this.writes)
      },
      null,
      2
    );
    await writeFile(tmpPath, payload, { mode: 0o600 });
    await rename(tmpPath, this.path);
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
    return {
      checkpointer: new FileBackedMemorySaver({ path }),
      readiness: {
        version: GRAPH_CHECKPOINTER_VERSION,
        mode: "file",
        durable: true,
        path,
        phiAtRest: "local_private_config_path_0600",
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
