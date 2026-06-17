import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { composeSourcedAnswerWithOpenAI } from "../concierge/intelligence/sourcedAnswerComposer.mjs";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";

await loadLocalEnvOnce();
const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);

test("live LLM sourced answer composer uses source pointers causally", { skip: hasOpenAI ? false : "OPENAI_API_KEY missing; live LLM composition proof blocked" }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-llm-composition-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  const { user, session } = await enrollDefaultMember(store, {
    email: "llm-composition-live@example.test",
    name: "Live Composition Test"
  });
  const state = {
    session_id: session.id,
    user_input: "What matters for an MRI in this SBC?",
    workflow: "document_or_trace_review",
    structured_intent: { reasoning: { primary_intent: "document_review" } },
    context_packet: { user: { id: user.id } },
    product_memory_recall: { facts: [] },
    source_pointers: [
      {
        table: "uploaded_document_extractions",
        id: "upload_mri_sbc",
        sourceUrl: "upload://upload_mri_sbc",
        summary: "SBC fixture says advanced imaging may require prior authorization and cost sharing varies by network.",
        evidenceFields: [
          { label: "Advanced imaging", value: "Prior authorization may be required.", confidence: "high" },
          { label: "Network", value: "Cost sharing differs in network vs out of network.", confidence: "medium" }
        ]
      }
    ]
  };
  const result = await composeSourcedAnswerWithOpenAI({
    state,
    deterministicAnswer: "Deterministic fallback answer.",
    store,
    sessionId: state.session_id,
    user
  });
  assert.equal(result.mode, "openai_chatopenai_invoked");
  assert.equal(result.valid, true, result.issues?.join("; "));
  assert.match(result.finalResponse, /MRI|imaging|authorization|network/i);
  assert.ok(result.answer.claims.every((claim) => claim.source_pointer_ids.includes("uploaded_document_extractions/upload_mri_sbc")));
});
