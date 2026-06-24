import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const PHASE67_GRAPHITI_SCHEMA_MEMORY_VERSION = "2026-06-22.phase67-graphiti-zep-schema-memory.v1";

const REQUIRED_FILES = [
  "brainsty_memory/entities.py",
  "brainsty_memory/edges.py",
  "brainsty_memory/groups.py",
  "brainsty_memory/temporal.py",
  "brainsty_memory/privacy.py",
  "brainsty_memory/ingest/schemas.py",
  "brainsty_memory/retrieval/primitives.py",
  "brainsty_memory/retrieval/views.py",
  "brainsty_memory/migrate.py",
  "docs/schema.md",
  "tests/test_schema_contract.py"
];

export function buildPhase67GraphitiSchemaMemoryProof({ rootDir = process.cwd() } = {}) {
  const missingFiles = REQUIRED_FILES.filter((file) => !existsSync(join(rootDir, file)));
  const seedDir = join(rootDir, "brainsty_memory/seeds/loop_templates");
  const seedCount = existsSync(seedDir) ? readdirSync(seedDir).filter((file) => file.endsWith(".yaml")).length : 0;
  const schemaDoc = existsSync(join(rootDir, "docs/schema.md")) ? readFileSync(join(rootDir, "docs/schema.md"), "utf8") : "";
  const tests = existsSync(join(rootDir, "tests/test_schema_contract.py")) ? readFileSync(join(rootDir, "tests/test_schema_contract.py"), "utf8") : "";
  const checks = {
    entitiesPresent: !missingFiles.includes("brainsty_memory/entities.py"),
    edgesPresent: !missingFiles.includes("brainsty_memory/edges.py"),
    groupIdsPresent: !missingFiles.includes("brainsty_memory/groups.py"),
    temporalHelpersPresent: !missingFiles.includes("brainsty_memory/temporal.py"),
    privacyFilterPresent: !missingFiles.includes("brainsty_memory/privacy.py"),
    ingestionSchemasPresent: !missingFiles.includes("brainsty_memory/ingest/schemas.py"),
    retrievalPrimitivesPresent: !missingFiles.includes("brainsty_memory/retrieval/primitives.py"),
    migrationBootstrapPresent: !missingFiles.includes("brainsty_memory/migrate.py"),
    sevenSeedTemplatesPresent: seedCount >= 7,
    docsPresent: schemaDoc.includes("Graphiti/Zep Memory Schema"),
    privacyRuleDocumented: schemaDoc.includes("Provider-facing price retrieval"),
    testsCoverFourteenContracts: (tests.match(/def test_/g) ?? []).length >= 14,
    noExecutorImplementedHere: !schemaDoc.includes("implements the Ralph loop executor")
  };
  const entries = Object.entries(checks);
  const passed = entries.filter(([, ok]) => ok).length;
  const score = Math.round((passed / entries.length) * 100);
  return {
    version: PHASE67_GRAPHITI_SCHEMA_MEMORY_VERSION,
    status: score === 100 ? "phase67_graphiti_zep_schema_contract_ready" : "phase67_graphiti_zep_schema_contract_attention",
    ok: score === 100,
    score,
    target: 100,
    checks,
    seedCount,
    missingFiles,
    contract: {
      graphitiApiBudget: ["add_episode", "search", "search_nodes", "valid_at", "invalid_at", "group_id"],
      phiPayloadPolicy: "pointer_hash_only",
      retrievalBoundary: "view_models_not_raw_graphiti_nodes",
      executionBoundary: "schema_only_no_executor_no_ui",
      testCommand: "npm run test:memory:schema"
    }
  };
}
