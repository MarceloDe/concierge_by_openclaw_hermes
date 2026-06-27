import { nowIso } from "./database.mjs";

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
