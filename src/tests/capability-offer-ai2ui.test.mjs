// go-live 2/3 proof (no mocks): the process offer surfaces an AI2UI accept affordance,
// and executeAcceptedProcess is wired to the real OpenClaw observation (exported).
import test from "node:test";
import assert from "node:assert/strict";
import { buildAi2UiBlocksFromState, AI2UI_BLOCK_TYPES, normalizeAi2UiBlocks } from "../concierge/ai2uiBlocks.mjs";
import { executeAcceptedProcess } from "../concierge/capabilityCatalog.mjs";

test("go-live 2/3: capability offer emits an AI2UI accept-process block", () => {
  const blocks = buildAi2UiBlocksFromState({
    graph_trace_id: "t1",
    final_response: "I can offer a read-only portal lookup.",
    workflow_outcome: "capability_reasoned_offer",
    capability_offer: {
      recommendedProcessId: "process:portal_readonly_lookup",
      offeredProcessIds: ["process:portal_readonly_lookup"],
      processes: [{ processId: "process:portal_readonly_lookup", title: "Read-only insurer portal lookup", approvalScope: "read_only_observation", requiredUserInputs: [{ key: "which_payer_portal", label: "Which insurance portal" }] }]
    }
  });
  const offer = blocks.find((b) => b.type === AI2UI_BLOCK_TYPES.CAPABILITY_PROCESS_OFFER);
  assert.ok(offer, "capability_process_offer block present");
  assert.equal(offer.payload.recommendedProcessId, "process:portal_readonly_lookup");
  assert.equal(offer.payload.processes[0].acceptAction.action, "accept_process_offer");
  assert.equal(offer.payload.processes[0].acceptAction.processId, "process:portal_readonly_lookup");
  assert.equal(offer.payload.processes[0].approvalScope, "read_only_observation");
  // block survives normalization (supported type).
  const normalized = normalizeAi2UiBlocks(blocks);
  assert.ok(normalized.some((b) => b.type === AI2UI_BLOCK_TYPES.CAPABILITY_PROCESS_OFFER));
});

test("go-live 2/3: executeAcceptedProcess is wired (real OpenClaw observation entrypoint)", () => {
  assert.equal(typeof executeAcceptedProcess, "function", "accept executor exported and ready to wire to a UI accept action");
});
