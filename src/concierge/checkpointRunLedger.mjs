import { nowIso } from "./database.mjs";
import { dispatchOnce } from "./dispatchIdempotency.mjs";

// Per-(run, boundary) checkpoint ledger. In SHADOW mode it is write-only (records the
// boundaries a run reached) and never affects control flow; AUTHORITATIVE mode (Step 9)
// will drive resume. Boundaries follow the paper: after_policy_gate / after_planner /
// before_worker / after_evidence / after_response.
export const RUN_LEDGER_VERSION = "2026-06-27.checkpoint-run-ledger.v1";
export const RUN_LEDGER_BOUNDARIES = Object.freeze([
  "after_policy_gate",
  "after_planner",
  "before_worker",
  "after_evidence",
  "after_response"
]);

export function runLedgerMode(env = process.env) {
  return String(env.BRAINSTY_RUN_LEDGER ?? "off").toLowerCase(); // off | shadow | authoritative
}

// Process-driven runtime is default-ON; BRAINSTY_PROCESS_RUNTIME=off is the emergency kill-switch
// (falls back to the legacy fixed-boundary ledger/resume, never a gate).
export function processRuntimeEnabled(env = process.env) {
  return String(env.BRAINSTY_PROCESS_RUNTIME ?? "on").toLowerCase() !== "off";
}

// Resolve the process bound to a routed workflow: explicit workflow_key match wins, then the
// process:<workflow> convention, else null (legacy fixed-boundary behavior). Active+production only.
export async function selectProcessForWorkflow(store, workflowKey) {
  if (!workflowKey || !processRuntimeEnabled()) return null;
  let proc = await store.findOne("processes", { workflow_key: workflowKey, status: "active", lifecycle_state: "production" });
  if (!proc) proc = await store.findOne("processes", { process_key: `process:${workflowKey}`, status: "active", lifecycle_state: "production" });
  return proc ?? null;
}

async function processStepsFor(store, processId) {
  return store.all(
    "SELECT id, step_order, step_key, checkpoint_boundary, capability_id, requires_idempotency_key, on_failure_policy FROM process_steps WHERE process_id = ? ORDER BY step_order;",
    [processId]
  );
}

export function reachedBoundaries(state = {}) {
  const reached = [];
  if (state.policy_result) reached.push("after_policy_gate");
  if (state.llm_orchestration_decision) reached.push("after_planner");
  if (state.openclaw_worker_plan || (state.tool_calls?.length ?? 0) > 0) reached.push("before_worker");
  if (state.evidence_observation) reached.push("after_evidence");
  if (state.final_response) reached.push("after_response");
  return reached;
}

async function upsertById(store, table, id, row) {
  const existing = await store.findOne(table, { id });
  if (existing) {
    const { id: _id, created_at: _created, ...mutable } = row;
    await store.update(table, { ...mutable, updated_at: nowIso() }, { id });
    return id;
  }
  await store.insert(table, { id, ...row, created_at: nowIso(), updated_at: nowIso() });
  return id;
}

// Write-only shadow ledger for one completed run. Idempotent (deterministic ids), gated
// by the caller; wrapped by the caller so it can never break the orchestration.
export async function writeShadowCheckpointLedger(store, { user, session, state, graphTraceId, sessionCheckpointId = null }) {
  const runId = `wfrun:${graphTraceId}`;
  // Bind the process for the routed workflow (default-on). When bound, the ledger is driven by the
  // process's real ordered steps (real process_id + pstep:* ids); otherwise the legacy fixed
  // boundaries with synthetic step ids (back-compat for workflows without an authored process).
  const proc = await selectProcessForWorkflow(store, state.workflow);
  const steps = proc ? await processStepsFor(store, proc.id) : [];

  await upsertById(store, "workflow_runs", runId, {
    user_id: user?.id ?? state.user_id,
    session_id: session?.id ?? state.session_id ?? null,
    workflow_key: state.workflow ?? "unknown",
    journey_stage: state.workflow_route?.journeyStage ?? state.journey_plan?.journey ?? "unknown",
    status: "started",
    route_reason: state.route_reason ?? "shadow_ledger",
    started_at: nowIso(),
    process_id: proc?.id ?? null,
    last_checkpoint_boundary: null
  });

  const reached = reachedBoundaries(state);
  // Ledger rows: one per real process step when bound, else one per fixed boundary.
  const ledgerRows = proc
    ? steps.map((s) => ({ boundary: s.checkpoint_boundary, order: s.step_order, processStepId: s.id }))
    : RUN_LEDGER_BOUNDARIES.map((b, i) => ({ boundary: b, order: i, processStepId: `step:adhoc:${b}` }));

  for (const row of ledgerRows) {
    const done = reached.includes(row.boundary);
    await upsertById(store, "workflow_checkpoint_runs", `ckpt:${graphTraceId}:${row.boundary}`, {
      workflow_run_id: runId,
      process_id: proc?.id ?? null,
      process_step_id: row.processStepId,
      checkpoint_boundary: row.boundary,
      step_order: row.order,
      status: done ? "completed" : "pending",
      effect_stage: done ? "after_effect" : "before_effect",
      session_checkpoint_id: sessionCheckpointId
    });
  }
  await store.update("workflow_runs", { last_checkpoint_boundary: reached.at(-1) ?? null, updated_at: nowIso() }, { id: runId });
  return { mode: "shadow", runId, processId: proc?.id ?? null, processBound: Boolean(proc), boundaries: reached };
}

// ---------------------------------------------------------------------------
// Step 9: authoritative resume. Rerun ONLY unfinished boundaries; skip completed;
// a since-quarantined selected capability invalidates after_planner (re-plan);
// re-dispatch is idempotent (no second worker/portal session).
// ---------------------------------------------------------------------------

async function selectedCapabilitiesInvalid(store, selectedCapabilityKeys = []) {
  const invalid = [];
  for (const key of selectedCapabilityKeys) {
    const cap = await store.findOne("capabilities", { capability_key: key });
    if (!cap || cap.status !== "active" || cap.lifecycle_state !== "production") invalid.push(key);
  }
  return invalid;
}

export async function resumeRun(store, runId, { selectedCapabilityKeys = [], dispatchFn = null } = {}) {
  const run = await store.findOne("workflow_runs", { id: runId });
  if (!run) return { ok: false, reason: "run_not_found" };
  await store.update("workflow_runs", { status: "resuming", updated_at: nowIso() }, { id: runId });

  // Derive the ordered plan from the BOUND process (real steps + idempotency + failure policy);
  // fall back to the fixed boundaries for legacy runs with no process_id.
  let plan; // [{ boundary, processStepId, requiresIdem, onFailure }]
  if (run.process_id && processRuntimeEnabled()) {
    const steps = await processStepsFor(store, run.process_id);
    plan = steps.map((s) => ({
      boundary: s.checkpoint_boundary,
      processStepId: s.id,
      requiresIdem: Number(s.requires_idempotency_key) === 1,
      onFailure: s.on_failure_policy ?? "resume"
    }));
  }
  if (!plan || plan.length === 0) {
    plan = RUN_LEDGER_BOUNDARIES.map((b) => ({ boundary: b, processStepId: `step:adhoc:${b}`, requiresIdem: b === "before_worker", onFailure: "resume" }));
  }
  const order = plan.map((p) => p.boundary);

  const rows = await store.all(
    "SELECT * FROM workflow_checkpoint_runs WHERE workflow_run_id = ? ORDER BY step_order;",
    [runId]
  );
  const byBoundary = new Map(rows.map((r) => [r.checkpoint_boundary, r]));
  const isDone = (b) => ["completed", "skipped"].includes(byBoundary.get(b)?.status);

  // Re-plan trigger: a previously-selected capability is now quarantined/non-production.
  const invalidCaps = await selectedCapabilitiesInvalid(store, selectedCapabilityKeys);
  const rePlanned = invalidCaps.length > 0;
  if (rePlanned) {
    const planner = byBoundary.get("after_planner");
    if (planner) {
      await store.update("workflow_checkpoint_runs", { status: "pending", updated_at: nowIso() }, { id: planner.id });
      planner.status = "pending";
    }
  }

  // Resume target R = first planned step not done.
  const resumeTarget = order.find((b) => !isDone(b)) ?? null;
  if (!resumeTarget) {
    await store.update("workflow_runs", { status: "completed", updated_at: nowIso() }, { id: runId });
    return { ok: true, resumeTarget: null, skipped: [...order], toReplay: [], rePlanned, invalidCaps, alreadyComplete: true };
  }
  const startIdx = order.indexOf(resumeTarget);
  const skipped = order.slice(0, startIdx).filter(isDone);
  const toReplay = plan.slice(startIdx);

  // Replay downstream only. Idempotent steps re-dispatch via dispatchOnce (no duplicate effect);
  // on_failure_policy 'abort' fails the run loudly, 'resume' leaves it resumable.
  let dispatch = null;
  for (const step of toReplay) {
    if (step.requiresIdem && dispatchFn) {
      const existing = byBoundary.get(step.boundary);
      try {
        dispatch = await dispatchOnce(
          store,
          {
            workflowRunId: runId,
            idempotencyKey: existing?.idempotency_key ?? `resume:${runId}:${step.boundary}`,
            sessionCheckpointId: existing?.session_checkpoint_id ?? null,
            processId: run.process_id ?? null,
            processStepId: step.processStepId
          },
          dispatchFn
        );
      } catch (err) {
        if (step.onFailure === "abort") {
          await store.update("workflow_runs", { status: "failed", last_checkpoint_boundary: step.boundary, updated_at: nowIso() }, { id: runId });
          return { ok: false, reason: "step_failed_abort", failedBoundary: step.boundary, error: String(err?.message ?? err), rePlanned, invalidCaps };
        }
        return { ok: false, reason: "step_failed_resumable", resumeTarget: step.boundary, error: String(err?.message ?? err), rePlanned, invalidCaps };
      }
    } else {
      const row = byBoundary.get(step.boundary);
      if (row) {
        await store.update("workflow_checkpoint_runs", { status: "completed", effect_stage: "after_effect", updated_at: nowIso() }, { id: row.id });
      }
    }
  }
  await store.update(
    "workflow_runs",
    { status: "completed", resume_count: (run.resume_count ?? 0) + 1, last_checkpoint_boundary: order.at(-1), updated_at: nowIso() },
    { id: runId }
  );
  return { ok: true, resumeTarget, skipped, toReplay: toReplay.map((s) => s.boundary), rePlanned, invalidCaps, dispatch };
}
