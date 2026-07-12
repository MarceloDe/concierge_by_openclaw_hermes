// Phase 89 cost + PA arms (plan §11) — LIVE network (real MRF stream slice, real
// crawled CMS policy page) + real graph runs. Skip-loud offline. Proves: the cost
// question composes WITH the MRF source pointer AND the mandatory non-guarantee
// disclaimer and passes the coverage-number guard; the PA-requirement question answers
// evidence_sourced citing a stored policy pointer; PA packet-prep Part 1 stores a
// prepared-for-review packet (never a submission).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { SqliteStore, createId, nowIso } from "./support/sqliteTestStore.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { fetchMrfIndex, selectSmallestInNetworkFile, streamIngestInNetworkFile } from "../concierge/connectors/mrfPipeline.mjs";
import { ingestPaPolicyCorpus } from "../../scripts/ingest-pa-policy-corpus.mjs";
import { reviewResearchArtifact } from "../concierge/researchOps.mjs";
import { buildPaPacketPreparation } from "../concierge/connectors/pasPacket.mjs";
import { evictConsentState } from "../concierge/consentStateRuntime.mjs";

await loadLocalEnvOnce();
const MRF_INDEX = "https://mrf.healthsparq.com/aetnacvs-egress.nophi.kyruushsq.com/prd/mrf/AETNACVS_I/ALICSI/latest_metadata.json";

async function seededStore(prefix) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const store = await new SqliteStore(join(dir, "t.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  return store;
}

test("Phase 89 LIVE: cost question answers WITH MRF source pointer + non-guarantee disclaimer (coverage-number guard holds)", async (t) => {
  const store = await seededStore("brainsty-p89-cost-");
  const { user, session } = await enrollDefaultMember(store);
  await store.all("UPDATE user_consents SET mrf_pricing_lookup_approved = 1, updated_at = ? WHERE user_id = ?;", [nowIso(), user.id]);
  await evictConsentState([session.id]);

  // Real streamed slice from the VERIFIED public index (bounded read).
  let landedCode = null;
  try {
    const index = await fetchMrfIndex({ indexUrl: MRF_INDEX });
    const file = await selectSmallestInNetworkFile(index.files, {});
    const ingest = await streamIngestInNetworkFile(store, { fileUrl: file.url, maxObservations: 40 });
    assert.ok(ingest.inserted > 0, "real observations must land");
    // Pick a code the deterministic extractor can parse (5-digit CPT or letter+4 HCPCS).
    const rows = await store.all("SELECT DISTINCT billing_code FROM mrf_price_observations;");
    landedCode = rows.map((row) => row.billing_code).find((code) => /^([A-Z]\d{4}|\d{5})$/.test(code)) ?? null;
    if (!landedCode) {
      t.skip(`no extractor-parsable billing code in this slice (landed: ${rows.map((row) => row.billing_code).join(",")}) — skip-loud`);
      return;
    }
  } catch (error) {
    t.skip(`live MRF stream unavailable (${error.failureClass ?? error.message}) — skip-loud`);
    return;
  }

  const run = await runLangGraphOrchestration(store, {
    user, session, channel: session.channel,
    userInput: `how much does procedure ${landedCode} cost in network?`,
    rawMessage: {
      source: "phase89_cost_arm", useLiveModel: false,
      llmOrchestrationDecisionReplay: {
        classification: { workflow: "cost_estimate_navigation", taskClass: "cost_estimation", intent: "cost_lookup", confidence: 0.9, rationale: "cost question with a billing code" },
        data_layer: ["layer_1_public"],
        risk_tier: "low",
        response: { responseStrategy: "answer", workerGoal: "cited price estimate" }
      }
    }
  });
  const mrfPointers = (run.state.source_pointers ?? []).filter((pointer) => pointer.table === "mrf_price_observations");
  assert.ok(mrfPointers.length > 0, "the run must carry CITED MRF pointers");
  const text = String(run.state.final_response?.summary ?? run.state.final_response?.text ?? JSON.stringify(run.state.final_response ?? {}));
  assert.ok(/not a guarantee|ESTIMATE for comparison/i.test(text), "the MANDATORY non-guarantee disclaimer must be in the composed answer");
  assert.ok(/mrf_price_observations\//.test(text), "the composed answer cites the MRF pointer");
});

test("Phase 89 LIVE: PA-requirement question answers evidence_sourced citing a stored policy pointer; packet prep is prepare-only", async (t) => {
  const store = await seededStore("brainsty-p89-pa-");
  const { user, session } = await enrollDefaultMember(store);

  // Real crawl (CMS MCD pages; polite; skip-loud offline) + the EXISTING operator review path.
  let crawl;
  try {
    crawl = await ingestPaPolicyCorpus(store, { limit: 2, delayMs: 800 });
  } catch (error) {
    t.skip(`live PA-policy crawl unavailable (${error.failureClass ?? error.message}) — skip-loud`);
    return;
  }
  assert.ok(crawl.ingested >= 1, "at least one real policy artifact must land");
  const artifacts = await store.all("SELECT id FROM research_artifacts;");
  for (const artifact of artifacts) {
    await reviewResearchArtifact(store, { artifactId: artifact.id, decision: "approve", reviewerUserId: user.id });
  }

  const run = await runLangGraphOrchestration(store, {
    user, session, channel: session.channel,
    userInput: "do I need prior authorization for a knee replacement?",
    rawMessage: {
      source: "phase89_pa_arm", useLiveModel: false, executeEvidenceObservation: false,
      llmOrchestrationDecisionReplay: {
        classification: { workflow: "prior_authorization_navigation", taskClass: "prior_auth_support", intent: "pa_requirement", confidence: 0.9, rationale: "PA requirement question" },
        data_layer: ["layer_1_public"],
        risk_tier: "low",
        response: { responseStrategy: "answer", workerGoal: "cited policy answer" }
      }
    }
  });
  const evidenceStatus = run.state.evidence_observation?.status ?? "";
  assert.ok(
    ["captured_trusted_research_evidence"].includes(evidenceStatus),
    `PA question must answer from sourced evidence; got ${evidenceStatus}`
  );
  const policyPointers = (run.state.source_pointers ?? []).filter((pointer) => pointer.table === "research_artifacts");
  assert.ok(policyPointers.length > 0, "a stored policy pointer must be cited");

  // Packet prep Part 1: prepared-for-review ONLY, cited evidence, audited.
  const prepared = await buildPaPacketPreparation(store, {
    userId: user.id, sessionId: session.id, procedureText: "prior authorization knee replacement"
  });
  assert.equal(prepared.packet.status, "prepared_for_review");
  assert.ok(prepared.packet.policyEvidence.length >= 1, "packet cites stored policy evidence");
  assert.ok(/PREPARED for your review/i.test(prepared.packet.disposition), "prepare-only phrasing is contract");
  const taskRow = await store.findOne("agent_tasks", { id: prepared.taskId });
  assert.equal(taskRow.status, "prepared_for_review");
  assert.equal(taskRow.task_type, "pa_packet_preparation");
});
