#!/usr/bin/env node
// Planner eval harness (NON-MOCKED): replays lay-person questions through the REAL planner
// (live gpt-4.1) and scores demand extraction + workflow/process selection against expectations.
// This is the measurement loop for "increase final performance" — run it before/after prompt or
// catalog changes to see if accuracy moved. Usage: node scripts/planner-eval.mjs
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLocalEnvOnce } from "../src/concierge/secrets.mjs";
import { SqliteStore, createId, nowIso } from "../src/concierge/database.mjs";
import { enrollDefaultMember } from "../src/concierge/enrollment.mjs";
import { seedCapabilityCatalog } from "../src/concierge/capabilityCatalogSeed.mjs";
import { runLangGraphOrchestration } from "../src/concierge/langgraphRunner.mjs";

// Lay-person question -> expectation. expectWorkflow: the routed workflow; expectProcess: a process
// the planner should offer (or null if an answer is acceptable); demandIncludes: a keyword the
// extractedDemand should contain (case-insensitive).
const CASES = [
  { q: "why was my last claim denied and what do I still owe?", expectWorkflow: "claim_status_navigation", expectProcess: "process:claim_status_lookup", demandIncludes: "deni", expectTaskClass: ["claims_support", "member_specific_read"], expectTier: ["medium", "high"] },
  { q: "is Ozempic covered by my plan and how much will it cost?", expectWorkflow: "pharmacy_formulary", expectProcess: "process:pharmacy_formulary_lookup", demandIncludes: "ozempic", expectTaskClass: ["medication_support", "cost_estimation"], expectTier: ["low", "medium"] },
  { q: "do I need approval before my knee replacement surgery?", expectWorkflow: "prior_authorization_navigation", expectProcess: "process:prior_auth_lookup", demandIncludes: ["approval", "prior auth"], expectTaskClass: ["prior_auth_support"], expectTier: ["low", "medium"] },
  { q: "what's my deductible and out-of-pocket so far this year?", expectWorkflow: "eligibility_benefits_navigation", expectProcess: "process:portal_readonly_lookup", demandIncludes: "deductible", expectTaskClass: ["member_specific_read", "cost_estimation"], expectTier: ["medium"] },
  { q: "help me appeal a denial my insurer sent me", expectWorkflow: "denial_appeal_preparation", expectProcess: "process:denial_appeal_support", demandIncludes: "appeal", expectTaskClass: ["appeal_or_denial_support"], expectTier: ["medium", "high"] },
  { q: "can you read this EOB document I have and explain it?", expectWorkflow: "document_or_trace_review", expectProcess: "process:document_review", demandIncludes: "eob", expectTaskClass: ["claims_support", "member_specific_read", "generic_public"], expectTier: ["low", "medium"] }
];

const DATA_LAYERS = ["layer_1_public", "layer_2_member_authorized_api", "layer_3_portal_control"];

async function main() {
  await loadLocalEnvOnce();
  process.env.BRAINSTY_TYPE_II_COMPOSER = "1";
  const store = await new SqliteStore(join(await mkdtemp(join(tmpdir(), "planner-eval-")), "g.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });

  const rows = [];
  for (const c of CASES) {
    const { user, session } = await enrollDefaultMember(store); // fresh session per case (no bleed)
    let d = {};
    let capabilitySource = null;
    try {
      const r = await runLangGraphOrchestration(store, { user, session, channel: session.channel, userInput: c.q, rawMessage: { source: "planner-eval", useLiveModel: true } });
      d = r.state.llm_orchestration_decision || {};
      capabilitySource = r.state.context_packet?.capabilityPortfolio?.source ?? null;
    } catch (err) {
      d = { error: String(err?.message ?? err) };
    }
    const offered = Array.isArray(d.selected_tools?.offeredProcessIds) ? d.selected_tools.offeredProcessIds : [];
    const workflowOk = d.classification?.workflow === c.expectWorkflow;
    const processOk = c.expectProcess ? offered.includes(c.expectProcess) : true;
    const extractedDemand = d.classification?.extractedDemand ?? "";
    // demandIncludes accepts synonyms (e.g. "prior auth" IS the approval requirement).
    const demandKeys = Array.isArray(c.demandIncludes) ? c.demandIncludes : [c.demandIncludes];
    const demandOk = Boolean(extractedDemand) && demandKeys.some((key) => extractedDemand.toLowerCase().includes(key));
    const needsOk = Array.isArray(d.demand_and_evidence?.informationNeeds) && d.demand_and_evidence.informationNeeds.length > 0;
    // DECISION_CONTRACT_V2 scoring (plan §11 Phase 83): draft-adopted enums.
    const floor = String(d.riskTierFloor ?? "low");
    const riskTierOk = ["low", "medium", "high", "critical"].includes(String(d.risk_tier)) &&
      (!c.expectTier || c.expectTier.includes(String(d.risk_tier)) || String(d.risk_tier) === floor);
    const dataLayerOk = Array.isArray(d.data_layer) && d.data_layer.length > 0 && d.data_layer.every((v) => DATA_LAYERS.includes(v));
    const taskClass = d.classification?.taskClass ?? null;
    const taskClassOk = Boolean(taskClass) && (!c.expectTaskClass || c.expectTaskClass.includes(taskClass) || taskClass === "mixed");
    const recommendedProcessId = d.selected_tools?.recommendedProcessId ?? null;
    const workflowGraphOk = !recommendedProcessId || d.workflow_graph?.processId === recommendedProcessId;
    // Phase 86 acceptance (§11): every turn's planner capability surface is the DB catalog.
    const capabilitySourceOk = capabilitySource === "db_catalog";
    rows.push({ q: c.q, mode: d.mode ?? null, workflow: d.classification?.workflow, workflowOk, offered: offered.join(","), processOk, demand: extractedDemand, demandOk, needsOk, conf: d.classification?.confidence, riskTier: d.risk_tier, riskTierOk, dataLayer: (d.data_layer ?? []).join(","), dataLayerOk, taskClass, taskClassOk, workflowGraphOk, capabilitySource, capabilitySourceOk });
    await new Promise((s) => setTimeout(s, 800)); // gentle pacing for rate limits
  }

  const n = rows.length;
  const pct = (k) => `${rows.filter((r) => r[k]).length}/${n} (${Math.round((rows.filter((r) => r[k]).length / n) * 100)}%)`;
  console.log("\n================ PLANNER EVAL (real gpt-4.1) ================");
  for (const r of rows) {
    console.log(`\nQ: ${r.q}`);
    console.log(`  workflow: ${r.workflow} ${r.workflowOk ? "✓" : "✗ (expected mismatch)"} | conf ${r.conf}`);
    console.log(`  offered:  ${r.offered || "(none)"} ${r.processOk ? "✓" : "✗"}`);
    console.log(`  demand:   "${r.demand}" ${r.demandOk ? "✓" : "✗"} | informationNeeds ${r.needsOk ? "✓" : "✗"}`);
    console.log(`  v2:       taskClass=${r.taskClass ?? "(none)"} ${r.taskClassOk ? "✓" : "✗"} | data_layer=[${r.dataLayer}] ${r.dataLayerOk ? "✓" : "✗"} | risk_tier=${r.riskTier ?? "(none)"} ${r.riskTierOk ? "✓" : "✗"} | graph ${r.workflowGraphOk ? "✓" : "✗"}`);
    console.log(`  source:   plannerCapabilitySource=${r.capabilitySource ?? "(none)"} ${r.capabilitySourceOk ? "✓" : "✗"} | mode=${r.mode ?? "(none)"}`);
  }
  console.log("\n---------------- SCORE ----------------");
  console.log(`  workflow selection : ${pct("workflowOk")}`);
  console.log(`  process selection  : ${pct("processOk")}`);
  console.log(`  demand extraction  : ${pct("demandOk")}`);
  console.log(`  information needs   : ${pct("needsOk")}`);
  console.log(`  task class (v2)    : ${pct("taskClassOk")}`);
  console.log(`  data layer (v2)    : ${pct("dataLayerOk")}`);
  console.log(`  risk tier (v2)     : ${pct("riskTierOk")}`);
  console.log(`  workflow graph (v2): ${pct("workflowGraphOk")}`);
  console.log(`  capability source  : ${pct("capabilitySourceOk")} (db_catalog required — Phase 86)`);
  console.log("\n(Inspect the full per-node hydration of any case in Langfuse: planner.start -> Input.full_prompt.)");
  await store.close?.();
}

main().catch((err) => { console.error("planner-eval failed:", err?.message ?? err); process.exit(1); });
