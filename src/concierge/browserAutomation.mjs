import { audit } from "./audit.mjs";
import { createId, nowIso } from "./database.mjs";
import { evaluatePortalAction } from "./policy.mjs";

const DEFAULT_REMOTE_DEBUGGER = "http://127.0.0.1:9222";

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  return response.json();
}

export async function probeChrome(remoteDebuggerUrl = DEFAULT_REMOTE_DEBUGGER) {
  try {
    const version = await fetchJson(`${remoteDebuggerUrl}/json/version`);
    const tabs = await fetchJson(`${remoteDebuggerUrl}/json/list`);
    return { connected: true, remoteDebuggerUrl, version, tabs };
  } catch (error) {
    return {
      connected: false,
      remoteDebuggerUrl,
      error: error.message,
      instructions:
        "Start Chrome with remote debugging enabled, then log in yourself: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222"
    };
  }
}

async function createTarget(remoteDebuggerUrl, url) {
  try {
    return await fetchJson(`${remoteDebuggerUrl}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  } catch {
    return fetchJson(`${remoteDebuggerUrl}/json/new?${encodeURIComponent(url)}`);
  }
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.webSocketUrl);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out connecting to Chrome DevTools Protocol")), 5000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      });
      this.socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Chrome DevTools Protocol websocket error"));
      });
    });
    this.socket.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (payload.id && this.pending.has(payload.id)) {
        const { resolve, reject } = this.pending.get(payload.id);
        this.pending.delete(payload.id);
        if (payload.error) reject(new Error(payload.error.message));
        else resolve(payload.result);
      }
    });
    return this;
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP call timed out: ${method}`));
      }, 8000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  close() {
    this.socket?.close();
  }
}

function findPortalTab(tabs, portalUrl) {
  const portalHost = new URL(portalUrl).hostname.replace(/^www\./, "");
  return tabs.find((tab) => {
    try {
      return new URL(tab.url).hostname.replace(/^www\./, "").includes(portalHost);
    } catch {
      return false;
    }
  });
}

function summarizePortalText(text) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const hasEligibility = /\beligibility\b/i.test(cleaned);
  const hasBenefits = /\bbenefits?\b/i.test(cleaned);
  const hasCoverage = /\bcoverage\b/i.test(cleaned);
  const hasClaims = /\bclaims?\b/i.test(cleaned);
  const signals = [
    hasEligibility ? "eligibility" : null,
    hasBenefits ? "benefits" : null,
    hasCoverage ? "coverage" : null,
    hasClaims ? "claims" : null
  ].filter(Boolean);
  return {
    textPreview: cleaned.slice(0, 4000),
    signals,
    summary:
      signals.length > 0
        ? `Portal text was extracted and includes these insurance navigation signals: ${signals.join(", ")}.`
        : "Portal text was extracted, but eligibility/benefit terms were not found in the visible page text."
  };
}

export async function persistClaimedChromeSnapshot({
  store,
  session,
  portal,
  snapshot,
  source = "codex_chrome_extension_claimed_tab"
}) {
  const startedAt = nowIso();
  const browserRun = {
    id: createId("browser"),
    session_id: session.id,
    portal_account_id: portal.id,
    status: "extracted_visible_page",
    remote_debugger_url: source,
    start_url: portal.portal_url,
    current_url: snapshot.url,
    page_title: snapshot.title,
    created_at: startedAt,
    updated_at: startedAt
  };
  await store.insert("browser_runs", browserRun);
  await store.insert("browser_actions", {
    id: createId("action"),
    browser_run_id: browserRun.id,
    action_type: "claim_existing_chrome_tab",
    target_url: snapshot.url,
    description: "Used the already-open user Chrome Aetna tab through the Codex Chrome Extension.",
    status: "completed",
    created_at: nowIso()
  });

  const extraction = summarizePortalText(snapshot.text ?? "");
  await store.insert("browser_actions", {
    id: createId("action"),
    browser_run_id: browserRun.id,
    action_type: "extract_visible_text",
    target_url: snapshot.url,
    description: "Extracted visible text from the claimed authenticated Chrome tab.",
    status: "completed",
    created_at: nowIso()
  });
  await store.insert("extraction_artifacts", {
    id: createId("artifact"),
    browser_run_id: browserRun.id,
    artifact_type: "claimed_chrome_visible_page_text",
    content: JSON.stringify({
      title: snapshot.title,
      url: snapshot.url,
      text: extraction.textPreview,
      links: snapshot.links ?? []
    }),
    created_at: nowIso()
  });
  await audit(store, session.id, "browser_extraction_completed", {
    browserRunId: browserRun.id,
    title: snapshot.title,
    url: snapshot.url,
    signals: extraction.signals,
    source
  });

  return {
    browserRunId: browserRun.id,
    connected: true,
    status: "extracted_visible_page",
    page: {
      title: snapshot.title,
      url: snapshot.url,
      text: snapshot.text ?? "",
      links: snapshot.links ?? []
    },
    extraction
  };
}

export async function runPortalExtraction({ store, session, portal, remoteDebuggerUrl = DEFAULT_REMOTE_DEBUGGER }) {
  const startedAt = nowIso();
  const browserRun = {
    id: createId("browser"),
    session_id: session.id,
    portal_account_id: portal.id,
    status: "started",
    remote_debugger_url: remoteDebuggerUrl,
    start_url: portal.portal_url,
    current_url: null,
    page_title: null,
    created_at: startedAt,
    updated_at: startedAt
  };
  await store.insert("browser_runs", browserRun);
  await audit(store, session.id, "browser_run_started", {
    browserRunId: browserRun.id,
    portalUrl: portal.portal_url,
    remoteDebuggerUrl
  });

  const probe = await probeChrome(remoteDebuggerUrl);
  if (!probe.connected) {
    await store.update("browser_runs", { status: "remote_debugger_unavailable", updated_at: nowIso() }, { id: browserRun.id });
    await store.insert("browser_actions", {
      id: createId("action"),
      browser_run_id: browserRun.id,
      action_type: "chrome_probe",
      target_url: remoteDebuggerUrl,
      description: probe.instructions,
      status: "blocked_until_chrome_remote_debugging_is_available",
      created_at: nowIso()
    });
    await audit(store, session.id, "browser_probe_failed", probe);
    return {
      browserRunId: browserRun.id,
      connected: false,
      status: "remote_debugger_unavailable",
      message: probe.instructions,
      extraction: null
    };
  }

  let target = findPortalTab(probe.tabs, portal.portal_url);
  if (!target) {
    const actionPolicy = evaluatePortalAction(`navigate to ${portal.portal_url}`);
    await store.insert("browser_actions", {
      id: createId("action"),
      browser_run_id: browserRun.id,
      action_type: "navigate",
      target_url: portal.portal_url,
      description: actionPolicy.reason,
      status: actionPolicy.allowed ? "approved_read_only_navigation" : "blocked",
      created_at: nowIso()
    });
    if (!actionPolicy.allowed) {
      await store.update("browser_runs", { status: "navigation_blocked", updated_at: nowIso() }, { id: browserRun.id });
      return {
        browserRunId: browserRun.id,
        connected: true,
        status: "navigation_blocked",
        message: actionPolicy.reason,
        extraction: null
      };
    }
    target = await createTarget(remoteDebuggerUrl, portal.portal_url);
  }

  const client = await new CdpClient(target.webSocketDebuggerUrl).connect();
  try {
    await client.send("Runtime.enable");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const result = await client.send("Runtime.evaluate", {
      expression: `(() => ({
        title: document.title,
        url: location.href,
        text: document.body ? document.body.innerText : "",
        links: Array.from(document.querySelectorAll("a")).slice(0, 80).map((a) => ({ text: a.innerText.trim(), href: a.href })).filter((a) => a.text || a.href)
      }))()`,
      returnByValue: true
    });
    const page = result.result.value;
    const extraction = summarizePortalText(page.text ?? "");

    await store.update(
      "browser_runs",
      {
        status: "extracted_visible_page",
        current_url: page.url,
        page_title: page.title,
        updated_at: nowIso()
      },
      { id: browserRun.id }
    );
    await store.insert("browser_actions", {
      id: createId("action"),
      browser_run_id: browserRun.id,
      action_type: "extract_visible_text",
      target_url: page.url,
      description: "Extracted visible DOM text and navigation links from the user-authenticated Chrome tab.",
      status: "completed",
      created_at: nowIso()
    });
    await store.insert("extraction_artifacts", {
      id: createId("artifact"),
      browser_run_id: browserRun.id,
      artifact_type: "visible_page_text",
      content: JSON.stringify({ title: page.title, url: page.url, text: extraction.textPreview, links: page.links }),
      created_at: nowIso()
    });
    await audit(store, session.id, "browser_extraction_completed", {
      browserRunId: browserRun.id,
      title: page.title,
      url: page.url,
      signals: extraction.signals
    });

    return {
      browserRunId: browserRun.id,
      connected: true,
      status: "extracted_visible_page",
      page,
      extraction
    };
  } finally {
    client.close();
  }
}
