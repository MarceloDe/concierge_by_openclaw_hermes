import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import {
  createResearchSchedulerDaemon,
  ensureResearchSchedulerDaemonState,
  getResearchSchedulerDaemonStatus,
  RESEARCH_SCHEDULER_DAEMON_VERSION,
  runResearchSchedulerDaemonTick
} from "../concierge/researchScheduler.mjs";
import {
  createResearchSchedule,
  getResearchRun,
  proposeResearchSource,
  reviewResearchSource
} from "../concierge/researchOps.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-research-scheduler-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

async function createApprovedDueSchedule(store, actorUserId = "operator_scheduler_daemon") {
  const proposed = await proposeResearchSource(store, {
    actorUserId,
    url: "https://example.invalid/scheduler-daemon-source",
    title: "Scheduler Daemon Source"
  });
  await reviewResearchSource(store, {
    sourceId: proposed.source.id,
    actorUserId,
    decision: "approved",
    reason: "Approved for scheduler daemon proof."
  });
  const schedule = await createResearchSchedule(store, {
    actorUserId,
    sourceId: proposed.source.id,
    scheduleLabel: "Daemon Proof Nightly Refresh",
    intervalHours: 24,
    nextRunAt: "2026-06-01T00:00:00.000Z",
    topic: "Daemon benefits source refresh",
    workflowKey: "general_rag",
    query: { q: "daemon benefits" }
  });
  return { proposed, schedule };
}

test("research scheduler daemon tick queues due approved schedules and records proof", async () => {
  const store = await createStore();
  const actorUserId = "operator_scheduler_daemon";
  const { schedule } = await createApprovedDueSchedule(store, actorUserId);

  const tick = await runResearchSchedulerDaemonTick(store, {
    enabled: true,
    actorUserId,
    intervalMs: 60_000,
    tickLimit: 5,
    now: "2026-06-01T00:00:00.000Z",
    trigger: "unit_daemon_tick"
  });

  assert.equal(tick.ok, true);
  assert.equal(tick.version, RESEARCH_SCHEDULER_DAEMON_VERSION);
  assert.equal(tick.status, "tick_completed");
  assert.equal(tick.scheduler.processedCount, 1);
  assert.equal(tick.scheduler.blockedCount, 0);
  assert.equal(tick.processed[0].schedule.id, schedule.schedule.id);
  assert.equal(tick.processed[0].run.runType, "scheduled_research_run");
  assert.deepEqual(tick.scheduler.actionsTaken, [`queued:${tick.processed[0].run.id}`]);
  assert.equal(tick.daemon.status, "tick_completed");
  assert.equal(tick.daemon.lastProcessedCount, 1);
  assert.equal(tick.daemon.tickCount, 1);
  assert.equal(tick.audit.eventType, "research_scheduler_daemon_tick_completed");
  assert.deepEqual(tick.runtimeEvents.map((event) => event.eventType), [
    "research.scheduler.daemon.tick_started",
    "research.scheduler.daemon.tick_completed"
  ]);

  const detail = await getResearchRun(store, { runId: tick.processed[0].run.id });
  assert.equal(detail.run.query.scheduledAutomation, true);
  assert.equal(detail.run.metadata.scheduledRun, true);
  assert.equal(detail.run.metadata.scheduleId, schedule.schedule.id);

  const persisted = await store.findOne("research_scheduler_daemon_state", { daemon_key: "research_scheduler_daemon_default" });
  assert.equal(persisted.status, "tick_completed");
  assert.equal(Number(persisted.tick_count), 1);

  const runtimeRows = await store.all("SELECT event_type FROM runtime_events WHERE source = 'research_scheduler_daemon' ORDER BY created_at ASC;");
  assert.deepEqual(runtimeRows.map((row) => row.event_type), [
    "research.scheduler.daemon.tick_started",
    "research.scheduler.daemon.tick_completed"
  ]);
  const auditRows = await store.all("SELECT event_type FROM audit_events WHERE event_type LIKE 'research_scheduler_daemon_%' ORDER BY created_at ASC;");
  assert.ok(auditRows.some((row) => row.event_type === "research_scheduler_daemon_tick_completed"));
});

test("research scheduler disabled status is visible and takes no hidden action", async () => {
  const store = await createStore();
  const state = await ensureResearchSchedulerDaemonState(store, {
    enabled: false,
    actorUserId: "operator_scheduler_disabled",
    intervalMs: 60_000,
    tickLimit: 5
  });
  assert.equal(state.status, "disabled");
  assert.equal(state.enabled, false);

  const status = await getResearchSchedulerDaemonStatus(store, {
    enabled: false,
    actorUserId: "operator_scheduler_disabled",
    intervalMs: 60_000,
    tickLimit: 5,
    processStatus: "disabled"
  });
  assert.equal(status.ok, true);
  assert.equal(status.daemon.status, "disabled");
  assert.equal(status.daemon.runtime.processStatus, "disabled");
  assert.equal(status.safety.onlyApprovedSchedules, true);
  assert.equal(status.safety.hiddenWorkerDispatch, false);

  const runtimeRows = await store.get("SELECT COUNT(*) AS count FROM runtime_events WHERE source = 'research_scheduler_daemon';");
  assert.equal(runtimeRows.count, 0);
});

test("research scheduler daemon start can run an automatic due scan", async () => {
  const store = await createStore();
  const actorUserId = "operator_scheduler_autostart";
  await createApprovedDueSchedule(store, actorUserId);

  const daemon = createResearchSchedulerDaemon(store, {
    enabled: true,
    actorUserId,
    intervalMs: 60_000,
    tickLimit: 5,
    runOnStart: true
  });

  try {
    const started = await daemon.start();
    assert.equal(started.daemon.runtime.processStatus, "running");
    const status = await daemon.status();
    assert.equal(status.daemon.runtime.intervalHandleActive, true);
    assert.equal(status.daemon.lastProcessedCount, 1);
    assert.equal(status.daemon.tickCount, 1);
  } finally {
    await daemon.stop("unit_test_cleanup");
  }
});

test("research scheduler daemon overlap guard prevents duplicate ticks", async () => {
  const store = await createStore();
  let releaseRunner;
  const runnerWait = new Promise((resolve) => {
    releaseRunner = resolve;
  });
  const slowRunner = async () => {
    await runnerWait;
    return {
      ok: true,
      scheduler: {
        mode: "queue_due_runs",
        processedCount: 0,
        blockedCount: 0,
        actionsTaken: []
      },
      processed: [],
      blocked: []
    };
  };

  const first = runResearchSchedulerDaemonTick(store, {
    daemonKey: "research_scheduler_daemon_overlap",
    enabled: true,
    actorUserId: "operator_scheduler_overlap",
    intervalMs: 60_000,
    tickLimit: 5,
    runner: slowRunner
  });
  const overlap = await runResearchSchedulerDaemonTick(store, {
    daemonKey: "research_scheduler_daemon_overlap",
    enabled: true,
    actorUserId: "operator_scheduler_overlap",
    intervalMs: 60_000,
    tickLimit: 5,
    runner: slowRunner
  });
  releaseRunner();
  const completed = await first;

  assert.equal(overlap.status, "skipped_overlap");
  assert.equal(overlap.scheduler.processedCount, 0);
  assert.deepEqual(overlap.actionsTaken, []);
  assert.equal(completed.status, "tick_completed");

  const state = await store.findOne("research_scheduler_daemon_state", { daemon_key: "research_scheduler_daemon_overlap" });
  assert.equal(Number(state.overlap_skipped_count), 1);
  const overlapEvents = await store.get("SELECT COUNT(*) AS count FROM runtime_events WHERE event_type = 'research.scheduler.daemon.tick_skipped_overlap';");
  assert.equal(overlapEvents.count, 1);
});
