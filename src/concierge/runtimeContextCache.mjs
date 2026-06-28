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

  async setNX(key, value, { ttlSeconds = 900 } = {}) {
    const result = await this.command(["SET", key, JSON.stringify(value), "NX", "EX", String(ttlSeconds)]);
    return result === "OK" || result === true;
  }

  async del(key) {
    const result = await this.command(["DEL", key]);
    return Number(result) || 0;
  }

  async ping() {
    const startedAt = Date.now();
    try {
      const result = await this.command(["PING"]);
      const healthy = result === "PONG" || /PONG/i.test(String(result));
      return { healthy, pingMs: Date.now() - startedAt };
    } catch (error) {
      return { healthy: false, pingMs: Date.now() - startedAt, error: error.message };
    }
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

  async setNX(key, value, { ttlSeconds = 900 } = {}) {
    const existing = await this.get(key);
    if (existing !== null) return false;
    await this.set(key, value, { ttlSeconds });
    return true;
  }

  async del(key) {
    return memoryStore.delete(key) ? 1 : 0;
  }

  async ping() {
    // Development-only backend; report unhealthy-for-production so readiness never
    // scores a process-local Map as Redis-backed.
    return { healthy: true, pingMs: 0, backend: "memory", productionReady: false };
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

  setNX(key, value, options) {
    return this.client.setNX(key, value, options);
  }

  del(key) {
    return this.client.del(key);
  }

  ping() {
    return this.client.ping();
  }
}

// Process-global cache hit/miss metrics. Real Redis design requires an observable
// hit/miss signal — these counters are surfaced at /api/health and proven in tests.
const runtimeCacheMetrics = { hits: 0, misses: 0, sets: 0, deletes: 0, errors: 0, lastBackend: null };
export function getRuntimeCacheMetrics() {
  const total = runtimeCacheMetrics.hits + runtimeCacheMetrics.misses;
  return { ...runtimeCacheMetrics, total, hitRate: total ? Number((runtimeCacheMetrics.hits / total).toFixed(4)) : null };
}
export function resetRuntimeCacheMetrics() {
  Object.assign(runtimeCacheMetrics, { hits: 0, misses: 0, sets: 0, deletes: 0, errors: 0 });
}

// Wrap an adapter so every get records a hit/miss and errors are counted (not hidden).
function instrument(adapter, backend) {
  runtimeCacheMetrics.lastBackend = backend;
  return {
    backend,
    async get(key) {
      try {
        const value = await adapter.get(key);
        if (value === null || value === undefined) runtimeCacheMetrics.misses += 1;
        else runtimeCacheMetrics.hits += 1;
        return value;
      } catch (error) { runtimeCacheMetrics.errors += 1; throw error; }
    },
    async set(key, value, options) { runtimeCacheMetrics.sets += 1; return adapter.set(key, value, options); },
    async setNX(key, value, options) { return adapter.setNX(key, value, options); },
    async del(key) { runtimeCacheMetrics.deletes += 1; return adapter.del(key); },
    ping() { return adapter.ping(); }
  };
}

export function createRuntimeContextCache({ env = process.env } = {}) {
  const url = env.BRAINSTY_REDIS_URL || env.REDIS_URL || "";
  if (url) {
    return {
      version: RUNTIME_CONTEXT_CACHE_VERSION,
      backend: "redis",
      urlHash: sha(url).slice(0, 16),
      adapter: instrument(new RedisRuntimeCache(url), "redis")
    };
  }
  return {
    version: RUNTIME_CONTEXT_CACHE_VERSION,
    backend: "memory",
    urlHash: null,
    adapter: instrument(new MemoryRuntimeCache(), "memory")
  };
}

// Whether a real Redis is mandatory in this environment (production, or explicit opt-in).
export function redisRequired(env = process.env) {
  if (String(env.BRAINSTY_REQUIRE_REDIS ?? "") === "1") return true;
  if (String(env.BRAINSTY_REQUIRE_REDIS ?? "") === "0") return false;
  const runtimeEnv = String(env.BRAINSTY_RUNTIME_ENV ?? env.NODE_ENV ?? env.APP_ENV ?? "").toLowerCase();
  return ["production", "prod", "staging", "production-candidate"].includes(runtimeEnv);
}

// Boot-time Redis runtime: verify startup connectivity (PING), prove a real write->read
// round-trip, and FAIL LOUD when Redis is required but unavailable or scored as memory.
// Returns a readiness object; never silently scores a process-local Map as Redis-backed.
export async function initializeRuntimeCache({ env = process.env } = {}) {
  const required = redisRequired(env);
  const cache = createRuntimeContextCache({ env });
  const ping = await cache.adapter.ping().catch((error) => ({ healthy: false, error: error.message }));
  const productionReady = cache.backend === "redis" && ping.healthy === true;

  let writeReadProbe = { ok: false };
  if (cache.backend === "redis" && ping.healthy) {
    const probeKey = `brainsty:runtime:boot-probe:${sha(String(Date.now() + Math.random())).slice(0, 10)}`;
    const token = sha(String(env.BRAINSTY_REDIS_URL ?? "") + probeKey).slice(0, 24);
    try {
      await cache.adapter.set(probeKey, { token, at: new Date().toISOString() }, { ttlSeconds: 60 });
      const readBack = await cache.adapter.get(probeKey);
      await cache.adapter.del(probeKey);
      writeReadProbe = { ok: readBack?.token === token, key: probeKey, wrote: token, readBack: readBack?.token ?? null };
    } catch (error) {
      writeReadProbe = { ok: false, error: error.message };
    }
  }

  const readiness = {
    version: RUNTIME_CONTEXT_CACHE_VERSION,
    backend: cache.backend,
    required,
    urlHash: cache.urlHash,
    ping,
    productionReady,
    writeReadProbe,
    metrics: getRuntimeCacheMetrics()
  };

  if (required && (!productionReady || !writeReadProbe.ok)) {
    const reason = cache.backend !== "redis" ? "no_redis_url_configured" : !ping.healthy ? "redis_ping_failed" : "redis_write_read_probe_failed";
    const error = new Error(`[runtime] Redis is required but not live (${reason}). Set BRAINSTY_REDIS_URL to a reachable Redis. Readiness: ${JSON.stringify(readiness)}`);
    error.readiness = readiness;
    throw error;
  }
  return readiness;
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
  const currentCheckpoints = compactManagedCheckpoints(managedSession);
  // Merge prior cached checkpoints (cross-turn / inter-session runtime memory)
  // with the freshly computed set so a resumed session inherits context from the
  // cache instead of rebuilding from scratch. Dedupe by checkpointId; DB-derived
  // current checkpoints win on conflict.
  const seen = new Set(currentCheckpoints.map((checkpoint) => checkpoint.checkpointId));
  let mergedFromPreviousCount = 0;
  const merged = [...currentCheckpoints];
  for (const prior of previous?.achievedCheckpoints ?? []) {
    if (prior?.checkpointId && !seen.has(prior.checkpointId)) {
      seen.add(prior.checkpointId);
      merged.push(prior);
      mergedFromPreviousCount += 1;
    }
  }
  const achievedCheckpoints = merged
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
    .slice(0, 12);
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
    mergedFromPreviousCount,
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
