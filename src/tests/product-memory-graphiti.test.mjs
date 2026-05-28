import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { getProductMemoryStatus, probeProductMemory } from "../concierge/productMemory.mjs";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";

test("real Graphiti/FalkorDB product memory schema retains and recalls safe facts", async (t) => {
  if (process.env.BRAINSTY_GRAPHITI_LIVE !== "1") {
    t.skip("Set BRAINSTY_GRAPHITI_LIVE=1 and run npm run graphiti:falkordb first.");
    return;
  }
  await loadLocalEnvOnce();
  process.env.BRAINSTY_PRODUCT_MEMORY_ADAPTER = "graphiti";
  process.env.GRAPHITI_BACKEND = "falkordb";
  process.env.FALKORDB_HOST = process.env.FALKORDB_HOST ?? "localhost";
  process.env.FALKORDB_PORT = process.env.FALKORDB_PORT ?? "6380";
  process.env.GRAPHITI_GROUP_ID = `brainstyworkers_test_${Date.now()}`;
  process.env.GRAPHITI_STORE_RAW_EPISODES = "0";

  const dir = await mkdtemp(join(tmpdir(), "brainsty-graphiti-memory-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  const enrollment = await enrollDefaultMember(store, {
    name: "Graphiti Memory Member",
    email: "graphiti-memory@example.com",
    payer: "Aetna",
    portalUrl: "https://www.aetna.com/"
  });

  const status = await getProductMemoryStatus({
    requireEnabled: true,
    store,
    sessionId: enrollment.session.id,
    user: enrollment.user
  });
  assert.equal(status.schemaReady, true);
  assert.equal(status.backend, "falkordb");
  assert.equal(status.rawEpisodeStorage, false);

  const probe = await probeProductMemory({
    store,
    user: enrollment.user,
    session: enrollment.session,
    query: "BrainstyMember deductible remaining EligibilitySnapshot source pointer"
  });
  assert.ok(probe.retained.episodeUuid);
  assert.ok(probe.recalled.facts.length >= 1, JSON.stringify(probe.recalled));
  assert.equal(probe.rawPortalTextStored, false);
  assert.equal(probe.cortexProductMemory, false);

  const graphRun = await runLangGraphOrchestration(store, {
    user: enrollment.user,
    session: enrollment.session,
    channel: enrollment.session.channel,
    userInput: "Do I still owe anything before insurance starts paying?",
    rawMessage: {
      source: "product_memory_graphiti_test",
      executeEvidenceObservation: false,
      useLiveModel: false
    }
  });

  assert.equal(graphRun.productMemory.recall.adapter, "graphiti");
  assert.equal(graphRun.productMemory.retain.adapter, "graphiti");
  assert.equal(graphRun.productMemory.retain.retained, true, JSON.stringify(graphRun.productMemory.retain));
  assert.ok(graphRun.productMemory.retain.episodeUuid);
  assert.match(graphRun.state.memory_context, /Graphiti memory fact/);

  const payloadAudits = await store.all(
    `SELECT * FROM audit_events WHERE session_id = '${enrollment.session.id.replaceAll("'", "''")}' AND event_type = 'outbound_payload_observed';`
  );
  const details = payloadAudits.map((row) => JSON.parse(row.details));
  assert.ok(details.some((item) => item.payloadType === "graphiti_probe_retain"));
  assert.ok(details.some((item) => item.payloadType === "graphiti_probe_recall"));
  assert.ok(details.some((item) => item.payloadType === "graphiti_recall"));
  assert.ok(details.some((item) => item.payloadType === "graphiti_retain"));
  const retainAudit = details.find((item) => item.payloadType === "graphiti_retain");
  assert.equal(retainAudit.destination, "zep_graphiti");
  assert.equal(retainAudit.containsSourcePointers, true);
  assert.equal(retainAudit.containsDirectIdentifier, false);
  assert.equal(retainAudit.containsPortalText, false);
  assert.equal(retainAudit.allowedByCurrentPrototypePolicy, true);
  assert.equal(retainAudit.enforcementMode, "enforced");
  assert.deepEqual(retainAudit.policyIssues, []);
  assert.ok(retainAudit.serializedPayload.includes("episodeBody"));
});
