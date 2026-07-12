import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "./support/sqliteTestStore.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import {
  buildLlmOrchestrationDecisionMessages,
  normalizeLlmOrchestrationDecision
} from "../concierge/llmOrchestrationDecision.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { catalogPortfolioKey, loadSessionPortfolio } from "../concierge/capabilityCatalog.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { createId, nowIso } from "./support/sqliteTestStore.mjs";

// Hermetic precondition: verifies the no-Redis in-memory fallback path, pinned
// independent of ambient .env.local (which now configures BRAINSTY_REDIS_URL).
process.env.BRAINSTY_REDIS_URL = "";
process.env.REDIS_URL = "";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-phase78-capability-portfolio-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  return store;
}

test("Phase 78 writes a hydratable capability portfolio and injects its short table", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const result = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Can you help check my medication copay and then a recent claim?",
    rawMessage: { source: "phase78_portfolio_test", useLiveModel: false, executeEvidenceObservation: false }
  });

  // Phase 86 (§6.3): the packet's capability surface is the DB-catalog manifest —
  // the legacy per-turn portfolio (brainsty:capability-portfolio) is retired.
  const summary = result.state.context_packet.capabilityPortfolio;
  assert.equal(summary.cacheBackend, "memory");
  assert.equal(summary.cacheKey, catalogPortfolioKey(session.id));
  assert.equal(summary.source, "db_catalog");
  assert.ok(summary.entryCount >= 10);
  assert.ok(summary.promptTable.some((entry) => entry.portfolioId === "workflow:pharmacy_formulary"));
  assert.ok(summary.promptTable.some((entry) => entry.portfolioId === "workflow:claim_status_navigation"));
  assert.ok(summary.promptTable.some((entry) => entry.portfolioId === "skill:insurance_portal_browser"));
  assert.ok(summary.promptTable.some((entry) => entry.portfolioId === "tool:openclaw_authenticated_browser"));
  assert.ok(summary.promptTable.some((entry) => entry.kind === "graph_path"));
  assert.ok(summary.allowedWorkflows.length > 0, "manifest must carry the DB-derived allowedWorkflows");

  const hydrated = await loadSessionPortfolio(store, { sessionId: session.id });
  assert.equal(hydrated.cacheKey, summary.cacheKey);
  assert.ok(hydrated.manifest.entries["workflow:pharmacy_formulary"]);
  assert.ok(hydrated.manifest.entries["skill:insurance_portal_browser"]);
  assert.ok(hydrated.manifest.entries["graph_path:input_policy_to_llm_planner"]);
});

test("Phase 78 planner payload exposes portfolio IDs and pointers instead of full hydrated entries", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const result = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "What is my medication copay?",
    rawMessage: { source: "phase78_planner_payload_test", useLiveModel: false, executeEvidenceObservation: false }
  });
  const messages = buildLlmOrchestrationDecisionMessages(result.state);
  const payload = JSON.parse(messages.find((message) => message.role === "user").content);

  assert.equal(payload.capabilityPortfolio.cacheKey, catalogPortfolioKey(session.id));
  assert.ok(payload.capabilityPortfolio.promptTable.length > 0);
  assert.ok(payload.capabilityPortfolio.promptTable.every((entry) => entry.portfolioId && entry.pointer));
  assert.equal(JSON.stringify(payload.capabilityPortfolio).includes('"hydrate"'), false);
});

test("Phase 78 decision parser preserves selected capability portfolio IDs and cache pointers", () => {
  const decision = normalizeLlmOrchestrationDecision({
    workflow: "pharmacy_formulary",
    intent: "medication_copay_scrutiny",
    confidence: 0.91,
    rationale: "The planner selected the pharmacy workflow and insurance portal browser skill from the portfolio.",
    requiredEvidence: ["medication_name", "formulary_or_pharmacy_benefit"],
    missingEvidence: ["medication_name"],
    approvalRequired: true,
    approvalScope: "read_only_observation",
    workerGoal: "Use the selected portfolio workflow and skill to inspect pharmacy benefit source pointers.",
    responseStrategy: "Ask for medication name and offer read-only portal observation.",
    userFacingNextQuestion: "Which medication should I check?",
    selectedCapabilityPortfolioIds: ["workflow:pharmacy_formulary", "skill:insurance_portal_browser"],
    selectedCapabilityPointers: [
      "brainsty:capability-catalog:session_1#workflow:pharmacy_formulary",
      "brainsty:capability-catalog:session_1#skill:insurance_portal_browser"
    ]
  }, {
    // v2 normalizer contract (plan §3.3): the DB-derived allowlists are REQUIRED options.
    allowedWorkflows: ["pharmacy_formulary"],
    offerableProcessIds: [],
    knownCapabilityKeys: ["workflow:pharmacy_formulary", "skill:insurance_portal_browser"]
  });

  assert.equal(decision.valid, true);
  assert.deepEqual(decision.selected_tools.selectedCapabilityPortfolioIds, ["workflow:pharmacy_formulary", "skill:insurance_portal_browser"]);
  assert.deepEqual(decision.selected_tools.capabilityPointers, [
    "brainsty:capability-catalog:session_1#workflow:pharmacy_formulary",
    "brainsty:capability-catalog:session_1#skill:insurance_portal_browser"
  ]);
});
