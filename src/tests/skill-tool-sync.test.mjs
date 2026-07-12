// Phase 87 (§7): skill.json allowed_tools and the DB OPENCLAW_SKILLS seed are
// SET-EQUAL (synced in one commit; this gate keeps them from drifting again), the
// dead OS-automation tool is gone, and every openclaw tool either resolves an
// executor in the explicit map or is a documented substrate/companion entry.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { SqliteStore, createId, nowIso } from "./support/sqliteTestStore.mjs";
import { toolExecutorAssignments } from "../concierge/workflowArchitecture.mjs";
import { selectExecutorForTool } from "../concierge/openclaw/executorRegistry.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("Phase 87: skill.json allowed_tools set-equals the DB openclaw_skills seed", async () => {
  const manifest = JSON.parse(await readFile(join(repoRoot, "openclaw/skills/insurance-portal-browser/skill.json"), "utf8"));
  const dir = await mkdtemp(join(tmpdir(), "brainsty-skillsync-"));
  const store = await new SqliteStore(join(dir, "t.sqlite")).initialize(); // seeds registries
  const row = await store.findOne("openclaw_skills", { skill_key: "insurance_portal_browser" });
  const dbTools = new Set(JSON.parse(row.allowed_tools_json));
  const manifestTools = new Set(manifest.allowed_tools);
  assert.deepEqual([...dbTools].sort(), [...manifestTools].sort(), "skill.json and DB allowed_tools must be SET-EQUAL");
  assert.equal(dbTools.has("local_os_automation"), false, "dead OS-automation tool must be gone");
  assert.equal(dbTools.has("website_scraper"), false, "renamed scraper key must be gone");
  assert.ok(dbTools.has("public_web_scraper_openclaw"));
});

test("Phase 87: every registry tool with a non-null executor resolves deterministically; write workers fail loud", async () => {
  const assignments = toolExecutorAssignments();
  for (const [toolKey, entry] of Object.entries(assignments)) {
    const selected = selectExecutorForTool(toolKey);
    if (entry.executorKey) {
      assert.equal(selected.ok, true, `${toolKey} must resolve its mapped executor`);
      assert.equal(selected.executorKey, entry.executorKey);
    } else {
      assert.equal(selected.ok, false, `${toolKey} (null executor) must fail loud`);
      assert.equal(selected.status, "executor_missing");
    }
  }
  // Unknown keys are LOUD, never bucketed.
  assert.equal(selectExecutorForTool("no_such_tool").status, "executor_missing");
});

test("Phase 87: signature-gated write workers are write_capable registry rows with NO executor", async () => {
  const assignments = toolExecutorAssignments();
  for (const key of ["openclaw_claim_submission_worker", "openclaw_form_filler", "openclaw_provider_scheduler", "prior_auth_submission_pas_api"]) {
    assert.ok(assignments[key], `${key} must exist in the registry`);
    assert.equal(assignments[key].executorKey, null, `${key} must have NO executor before Phase 92`);
    assert.equal(assignments[key].writeCapable, 1, `${key} must be declared write-capable`);
  }
});
