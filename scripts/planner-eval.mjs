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
  { q: "why was my last claim denied and what do I still owe?", expectWorkflow: "claim_status_navigation", expectProcess: "process:claim_status_lookup", demandIncludes: "deni" },
  { q: "is Ozempic covered by my plan and how much will it cost?", expectWorkflow: "pharmacy_formulary", expectProcess: "process:pharmacy_formulary_lookup", demandIncludes: "ozempic" },
  { q: "do I need approval before my knee replacement surgery?", expectWorkflow: "prior_authorization_navigation", expectProcess: "process:prior_auth_lookup", demandIncludes: "approval" },
  { q: "what's my deductible and out-of-pocket so far this year?", expectWorkflow: "eligibility_benefits_navigation", expectProcess: "process:portal_readonly_lookup", demandIncludes: "deductible" },
  { q: "help me appeal a denial my insurer sent me", expectWorkflow: "denial_appeal_preparation", expectProcess: "process:denial_appeal_support", demandIncludes: "appeal" },
  { q: "can you read this EOB document I have and explain it?", expectWorkflow: "document_or_trace_review", expectProcess: "process:document_review", demandIncludes: "eob" }
];

async function main() {
  await loadLocalEnvOnce();
  process.env.BRAINSTY_ORCHESTRATOR_LLM_ALWAYS = "1";
  process.env.BRAINSTY_TYPE_II_COMPOSER = "1";
  const store = await new SqliteStore(join(await mkdtemp(join(tmpdir(), "planner-eval-")), "g.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });

  const rows = [];
  for (const c of CASES) {
    const { user, session } = await enrollDefaultMember(store); // fresh session per case (no bleed)
    let d = {};
    try {
      const r = await runLangGraphOrchestration(store, { user, session, channel: session.channel, userInput: c.q, rawMessage: { source: "planner-eval", useLiveModel: true } });
      d = r.state.llm_orchestration_decision || {};
    } catch (err) {
      d = { error: String(err?.message ?? err) };
    }
    const offered = Array.isArray(d.offeredProcessIds) ? d.offeredProcessIds : [];
    const workflowOk = d.workflow === c.expectWorkflow;
    const processOk = c.expectProcess ? offered.includes(c.expectProcess) : true;
    const demandOk = Boolean(d.extractedDemand) && d.extractedDemand.toLowerCase().includes(c.demandIncludes);
    const needsOk = Array.isArray(d.informationNeeds) && d.informationNeeds.length > 0;
    rows.push({ q: c.q, workflow: d.workflow, workflowOk, offered: offered.join(","), processOk, demand: d.extractedDemand, demandOk, needsOk, conf: d.confidence });
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
  }
  console.log("\n---------------- SCORE ----------------");
  console.log(`  workflow selection : ${pct("workflowOk")}`);
  console.log(`  process selection  : ${pct("processOk")}`);
  console.log(`  demand extraction  : ${pct("demandOk")}`);
  console.log(`  information needs   : ${pct("needsOk")}`);
  console.log("\n(Inspect the full per-node hydration of any case in Langfuse: planner.start -> Input.full_prompt.)");
  await store.close?.();
}

main().catch((err) => { console.error("planner-eval failed:", err?.message ?? err); process.exit(1); });
