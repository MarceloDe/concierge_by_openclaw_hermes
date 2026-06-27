import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import {
  resetTieredChatModelFactoryForTests,
  setTieredChatModelFactoryForTests
} from "../concierge/modelTierPolicy.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-phase76-planner-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

function parseUserPayload(messages) {
  const userMessage = messages.find((message) => message.role === "user");
  return JSON.parse(userMessage.content);
}

function structuredIntentResponse(payload) {
  const input = String(payload.user_input ?? "").toLowerCase();
  const journey = input.includes("claim") ? "claims_eob_payment" : "pharmacy_formulary";
  return {
    primary_intent: journey,
    candidate_journeys: [
      {
        journey,
        confidence: 0.87,
        rationale: "The user asked a general insurance question that needs workflow planning and source-backed evidence.",
        required_evidence:
          journey === "claims_eob_payment"
            ? ["claim_record_or_eob", "patient_responsibility"]
            : ["medication_name", "formulary_or_pharmacy_benefit", "member_plan_context"],
        missing_evidence:
          journey === "claims_eob_payment"
            ? ["claim_record_or_eob"]
            : ["medication_name", "formulary_or_pharmacy_benefit"],
        safe_next_action: "request_or_retrieve_evidence",
        requires_approval: true,
        requires_human_handoff: false
      }
    ],
    complexity: "moderate",
    ambiguities: [],
    policy_flags: [],
    unsafe_action_requested: false
  };
}

function plannerDecisionResponse(payload) {
  const input = String(payload.userInput ?? "").toLowerCase();
  if (input.includes("claim")) {
    return {
      workflow: "claim_status_navigation",
      intent: "claim_status_and_payment_scrutiny",
      confidence: 0.88,
      rationale: "The user asked about a claim, so the graph should inspect claim/EOB evidence rather than give generic guidance.",
      requiredEvidence: ["claim_record_or_eob", "patient_responsibility", "portal_claims_page_or_eob"],
      missingEvidence: ["claim_record_or_eob"],
      approvalRequired: true,
      approvalScope: "read_only_observation",
      workerGoal: "After user approval and login, use OpenClaw read-only portal navigation to inspect claim status, EOB, paid amount, denial reason, and patient responsibility source pointers.",
      responseStrategy: "Offer the read-only portal path and ask which claim or date range should be checked.",
      userFacingNextQuestion: "Which claim or date range should I check first?"
    };
  }
  return {
    workflow: "pharmacy_formulary",
    intent: "medication_copay_and_formulary_scrutiny",
    confidence: 0.9,
    rationale: "The user asked for medication copay support, which requires pharmacy/formulary and plan evidence rather than generic eligibility text.",
    requiredEvidence: ["medication_name", "formulary_or_pharmacy_benefit", "member_plan_context", "portal_pharmacy_page_or_plan_document"],
    missingEvidence: ["medication_name", "formulary_or_pharmacy_benefit"],
    approvalRequired: true,
    approvalScope: "read_only_observation",
    workerGoal: "After user approval and login, use OpenClaw read-only portal navigation and plan document lookup to inspect formulary tier, copay/coinsurance, prior authorization flags, and pharmacy benefit source pointers.",
    responseStrategy: "Ask for the medication name and offer the read-only portal/document path.",
    userFacingNextQuestion: "Which medication should I check?"
  };
}

async function runWithPlanner(question) {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-phase76-key";
  setTieredChatModelFactoryForTests(({ step, selection }) => ({
    invoke: async (messages) => {
      const payload = parseUserPayload(messages);
      if (step === "structured_intent") {
        return { content: JSON.stringify(structuredIntentResponse(payload)) };
      }
      if (step === "llm_orchestration_decision") {
        assert.equal(selection.tier, "planner");
        assert.equal(selection.model, "gpt-5");
        assert.ok(Array.isArray(payload.routeCandidates));
        assert.ok(payload.routeCandidates.length > 0);
        assert.ok(payload.openclawCapabilityPolicy.workerMayCreateSubtasks);
        return { content: JSON.stringify(plannerDecisionResponse(payload)) };
      }
      throw new Error(`unexpected model step in phase 76 harness: ${step}`);
    }
  }));
  try {
    const store = await createStore();
    const { user, session } = await enrollDefaultMember(store);
    return await runLangGraphOrchestration(store, {
      user,
      session,
      channel: session.channel,
      userInput: question,
      rawMessage: {
        source: "phase76_general_planner_harness",
        useLiveModel: true,
        executeEvidenceObservation: false,
        payloadMode: "phi_allowed_identifier_masked_reasoning"
      }
    });
  } finally {
    resetTieredChatModelFactoryForTests();
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
    else delete process.env.OPENAI_API_KEY;
  }
}

test("Phase 76 routes a general medication copay question through the top-tier LLM planner", async () => {
  const result = await runWithPlanner("What is my copayment for a medication under my Aetna plan?");

  assert.equal(result.state.structured_intent.primary_intent, "pharmacy_formulary");
  assert.equal(result.state.llm_orchestration_decision.mode, "openai_chatopenai_invoked");
  assert.equal(result.state.llm_orchestration_decision.modelTier.tier, "planner");
  assert.equal(result.state.llm_orchestration_decision.modelTier.model, "gpt-5");
  assert.equal(result.state.workflow, "pharmacy_formulary");
  assert.equal(result.state.route_reason, "llm_orchestration_decision");
  assert.equal(result.state.llm_orchestration_decision.usedByRouter, true);
  assert.match(result.state.llm_orchestration_decision.workerGoal, /formulary tier/i);
});

test("Phase 76 routes a general claim question through the top-tier LLM planner", async () => {
  const result = await runWithPlanner("What about my claim?");

  assert.equal(result.state.structured_intent.primary_intent, "claims_eob_payment");
  assert.equal(result.state.llm_orchestration_decision.mode, "openai_chatopenai_invoked");
  assert.equal(result.state.llm_orchestration_decision.modelTier.tier, "planner");
  assert.equal(result.state.workflow, "claim_status_navigation");
  assert.equal(result.state.route_reason, "llm_orchestration_decision");
  assert.equal(result.state.llm_orchestration_decision.usedByRouter, true);
  assert.match(result.state.llm_orchestration_decision.workerGoal, /claim status/i);
});

test("Phase 76 keeps free-text chat routing out of brittle frontend phrase shortcuts", async () => {
  const [app, api] = await Promise.all([
    readFile(new URL("../userapp/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../userapp/api.ts", import.meta.url), "utf8")
  ]);
  const source = `${app}\n${api}`;

  assert.equal(source.includes("interactiveFastPath"), false);
  assert.equal(source.includes("isPortalConnectRequest"), false);
  assert.equal(source.includes("Go to the option B"), false);
  assert.equal(source.includes("option B"), false);
});
