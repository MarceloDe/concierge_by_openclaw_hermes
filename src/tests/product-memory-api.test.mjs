import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("product memory API exposes replay queue and disabled replay precondition", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-product-memory-api-"));
  process.env.BRAINSTY_DB_PATH = join(dir, "test.sqlite");
  process.env.BRAINSTY_PRODUCT_MEMORY_ADAPTER = "disabled";
  const { server } = await import("../server/server.mjs");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const statusResponse = await fetch(`http://127.0.0.1:${port}/api/product-memory/status`);
    const status = await statusResponse.json();
    assert.equal(statusResponse.status, 200, JSON.stringify(status));
    assert.equal(status.replayQueue.available, true);
    assert.equal(status.replayQueue.pending, 0);

    const queueResponse = await fetch(`http://127.0.0.1:${port}/api/product-memory/replay-queue`);
    const queue = await queueResponse.json();
    assert.equal(queueResponse.status, 200, JSON.stringify(queue));
    assert.deepEqual(queue.items, []);

    const replayResponse = await fetch(`http://127.0.0.1:${port}/api/product-memory/replay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 1 })
    });
    const replay = await replayResponse.json();
    assert.equal(replayResponse.status, 200, JSON.stringify(replay));
    assert.equal(replay.status, "disabled_by_env");
    assert.equal(replay.replayed, 0);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("product memory status degrades cleanly when Graphiti is enabled but unavailable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-product-memory-degraded-"));
  const previousEnv = {
    BRAINSTY_DB_PATH: process.env.BRAINSTY_DB_PATH,
    BRAINSTY_PRODUCT_MEMORY_ADAPTER: process.env.BRAINSTY_PRODUCT_MEMORY_ADAPTER,
    BRAINSTY_PRODUCT_MEMORY_PHI_CLEARED: process.env.BRAINSTY_PRODUCT_MEMORY_PHI_CLEARED,
    BRAINSTY_GRAPHITI_PYTHON: process.env.BRAINSTY_GRAPHITI_PYTHON,
    FALKORDB_HOST: process.env.FALKORDB_HOST,
    FALKORDB_PORT: process.env.FALKORDB_PORT
  };
  process.env.BRAINSTY_DB_PATH = join(dir, "test.sqlite");
  process.env.BRAINSTY_PRODUCT_MEMORY_ADAPTER = "graphiti";
  process.env.BRAINSTY_PRODUCT_MEMORY_PHI_CLEARED = "1";
  process.env.BRAINSTY_GRAPHITI_PYTHON = "/usr/bin/python3";
  process.env.FALKORDB_HOST = "127.0.0.1";
  process.env.FALKORDB_PORT = "1";
  const serverModule = await import(`../server/server.mjs?degraded=${Date.now()}`);
  const { server } = serverModule;
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const statusResponse = await fetch(`http://127.0.0.1:${port}/api/product-memory/status`);
    const status = await statusResponse.json();
    assert.equal(statusResponse.status, 200, JSON.stringify(status));
    assert.equal(status.ok, false);
    assert.equal(status.status, "degraded");
    assert.equal(status.adapter, "graphiti");
    assert.equal(status.enabled, true);
    assert.equal(status.replayQueue.available, true);
    assert.match(status.error, /Graphiti bridge failed|Graphiti dependencies are not installed|Connection refused|connect/i);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
