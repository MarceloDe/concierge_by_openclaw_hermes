import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import {
  buildSafeProductMemoryEpisode,
  getProductMemoryConfig,
  getProductMemoryStatus,
  probeProductMemoryAtBoot,
  retainProductMemoryFromGraphRun
} from "../concierge/productMemory.mjs";

function withEnv(values, fn) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

test("mocked Bedrock provider conforms to the Graphiti bridge contract", () => {
  const result = spawnSync("python3", ["tools/graphiti/graphiti_bridge_bedrock_test.py"], {
    cwd: resolve("."),
    encoding: "utf8"
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("BRAINSTY_GRAPHITI_PYTHON override is honored without changing the default", async () => {
  await withEnv(
    {
      BRAINSTY_GRAPHITI_PYTHON: "/opt/brainsty/graphiti/bin/python",
      GRAPHITI_LLM_PROVIDER: "bedrock",
      GRAPHITI_BEDROCK_EMBED_MODEL_ID: "amazon.titan-embed-text-v2:0"
    },
    async () => {
      const config = getProductMemoryConfig();
      assert.equal(config.pythonPath, "/opt/brainsty/graphiti/bin/python");
      assert.equal(config.llmProvider, "bedrock");
      assert.equal(config.bedrock.embeddingModelId, "amazon.titan-embed-text-v2:0");
    }
  );
  await withEnv({ BRAINSTY_GRAPHITI_PYTHON: undefined }, async () => {
    assert.match(getProductMemoryConfig().pythonPath, /\.venv-graphiti\/bin\/python$/);
  });
  await withEnv({ BRAINSTY_GRAPHITI_PYTHON: "python3" }, async () => {
    assert.equal(getProductMemoryConfig().pythonPath, "python3");
  });
});

test("Graphiti enabled without PHI clearance degrades without sending provider payloads", async () => {
  await withEnv(
    {
      BRAINSTY_PRODUCT_MEMORY_ADAPTER: "graphiti",
      BRAINSTY_PRODUCT_MEMORY_PHI_CLEARED: undefined,
      BRAINSTY_GRAPHITI_PYTHON: "/bin/false"
    },
    async () => {
      const status = await getProductMemoryStatus();
      assert.equal(status.ok, false);
      assert.equal(status.status, "degraded");
      assert.equal(status.reason, "phi_clearance_required");
      assert.equal(status.enabled, true);

      const dir = await mkdtemp(join(tmpdir(), "brainsty-product-memory-clearance-"));
      const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
      const enrollment = await enrollDefaultMember(store, {
        name: "Clearance Member",
        email: "clearance-member@example.com"
      });
      const retain = await retainProductMemoryFromGraphRun(store, {
        user: enrollment.user,
        session: enrollment.session,
        state: {
          should_remember: true,
          workflow: "eligibility_benefits_navigation",
          workflow_outcome: "completed_with_sourced_result",
          source_pointers: [{ table: "eligibility_snapshots", id: "snapshot_1", summary: "safe pointer" }]
        }
      });
      assert.equal(retain.ok, false);
      assert.equal(retain.reason, "phi_clearance_required");
      assert.equal(retain.retained, false);
      const audits = await store.all(
        "SELECT event_type, details FROM audit_events WHERE session_id = ? ORDER BY created_at ASC;",
        [enrollment.session.id]
      );
      const blockAudit = audits.find((row) => row.event_type === "product_memory_retain_blocked_phi_clearance");
      assert.ok(blockAudit, JSON.stringify(audits));
      const details = JSON.parse(blockAudit.details);
      assert.equal(details.payloadSent, false);
      assert.equal(details.rawPortalTextStored, false);
    }
  );
});

test("product memory boot probe is fail-soft", async () => {
  const logs = [];
  await withEnv(
    {
      BRAINSTY_PRODUCT_MEMORY_ADAPTER: "graphiti",
      BRAINSTY_PRODUCT_MEMORY_PHI_CLEARED: undefined
    },
    async () => {
      const status = await probeProductMemoryAtBoot({
        logger: {
          info: (message) => logs.push(message),
          warn: (message) => logs.push(message)
        },
        timeoutMs: 5
      });
      assert.equal(status.status, "degraded");
      assert.equal(status.reason, "phi_clearance_required");
      assert.match(logs.join("\n"), /boot probe/);
    }
  );
});

test("safe product-memory episode masks direct identifiers before provider calls", () => {
  const episode = buildSafeProductMemoryEpisode({
    user: { id: "user_mask" },
    session: { id: "session_mask" },
    state: {
      workflow: "eligibility_benefits_navigation",
      workflow_outcome: "completed_with_sourced_result",
      memory_summary: "Email member at patient@example.com after checking phone 212-555-1212.",
      source_pointers: [
        {
          table: "uploaded_document_extractions",
          id: "upload_1",
          displayLabel: "patient@example.com benefits document",
          summary: "The member email patient@example.com appears near the deductible.",
          evidenceFields: [{ label: "member_email", value: "patient@example.com", confidence: "low" }]
        }
      ]
    }
  });
  const serialized = JSON.stringify(episode);
  assert.doesNotMatch(serialized, /patient@example\.com/);
  assert.doesNotMatch(serialized, /212-555-1212/);
  assert.equal(episode.boundaries.rawPortalTextStored, false);
  assert.equal(episode.boundaries.cortexProductMemory, false);
});
