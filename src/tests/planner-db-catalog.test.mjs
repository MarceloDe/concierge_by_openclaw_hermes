// go-live 3/3 proof (no mocks): the DB catalog is the planner's surface, and selected
// pointers hydrate via the authoritative catalog hydrator (backing-precedence).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { catalogPortfolioKey } from "../concierge/capabilityCatalog.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";

async function seededStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-dbcat-"));
  const store = await new SqliteStore(join(dir, "d.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  return store;
}

test("go-live 3/3: replay decision with a DB-catalog pointer hydrates via the catalog (backing-precedence)", async () => {
  const prev = process.env.BRAINSTY_PLANNER_DB_CATALOG;
  delete process.env.BRAINSTY_PLANNER_DB_CATALOG; // default on
  try {
    const store = await seededStore();
    const { user, session } = await enrollDefaultMember(store);
    const pointer = `${catalogPortfolioKey(session.id)}#skill:insurance_portal_browser`;
    const result = await runLangGraphOrchestration(store, {
      user, session, channel: session.channel, userInput: "check my benefits",
      rawMessage: {
        source: "dbcat_test", useLiveModel: false, executeEvidenceObservation: false,
        llmOrchestrationDecisionReplay: {
          workflow: "eligibility_benefits_navigation", intent: "benefits_eligibility", confidence: 0.9,
          rationale: "replay", workerGoal: "read-only", selectedCapabilityPointers: [pointer]
        }
      }
    });
    const h = result.state.hydrated_capabilities;
    assert.ok(h, "hydrated_capabilities present");
    assert.equal(h.cacheBackend, "db_catalog", "hydration resolved via the DB catalog, not legacy");
    assert.equal(h.resolvedCount, 1, "DB-catalog pointer resolved");
    assert.equal(h.resolved[0].portfolioId, "skill:insurance_portal_browser");
  } finally {
    if (prev !== undefined) process.env.BRAINSTY_PLANNER_DB_CATALOG = prev;
  }
});
