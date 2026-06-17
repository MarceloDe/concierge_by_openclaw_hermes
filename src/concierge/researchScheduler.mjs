import { audit } from "./audit.mjs";
import { createId, nowIso } from "./database.mjs";
import { listResearchSchedules, RESEARCH_OPS_VERSION, runDueResearchSchedules } from "./researchOps.mjs";
import { publishRuntimeEvent } from "./runtimeEvents.mjs";

export const RESEARCH_SCHEDULER_DAEMON_VERSION = "2026-06-01.phase10t-research-scheduler-daemon.v1";
export const DEFAULT_RESEARCH_SCHEDULER_DAEMON_KEY = "research_scheduler_daemon_default";

const DAEMON_SOURCE = "research_scheduler_daemon";
const inFlightDaemonTicks = new Set();

function envFlag(name, env = process.env) {
  return ["1", "true", "yes", "on"].includes(String(env[name] ?? "").toLowerCase());
}

function intValue(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function json(value) {
  return JSON.stringify(value ?? {});
}

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function enabledInt(value) {
  return value ? 1 : 0;
}

export function researchSchedulerConfigFromEnv(env = process.env) {
  return {
    daemonKey: env.BRAINSTY_RESEARCH_SCHEDULER_KEY || DEFAULT_RESEARCH_SCHEDULER_DAEMON_KEY,
    enabled: envFlag("BRAINSTY_RESEARCH_SCHEDULER_ENABLED", env),
    intervalMs: intValue(env.BRAINSTY_RESEARCH_SCHEDULER_INTERVAL_MS, 5 * 60 * 1000, 1000, 24 * 60 * 60 * 1000),
    tickLimit: intValue(env.BRAINSTY_RESEARCH_SCHEDULER_LIMIT, 5, 1, 25),
    actorUserId: env.BRAINSTY_RESEARCH_SCHEDULER_ACTOR || "system_research_scheduler",
    executeDueRuns: envFlag("BRAINSTY_RESEARCH_SCHEDULER_EXECUTE", env),
    approvedWorkerDispatch: envFlag("BRAINSTY_RESEARCH_SCHEDULER_APPROVED_WORKER_DISPATCH", env),
    workerMode: env.BRAINSTY_RESEARCH_SCHEDULER_WORKER_MODE || null,
    runOnStart: envFlag("BRAINSTY_RESEARCH_SCHEDULER_RUN_ON_START", env)
  };
}

function normalizeConfig(options = {}) {
  const envConfig = researchSchedulerConfigFromEnv(options.env ?? process.env);
  return {
    ...envConfig,
    ...options,
    daemonKey: options.daemonKey || envConfig.daemonKey,
    enabled: Boolean(options.enabled ?? envConfig.enabled),
    intervalMs: intValue(options.intervalMs ?? envConfig.intervalMs, envConfig.intervalMs, 1000, 24 * 60 * 60 * 1000),
    tickLimit: intValue(options.tickLimit ?? options.limit ?? envConfig.tickLimit, envConfig.tickLimit, 1, 25),
    actorUserId: options.actorUserId ?? envConfig.actorUserId,
    executeDueRuns: Boolean(options.executeDueRuns ?? options.execute ?? envConfig.executeDueRuns),
    approvedWorkerDispatch: Boolean(options.approvedWorkerDispatch ?? envConfig.approvedWorkerDispatch),
    workerMode: options.workerMode ?? envConfig.workerMode ?? null,
    runOnStart: Boolean(options.runOnStart ?? envConfig.runOnStart)
  };
}

function normalizeDaemonRow(row, runtime = {}) {
  if (!row) return null;
  return {
    id: row.id,
    daemonKey: row.daemon_key,
    actorUserId: row.actor_user_id ?? null,
    status: row.status,
    enabled: Boolean(Number(row.enabled ?? 0)),
    intervalMs: Number(row.interval_ms ?? 0),
    tickLimit: Number(row.tick_limit ?? 0),
    executeDueRuns: Boolean(Number(row.execute_due_runs ?? 0)),
    approvedWorkerDispatch: Boolean(Number(row.approved_worker_dispatch ?? 0)),
    workerMode: row.worker_mode ?? null,
    lastTickAt: row.last_tick_at ?? null,
    lastTickEventId: row.last_tick_event_id ?? null,
    lastSuccessAt: row.last_success_at ?? null,
    lastFailureAt: row.last_failure_at ?? null,
    lastError: row.last_error ?? null,
    lastProcessedCount: Number(row.last_processed_count ?? 0),
    lastBlockedCount: Number(row.last_blocked_count ?? 0),
    lastActions: parseJson(row.last_actions_json, []),
    tickCount: Number(row.tick_count ?? 0),
    overlapSkippedCount: Number(row.overlap_skipped_count ?? 0),
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    runtime
  };
}

function schedulerSafety(config) {
  return {
    onlyApprovedSchedules: true,
    hiddenWorkerDispatch: false,
    defaultExecuteDueRuns: Boolean(config.executeDueRuns),
    approvedWorkerDispatchRequiredForAdaptiveModes: true
  };
}

async function updateDaemonState(store, daemonKey, patch) {
  await store.update(
    "research_scheduler_daemon_state",
    {
      ...patch,
      updated_at: nowIso()
    },
    { daemon_key: daemonKey }
  );
  return store.findOne("research_scheduler_daemon_state", { daemon_key: daemonKey });
}

export async function ensureResearchSchedulerDaemonState(store, options = {}) {
  const config = normalizeConfig(options);
  const existing = await store.findOne("research_scheduler_daemon_state", { daemon_key: config.daemonKey });
  const time = nowIso();
  if (!existing) {
    const row = {
      id: createId("research_scheduler_daemon"),
      daemon_key: config.daemonKey,
      actor_user_id: config.actorUserId,
      status: config.enabled ? "idle" : "disabled",
      enabled: enabledInt(config.enabled),
      interval_ms: config.intervalMs,
      tick_limit: config.tickLimit,
      execute_due_runs: enabledInt(config.executeDueRuns),
      approved_worker_dispatch: enabledInt(config.approvedWorkerDispatch),
      worker_mode: config.workerMode,
      last_tick_at: null,
      last_tick_event_id: null,
      last_success_at: null,
      last_failure_at: null,
      last_error: null,
      last_processed_count: 0,
      last_blocked_count: 0,
      last_actions_json: "[]",
      tick_count: 0,
      overlap_skipped_count: 0,
      metadata_json: json({
        version: RESEARCH_SCHEDULER_DAEMON_VERSION,
        researchOpsVersion: RESEARCH_OPS_VERSION,
        mode: "local_interval_due_scan",
        queuesOnlyApprovedSchedules: true,
        defaultAction: "queue_due_research_runs"
      }),
      created_at: time,
      updated_at: time
    };
    try {
      await store.insert("research_scheduler_daemon_state", row);
      return normalizeDaemonRow(row);
    } catch (error) {
      if (!String(error.message ?? "").includes("UNIQUE constraint failed")) throw error;
      const raced = await store.findOne("research_scheduler_daemon_state", { daemon_key: config.daemonKey });
      if (raced) return normalizeDaemonRow(raced);
      throw error;
    }
  }

  const nextStatus = config.enabled ? (existing.status === "disabled" ? "idle" : existing.status) : "disabled";
  const updated = await updateDaemonState(store, config.daemonKey, {
    actor_user_id: config.actorUserId,
    enabled: enabledInt(config.enabled),
    interval_ms: config.intervalMs,
    tick_limit: config.tickLimit,
    execute_due_runs: enabledInt(config.executeDueRuns),
    approved_worker_dispatch: enabledInt(config.approvedWorkerDispatch),
    worker_mode: config.workerMode,
    status: nextStatus,
    metadata_json: json({
      ...parseJson(existing.metadata_json, {}),
      version: RESEARCH_SCHEDULER_DAEMON_VERSION,
      researchOpsVersion: RESEARCH_OPS_VERSION,
      mode: "local_interval_due_scan",
      queuesOnlyApprovedSchedules: true,
      defaultAction: config.executeDueRuns ? "queue_and_execute_due_research_runs" : "queue_due_research_runs"
    })
  });
  return normalizeDaemonRow(updated);
}

export async function getResearchSchedulerDaemonStatus(store, options = {}) {
  const config = normalizeConfig(options);
  const daemon = await ensureResearchSchedulerDaemonState(store, config);
  const schedules = await listResearchSchedules(store, { limit: config.tickLimit });
  return {
    ok: true,
    version: RESEARCH_SCHEDULER_DAEMON_VERSION,
    daemon: {
      ...daemon,
      runtime: {
        processStatus: options.processStatus ?? (config.enabled ? "configured_idle" : "disabled"),
        startedAt: options.startedAt ?? null,
        nextTickAt: options.nextTickAt ?? null,
        intervalHandleActive: Boolean(options.intervalHandleActive)
      }
    },
    dueCount: schedules.dueCount,
    schedules: {
      dueCount: schedules.dueCount,
      activeCount: schedules.schedules.filter((item) => item.status === "active").length,
      loadedCount: schedules.schedules.length
    },
    safety: schedulerSafety(config)
  };
}

export async function runResearchSchedulerDaemonTick(store, options = {}) {
  const config = normalizeConfig(options);
  const daemonKey = config.daemonKey;
  if (inFlightDaemonTicks.has(daemonKey)) {
    await ensureResearchSchedulerDaemonState(store, config);
    const event = await publishRuntimeEvent(store, {
      source: DAEMON_SOURCE,
      eventType: "research.scheduler.daemon.tick_skipped_overlap",
      correlationId: daemonKey,
      payload: {
        daemonKey,
        actorUserId: config.actorUserId,
        reason: "tick_already_in_flight",
        actionsTaken: []
      }
    });
    const existing = await store.findOne("research_scheduler_daemon_state", { daemon_key: daemonKey });
    const updated = await updateDaemonState(store, daemonKey, {
      status: "overlap_skipped",
      last_tick_at: nowIso(),
      last_tick_event_id: event.id,
      overlap_skipped_count: Number(existing?.overlap_skipped_count ?? 0) + 1
    });
    const auditEvent = await audit(store, null, "research_scheduler_daemon_tick_skipped_overlap", {
      daemonKey,
      actorUserId: config.actorUserId,
      runtimeEventId: event.id,
      actionsTaken: []
    });
    return {
      ok: true,
      version: RESEARCH_SCHEDULER_DAEMON_VERSION,
      status: "skipped_overlap",
      daemon: normalizeDaemonRow(updated),
      scheduler: { mode: "overlap_guard", processedCount: 0, blockedCount: 0, actionsTaken: [] },
      runtimeEvents: [event],
      audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash },
      safety: schedulerSafety(config),
      actionsTaken: []
    };
  }

  inFlightDaemonTicks.add(daemonKey);
  await ensureResearchSchedulerDaemonState(store, config);
  const startedAt = options.now ?? nowIso();
  let startedEvent = null;
  try {
    const existing = await store.findOne("research_scheduler_daemon_state", { daemon_key: daemonKey });
    await updateDaemonState(store, daemonKey, {
      status: "running",
      last_tick_at: startedAt,
      metadata_json: json({
        ...parseJson(existing?.metadata_json, {}),
        lastTrigger: options.trigger ?? "manual_tick",
        lastStartedAt: startedAt
      })
    });
    startedEvent = await publishRuntimeEvent(store, {
      source: DAEMON_SOURCE,
      eventType: "research.scheduler.daemon.tick_started",
      correlationId: daemonKey,
      payload: {
        daemonKey,
        actorUserId: config.actorUserId,
        trigger: options.trigger ?? "manual_tick",
        executeDueRuns: config.executeDueRuns,
        tickLimit: config.tickLimit,
        actionsTaken: ["research_scheduler_due_scan_started"]
      }
    });

    const runner = options.runner ?? runDueResearchSchedules;
    const tick = await runner(store, {
      actorUserId: config.actorUserId,
      now: options.now ?? nowIso(),
      limit: config.tickLimit,
      execute: config.executeDueRuns,
      workerMode: config.workerMode,
      approvedWorkerDispatch: config.approvedWorkerDispatch
    });
    const completedAt = nowIso();
    const completedEvent = await publishRuntimeEvent(store, {
      source: DAEMON_SOURCE,
      eventType: "research.scheduler.daemon.tick_completed",
      correlationId: daemonKey,
      payload: {
        daemonKey,
        actorUserId: config.actorUserId,
        trigger: options.trigger ?? "manual_tick",
        processedCount: tick.scheduler?.processedCount ?? 0,
        blockedCount: tick.scheduler?.blockedCount ?? 0,
        actionsTaken: tick.scheduler?.actionsTaken ?? []
      }
    });
    const rowBeforeUpdate = await store.findOne("research_scheduler_daemon_state", { daemon_key: daemonKey });
    const updated = await updateDaemonState(store, daemonKey, {
      status: "tick_completed",
      last_tick_at: completedAt,
      last_tick_event_id: completedEvent.id,
      last_success_at: completedAt,
      last_error: null,
      last_processed_count: tick.scheduler?.processedCount ?? 0,
      last_blocked_count: tick.scheduler?.blockedCount ?? 0,
      last_actions_json: json(tick.scheduler?.actionsTaken ?? []),
      tick_count: Number(rowBeforeUpdate?.tick_count ?? 0) + 1
    });
    const auditEvent = await audit(store, null, "research_scheduler_daemon_tick_completed", {
      daemonKey,
      actorUserId: config.actorUserId,
      startedRuntimeEventId: startedEvent.id,
      completedRuntimeEventId: completedEvent.id,
      processedCount: tick.scheduler?.processedCount ?? 0,
      blockedCount: tick.scheduler?.blockedCount ?? 0,
      executeDueRuns: config.executeDueRuns,
      actionsTaken: tick.scheduler?.actionsTaken ?? []
    });
    return {
      ...tick,
      ok: true,
      version: RESEARCH_SCHEDULER_DAEMON_VERSION,
      status: "tick_completed",
      daemon: normalizeDaemonRow(updated),
      runtimeEvents: [startedEvent, completedEvent],
      audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash },
      safety: schedulerSafety(config)
    };
  } catch (error) {
    const failedAt = nowIso();
    const failedEvent = await publishRuntimeEvent(store, {
      source: DAEMON_SOURCE,
      eventType: "research.scheduler.daemon.tick_failed",
      correlationId: daemonKey,
      payload: {
        daemonKey,
        actorUserId: config.actorUserId,
        error: String(error.message ?? error).slice(0, 500),
        actionsTaken: []
      }
    });
    const updated = await updateDaemonState(store, daemonKey, {
      status: "tick_failed",
      last_tick_at: failedAt,
      last_tick_event_id: failedEvent.id,
      last_failure_at: failedAt,
      last_error: String(error.message ?? error).slice(0, 500),
      last_processed_count: 0,
      last_blocked_count: 0,
      last_actions_json: "[]"
    });
    await audit(store, null, "research_scheduler_daemon_tick_failed", {
      daemonKey,
      actorUserId: config.actorUserId,
      startedRuntimeEventId: startedEvent?.id ?? null,
      failedRuntimeEventId: failedEvent.id,
      error: String(error.message ?? error).slice(0, 500),
      actionsTaken: []
    });
    return {
      ok: false,
      version: RESEARCH_SCHEDULER_DAEMON_VERSION,
      status: "tick_failed",
      daemon: normalizeDaemonRow(updated),
      scheduler: { mode: "daemon_tick_failed", processedCount: 0, blockedCount: 0, actionsTaken: [] },
      runtimeEvents: [startedEvent, failedEvent].filter(Boolean),
      safety: schedulerSafety(config),
      error: String(error.message ?? error)
    };
  } finally {
    inFlightDaemonTicks.delete(daemonKey);
  }
}

export function createResearchSchedulerDaemon(store, options = {}) {
  const config = normalizeConfig(options);
  let intervalHandle = null;
  let startedAt = null;
  let nextTickAt = null;

  function computeNextTickAt() {
    return new Date(Date.now() + config.intervalMs).toISOString();
  }

  async function status() {
    return getResearchSchedulerDaemonStatus(store, {
      ...config,
      processStatus: !config.enabled ? "disabled" : intervalHandle ? "running" : "stopped",
      startedAt,
      nextTickAt,
      intervalHandleActive: Boolean(intervalHandle)
    });
  }

  async function tickOnce(overrides = {}) {
    const result = await runResearchSchedulerDaemonTick(store, {
      ...config,
      ...overrides,
      trigger: overrides.trigger ?? "daemon_tick_once"
    });
    if (intervalHandle) nextTickAt = computeNextTickAt();
    return result;
  }

  async function start(overrides = {}) {
    if (!config.enabled) {
      await ensureResearchSchedulerDaemonState(store, config);
      return status();
    }
    if (intervalHandle) return status();
    startedAt = nowIso();
    nextTickAt = computeNextTickAt();
    await ensureResearchSchedulerDaemonState(store, config);
    await updateDaemonState(store, config.daemonKey, { status: "idle" });
    await publishRuntimeEvent(store, {
      source: DAEMON_SOURCE,
      eventType: "research.scheduler.daemon.started",
      correlationId: config.daemonKey,
      payload: {
        daemonKey: config.daemonKey,
        actorUserId: config.actorUserId,
        intervalMs: config.intervalMs,
        tickLimit: config.tickLimit,
        executeDueRuns: config.executeDueRuns,
        actionsTaken: ["research_scheduler_daemon_started"]
      }
    });
    await audit(store, null, "research_scheduler_daemon_started", {
      daemonKey: config.daemonKey,
      actorUserId: config.actorUserId,
      intervalMs: config.intervalMs,
      tickLimit: config.tickLimit,
      executeDueRuns: config.executeDueRuns
    });
    intervalHandle = setInterval(() => {
      nextTickAt = computeNextTickAt();
      void tickOnce({ trigger: "daemon_interval" });
    }, config.intervalMs);
    intervalHandle.unref?.();
    if (overrides.runOnStart ?? config.runOnStart) {
      await tickOnce({ trigger: "daemon_startup" });
    }
    return status();
  }

  async function stop(reason = "operator_or_shutdown_stop") {
    if (intervalHandle) clearInterval(intervalHandle);
    intervalHandle = null;
    nextTickAt = null;
    await ensureResearchSchedulerDaemonState(store, config);
    const updated = await updateDaemonState(store, config.daemonKey, {
      status: config.enabled ? "stopped" : "disabled",
      metadata_json: json({
        version: RESEARCH_SCHEDULER_DAEMON_VERSION,
        stoppedAt: nowIso(),
        stopReason: reason
      })
    });
    await publishRuntimeEvent(store, {
      source: DAEMON_SOURCE,
      eventType: "research.scheduler.daemon.stopped",
      correlationId: config.daemonKey,
      payload: {
        daemonKey: config.daemonKey,
        actorUserId: config.actorUserId,
        reason,
        actionsTaken: ["research_scheduler_daemon_stopped"]
      }
    });
    return {
      ok: true,
      version: RESEARCH_SCHEDULER_DAEMON_VERSION,
      daemon: normalizeDaemonRow(updated, {
        processStatus: config.enabled ? "stopped" : "disabled",
        startedAt,
        nextTickAt,
        intervalHandleActive: false
      })
    };
  }

  return {
    config,
    start,
    stop,
    status,
    tickOnce
  };
}
