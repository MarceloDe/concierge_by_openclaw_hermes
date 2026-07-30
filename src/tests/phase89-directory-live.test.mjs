// Phase 89 LIVE Plan-Net proofs (plan §9/§11) — real network (fhir.humana.com public
// Plan-Net R4 server), real 2-page Bundle pagination, real mirror rows, and the LIVE
// gpt-4.1 planner routing the in-network-cardiologist question to the new process with
// CITED directory source URLs. Skip-loud offline. Run via `npm run test:phase89:live`.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { SqliteStore, createId, nowIso } from "./support/sqliteTestStore.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { createFhirClient } from "../concierge/connectors/fhirClient.mjs";
import { probeConnectorEndpoint, upsertConnectorEndpoint, connectorFeasibility } from "../concierge/connectors/endpointRegistry.mjs";
import { extractDirectoryQuery, queryProviderDirectoryEvidence, syncProviderDirectory } from "../concierge/connectors/planNetDirectory.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";

await loadLocalEnvOnce();
const LIVE_KEY = Boolean(process.env.OPENAI_API_KEY);
const BASE = "https://fhir.humana.com/api";

async function seededStore(prefix) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const store = await new SqliteStore(join(dir, "t.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  return store;
}

test("Phase 89 LIVE: CapabilityStatement + 2-page real Bundle pagination synced into the mirror (idempotent)", async (t) => {
  const store = await seededStore("brainsty-p89-dirlive-");
  await upsertConnectorEndpoint(store, { payerKey: "humana", connectorKind: "plan_net_directory", baseUrl: BASE, authMode: "none" });
  const probe = await probeConnectorEndpoint(store, { payerKey: "humana", connectorKind: "plan_net_directory" });
  if (probe.status !== "connected") {
    t.skip(`live Plan-Net endpoint unreachable (${JSON.stringify(probe)}) — skip-loud, never faked`);
    return;
  }
  const feasibility = await connectorFeasibility(store, { payerKey: "humana", connectorKind: "plan_net_directory" });
  assert.equal(feasibility.feasible, true, "the stored probe fact drives feasibility");

  const client = createFhirClient({ baseUrl: BASE, authMode: "none", defaultCount: 20 });
  const capability = await client.capabilityStatement();
  assert.equal(capability.resourceType, "CapabilityStatement");
  assert.ok(String(capability.fhirVersion).startsWith("4."), "R4 server");

  const sync = await syncProviderDirectory(store, { client, payerKey: "humana", specialty: "207RC0000X", count: 20, maxPages: 2 });
  assert.equal(sync.pages, 2, "must page through >= 2 REAL Bundle pages");
  assert.ok(sync.inserted >= 20, `real rows inserted (got ${sync.inserted})`);
  assert.ok(sync.pageUrls[1].includes("_skip=") || sync.pageUrls[1] !== sync.pageUrls[0], "page 2 came from the REAL next link");

  // Idempotent re-sync: the same two pages insert nothing new.
  const resync = await syncProviderDirectory(store, { client, payerKey: "humana", specialty: "207RC0000X", count: 20, maxPages: 2 });
  assert.equal(resync.inserted, 0, "re-sync must be idempotent on row_content_hash");
  assert.ok(resync.skipped >= 20);

  // Query half: cited rows with REAL directory source URLs.
  const evidence = await queryProviderDirectoryEvidence(store, { specialty: "cardiology", limit: 3 });
  assert.ok(evidence.length > 0, "mirror answers the specialty query");
  for (const row of evidence) {
    assert.ok(row.sourceUrl.startsWith("https://fhir.humana.com/"), "each row cites its REAL directory source URL");
    assert.ok(row.sourcePointer.startsWith("provider_directory_entries#"));
  }
});

test("Phase 89 LIVE: '/find an in-network cardiologist near {zip}' routes via the REAL planner and cites stored source URLs", { skip: LIVE_KEY ? false : "OPENAI_API_KEY required (live planner arm)" }, async (t) => {
  const store = await seededStore("brainsty-p89-chat-");
  await upsertConnectorEndpoint(store, { payerKey: "humana", connectorKind: "plan_net_directory", baseUrl: BASE, authMode: "none" });
  const probe = await probeConnectorEndpoint(store, { payerKey: "humana", connectorKind: "plan_net_directory" });
  if (probe.status !== "connected") {
    t.skip("live Plan-Net endpoint unreachable — skip-loud");
    return;
  }
  const client = createFhirClient({ baseUrl: BASE, authMode: "none", defaultCount: 20 });
  await syncProviderDirectory(store, { client, payerKey: "humana", specialty: "207RC0000X", count: 20, maxPages: 2 });

  const { user, session } = await enrollDefaultMember(store);
  const question = "find an in-network cardiologist near 33143";
  const parsed = extractDirectoryQuery(question);
  assert.equal(parsed.specialty, "cardiology");
  assert.equal(parsed.zip, "33143");

  const run = await runLangGraphOrchestration(store, {
    user, session, channel: session.channel,
    userInput: question,
    rawMessage: { source: "phase89_chat_arm", useLiveModel: true }
  });
  const decision = run.state.llm_orchestration_decision;
  assert.equal(decision.classification?.workflow, "provider_network_navigation", `REAL planner must route to the new workflow; got ${decision.classification?.workflow}`);
  const offered = decision.selected_tools?.offeredProcessIds ?? [];
  assert.ok(offered.includes("process:provider_network_search") || decision.selected_tools?.recommendedProcessId === "process:provider_network_search", `the new process must be offered; got ${JSON.stringify(offered)}`);

  const directoryPointers = (run.state.source_pointers ?? []).filter((pointer) => pointer.table === "provider_directory_entries");
  assert.ok(directoryPointers.length > 0, "the run must carry CITED directory pointers");
  for (const pointer of directoryPointers) {
    assert.ok(String(pointer.sourceUrl ?? "").startsWith("https://fhir.humana.com/"), "stored source URLs cited");
  }
  const text = String(run.state.final_response?.summary ?? run.state.final_response?.text ?? JSON.stringify(run.state.final_response ?? {}));
  assert.ok(/directory|provider/i.test(text), "user-visible answer references the directory evidence");
});
