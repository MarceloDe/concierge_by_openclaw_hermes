import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import test from "node:test";

const siteRoot = resolve(new URL("..", import.meta.url).pathname);
const repoRoot = resolve(process.env.WATCHDOG_SOURCE_ROOT || resolve(siteRoot, ".."));
const vscodeRoot = resolve(process.env.WATCHDOG_VSCODE_ROOT || repoRoot);

async function waitForCollector(child, expected, timeoutMs = 12_000) {
  let output = "";
  const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
  try {
    for await (const chunk of child.stdout) {
      output += chunk;
      if (output.includes(expected)) return output;
    }
    throw new Error(`collector exited before readiness: ${output}`);
  } finally {
    clearTimeout(timer);
  }
}

test("loopback collector serves sanitized live evidence and rejects writes/origin abuse", async () => {
  const port = 42890 + (process.pid % 500);
  const child = spawn(process.execPath, [resolve(siteRoot, "scripts/serve-watchdog-live.mjs")], {
    cwd: siteRoot,
    env: {
      ...process.env,
      WATCHDOG_LIVE_PORT: String(port),
      WATCHDOG_SOURCE_ROOT: repoRoot,
      WATCHDOG_VSCODE_ROOT: vscodeRoot,
      WATCHDOG_ALLOWED_ORIGINS: "http://localhost:3000"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    await waitForCollector(child, `127.0.0.1:${port}/manifest`);
    const manifestResponse = await fetch(`http://127.0.0.1:${port}/manifest`, { headers: { origin: "http://localhost:3000" } });
    assert.equal(manifestResponse.status, 200);
    assert.equal(manifestResponse.headers.get("access-control-allow-origin"), "http://localhost:3000");
    const manifest = await manifestResponse.json();
    assert.equal(manifest.moduleProbes.orchestrator.loaded, true);
    assert.equal(manifest.moduleProbes.orchestrator.nodeCount, 11);
    assert.doesNotMatch(JSON.stringify(manifest), /\bsk-[A-Za-z0-9_-]{10,}/);

    const writeResponse = await fetch(`http://127.0.0.1:${port}/manifest`, { method: "POST", headers: { origin: "http://localhost:3000" } });
    assert.equal(writeResponse.status, 405);
    const rejectedOrigin = await fetch(`http://127.0.0.1:${port}/manifest`, { headers: { origin: "https://example.invalid" } });
    assert.equal(rejectedOrigin.status, 403);
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
});
