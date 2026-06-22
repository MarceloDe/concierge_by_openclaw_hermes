import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildAi2UiBlocksFromState, AI2UI_BLOCK_TYPES } from "../concierge/ai2uiBlocks.mjs";
import {
  composeBestEffortAnswer,
  SANDBOX_PRIVACY_COPY
} from "../concierge/gracefulDegradation.mjs";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { baseSafetyRules } from "../concierge/promptContracts.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-graceful-degradation-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

test("best-effort composer degrades without making uncited factual claims", async () => {
  const result = await composeBestEffortAnswer(
    {
      workflow: "eligibility_benefits_navigation",
      user_input: "Do I still owe anything before coinsurance?",
      raw_message: { useLiveModel: false },
      evidence_observation: {
        status: "blocked_no_trusted_research_evidence",
        missingEvidence: ["current plan source pointer"]
      },
      source_pointers: []
    },
    { missingEvidence: ["reviewed deductible evidence"] }
  );

  assert.equal(result.valid, true);
  assert.equal(result.mode, "deterministic_graceful_degradation_fallback");
  assert.match(result.finalResponse, /Unverified:/);
  assert.ok(result.unverified.includes("reviewed deductible evidence"));
  assert.ok(result.answer.claims.every((claim) => claim.unsupported === true));
  assert.ok(result.answer.claims.every((claim) => claim.source_pointer_ids.length === 0));
});

test("AI2UI exposes the tiered offer with privacy copy and approval gating", () => {
  const blocks = buildAi2UiBlocksFromState({
    graph_trace_id: "lgtrace_degraded",
    workflow: "eligibility_benefits_navigation",
    workflow_outcome: "best_effort_degraded",
    final_response: "Unverified answer.",
    degraded_answer: {
      answer: {
        claims: [{ claim: "Evidence is insufficient.", source_pointer_ids: [], unsupported: true }],
        next_steps: [{ label: "Approve read-only observation", type: "prepare_approval", requires_approval: true }]
      },
      unverified: ["portal evidence"],
      reason: "blocked_no_authenticated_evidence",
      clarification: { questions: ["Which plan should I check?"], terminal: false }
    },
    openclaw_skill_proposal: {
      task: { id: "task_123" },
      approval: { approvalScope: "read_only_observation", allowedAction: "observe_current_portal_page" }
    },
    openclaw_skill_validation: { status: "valid" }
  });

  const degradedBlock = blocks.find((block) => block.type === AI2UI_BLOCK_TYPES.DEGRADED_ANSWER_WITH_OPTIONS);
  assert.ok(degradedBlock);
  assert.equal(degradedBlock.payload.privacyCopy, SANDBOX_PRIVACY_COPY);
  assert.equal(degradedBlock.payload.safety.noConfidentUncitedClaims, true);
  assert.deepEqual(
    degradedBlock.payload.options.map((option) => option.id),
    ["verify_myself", "let_concierge_check", "provide_more_info"]
  );
  assert.equal(degradedBlock.payload.options[1].requiresApproval, true);
  assert.equal(degradedBlock.payload.options[1].taskId, "task_123");
});

test("prompt safety rules disclose isolated sandbox behavior for user takeover", () => {
  assert.ok(baseSafetyRules().some((rule) => rule.includes(SANDBOX_PRIVACY_COPY)));
});

test("LangGraph turns missing trusted evidence into best-effort degradation, not a dead end", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);

  const result = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "What does reviewed evidence say about my annual deductible before coinsurance?",
    rawMessage: { source: "phase54_graceful_degradation_test", useLiveModel: false, executeEvidenceObservation: false }
  });

  assert.equal(result.state.evidence_observation.status, "blocked_no_trusted_research_evidence");
  assert.equal(result.state.workflow_outcome, "best_effort_degraded");
  assert.deepEqual(result.state.source_pointers, []);
  assert.equal(result.state.should_remember, false);
  assert.match(result.state.final_response, /Unverified:/);
  assert.ok(result.state.degraded_answer);
  assert.ok(result.state.degraded_answer.answer.claims.every((claim) => claim.unsupported === true));

  const degradedBlock = result.state.ai2ui_blocks.find((block) => block.type === AI2UI_BLOCK_TYPES.DEGRADED_ANSWER_WITH_OPTIONS);
  assert.ok(degradedBlock);
  assert.equal(degradedBlock.payload.status, "best_effort_degraded");
  assert.ok(degradedBlock.payload.options.some((option) => option.id === "let_concierge_check"));
});
