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

test("AI2UI builder returns source-backed pharmacy formulary rows for prescription questions", () => {
  const blocks = buildAi2UiBlocksFromState({
    graph_trace_id: "lgtrace_rx",
    workflow: "pharmacy_formulary",
    user_input: "Is Ozempic on formulary or does it need prior authorization?",
    final_response: "A sourced formulary answer.",
    source_pointers: [
      {
        table: "research_artifacts",
        id: "artifact_rx_1",
        displayLabel: "Reviewed formulary evidence",
        evidenceFields: [
          {
            label: "Medication Ozempic formulary status",
            value: "Ozempic is listed as covered on formulary, tier 3, with prior authorization and quantity limit signals.",
            confidence: "high"
          }
        ],
        citation: { confidence: "high" }
      }
    ],
    evidence_observation: { status: "captured_trusted_research_evidence", actionsTaken: ["trusted_research_evidence_search"] }
  });

  const formulary = blocks.find((block) => block.type === AI2UI_BLOCK_TYPES.PHARMACY_FORMULARY);
  assert.ok(formulary);
  assert.equal(formulary.payload.status, "source_backed_pharmacy_answer_ready");
  assert.equal(formulary.payload.safety.noMedicationAdvice, true);
  assert.equal(formulary.payload.safety.noClinicalSubstitutionAdvice, true);
  assert.equal(formulary.payload.safety.everyRowHasSourcePointer, true);
  assert.ok(formulary.payload.rows.length >= 1);
  assert.ok(formulary.payload.rows.some((row) => row.medicationLabel === "Ozempic"));
  assert.ok(formulary.payload.rows.some((row) => row.requirements.includes("prior_authorization_signal")));
  assert.ok(formulary.payload.rows.some((row) => row.requirements.includes("quantity_limit_signal")));
  assert.ok(formulary.payload.rows.every((row) => row.sourcePointerIds.includes("research_artifacts/artifact_rx_1")));
});

test("AI2UI pharmacy formulary fails closed when a prescription ask has no source pointers", () => {
  const blocks = buildAi2UiBlocksFromState({
    graph_trace_id: "lgtrace_rx_missing",
    workflow: "pharmacy_formulary",
    user_input: "Is this medication covered under my plan formulary?",
    final_response: "I cannot answer without evidence.",
    source_pointers: [],
    evidence_observation: { status: "blocked_no_trusted_research_evidence", actionsTaken: [] }
  });

  const formulary = blocks.find((block) => block.type === AI2UI_BLOCK_TYPES.PHARMACY_FORMULARY);
  assert.ok(formulary);
  assert.equal(formulary.payload.status, "blocked_missing_source_pointers");
  assert.equal(formulary.payload.rowCount, 0);
  assert.deepEqual(formulary.payload.rows, []);
  assert.equal(formulary.payload.safety.noMedicationAdvice, true);
  assert.ok(formulary.payload.missingEvidence.includes("cited formulary or drug-list evidence"));
});

test("AI2UI builder returns source-backed procedure checklist rows for procedure prep questions", () => {
  const blocks = buildAi2UiBlocksFromState({
    graph_trace_id: "lgtrace_procedure",
    workflow: "eligibility_benefits_navigation",
    structured_intent: { reasoning: { primary_intent: "procedure_admin_checklist" } },
    user_input: "Can you make a procedure prep checklist for my colonoscopy appointment?",
    final_response: "A sourced procedure preparation answer.",
    source_pointers: [
      {
        table: "research_artifacts",
        id: "artifact_proc_1",
        displayLabel: "Reviewed procedure preparation evidence",
        evidenceFields: [
          {
            label: "Colonoscopy administrative checklist",
            value: "Before the procedure, confirm prior authorization, bring photo ID and insurance card, arrive 30 minutes early, and arrange a driver. Follow facility prep instructions for fasting.",
            confidence: "high"
          }
        ],
        citation: { confidence: "high" }
      }
    ],
    evidence_observation: { status: "captured_trusted_research_evidence", actionsTaken: ["trusted_research_evidence_search"] }
  });

  const checklist = blocks.find((block) => block.type === AI2UI_BLOCK_TYPES.PROCEDURE_CHECKLIST);
  assert.ok(checklist);
  assert.equal(checklist.payload.status, "source_backed_procedure_checklist_ready");
  assert.equal(checklist.payload.safety.administrativeSupportOnly, true);
  assert.equal(checklist.payload.safety.noMedicalAdvice, true);
  assert.equal(checklist.payload.safety.noClinicalInstructionCreation, true);
  assert.equal(checklist.payload.safety.everyRowHasSourcePointer, true);
  assert.ok(checklist.payload.rows.length >= 1);
  assert.ok(checklist.payload.rows.some((row) => row.signals.includes("authorization_signal")));
  assert.ok(checklist.payload.rows.some((row) => row.signals.includes("document_signal")));
  assert.ok(checklist.payload.rows.some((row) => row.signals.includes("transportation_signal")));
  assert.ok(checklist.payload.rows.every((row) => row.sourcePointerIds.includes("research_artifacts/artifact_proc_1")));
});

test("AI2UI procedure checklist fails closed when a procedure prep ask has no source pointers", () => {
  const blocks = buildAi2UiBlocksFromState({
    graph_trace_id: "lgtrace_procedure_missing",
    workflow: "eligibility_benefits_navigation",
    structured_intent: { reasoning: { primary_intent: "procedure_admin_checklist" } },
    user_input: "What should I do before my procedure appointment?",
    final_response: "I cannot create a checklist without evidence.",
    source_pointers: [],
    evidence_observation: { status: "blocked_no_trusted_research_evidence", actionsTaken: [] }
  });

  const checklist = blocks.find((block) => block.type === AI2UI_BLOCK_TYPES.PROCEDURE_CHECKLIST);
  assert.ok(checklist);
  assert.equal(checklist.payload.status, "blocked_missing_source_pointers");
  assert.equal(checklist.payload.rowCount, 0);
  assert.deepEqual(checklist.payload.rows, []);
  assert.equal(checklist.payload.safety.noMedicalAdvice, true);
  assert.ok(checklist.payload.missingEvidence.includes("cited procedure or facility instruction"));
});

test("AI2UI builder returns source-backed provider network rows for provider/facility questions", () => {
  const blocks = buildAi2UiBlocksFromState({
    graph_trace_id: "lgtrace_provider_network",
    workflow: "eligibility_benefits_navigation",
    structured_intent: { reasoning: { primary_intent: "provider_network" } },
    user_input: "Is Midtown Imaging Center in network and accepting new patients?",
    final_response: "A sourced provider network answer.",
    source_pointers: [
      {
        table: "research_artifacts",
        id: "artifact_provider_1",
        displayLabel: "Reviewed provider directory evidence",
        evidenceFields: [
          {
            label: "Provider directory network status",
            value: "Midtown Imaging Center is listed in the provider directory as an in-network participating imaging facility for the plan. NPI 1234567890 is shown, accepting new patients, and referral may be required.",
            confidence: "high"
          }
        ],
        citation: { confidence: "high" }
      }
    ],
    evidence_observation: { status: "captured_trusted_research_evidence", actionsTaken: ["trusted_research_evidence_search"] }
  });

  const providerNetwork = blocks.find((block) => block.type === AI2UI_BLOCK_TYPES.PROVIDER_NETWORK);
  assert.ok(providerNetwork);
  assert.equal(providerNetwork.payload.status, "source_backed_provider_network_ready");
  assert.equal(providerNetwork.payload.safety.evidenceNavigationOnly, true);
  assert.equal(providerNetwork.payload.safety.noNetworkGuarantee, true);
  assert.equal(providerNetwork.payload.safety.noProviderContact, true);
  assert.equal(providerNetwork.payload.safety.noSchedulingAction, true);
  assert.equal(providerNetwork.payload.safety.everyRowHasSourcePointer, true);
  assert.ok(providerNetwork.payload.rows.length >= 1);
  assert.ok(providerNetwork.payload.rows.some((row) => row.providerLabel.includes("Midtown Imaging Center")));
  assert.ok(providerNetwork.payload.rows.some((row) => row.networkSignal === "in_network_signal"));
  assert.ok(providerNetwork.payload.rows.some((row) => row.details.includes("npi_signal")));
  assert.ok(providerNetwork.payload.rows.some((row) => row.details.includes("accepting_new_patients_signal")));
  assert.ok(providerNetwork.payload.rows.every((row) => row.sourcePointerIds.includes("research_artifacts/artifact_provider_1")));
});

test("AI2UI provider network card fails closed when provider ask has no source pointers", () => {
  const blocks = buildAi2UiBlocksFromState({
    graph_trace_id: "lgtrace_provider_missing",
    workflow: "eligibility_benefits_navigation",
    structured_intent: { reasoning: { primary_intent: "provider_network" } },
    user_input: "Is this doctor in network?",
    final_response: "I cannot verify network status without evidence.",
    source_pointers: [],
    evidence_observation: { status: "blocked_no_trusted_research_evidence", actionsTaken: [] }
  });

  const providerNetwork = blocks.find((block) => block.type === AI2UI_BLOCK_TYPES.PROVIDER_NETWORK);
  assert.ok(providerNetwork);
  assert.equal(providerNetwork.payload.status, "blocked_missing_source_pointers");
  assert.equal(providerNetwork.payload.rowCount, 0);
  assert.deepEqual(providerNetwork.payload.rows, []);
  assert.equal(providerNetwork.payload.safety.noNetworkGuarantee, true);
  assert.ok(providerNetwork.payload.missingEvidence.includes("cited provider directory or network directory evidence"));
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
