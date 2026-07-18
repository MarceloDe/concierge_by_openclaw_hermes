import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta = /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Founder Watchdog control plane", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /<title>Founder Watchdog · Brainstyworkers<\/title>/i);
  assert.match(html, /The system truth/);
  assert.match(html, /Founder Watchdog/);
  assert.match(html, /Architecture/);
  assert.match(html, /Prompts/);
  assert.match(html, /Data &amp; APIs/);
  assert.match(html, /CONNECT LIVE/);
  assert.match(html, /READ-ONLY/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("generated manifest is source-linked, sanitized, and complete", async () => {
  const raw = await readFile(new URL("../app/generated/watchdog-manifest.json", import.meta.url), "utf8");
  const manifest = JSON.parse(raw);
  assert.equal(manifest.summary.currentPhase, 90);
  assert.equal(manifest.summary.tableCount, 89);
  assert.equal(manifest.graphFlow.length, 11);
  assert.equal(manifest.data.redis.namespaces.length, 8);
  assert.ok(manifest.prompts.length >= 9);
  assert.ok(manifest.phases.some((phase) => phase.phase === 96 && phase.status === "planned"));
  assert.ok(manifest.modules.every((module) => module.source?.vscodeUrl && module.source?.githubUrl));
  assert.equal(manifest.snapshot.repo, "MarceloDe/concierge_by_openclaw_hermes");
  assert.ok(manifest.modules.every((module) => module.source.githubUrl.startsWith("https://github.com/MarceloDe/concierge_by_openclaw_hermes/blob/")));
  assert.equal(manifest.moduleProbes.orchestrator.loaded, true);
  assert.equal(manifest.moduleProbes.orchestrator.graphCompiled, true);
  assert.equal(manifest.moduleProbes.orchestrator.nodeCount, 11);
  assert.notEqual(manifest.modules.find((module) => module.id === "langgraph").runtime, "not_loaded");
  assert.ok(Object.values(manifest.liveProbes).every((probe) => Object.hasOwn(probe, "healthy")));
  assert.equal(manifest.links.localCollector, "http://127.0.0.1:4189/manifest");
  assert.ok(manifest.configuration.configuredEnvNames.every((item) => Object.keys(item).sort().join(",") === "configured,name"));
  assert.doesNotMatch(raw, /\bsk-[A-Za-z0-9_-]{10,}/);
  assert.doesNotMatch(raw, /postgresql:\/\/[^\s"']+:[^\s"']+@/);
});
