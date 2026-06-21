import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("Node connector image includes Graphiti/FalkorDB product-memory runtime", async () => {
  const dockerfile = await readFile(resolve("Dockerfile.node"), "utf8");
  assert.match(dockerfile, /python3 -m venv \.venv-graphiti/);
  assert.match(dockerfile, /vendor\/getzep-graphiti\[falkordb\]/);
  assert.match(dockerfile, /tools\/graphiti\/requirements-graphiti\.txt/);
  assert.match(dockerfile, /graphiti_core\.driver\.falkordb_driver/);
  assert.doesNotMatch(dockerfile, /COPY \.env/);
});

test("compose wires Graphiti runtime without enabling unsafe defaults", async () => {
  const compose = await readFile(resolve("compose.yaml"), "utf8");
  assert.match(compose, /BRAINSTY_PRODUCT_MEMORY_ADAPTER: \$\{BRAINSTY_PRODUCT_MEMORY_ADAPTER:-disabled\}/);
  assert.match(compose, /BRAINSTY_PRODUCT_MEMORY_PHI_CLEARED: \$\{BRAINSTY_PRODUCT_MEMORY_PHI_CLEARED:-\}/);
  assert.match(compose, /BRAINSTY_GRAPHITI_PYTHON: \$\{BRAINSTY_GRAPHITI_PYTHON:-\/app\/\.venv-graphiti\/bin\/python\}/);
  assert.match(compose, /GRAPHITI_LLM_PROVIDER: \$\{GRAPHITI_LLM_PROVIDER:-openai\}/);
  assert.match(compose, /GRAPHITI_BEDROCK_EMBED_MODEL_ID: \$\{GRAPHITI_BEDROCK_EMBED_MODEL_ID:-amazon\.titan-embed-text-v2:0\}/);
  assert.match(compose, /OPENAI_API_KEY: \$\{OPENAI_API_KEY:-\}/);
  assert.match(compose, /GRAPHITI_LLM_MODEL: \$\{GRAPHITI_LLM_MODEL:-gpt-4\.1-mini\}/);
  assert.match(compose, /GRAPHITI_EMBEDDING_MODEL: \$\{GRAPHITI_EMBEDDING_MODEL:-text-embedding-3-small\}/);
  assert.match(compose, /GRAPHITI_STORE_RAW_EPISODES: "0"/);
  assert.match(compose, /FALKORDB_HOST: falkordb/);
  assert.match(compose, /FALKORDB_PORT: 6379/);
});

test("compose memory smoke script supports schema and retain/recall proof gates", async () => {
  const script = await readFile(resolve("scripts/compose-memory-smoke.mjs"), "utf8");
  assert.match(script, /BRAINSTY_EXPECT_GRAPHITI_READY/);
  assert.match(script, /BRAINSTY_RUN_GRAPHITI_PROBE/);
  assert.match(script, /\/api\/product-memory\/status/);
  assert.match(script, /\/api\/product-memory\/probe/);
});
