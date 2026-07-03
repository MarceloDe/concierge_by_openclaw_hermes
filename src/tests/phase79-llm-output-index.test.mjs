import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { buildLlmOrchestrationDecisionMessages } from "../concierge/llmOrchestrationDecision.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { llmOutputIndexKey, loadLlmOutputIndex } from "../concierge/llmOutputIndex.mjs";
import {
  resetTieredChatModelFactoryForTests,
  setTieredChatModelFactoryForTests
} from "../concierge/modelTierPolicy.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-phase79-llm-output-index-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

function parsePayload(messages) {
  return JSON.parse(messages.find((message) => message.role === "user").content);
}

function fakePlanner(payload) {
  const workflow = /claim/i.test(payload.userInput ?? "") ? "claim_status_navigation" : "pharmacy_formulary";
  const pointer = payload.capabilityPortfolio?.promptTable?.find((entry) => entry.portfolioId === `workflow:${workflow}`)?.pointer;
  return {
    workflow,
    intent: workflow === "claim_status_navigation" ? "claim_status_scrutiny" : "medication_copay_scrutiny",
    confidence: 0.89,
    rationale: "Phase 79 fake planner output.",
    requiredEvidence: workflow === "claim_status_navigation" ? ["claim_record_or_eob"] : ["medication_name", "formulary_or_pharmacy_benefit"],
    missingEvidence: workflow === "claim_status_navigation" ? ["claim_record_or_eob"] : ["medication_name"],
    approvalRequired: true,
    approvalScope: "read_only_observation",
    workerGoal: `Use ${workflow} with source pointers.`,
    responseStrategy: "Ask for missing evidence and offer read-only portal observation.",
    userFacingNextQuestion: workflow === "claim_status_navigation" ? "Which claim should I check?" : "Which medication should I check?",
    selectedCapabilityPortfolioIds: [`workflow:${workflow}`],
    selectedCapabilityPointers: pointer ? [pointer] : [],
    priorLlmOutputPointersUsed: (payload.llmOutputIndex?.entries ?? []).map((entry) => entry.pointer)
  };
}

async function withFakeModels(fn) {
  const priorKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "phase79-test-key";
  setTieredChatModelFactoryForTests(({ step }) => ({
    invoke: async (messages) => {
      const payload = parsePayload(messages);
      if (step === "llm_orchestration_decision") return { content: JSON.stringify(fakePlanner(payload)) };
      throw new Error(`unexpected model step ${step}`);
    }
  }));
  try {
    return await fn();
  } finally {
    resetTieredChatModelFactoryForTests();
    if (priorKey) process.env.OPENAI_API_KEY = priorKey;
    else delete process.env.OPENAI_API_KEY;
  }
}

test("Phase 79 indexes live LLM outputs as pointers and hashes", async () =>
  withFakeModels(async () => {
    const store = await createStore();
    await seedCapabilityCatalog(store, { nowIso, createId });
    const { user, session } = await enrollDefaultMember(store);
    const run = await runLangGraphOrchestration(store, {
      user,
      session,
      channel: session.channel,
      userInput: "What is my medication copay?",
      rawMessage: { source: "phase79_index_first", useLiveModel: true, executeEvidenceObservation: false }
    });
    const index = await loadLlmOutputIndex(session.id);

    assert.equal(index.status, "hit");
    assert.equal(index.cacheKey, llmOutputIndexKey(session.id));
    assert.ok(index.entries.some((entry) => entry.step === "llm_orchestration_decision"));
    assert.ok(index.entries.every((entry) => entry.pointer && entry.outputHash && entry.rawOutputStored === false));
    assert.equal(run.state.llm_orchestration_decision.llmOutputIndex.rawOutputStored, false);
  }));

test("Phase 79 injects prior LLM output index pointers into the next planner payload", async () =>
  withFakeModels(async () => {
    const store = await createStore();
    await seedCapabilityCatalog(store, { nowIso, createId });
    const { user, session } = await enrollDefaultMember(store);
    await runLangGraphOrchestration(store, {
      user,
      session,
      channel: session.channel,
      userInput: "What is my medication copay?",
      rawMessage: { source: "phase79_index_seed", useLiveModel: true, executeEvidenceObservation: false }
    });
    const second = await runLangGraphOrchestration(store, {
      user,
      session,
      channel: session.channel,
      userInput: "What about my claim?",
      rawMessage: { source: "phase79_index_second", useLiveModel: true, executeEvidenceObservation: false }
    });
    const messages = buildLlmOrchestrationDecisionMessages(second.state);
    const payload = parsePayload(messages);
    const serialized = JSON.stringify(payload.llmOutputIndex);

    assert.equal(payload.llmOutputIndex.cacheKey, llmOutputIndexKey(session.id));
    // Exactly one LLM step (the planner) is indexed per turn since the legacy
    // classifier step was deleted, so the prior turn contributes one entry.
    assert.ok(payload.llmOutputIndex.entries.length >= 1);
    assert.ok(payload.llmOutputIndex.entries.every((entry) => entry.step === "llm_orchestration_decision"));
    assert.ok(second.state.llm_orchestration_decision.demand_and_evidence.priorLlmOutputPointersUsed.length >= 1);
    assert.doesNotMatch(serialized, /Phase 79 fake planner output/);
    assert.doesNotMatch(serialized, /Phase 79 fake structured-intent output/);
  }));
