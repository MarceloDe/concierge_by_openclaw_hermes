import assert from "node:assert/strict";
import test from "node:test";
import {
  AI2UI_BLOCK_CONTRACT_VERSION,
  AI2UI_BLOCK_TYPES,
  buildAi2UiBlocksFromState,
  normalizeAi2UiBlocks
} from "../concierge/ai2uiBlocks.mjs";

test("AI2UI builder returns typed blocks for a sourced LangGraph result", () => {
  const blocks = buildAi2UiBlocksFromState(
    {
      graph_trace_id: "lgtrace_test",
      workflow: "eligibility_benefits_navigation",
      workflow_outcome: "evidence_captured",
      structured_intent: { intent: "eligibility_benefits", confidence: 0.86 },
      route_reason: "structured_intent",
      final_response: "A sourced answer.",
      source_pointers: [
        {
          table: "portal_page_snapshots",
          id: "page_1",
          sourceUrl: "https://member.example.test/benefits",
          summary: "Benefits page",
          extractionHash: "hash_123"
        }
      ],
      evidence_observation: {
        status: "captured_official_openclaw_multi_page_read_only_observation",
        actionsTaken: ["open_current_tab", "read_visible_text"]
      },
      product_memory_recall: { adapter: "graphiti", status: "available", facts: [] },
      product_memory_retain: { adapter: "graphiti", status: "retained", retained: true, episodeUuid: "episode_1" }
    }
  );

  assert.ok(blocks.length >= 8);
  assert.ok(blocks.every((block) => block.version === AI2UI_BLOCK_CONTRACT_VERSION));
  assert.ok(blocks.some((block) => block.type === AI2UI_BLOCK_TYPES.ANSWER_MARKDOWN));
  assert.ok(blocks.some((block) => block.type === AI2UI_BLOCK_TYPES.SOURCE_CITATIONS));
  assert.ok(blocks.some((block) => block.type === AI2UI_BLOCK_TYPES.MEMORY_STATUS));

  const citations = blocks.find((block) => block.type === AI2UI_BLOCK_TYPES.SOURCE_CITATIONS);
  assert.equal(citations.payload.sourcePointerCount, 1);
  assert.equal(citations.payload.sourcePointers[0].table, "portal_page_snapshots");
  assert.equal(citations.payload.sourcePointers[0].summary, "Benefits page");
});

test("AI2UI builder returns source-backed cost comparison rows for cost questions", () => {
  const blocks = buildAi2UiBlocksFromState({
    graph_trace_id: "lgtrace_cost",
    workflow: "eligibility_benefits_navigation",
    user_input: "Can you compare what I may owe before insurance starts paying?",
    final_response: "A sourced cost answer.",
    source_pointers: [
      {
        table: "coverage_balances",
        id: "balance_ded_1",
        summary: "Annual deductible: total $2,000, spent $750, remaining $1,250",
        balanceType: "deductible",
        totalAmount: 2000,
        spentAmount: 750,
        remainingAmount: 1250
      },
      {
        table: "research_artifacts",
        id: "artifact_coin_1",
        displayLabel: "Reviewed coinsurance evidence",
        evidenceFields: [
          {
            label: "Coinsurance after deductible",
            value: "After the deductible, plan coinsurance is 20% for the cited covered service.",
            confidence: "high"
          }
        ],
        citation: { confidence: "high" }
      }
    ],
    evidence_observation: { status: "captured_trusted_research_evidence", actionsTaken: ["trusted_research_evidence_search"] }
  });

  const comparison = blocks.find((block) => block.type === AI2UI_BLOCK_TYPES.COST_COMPARISON);
  assert.ok(comparison);
  assert.equal(comparison.payload.status, "source_backed_comparison_ready");
  assert.equal(comparison.payload.safety.noFabricatedExactPrices, true);
  assert.equal(comparison.payload.safety.everyRowHasSourcePointer, true);
  assert.ok(comparison.payload.rows.length >= 2);
  assert.ok(comparison.payload.rows.every((row) => row.sourcePointerIds.length === 1));
  assert.ok(comparison.payload.rows.some((row) => String(row.costSignal).includes("1250")));
  assert.ok(comparison.payload.rows.some((row) => String(row.costSignal).includes("20%")));
});

test("AI2UI cost comparison fails closed when a cost ask has no source pointers", () => {
  const blocks = buildAi2UiBlocksFromState({
    graph_trace_id: "lgtrace_cost_missing",
    workflow: "eligibility_benefits_navigation",
    user_input: "Which option is cheaper and what exact price should I expect?",
    final_response: "I cannot compare exact prices without evidence.",
    source_pointers: [],
    evidence_observation: { status: "blocked_no_trusted_research_evidence", actionsTaken: [] }
  });

  const comparison = blocks.find((block) => block.type === AI2UI_BLOCK_TYPES.COST_COMPARISON);
  assert.ok(comparison);
  assert.equal(comparison.payload.status, "blocked_missing_source_pointers");
  assert.equal(comparison.payload.rowCount, 0);
  assert.deepEqual(comparison.payload.rows, []);
  assert.equal(comparison.payload.safety.noFabricatedExactPrices, true);
});

test("AI2UI normalizer converts unknown block types into safe fallback cards", () => {
  const blocks = normalizeAi2UiBlocks([
    {
      id: "future_block_1",
      type: "future_complex_chart",
      payload: {
        privateValue: "safe preview only",
        nested: { unsupported: true }
      }
    }
  ]);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, AI2UI_BLOCK_TYPES.UNKNOWN);
  assert.equal(blocks[0].payload.originalType, "future_complex_chart");
  assert.match(blocks[0].payload.safePreview, /safe preview only/);
  assert.equal(blocks[0].renderHints.fallback, "safe_json_preview");
});
