// Phase 87 hermetic proofs (plan §7 / §11) — REAL SQLite + seed v4, real graph runs
// with recorded replays (no live LLM), in-memory cache pinned. Covers: the write-worker
// registry/catalog split (§7.0 a-c), the dispatch-trigger replacement (planner-driven,
// continuation, quarantined-arm negative), and the §7.0 hydrator/normalizer refusals.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { hydrateCapabilityPointer, catalogPortfolioKey, loadSessionPortfolio } from "../concierge/capabilityCatalog.mjs";
import { normalizeLlmOrchestrationDecision, applyDecisionCapabilityGates } from "../concierge/llmOrchestrationDecision.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";

process.env.BRAINSTY_REDIS_URL = "";
process.env.REDIS_URL = "";

async function seededStore(prefix) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const store = await new SqliteStore(join(dir, "t.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  return store;
}

test("Phase 87 §7.0 split (a): write workers are Capability Registry rows — planned, runtime_selectable=0, exposure contract present", async () => {
  const store = await seededStore("brainsty-p87-split-");
  for (const key of ["tool:openclaw_claim_submission_worker", "tool:openclaw_form_filler", "tool:openclaw_provider_scheduler"]) {
    const row = await store.findOne("capabilities", { capability_key: key });
    assert.ok(row, `${key} must exist in the registry`);
    assert.equal(Number(row.runtime_selectable), 0, `${key} must be fail-closed non-selectable`);
    assert.ok(["planned", "contract_ready"].includes(row.registry_status));
    const exposure = JSON.parse(row.planner_exposure_json);
    assert.ok(exposure.planner_may?.length > 0, "exposure contract planner_may present");
    assert.ok(exposure.planner_must_not?.some((rule) => /claim (the action was performed|the form was submitted|an appointment was booked)/i.test(rule)));
  }
  // promptTable surfaces them HONESTLY when present: notYetExecutable + exposure.
  const { session } = await enrollDefaultMember(store);
  const portfolio = await loadSessionPortfolio(store, { sessionId: session.id });
  const planned = portfolio.manifest.promptTable.find((row) => row.portfolioId === "tool:openclaw_claim_submission_worker");
  assert.ok(planned, "write worker appears in the manifest table");
  assert.equal(planned.notYetExecutable, true);
  assert.equal(planned.runtimeSelectable, 0);
  assert.ok(planned.plannerExposure.planner_must_not.length > 0);
});

test("Phase 87 §7.0 split (b): normalizer REJECTS a write worker selected as executable — tool_not_runtime_selectable", async () => {
  const store = await seededStore("brainsty-p87-norm-");
  const row = await store.findOne("capabilities", { capability_key: "tool:openclaw_claim_submission_worker" });
  const decision = normalizeLlmOrchestrationDecision({
    classification: { workflow: "claim_status_navigation", taskClass: "claims_support", intent: "claim_submission", confidence: 0.9, rationale: "write intent" },
    data_layer: ["layer_3_portal_control"],
    risk_tier: "high",
    selected_tools: { capabilityPointers: ["brainsty:capability-catalog:s1#tool:openclaw_claim_submission_worker"] },
    response: { responseStrategy: "answer", workerGoal: "submit claim" }
  }, {
    allowedWorkflows: ["claim_status_navigation"],
    offerableProcessIds: [],
    knownCapabilityKeys: ["tool:openclaw_claim_submission_worker"],
    selectedCapabilityRows: [{ capabilityKey: "tool:openclaw_claim_submission_worker", runtime_selectable: Number(row.runtime_selectable), riskLevel: row.risk_level }]
  });
  assert.equal(decision.valid, false);
  assert.ok(decision.issues.some((issue) => issue.startsWith("tool_not_runtime_selectable:")));
  // Same gate post-hydration (ONE implementation).
  const gated = applyDecisionCapabilityGates(decision, { selectedCapabilityRows: [{ capabilityKey: "tool:openclaw_claim_submission_worker", runtime_selectable: 0 }] });
  assert.ok(gated.issues.some((issue) => issue.startsWith("tool_not_runtime_selectable:")));
});

test("Phase 87 §7.0 split (c): the hydrator refuses the write worker — never in the dispatchable set", async () => {
  const store = await seededStore("brainsty-p87-hyd-");
  const { session } = await enrollDefaultMember(store);
  const pointer = `${catalogPortfolioKey(session.id)}#tool:openclaw_claim_submission_worker`;
  const refusal = await hydrateCapabilityPointer(store, { pointer });
  assert.equal(refusal.resolved, false);
  assert.equal(refusal.reason, "capability_not_runtime_selectable");
});

test("Phase 87: planner-selected observation dispatches with NO client flag present", async () => {
  const store = await seededStore("brainsty-p87-dispatch-");
  const { user, session } = await enrollDefaultMember(store);
  const pointer = `${catalogPortfolioKey(session.id)}#skill:insurance_portal_browser`;
  const result = await runLangGraphOrchestration(store, {
    user, session, channel: session.channel,
    userInput: "check my benefits on the portal",
    rawMessage: {
      source: "phase87_dispatch_test", useLiveModel: false,
      // NO executeEvidenceObservation, NO legacy worker flag — the DECISION drives it.
      llmOrchestrationDecisionReplay: {
        workflow: "payer_portal_read_only_extraction", intent: "portal_lookup", confidence: 0.9,
        rationale: "replay", workerGoal: "read-only observation",
        selectedCapabilityPointers: [pointer]
      }
    }
  });
  const hydrated = result.state.hydrated_capabilities;
  assert.equal(hydrated.resolvedCount, 1, "planner pointer must hydrate");
  const observation = result.state.evidence_observation;
  assert.ok(observation, "evidence observation node must RUN on the planner trigger (no client flag)");
  // The dispatch path was ENTERED (not skipped): the runner attempted the official
  // read-only observation and reported a classified status (no live portal here).
  assert.notEqual(observation.status, undefined);
  assert.ok(
    !["skipped"].includes(observation.status),
    `observation must not be skipped; got ${observation.status}`
  );
});

test("Phase 87: quarantined capability produces NO dispatch (hydration refuses, trigger absent)", async () => {
  const store = await seededStore("brainsty-p87-quarantine-");
  const { user, session } = await enrollDefaultMember(store);
  await store.all("UPDATE capabilities SET status = 'quarantined' WHERE capability_key = 'skill:insurance_portal_browser';");
  const { evictCatalogMirror } = await import("../concierge/capabilityCatalog.mjs").then((m) => ({ evictCatalogMirror: m.evictCatalogMirror ?? null }));
  const pointer = `${catalogPortfolioKey(session.id)}#skill:insurance_portal_browser`;
  const refusal = await hydrateCapabilityPointer(store, { pointer });
  assert.equal(refusal.resolved, false, "quarantined capability must refuse hydration");
  const result = await runLangGraphOrchestration(store, {
    user, session, channel: session.channel,
    userInput: "check my benefits on the portal",
    rawMessage: {
      source: "phase87_quarantine_test", useLiveModel: false,
      llmOrchestrationDecisionReplay: {
        workflow: "payer_portal_read_only_extraction", intent: "portal_lookup", confidence: 0.9,
        rationale: "replay", workerGoal: "read-only observation",
        selectedCapabilityPointers: [pointer]
      }
    }
  });
  assert.equal(result.state.hydrated_capabilities?.resolvedCount ?? 0, 0, "quarantined pointer must not hydrate");
  const runs = await store.all("SELECT id FROM browser_runs WHERE session_id = ?;", [session.id]);
  assert.equal(runs.length, 0, "quarantined arm must produce NO dispatch (no browser_runs row)");
});
