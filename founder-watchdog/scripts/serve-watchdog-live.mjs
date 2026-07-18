import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptRoot = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(scriptRoot, "..");
const repoRoot = resolve(process.env.WATCHDOG_SOURCE_ROOT || join(siteRoot, ".."));
const manifestPath = join(siteRoot, "public/watchdog-manifest.json");
const port = Number(process.env.WATCHDOG_LIVE_PORT || 4189);
const allowedOrigins = new Set(
  String(
    process.env.WATCHDOG_ALLOWED_ORIGINS ||
      "https://brainsty-founder-watchdog.felixdema.chatgpt.site,http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

let refreshPromise = null;
let lastRefreshAt = 0;

function corsHeaders(origin) {
  const headers = {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    vary: "Origin"
  };
  if (origin && allowedOrigins.has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = "GET, OPTIONS";
    headers["access-control-allow-headers"] = "content-type";
  }
  return headers;
}

async function refreshManifest() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    await execFileAsync(process.execPath, [join(scriptRoot, "generate-watchdog-manifest.mjs")], {
      cwd: siteRoot,
      env: {
        ...process.env,
        WATCHDOG_SOURCE_ROOT: repoRoot,
        WATCHDOG_VSCODE_ROOT: process.env.WATCHDOG_VSCODE_ROOT || repoRoot
      },
      timeout: 45_000,
      maxBuffer: 1024 * 1024
    });
    lastRefreshAt = Date.now();
    return JSON.parse(await readFile(manifestPath, "utf8"));
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  const headers = corsHeaders(origin);
  if (origin && !allowedOrigins.has(origin)) {
    response.writeHead(403, headers);
    response.end(JSON.stringify({ ok: false, error: "origin_not_allowed" }));
    return;
  }
  if (request.method === "OPTIONS") {
    response.writeHead(204, headers);
    response.end();
    return;
  }
  if (request.method !== "GET") {
    response.writeHead(405, headers);
    response.end(JSON.stringify({ ok: false, error: "read_only_collector" }));
    return;
  }
  const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/health") {
    response.writeHead(200, headers);
    response.end(JSON.stringify({ ok: true, mode: "read_only", sourceRoot: repoRoot, lastRefreshAt: lastRefreshAt || null }));
    return;
  }
  if (url.pathname !== "/manifest") {
    response.writeHead(404, headers);
    response.end(JSON.stringify({ ok: false, error: "not_found" }));
    return;
  }
  try {
    const manifest = await refreshManifest();
    response.writeHead(200, headers);
    response.end(JSON.stringify(manifest));
  } catch (error) {
    response.writeHead(503, headers);
    response.end(JSON.stringify({ ok: false, error: "manifest_refresh_failed", detail: String(error?.message || error).slice(0, 240) }));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Founder Watchdog live collector: http://127.0.0.1:${port}/manifest`);
  console.log(`Read-only · loopback-bound · allowed origins: ${[...allowedOrigins].join(", ")}`);
});
