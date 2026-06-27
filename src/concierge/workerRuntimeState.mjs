import { createRuntimeContextCache } from "./runtimeContextCache.mjs";

// Stateful OpenClaw worker runtime: a per-session worker state persisted to the
// runtime cache (Redis) and READ BACK across dispatches/turns/processes, keyed to
// the LangGraph thread. This is the worker analogue of the capability-portfolio
// pointer layer: the worker resumes with prior observations instead of restarting
// context-blind. The authoritative record remains the DB (worker_continuations,
// source pointers, audit); Redis is the fast resumable runtime layer.
export const WORKER_RUNTIME_STATE_VERSION = "2026-06-27.worker-runtime-state.v1";

export function workerRuntimeStateKey(sessionId) {
  return `brainsty:worker-state:${sessionId}`;
}

export async function readWorkerRuntimeState(sessionId) {
  const cache = createRuntimeContextCache();
  const key = workerRuntimeStateKey(sessionId);
  try {
    const prior = await cache.adapter.get(key);
    return { cacheBackend: cache.backend, cacheKey: key, status: prior ? "hit" : "miss", cacheHit: Boolean(prior), prior: prior ?? null };
  } catch (error) {
    return { cacheBackend: cache.backend, cacheKey: key, status: "error", cacheHit: false, prior: null, error: error.message };
  }
}

// Append the latest dispatch to a bounded history and persist. Returns the new
// state plus the prior state it resumed from (so callers can trace the resume).
export async function recordWorkerDispatchState({ sessionId, threadId = null, dispatch, ttlSeconds = 1800, historyLimit = 10 }) {
  const cache = createRuntimeContextCache();
  const key = workerRuntimeStateKey(sessionId);
  let prior = null;
  try {
    prior = await cache.adapter.get(key);
  } catch {
    prior = null;
  }
  const priorHistory = Array.isArray(prior?.dispatchHistory) ? prior.dispatchHistory : [];
  const dispatchHistory = [...priorHistory, dispatch].slice(-historyLimit);
  const next = {
    version: WORKER_RUNTIME_STATE_VERSION,
    sessionId,
    threadId: threadId ?? prior?.threadId ?? null,
    dispatchCount: (prior?.dispatchCount ?? 0) + 1,
    latestDispatch: dispatch,
    dispatchHistory,
    updatedAt: dispatch?.dispatchedAt ?? null
  };
  let stored = false;
  let storeError = null;
  try {
    await cache.adapter.set(key, next, { ttlSeconds });
    stored = true;
  } catch (error) {
    storeError = error.message;
  }
  return {
    cacheBackend: cache.backend,
    cacheKey: key,
    stored,
    storeError,
    resumedFrom: prior
      ? { dispatchCount: prior.dispatchCount ?? 0, latestDispatch: prior.latestDispatch ?? null }
      : null,
    state: next
  };
}
