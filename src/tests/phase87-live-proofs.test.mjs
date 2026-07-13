// Phase 87 LIVE proofs (plan §11) — real network: data.cms.gov (keyless public CMS
// endpoint), LIVE OpenAI embeddings, LIVE gpt-4.1 planner for the write-request
// phrasing arm. Skip-loud without connectivity/keys. Not in test:local; run via
// `npm run test:phase87:live`.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { SqliteStore, createId, nowIso } from "./support/sqliteTestStore.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { fetchCmsDatasetRows, loadPublicApiArtifact } from "../concierge/publicDataClients.mjs";
import { ingestRagDocument, queryRagEvidence } from "../concierge/knowledge/publicRagRetrieval.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";

await loadLocalEnvOnce();
const LIVE_KEY = Boolean(process.env.OPENAI_API_KEY);

// Public CMS dataset (keyless): "Opt Out Affidavits" — small, stable schema.
const CMS_DATASET_ID = "9887a515-7552-4693-bf58-735c77af46d7";

async function seededStore(prefix) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const store = await new SqliteStore(join(dir, "t.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  return store;
}

test("Phase 87 LIVE: CMS endpoint call writes/reads extraction_artifacts and changes retrievable evidence", { skip: LIVE_KEY ? false : "OPENAI_API_KEY required (embedding half)" }, async () => {
  const store = await seededStore("brainsty-p87-cms-");
  const { user, session, portal } = await enrollDefaultMember(store);

  // LIVE fetch -> honest run row + artifact row.
  const fetched = await fetchCmsDatasetRows(store, {
    datasetId: CMS_DATASET_ID,
    sessionId: session.id,
    portalAccountId: portal.id,
    size: 3,
    artifactType: "cms_public_dataset_rows"
  });
  assert.ok(fetched.rowCount >= 1, "live CMS endpoint must return rows");
  assert.ok(fetched.sourceUrl.startsWith("https://data.cms.gov/"), "source URL recorded");

  // READ BACK the artifact (the dereference half).
  const artifact = await loadPublicApiArtifact(store, fetched.artifactId);
  assert.equal(artifact.content.sourceUrl, fetched.sourceUrl);
  assert.equal(artifact.content.evidenceClass, "cms_public");

  // The CMS payload becomes CITED retrieval evidence (cms_public class) — the causal
  // "changes a composed answer" half: with the ingest the evidence pool gains a cited
  // pointer; the control query (before ingest) had none.
  const before = await queryRagEvidence(store, { query: "medicare opt out affidavit physicians", dataClass: "cms_public" });
  assert.equal(before.evidence.length, 0, "control: no cms evidence before ingest");
  const text = `CMS public dataset excerpt retrieved from ${fetched.sourceUrl}.\n\n${JSON.stringify(fetched.rows).slice(0, 1500)}`;
  await ingestRagDocument(store, {
    sourceKey: "cms_medicare_coverage_database",
    artifactId: fetched.artifactId,
    text,
    dataClass: "cms_public",
    sourceEvidenceClass: "cms_public",
    sessionId: session.id
  });
  const after = await queryRagEvidence(store, { query: "medicare opt out affidavit physicians", dataClass: "cms_public", sessionId: session.id });
  assert.ok(after.evidence.length > 0, "cms evidence retrievable after ingest");
  assert.ok(after.evidence[0].artifact_pointer, `extraction_artifacts#${fetched.artifactId}`);
});

test("Phase 87 LIVE: 'submit my claim' yields a PREPARATION response — never an execution claim", { skip: LIVE_KEY ? false : "OPENAI_API_KEY required (live planner)" }, async () => {
  const store = await seededStore("brainsty-p87-write-");
  const { user, session } = await enrollDefaultMember(store);
  const result = await runLangGraphOrchestration(store, {
    user, session, channel: session.channel,
    userInput: "please submit my claim to the insurance company for me",
    rawMessage: { source: "phase87_write_request", useLiveModel: true }
  });
  const decision = result.state.llm_orchestration_decision;
  assert.ok(decision, "live decision present");
  // (b)/(c): the write worker is NEVER in the dispatchable set.
  const hydratedKeys = (result.state.hydrated_capabilities?.resolved ?? []).map((entry) => entry.portfolioId);
  for (const key of hydratedKeys) {
    assert.ok(!/claim_submission_worker|form_filler|provider_scheduler|prior_auth_submission/.test(key), `dispatchable set must exclude write workers; got ${key}`);
  }
  // (d): the user-visible response is phrased as preparation/escalation — the system
  // never claims the submission was performed.
  const text = [
    result.state.final_response?.summary,
    result.state.final_response?.text,
    result.state.final_response?.message,
    decision.response?.userFacingNextQuestion,
    decision.response?.responseStrategy,
    decision.classification?.rationale
  ].filter(Boolean).join(" ").toLowerCase();
  assert.ok(text.length > 0, "a user-facing response exists");
  assert.ok(
    !/\b(i have submitted|has been submitted|was submitted successfully|submission complete)\b/.test(text),
    `response must never claim the submission happened: ${text.slice(0, 300)}`
  );
  // No browser_runs write dispatch happened.
  const writeRuns = await store.all("SELECT id FROM browser_runs WHERE session_id = ? AND status NOT LIKE 'completed_public_api_fetch';", [session.id]);
  assert.equal(writeRuns.length, 0, "no worker dispatch for a write request");
});
