import { audit } from "./audit.mjs";
import { nowIso } from "./database.mjs";
import { publishRuntimeEvent } from "./runtimeEvents.mjs";
import { RETENTION_POLICY_VERSION, sweepExpiredRuntimeState } from "./retentionPolicy.mjs";

export const RETENTION_SCHEDULER_VERSION = "2026-06-22.phase56-retention-scheduler.v1";
export const DEFAULT_RETENTION_SCHEDULER_KEY = "retention_sweeper_default";

function envFlag(name, env = process.env) {
  return ["1", "true", "yes", "on"].includes(String(env[name] ?? "").toLowerCase());
}

function intValue(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

export function retentionSchedulerConfigFromEnv(env = process.env) {
  return {
    schedulerKey: env.BRAINSTY_RETENTION_SWEEPER_KEY || DEFAULT_RETENTION_SCHEDULER_KEY,
    enabled: envFlag("BRAINSTY_RETENTION_SWEEPER_ENABLED", env),
    intervalMs: intValue(env.BRAINSTY_RETENTION_SWEEPER_INTERVAL_MS, 60 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    runOnStart: envFlag("BRAINSTY_RETENTION_SWEEPER_RUN_ON_START", env)
  };
}

function normalizeConfig(options = {}) {
  const envConfig = retentionSchedulerConfigFromEnv(options.env ?? process.env);
  return {
    ...envConfig,
    ...options,
    schedulerKey: options.schedulerKey || envConfig.schedulerKey,
    enabled: Boolean(options.enabled ?? envConfig.enabled),
    intervalMs: intValue(options.intervalMs ?? envConfig.intervalMs, envConfig.intervalMs, 60 * 1000, 24 * 60 * 60 * 1000),
    runOnStart: Boolean(options.runOnStart ?? envConfig.runOnStart)
  };
}

export function createRetentionSweepDaemon(store, options = {}) {
  const config = normalizeConfig(options);
  let intervalHandle = null;
  let inFlight = false;
  let lastTick = null;

  async function tickOnce({ trigger = "manual_tick", now = nowIso() } = {}) {
    if (inFlight) {
      const skipped = {
        version: RETENTION_SCHEDULER_VERSION,
        schedulerKey: config.schedulerKey,
        status: "overlap_skipped",
        trigger,
        now,
        actionsTaken: ["retention_sweeper_overlap_skipped"]
      };
      await publishRuntimeEvent(store, {
        source: "retention_sweeper_daemon",
        eventType: "retention.sweeper.tick_skipped_overlap",
        correlationId: config.schedulerKey,
        payload: skipped
      });
      return skipped;
    }
    inFlight = true;
    await publishRuntimeEvent(store, {
      source: "retention_sweeper_daemon",
      eventType: "retention.sweeper.tick_started",
      correlationId: config.schedulerKey,
      payload: {
        version: RETENTION_SCHEDULER_VERSION,
        schedulerKey: config.schedulerKey,
        trigger,
        now
      }
    });
    try {
      const sweep = await sweepExpiredRuntimeState(store, { now });
      const auditEvent = await audit(store, null, "retention.sweeper_scheduled_run_completed", {
        version: RETENTION_SCHEDULER_VERSION,
        retentionPolicyVersion: RETENTION_POLICY_VERSION,
        schedulerKey: config.schedulerKey,
        trigger,
        now,
        sweep
      });
      lastTick = {
        version: RETENTION_SCHEDULER_VERSION,
        schedulerKey: config.schedulerKey,
        status: "tick_completed",
        trigger,
        now,
        sweep,
        auditEventId: auditEvent.id,
        auditEventHash: auditEvent.event_hash,
        actionsTaken: ["retention_sweeper_executed", "retention_sweeper_audit_created"]
      };
      await publishRuntimeEvent(store, {
        source: "retention_sweeper_daemon",
        eventType: "retention.sweeper.tick_completed",
        correlationId: config.schedulerKey,
        payload: lastTick
      });
      return lastTick;
    } finally {
      inFlight = false;
    }
  }

  async function start() {
    if (!config.enabled) {
      return status("disabled");
    }
    if (intervalHandle) return status("already_running");
    if (config.runOnStart) await tickOnce({ trigger: "daemon_startup" });
    intervalHandle = setInterval(() => {
      void tickOnce({ trigger: "daemon_interval" });
    }, config.intervalMs);
    return status("running");
  }

  async function stop(reason = "manual_stop") {
    if (intervalHandle) clearInterval(intervalHandle);
    intervalHandle = null;
    return status(reason);
  }

  function status(statusOverride = null) {
    return {
      version: RETENTION_SCHEDULER_VERSION,
      schedulerKey: config.schedulerKey,
      status: statusOverride ?? (intervalHandle ? "running" : config.enabled ? "idle" : "disabled"),
      enabled: config.enabled,
      intervalMs: config.intervalMs,
      runOnStart: config.runOnStart,
      intervalHandleActive: Boolean(intervalHandle),
      inFlight,
      lastTick,
      safety: {
        hiddenExecution: false,
        auditRequired: true,
        rawPhiReturned: false
      }
    };
  }

  return { config, tickOnce, start, stop, status };
}
