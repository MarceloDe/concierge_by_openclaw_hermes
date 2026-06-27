import { safe_metadata } from "./redaction.mjs";
import { Langfuse } from "langfuse";

export const LANGFUSE_OBSERVABILITY_VERSION = "2026-06-27.langfuse-observability.v1";

let clientState = null;
let callbackHandlerPromise = null;
let overrideClient = undefined;

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());
}

function buildConfig(env = process.env) {
  const enabledRequested = truthy(env.LANGFUSE_ENABLED);
  const publicKey = env.LANGFUSE_PUBLIC_KEY || "";
  const secretKey = env.LANGFUSE_SECRET_KEY || "";
  const host = env.LANGFUSE_HOST || "http://localhost:3000";
  const configured = Boolean(publicKey && secretKey);
  return {
    version: LANGFUSE_OBSERVABILITY_VERSION,
    enabledRequested,
    configured,
    enabled: enabledRequested && configured,
    host,
    environment: env.LANGFUSE_ENVIRONMENT || env.NODE_ENV || "local",
    release: env.LANGFUSE_RELEASE || process.env.npm_package_version || "local",
    publicKey,
    secretKey
  };
}

function noopClient(config) {
  return {
    __noop: true,
    config,
    trace: () => ({
      id: null,
      traceId: null,
      span: () => ({ update() {}, end() {} }),
      generation: () => ({ update() {}, end() {} }),
      event: () => null,
      update: () => null,
      getTraceUrl: () => null
    }),
    span: () => ({ update() {}, end() {} }),
    event: () => null,
    flush: () => null,
    shutdown: () => null,
    async flushAsync() {},
    async shutdownAsync() {}
  };
}

export function resetLangfuseForTests() {
  clientState = null;
  callbackHandlerPromise = null;
  overrideClient = undefined;
}

export function setLangfuseClientForTests(client) {
  overrideClient = client;
  clientState = null;
  callbackHandlerPromise = null;
}

export function getLangfuseStatus(env = process.env) {
  const config = buildConfig(env);
  return {
    version: config.version,
    enabled: overrideClient !== undefined ? !overrideClient?.__noop : config.enabled,
    enabledRequested: config.enabledRequested,
    configured: config.configured,
    host: config.host,
    environment: config.environment,
    release: config.release,
    mode: config.enabled ? "langfuse_enabled" : config.enabledRequested ? "langfuse_disabled_missing_keys" : "langfuse_disabled"
  };
}

export function get_langfuse_client(env = process.env) {
  if (clientState) return clientState.client;
  const config = buildConfig(env);
  if (overrideClient !== undefined) {
    clientState = { config, client: overrideClient ?? noopClient(config) };
    return clientState.client;
  }
  if (!config.enabled) {
    clientState = { config, client: noopClient(config) };
    return clientState.client;
  }
  try {
    const client = new Langfuse({
      publicKey: config.publicKey,
      secretKey: config.secretKey,
      baseUrl: config.host,
      environment: config.environment,
      release: config.release,
      flushAt: 20,
      flushInterval: 10000
    });
    clientState = { config, client };
    return client;
  } catch {
    clientState = { config, client: noopClient(config) };
    return clientState.client;
  }
}

async function resolveClient() {
  return await get_langfuse_client();
}

export function is_langfuse_enabled(env = process.env) {
  return getLangfuseStatus(env).enabled;
}

export async function get_langchain_callback_handler() {
  if (!is_langfuse_enabled()) return null;
  if (!callbackHandlerPromise) {
    callbackHandlerPromise = import("langfuse-langchain")
      .then((module) => {
        const CallbackHandler = module.CallbackHandler ?? module.LangfuseCallbackHandler ?? module.default;
        return CallbackHandler ? new CallbackHandler({ root: awaitableClientProxy() }) : null;
      })
      .catch(() => null);
  }
  return callbackHandlerPromise;
}

function awaitableClientProxy() {
  return new Proxy(
    {},
    {
      get(_, prop) {
        return async (...args) => {
          const client = await resolveClient();
          if (typeof client?.[prop] === "function") return client[prop](...args);
          return null;
        };
      }
    }
  );
}

export async function createLangfuseTrace({ traceId = null, name = "agent.run", metadata = {}, input = null, userId = null, sessionId = null } = {}) {
  const client = await resolveClient();
  const resolved = client?.__noop ? client : client;
  if (!resolved?.trace) return null;
  return resolved.trace({
    id: traceId ?? undefined,
    name,
    userId: userId ?? undefined,
    sessionId: sessionId ?? undefined,
    metadata: safe_metadata(metadata),
    input
  });
}

export async function flush_langfuse() {
  const client = await resolveClient();
  if (typeof client?.flushAsync === "function") return client.flushAsync();
  if (typeof client?.flush === "function") return client.flush();
  return null;
}

export async function shutdown_langfuse() {
  const client = await resolveClient();
  if (typeof client?.shutdownAsync === "function") return client.shutdownAsync();
  if (typeof client?.shutdown === "function") return client.shutdown();
  return null;
}

export const getLangfuseClient = get_langfuse_client;
export const getLangChainCallbackHandler = get_langchain_callback_handler;
export const isLangfuseEnabled = is_langfuse_enabled;
export const flushLangfuse = flush_langfuse;
export const shutdownLangfuse = shutdown_langfuse;

export function langfuseStartupLine(env = process.env) {
  const status = getLangfuseStatus(env);
  return `[observability] Langfuse ${status.mode}; host=${status.host}; environment=${status.environment}; release=${status.release}; secrets=redacted`;
}
