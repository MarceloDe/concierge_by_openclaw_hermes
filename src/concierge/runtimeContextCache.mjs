import { createHash } from "node:crypto";
import net from "node:net";
import tls from "node:tls";

export const RUNTIME_CONTEXT_CACHE_VERSION = "2026-06-26.phase77-runtime-context-cache.v1";

const memoryStore = new Map();

function sha(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function compact(value, limit = 420) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function encodeRespCommand(args) {
  return `*${args.length}\r\n${args.map((arg) => {
    const value = String(arg);
    return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
  }).join("")}`;
}

function parseRespAt(buffer, offset = 0) {
  const type = buffer[offset];
  const lineEnd = buffer.indexOf("\r\n", offset);
  if (lineEnd < 0) return null;
  const header = buffer.slice(offset + 1, lineEnd);
  if (type === "+" || type === ":") return { value: type === ":" ? Number(header) : header, offset: lineEnd + 2 };
  if (type === "-") {
    const error = new Error(header);
    error.redis = true;
    throw error;
  }
  if (type === "$") {
    const len = Number(header);
    if (len < 0) return { value: null, offset: lineEnd + 2 };
    const start = lineEnd + 2;
    const end = start + len;
    if (buffer.length < end + 2) return null;
    return { value: buffer.slice(start, end), offset: end + 2 };
  }
  if (type === "*") {
    const count = Number(header);
    let nextOffset = lineEnd + 2;
    const value = [];
    for (let index = 0; index < count; index += 1) {
      const parsed = parseRespAt(buffer, nextOffset);
      if (!parsed) return null;
      value.push(parsed.value);
      nextOffset = parsed.offset;
    }
    return { value, offset: nextOffset };
  }
  throw new Error(`unsupported_redis_resp_type:${type}`);
}

function parseRespAll(buffer) {
  const values = [];
  let offset = 0;
  while (offset < buffer.length) {
    const parsed = parseRespAt(buffer, offset);
    if (!parsed) break;
    values.push(parsed.value);
    offset = parsed.offset;
  }
  return values;
}

class MinimalRedisClient {
  constructor(url, { timeoutMs = 3000 } = {}) {
    this.url = new URL(url);
    this.timeoutMs = timeoutMs;
  }

  async command(args) {
    const commands = [];
    if (this.url.password) {
      commands.push(["AUTH", decodeURIComponent(this.url.username || "default"), decodeURIComponent(this.url.password)]);
    }
    commands.push(args);
    const payload = commands.map(encodeRespCommand).join("");
    const useTls = this.url.protocol === "rediss:";
    const port = Number(this.url.port || (useTls ? 6380 : 6379));
    const host = this.url.hostname;
    return new Promise((resolve, reject) => {
      const chunks = [];
      const socket = (useTls ? tls : net).connect({ host, port, servername: host });
      const timer = setTimeout(() => {
        socket.destroy(new Error("redis_runtime_context_timeout"));
      }, this.timeoutMs);
      socket.once("connect", () => socket.write(payload));
      socket.on("data", (chunk) => {
        chunks.push(chunk);
        try {
          const values = parseRespAll(Buffer.concat(chunks).toString("utf8"));
          if (values.length >= commands.length) {
            clearTimeout(timer);
            socket.end();
            resolve(values.at(-1));
          }
        } catch (error) {
          clearTimeout(timer);
          socket.destroy();
          reject(error);
        }
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.once("close", () => clearTimeout(timer));
    });
  }

  async get(key) {
    const value = await this.command(["GET", key]);
    return value ? JSON.parse(value) : null;
  }

  async set(key, value, { ttlSeconds = 1800 } = {}) {
    await this.command(["SET", key, JSON.stringify(value), "EX", String(ttlSeconds)]);
    return true;
  }
}

class MemoryRuntimeCache {
  constructor() {
    this.backend = "memory";
  }

  async get(key) {
    const row = memoryStore.get(key);
    if (!row) return null;
    if (row.expiresAt && row.expiresAt < Date.now()) {
      memoryStore.delete(key);
      return null;
    }
    return row.value;
  }

  async set(key, value, { ttlSeconds = 1800 } = {}) {
    memoryStore.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null
    });
    return true;
  }
}

class RedisRuntimeCache {
  constructor(url) {
    this.backend = "redis";
    this.client = new MinimalRedisClient(url);
  }

  get(key) {
    return this.client.get(key);
  }

  set(key, value, options) {
    return this.client.set(key, value, options);
  }
}

export function createRuntimeContextCache({ env = process.env } = {}) {
  const url = env.BRAINSTY_REDIS_URL || env.REDIS_URL || "";
  if (url) {
    return {
      version: RUNTIME_CONTEXT_CACHE_VERSION,
      backend: "redis",
      urlHash: sha(url).slice(0, 16),
      adapter: new RedisRuntimeCache(url)
    };
  }
  return {
    version: RUNTIME_CONTEXT_CACHE_VERSION,
    backend: "memory",
    urlHash: null,
    adapter: new MemoryRuntimeCache()
  };
}

export function runtimeContextKey(sessionId) {
  return `brainsty:runtime-context:${sessionId}`;
}

export function compactManagedCheckpoints(managedSession, { limit = 6 } = {}) {
  return (managedSession?.checkpoints ?? [])
    .slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, limit)
    .map((checkpoint) => {
      const state = checkpoint.state ?? {};
      const langgraph = state.langgraph ?? {};
      return {
        checkpointId: checkpoint.checkpoint_id ?? checkpoint.id,
        stepName: checkpoint.step_name,
        createdAt: checkpoint.created_at,
        stateVersion: state.session?.stateVersion ?? state.stateVersion ?? null,
        workflow: langgraph.workflow ?? state.workflow?.lastWorkflow ?? null,
        routeReason: langgraph.routeReason ?? null,
        contextPacketId: langgraph.contextPacketId ?? null,
        sourcePointerCount: Array.isArray(langgraph.sourcePointers) ? langgraph.sourcePointers.length : 0,
        evidenceObservationStatus: langgraph.evidenceObservationStatus ?? null
      };
    });
}

export function buildRuntimeContextManifest({ session, contextPacket, managedSession, previous = null }) {
  const achievedCheckpoints = compactManagedCheckpoints(managedSession);
  const latestCheckpoint = achievedCheckpoints[0] ?? null;
  const priorDecisionPointers = achievedCheckpoints
    .filter((checkpoint) => checkpoint.workflow || checkpoint.routeReason)
    .slice(0, 4)
    .map((checkpoint) => ({
      checkpointId: checkpoint.checkpointId,
      stepName: checkpoint.stepName,
      workflow: checkpoint.workflow,
      routeReason: checkpoint.routeReason,
      sourcePointerCount: checkpoint.sourcePointerCount,
      contextPacketId: checkpoint.contextPacketId
    }));
  const capabilitySummary = (contextPacket.workflowArchitecture?.routeCandidates ?? []).slice(0, 5).map((candidate) => ({
    workflowKey: candidate.workflowKey,
    routeScore: candidate.routeScore,
    executableNow: candidate.executableNow,
    missingDataPointerCount: candidate.missingDataPointers?.length ?? 0,
    disabledToolCount: candidate.disabledTools?.length ?? 0
  }));
  const manifest = {
    version: RUNTIME_CONTEXT_CACHE_VERSION,
    cacheKey: runtimeContextKey(session.id),
    sessionId: session.id,
    threadId: session.langgraph_thread_id,
    generatedAt: contextPacket.generatedAt,
    previousManifestHash: previous?.manifestHash ?? null,
    latestCheckpoint,
    achievedCheckpoints,
    priorDecisionPointers,
    promptCompaction: {
      strategy: "short_pointer_manifest_with_hydratable_cache_payload",
      checkpointLimit: achievedCheckpoints.length,
      contextPacketId: contextPacket.currentSession?.lastContextPacketId ?? null,
      userInputHash: sha(contextPacket.request?.userInput).slice(0, 16)
    },
    capabilitySummary
  };
  return {
    ...manifest,
    manifestHash: sha(JSON.stringify(manifest)).slice(0, 24)
  };
}

export async function loadRuntimeContextForSession(session) {
  const cache = createRuntimeContextCache();
  const key = runtimeContextKey(session.id);
  try {
    const previous = await cache.adapter.get(key);
    return {
      cache,
      key,
      previous,
      status: previous ? "hit" : "miss"
    };
  } catch (error) {
    return {
      cache,
      key,
      previous: null,
      status: "error",
      error: error.message
    };
  }
}

export async function storeRuntimeContextManifest({ cache, key, manifest, ttlSeconds = 1800 }) {
  try {
    await cache.adapter.set(key, manifest, { ttlSeconds });
    return {
      ok: true,
      backend: cache.backend,
      key,
      manifestHash: manifest.manifestHash,
      checkpointCount: manifest.achievedCheckpoints.length
    };
  } catch (error) {
    return {
      ok: false,
      backend: cache.backend,
      key,
      manifestHash: manifest.manifestHash,
      error: error.message
    };
  }
}
