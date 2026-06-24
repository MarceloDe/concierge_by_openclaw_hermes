import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildPhase67GraphitiSchemaMemoryProof } from "../concierge/graphitiSchemaMemory.mjs";

const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
const app = await readFile(new URL("../app/app.js", import.meta.url), "utf8");
const server = await readFile(new URL("../server/server.mjs", import.meta.url), "utf8");

test("Phase 67 Graphiti/Zep schema memory proof is registered and complete", () => {
  const proof = buildPhase67GraphitiSchemaMemoryProof();

  assert.equal(proof.status, "phase67_graphiti_zep_schema_contract_ready");
  assert.equal(proof.ok, true);
  assert.equal(proof.score, 100);
  assert.equal(proof.seedCount, 7);
  assert.deepEqual(proof.missingFiles, []);
  assert.equal(proof.contract.phiPayloadPolicy, "pointer_hash_only");
  assert.equal(proof.contract.executionBoundary, "schema_only_no_executor_no_ui");
});

test("Phase 67 schema memory gate is visible in scripts, server proof, and dashboard", () => {
  assert.equal(packageJson.scripts["test:memory:schema"], "python3 tests/test_schema_contract.py");
  assert.match(server, /buildPhase67GraphitiSchemaMemoryProof/);
  assert.match(server, /phase67_graphiti_zep_schema_memory/);
  assert.match(app, /Phase 67 Graphiti\/Zep Schema Memory/);
  assert.match(app, /npm run test:memory:schema/);
});
