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
  await upsertById(store, "workflow_runs", runId, {
    user_id: user?.id ?? state.user_id,
    session_id: session?.id ?? state.session_id ?? null,
    workflow_key: state.workflow ?? "unknown",
    journey_stage: state.workflow_route?.journeyStage ?? state.journey_plan?.journey ?? "unknown",
    status: "started",
    route_reason: state.route_reason ?? "shadow_ledger",
    started_at: nowIso(),
    process_id: null,
    last_checkpoint_boundary: null
  });

  const reached = reachedBoundaries(state);
  let order = 0;
  for (const boundary of RUN_LEDGER_BOUNDARIES) {
    if (!reached.includes(boundary)) {
      order += 1;
      continue;
    }
    await upsertById(store, "workflow_checkpoint_runs", `ckpt:${graphTraceId}:${boundary}`, {
      workflow_run_id: runId,
      process_id: null,
      process_step_id: `step:adhoc:${boundary}`,
      checkpoint_boundary: boundary,
      step_order: order,
      status: "completed",
      effect_stage: "after_effect",
      session_checkpoint_id: sessionCheckpointId
    });
    order += 1;
  }
  await store.update("workflow_runs", { last_checkpoint_boundary: reached.at(-1) ?? null, updated_at: nowIso() }, { id: runId });
  return { mode: "shadow", runId, boundaries: reached };
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

  // Resume target R = first boundary not done.
  const resumeTarget = RUN_LEDGER_BOUNDARIES.find((b) => !isDone(b)) ?? null;
  if (!resumeTarget) {
    await store.update("workflow_runs", { status: "completed", updated_at: nowIso() }, { id: runId });
    return { ok: true, resumeTarget: null, skipped: [...RUN_LEDGER_BOUNDARIES], toReplay: [], rePlanned, invalidCaps, alreadyComplete: true };
  }
  const startIdx = RUN_LEDGER_BOUNDARIES.indexOf(resumeTarget);
  const skipped = RUN_LEDGER_BOUNDARIES.slice(0, startIdx).filter(isDone);
  const toReplay = RUN_LEDGER_BOUNDARIES.slice(startIdx);

  // Replay downstream only. before_worker re-dispatch is idempotent (no duplicate effect).
  let dispatch = null;
  for (const boundary of toReplay) {
    if (boundary === "before_worker" && dispatchFn) {
      const existing = byBoundary.get("before_worker");
      dispatch = await dispatchOnce(
        store,
        { workflowRunId: runId, idempotencyKey: existing?.idempotency_key ?? `resume:${runId}:before_worker`, sessionCheckpointId: existing?.session_checkpoint_id ?? null },
        dispatchFn
      );
    } else {
      const row = byBoundary.get(boundary);
      if (row) {
        await store.update("workflow_checkpoint_runs", { status: "completed", effect_stage: "after_effect", updated_at: nowIso() }, { id: row.id });
      }
    }
  }
  await store.update(
    "workflow_runs",
    { status: "completed", resume_count: (run.resume_count ?? 0) + 1, last_checkpoint_boundary: "after_response", updated_at: nowIso() },
    { id: runId }
  );
  return { ok: true, resumeTarget, skipped, toReplay, rePlanned, invalidCaps, dispatch };
}
