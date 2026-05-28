import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { audit } from "./audit.mjs";
import { createId, nowIso } from "./database.mjs";
import { recordOutboundPayloadObservation } from "./outboundPayloadObservability.mjs";

const execFileAsync = promisify(execFile);

export const OFFICIAL_OPENCLAW_RUNTIME_VERSION = "2026-05-27.official-openclaw-runtime.v1";

const DEFAULT_PROFILE = "brainstyworkers";
const DEFAULT_AGENT_ID = "brainstyworkers-insurance-browser";
const DEFAULT_BROWSER_PROFILE = "openclaw";
const DEFAULT_GATEWAY_PORT = 19789;
const DEFAULT_SKILL_KEY = "insurance-portal-browser";
const DEFAULT_TIMEOUT_MS = 45000;

export function getOfficialOpenClawConfig(env = process.env) {
  const profile = env.BRAINSTY_OPENCLAW_PROFILE ?? DEFAULT_PROFILE;
  const stateDir = env.BRAINSTY_OPENCLAW_STATE_DIR ?? join(homedir(), `.openclaw-${profile}`);
  return {
    version: OFFICIAL_OPENCLAW_RUNTIME_VERSION,
    binary: env.BRAINSTY_OPENCLAW_BIN ?? "openclaw",
    profile,
    stateDir,
    configPath: env.BRAINSTY_OPENCLAW_CONFIG_PATH ?? join(stateDir, "openclaw.json"),
    workspace: env.BRAINSTY_OPENCLAW_WORKSPACE ?? join(stateDir, `workspace-${profile}`),
    agentId: env.BRAINSTY_OPENCLAW_AGENT_ID ?? DEFAULT_AGENT_ID,
    browserProfile: env.BRAINSTY_OPENCLAW_BROWSER_PROFILE ?? DEFAULT_BROWSER_PROFILE,
    gatewayPort: Number(env.BRAINSTY_OPENCLAW_GATEWAY_PORT ?? DEFAULT_GATEWAY_PORT),
    gatewayBind: env.BRAINSTY_OPENCLAW_GATEWAY_BIND ?? "loopback",
    skillKey: env.BRAINSTY_OPENCLAW_SKILL_KEY ?? DEFAULT_SKILL_KEY,
    executionMode: "approved_read_only_observation_only",
    ocrSkillKey: env.BRAINSTY_OPENCLAW_OCR_SKILL_KEY ?? "ocr-local",
    ocrSkillPath:
      env.BRAINSTY_OPENCLAW_OCR_SKILL_PATH ?? join(stateDir, `workspace-${profile}`, "skills", "ocr-local"),
    visualEvidenceDir: env.BRAINSTY_OPENCLAW_VISUAL_EVIDENCE_DIR ?? join(process.cwd(), "data", "openclaw-visual-evidence"),
    allowedActions: ["browser_start", "open_url", "snapshot_accessibility_tree", "screenshot_capture", "local_ocr"],
    blockedActions: ["credential_entry", "payer_contact", "form_submission", "medical_advice", "external_message"]
  };
}

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function extractTitleFromAriaSnapshot(stdout) {
  const match = String(stdout ?? "").match(/RootWebArea\s+"([^"]+)"/);
  return match?.[1] ?? "OpenClaw browser snapshot";
}

function extractOpenedUrl(stdout, fallbackUrl) {
  const match = String(stdout ?? "").match(/opened:\s*(\S+)/);
  return match?.[1] ?? fallbackUrl;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function snapshotReadyForVerification(stdout) {
  const text = compact(stdout);
  if (!text) return false;
  if (/\bPage Loading\b/i.test(text)) return false;
  if (text.length < 1200 && !/\b(Home|Benefits?|Claims?|Coverage|Deductible|Member|Plan)\b/i.test(text)) return false;
  return true;
}

function hostMatches(candidateUrl, targetUrl) {
  try {
    const candidate = new URL(candidateUrl);
    const target = new URL(targetUrl);
    return candidate.hostname.replace(/^www\./, "") === target.hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

class CdpScreenshotClient {
  constructor(webSocketDebuggerUrl) {
    this.webSocketDebuggerUrl = webSocketDebuggerUrl;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out connecting to OpenClaw browser CDP")), 8000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      });
      this.socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("OpenClaw browser CDP websocket error"));
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
        reject(new Error(`OpenClaw CDP call timed out: ${method}`));
      }, 12000);
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

async function execOpenClaw(args, { config = getOfficialOpenClawConfig(), timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  try {
    const result = await execFileAsync(config.binary, ["--profile", config.profile, ...args], {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 20
    });
    return {
      ok: true,
      command: `${config.binary} --profile ${config.profile} ${args.join(" ")}`,
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    return {
      ok: false,
      command: `${config.binary} --profile ${config.profile} ${args.join(" ")}`,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      error: error.message
    };
  }
}

async function captureScreenshotViaCdp({ config, targetUrl, browserRunId }) {
  const status = await execOpenClaw(["browser", "--browser-profile", config.browserProfile, "status"], { config, timeoutMs: 20000 });
  if (!status.ok) {
    return { ok: false, status: "official_openclaw_browser_status_failed", error: status.error ?? status.stderr, commandResult: status };
  }
  const browser = parseBrowserStatus(status.stdout);
  if (!browser.cdpUrl) {
    return { ok: false, status: "official_openclaw_cdp_url_missing", error: "OpenClaw browser status did not expose cdpUrl.", commandResult: status };
  }
  const tabsResponse = await fetch(`${browser.cdpUrl}/json/list`);
  if (!tabsResponse.ok) {
    return { ok: false, status: "official_openclaw_cdp_tabs_failed", error: `HTTP ${tabsResponse.status} from ${browser.cdpUrl}/json/list` };
  }
  const tabs = await tabsResponse.json();
  const target =
    tabs.find((tab) => tab.type === "page" && hostMatches(tab.url, targetUrl)) ??
    tabs.find((tab) => tab.type === "page" && tab.webSocketDebuggerUrl);
  if (!target?.webSocketDebuggerUrl) {
    return { ok: false, status: "official_openclaw_cdp_target_missing", error: "No page target with a websocket debugger URL was available." };
  }
  const client = await new CdpScreenshotClient(target.webSocketDebuggerUrl).connect();
  try {
    await client.send("Page.enable");
    const result = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
      fromSurface: true
    });
    const filePath = join(config.visualEvidenceDir, `${browserRunId}.png`);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from(result.data, "base64"));
    return {
      ok: true,
      status: "official_openclaw_screenshot_captured",
      filePath,
      targetUrl: target.url,
      title: target.title ?? null,
      browser,
      bytes: Buffer.byteLength(result.data, "base64")
    };
  } finally {
    client.close();
  }
}

async function runLocalOcr({ config, imagePath }) {
  const scriptPath = join(config.ocrSkillPath, "scripts", "ocr.js");
  if (!existsSync(scriptPath)) {
    return { ok: false, status: "official_openclaw_ocr_skill_missing", error: `OCR script not found: ${scriptPath}` };
  }
  const result = await execFileAsync("node", [scriptPath, imagePath, "--lang", "eng", "--json"], {
    cwd: config.ocrSkillPath,
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 20
  })
    .then(({ stdout, stderr }) => ({ ok: true, stdout, stderr }))
    .catch((error) => ({ ok: false, stdout: error.stdout ?? "", stderr: error.stderr ?? "", error: error.message }));
  if (!result.ok) {
    return { ok: false, status: "official_openclaw_visual_ocr_failed", error: result.error ?? result.stderr, stderr: result.stderr };
  }
  try {
    const parsed = JSON.parse(result.stdout);
    return {
      ok: true,
      status: "official_openclaw_visual_ocr_completed",
      imagePath,
      text: parsed.text ?? "",
      confidence: parsed.confidence ?? null,
      wordCount: Array.isArray(parsed.words) ? parsed.words.length : null,
      stderr: result.stderr
    };
  } catch (error) {
    return { ok: false, status: "official_openclaw_visual_ocr_parse_failed", error: error.message, stdout: result.stdout, stderr: result.stderr };
  }
}

function parseBrowserStatus(stdout) {
  const rows = Object.fromEntries(
    String(stdout ?? "")
      .split(/\r?\n/)
      .map((line) => line.split(":").map((part) => part.trim()))
      .filter((parts) => parts.length >= 2 && parts[0])
      .map(([key, ...rest]) => [key, rest.join(":").trim()])
  );
  return {
    profile: rows.profile ?? null,
    enabled: rows.enabled === "true",
    running: rows.running === "true",
    transport: rows.transport ?? null,
    cdpPort: rows.cdpPort ? Number(rows.cdpPort) : null,
    cdpUrl: rows.cdpUrl ?? null,
    detectedBrowser: rows.detectedBrowser ?? null,
    headless: rows.headless === "true",
    profileColor: rows.profileColor ?? null
  };
}

function parseAgentList(stdout, agentId) {
  try {
    const parsed = JSON.parse(stdout);
    const agents = Array.isArray(parsed) ? parsed : parsed.agents ?? [];
    return {
      agents,
      agentReady: agents.some((agent) => agent.id === agentId),
      selectedAgent: agents.find((agent) => agent.id === agentId) ?? null
    };
  } catch {
    return {
      agents: [],
      agentReady: String(stdout ?? "").includes(agentId),
      selectedAgent: null
    };
  }
}

function parseSkillList(stdout, skillKey) {
  const text = String(stdout ?? "");
  const lines = text.split(/\r?\n/);
  return {
    skillReady: lines.some((line) => line.includes(skillKey) && /\bready\b/i.test(line)),
    browserAutomationReady: lines.some((line) => line.includes("browser-automation") && /\bready\b/i.test(line)),
    ocrLocalReady: lines.some((line) => line.includes("ocr-local") && /\bready\b/i.test(line)),
    personalSkillsExcluded: /\bexcluded\b/i.test(text),
    raw: text
  };
}

export async function checkOfficialOpenClawReadiness({ config = getOfficialOpenClawConfig() } = {}) {
  const skillPath = join(config.workspace, "skills", config.skillKey);
  const configExists = existsSync(config.configPath);
  const workspaceSkillExists = existsSync(join(skillPath, "SKILL.md")) && existsSync(join(skillPath, "skill.json"));
  const configValidation = await execOpenClaw(["config", "validate"], { config, timeoutMs: 20000 });
  const agents = await execOpenClaw(["agents", "list", "--json"], { config, timeoutMs: 20000 });
  const skills = await execOpenClaw(["skills", "list", "--agent", config.agentId], { config, timeoutMs: 20000 });
  const browserStatusResult = await execOpenClaw(["browser", "--browser-profile", config.browserProfile, "status"], {
    config,
    timeoutMs: 20000
  });
  const agentStatus = parseAgentList(agents.stdout, config.agentId);
  const skillStatus = parseSkillList(skills.stdout, config.skillKey);
  const browser = parseBrowserStatus(browserStatusResult.stdout);
  const checks = {
    configExists,
    workspaceSkillExists,
    configValid: configValidation.ok,
    agentReady: agentStatus.agentReady,
    skillReady: skillStatus.skillReady,
    browserAutomationReady: skillStatus.browserAutomationReady,
    ocrLocalReady: skillStatus.ocrLocalReady,
    personalSkillsExcluded: skillStatus.personalSkillsExcluded,
    browserEnabled: browser.enabled,
    dedicatedBrowserProfile: browser.profile === config.browserProfile
  };
  const ready = Object.values(checks).every(Boolean);
  return {
    version: OFFICIAL_OPENCLAW_RUNTIME_VERSION,
    ready,
    status: ready ? "official_openclaw_profile_ready" : "official_openclaw_profile_not_ready",
    config,
    checks,
    browser,
    agent: agentStatus.selectedAgent,
    commandResults: {
      configValidation: { ok: configValidation.ok, stderr: configValidation.stderr, error: configValidation.error },
      agents: { ok: agents.ok, stderr: agents.stderr, error: agents.error },
      skills: { ok: skills.ok, stderr: skills.stderr, error: skills.error },
      browserStatus: { ok: browserStatusResult.ok, stderr: browserStatusResult.stderr, error: browserStatusResult.error }
    }
  };
}

function summarizeOpenClawSnapshot(text) {
  const cleaned = compact(text);
  const signals = [
    /\beligibility\b/i.test(cleaned) ? "eligibility" : null,
    /\bbenefits?\b/i.test(cleaned) ? "benefits" : null,
    /\bcoverage\b/i.test(cleaned) ? "coverage" : null,
    /\bclaims?\b/i.test(cleaned) ? "claims" : null
  ].filter(Boolean);
  return {
    textPreview: cleaned.slice(0, 4000),
    fullText: cleaned,
    signals,
    summary:
      signals.length > 0
        ? `Official OpenClaw read-only snapshot includes these insurance navigation signals: ${signals.join(", ")}.`
        : "Official OpenClaw read-only snapshot was captured, but eligibility/benefit terms were not found in the visible accessibility tree."
  };
}

async function insertAction(store, browserRunId, { actionType, targetUrl, description, status }) {
  await store.insert("browser_actions", {
    id: createId("action"),
    browser_run_id: browserRunId,
    action_type: actionType,
    target_url: targetUrl ?? null,
    description,
    status,
    created_at: nowIso()
  });
}

export async function runOfficialOpenClawReadOnlyObservation({
  store,
  session,
  portal,
  targetUrl = null,
  config = getOfficialOpenClawConfig(),
  approval = null
}) {
  const requestedUrl = targetUrl ?? portal.portal_url;
  const startedAt = nowIso();
  const browserRun = {
    id: createId("browser"),
    session_id: session.id,
    portal_account_id: portal.id,
    status: "official_openclaw_started",
    remote_debugger_url: `openclaw://${config.profile}/${config.browserProfile}`,
    start_url: requestedUrl,
    current_url: null,
    page_title: null,
    created_at: startedAt,
    updated_at: startedAt
  };
  const actionsTaken = [];
  await store.insert("browser_runs", browserRun);
  await recordOutboundPayloadObservation(store, {
    sessionId: session.id,
    payload: {
      runtime: "official_openclaw_cli",
      profile: config.profile,
      agentId: config.agentId,
  browserProfile: config.browserProfile,
  skillKey: config.skillKey,
  ocrSkillKey: config.ocrSkillKey,
  targetUrl: requestedUrl,
      allowedAction: "read_only_observation",
      approvalGateId: approval?.approvalGateId ?? null
    },
    payloadType: "official_openclaw_read_only_worker_dispatch",
    destination: "official_openclaw_cli",
    policyMode: "source_pointer_or_safe_control_payload",
    enforcementMode: "enforced",
    allowDirectIdentifiers: false,
    allowPortalText: false,
    requireSourcePointers: false
  });
  await audit(store, session.id, "official_openclaw_read_only_observation_started", {
    browserRunId: browserRun.id,
    profile: config.profile,
    agentId: config.agentId,
    browserProfile: config.browserProfile,
    skillKey: config.skillKey,
    targetUrl: requestedUrl,
    approvalGateId: approval?.approvalGateId ?? null,
    actionsTaken
  });

  const start = await execOpenClaw(["browser", "--browser-profile", config.browserProfile, "start"], { config });
  actionsTaken.push("openclaw_browser_start");
  await insertAction(store, browserRun.id, {
    actionType: "openclaw_browser_start",
    targetUrl: requestedUrl,
    description: "Started the dedicated official OpenClaw managed browser profile for this project.",
    status: start.ok ? "completed" : "failed"
  });
  if (!start.ok) {
    await store.update("browser_runs", { status: "official_openclaw_browser_start_failed", updated_at: nowIso() }, { id: browserRun.id });
    await audit(store, session.id, "official_openclaw_read_only_observation_blocked", {
      browserRunId: browserRun.id,
      status: "official_openclaw_browser_start_failed",
      command: start.command,
      stderr: start.stderr,
      error: start.error,
      actionsTaken
    });
    return {
      browserRunId: browserRun.id,
      connected: false,
      status: "official_openclaw_browser_start_failed",
      message: start.error ?? start.stderr,
      page: null,
      extraction: null,
      actionsTaken,
      officialOpenClaw: { config, commandResults: { start } }
    };
  }

  const opened = await execOpenClaw(["browser", "--browser-profile", config.browserProfile, "open", requestedUrl], { config });
  actionsTaken.push("openclaw_browser_open_url");
  const openedUrl = extractOpenedUrl(opened.stdout, requestedUrl);
  await insertAction(store, browserRun.id, {
    actionType: "openclaw_browser_open_url",
    targetUrl: requestedUrl,
    description: "Opened the approved URL in the dedicated official OpenClaw browser profile.",
    status: opened.ok ? "completed" : "failed"
  });
  if (!opened.ok) {
    await store.update("browser_runs", { status: "official_openclaw_open_url_failed", updated_at: nowIso() }, { id: browserRun.id });
    await audit(store, session.id, "official_openclaw_read_only_observation_blocked", {
      browserRunId: browserRun.id,
      status: "official_openclaw_open_url_failed",
      command: opened.command,
      stderr: opened.stderr,
      error: opened.error,
      actionsTaken
    });
    return {
      browserRunId: browserRun.id,
      connected: false,
      status: "official_openclaw_open_url_failed",
      message: opened.error ?? opened.stderr,
      page: null,
      extraction: null,
      actionsTaken,
      officialOpenClaw: { config, commandResults: { start, opened } }
    };
  }

  let snapshot = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    if (attempt > 1) await sleep(2000);
    snapshot = await execOpenClaw(["browser", "--browser-profile", config.browserProfile, "snapshot", "--format", "aria", "--limit", "4000"], {
      config
    });
    if (!snapshot.ok || snapshotReadyForVerification(snapshot.stdout)) break;
  }
  actionsTaken.push("openclaw_browser_snapshot_aria");
  await insertAction(store, browserRun.id, {
    actionType: "openclaw_browser_snapshot_aria",
    targetUrl: openedUrl,
    description: "Captured a read-only accessibility-tree snapshot from the official OpenClaw browser.",
    status: snapshot.ok ? "completed" : "failed"
  });
  if (!snapshot.ok) {
    await store.update(
      "browser_runs",
      {
        status: "official_openclaw_snapshot_failed",
        current_url: openedUrl,
        updated_at: nowIso()
      },
      { id: browserRun.id }
    );
    await audit(store, session.id, "official_openclaw_read_only_observation_blocked", {
      browserRunId: browserRun.id,
      status: "official_openclaw_snapshot_failed",
      command: snapshot.command,
      stderr: snapshot.stderr,
      error: snapshot.error,
      actionsTaken
    });
    return {
      browserRunId: browserRun.id,
      connected: false,
      status: "official_openclaw_snapshot_failed",
      message: snapshot.error ?? snapshot.stderr,
      page: null,
      extraction: null,
      actionsTaken,
      officialOpenClaw: { config, commandResults: { start, opened, snapshot } }
    };
  }

  const screenshot = await captureScreenshotViaCdp({ config, targetUrl: openedUrl, browserRunId: browserRun.id });
  actionsTaken.push("openclaw_browser_screenshot_cdp");
  await insertAction(store, browserRun.id, {
    actionType: "openclaw_browser_screenshot_cdp",
    targetUrl: openedUrl,
    description: "Captured a read-only screenshot from the dedicated OpenClaw browser via CDP for visual/OCR verification.",
    status: screenshot.ok ? "completed" : "failed"
  });
  if (!screenshot.ok) {
    await store.update(
      "browser_runs",
      {
        status: "official_openclaw_screenshot_failed",
        current_url: openedUrl,
        updated_at: nowIso()
      },
      { id: browserRun.id }
    );
    await audit(store, session.id, "official_openclaw_read_only_observation_blocked", {
      browserRunId: browserRun.id,
      status: screenshot.status,
      error: screenshot.error,
      actionsTaken
    });
    return {
      browserRunId: browserRun.id,
      connected: false,
      status: screenshot.status,
      message: screenshot.error,
      page: null,
      extraction: null,
      actionsTaken,
      officialOpenClaw: { config, commandResults: { start, opened, snapshot }, screenshot }
    };
  }

  const visualOcr = await runLocalOcr({ config, imagePath: screenshot.filePath });
  actionsTaken.push("openclaw_browser_visual_ocr_local");
  await insertAction(store, browserRun.id, {
    actionType: "openclaw_browser_visual_ocr_local",
    targetUrl: openedUrl,
    description: "Ran local OCR against the read-only OpenClaw browser screenshot.",
    status: visualOcr.ok ? "completed" : "failed"
  });
  if (!visualOcr.ok) {
    await store.update(
      "browser_runs",
      {
        status: "official_openclaw_visual_ocr_failed",
        current_url: openedUrl,
        updated_at: nowIso()
      },
      { id: browserRun.id }
    );
    await audit(store, session.id, "official_openclaw_read_only_observation_blocked", {
      browserRunId: browserRun.id,
      status: visualOcr.status,
      error: visualOcr.error,
      actionsTaken
    });
    return {
      browserRunId: browserRun.id,
      connected: false,
      status: visualOcr.status,
      message: visualOcr.error,
      page: null,
      extraction: null,
      actionsTaken,
      officialOpenClaw: { config, commandResults: { start, opened, snapshot }, screenshot, visualOcr }
    };
  }

  const page = {
    title: extractTitleFromAriaSnapshot(snapshot.stdout),
    url: openedUrl,
    text: [snapshot.stdout, "\n\n[Visual OCR]\n", visualOcr.text].join(""),
    links: []
  };
  const extraction = {
    ...summarizeOpenClawSnapshot(page.text),
    ariaTextPreview: compact(snapshot.stdout).slice(0, 4000),
    visualOcrTextPreview: compact(visualOcr.text).slice(0, 4000),
    visualOcrConfidence: visualOcr.confidence,
    visualOcrWordCount: visualOcr.wordCount,
    screenshotPath: screenshot.filePath
  };
  await store.update(
    "browser_runs",
    {
      status: "official_openclaw_snapshot_captured",
      current_url: page.url,
      page_title: page.title,
      updated_at: nowIso()
    },
    { id: browserRun.id }
  );
  await store.insert("extraction_artifacts", {
    id: createId("artifact"),
    browser_run_id: browserRun.id,
    artifact_type: "official_openclaw_aria_snapshot",
    content: JSON.stringify({
      title: page.title,
      url: page.url,
      text: extraction.textPreview,
      ariaText: extraction.ariaTextPreview,
      visualOcrText: extraction.visualOcrTextPreview,
      visualOcrConfidence: extraction.visualOcrConfidence,
      screenshotPath: extraction.screenshotPath,
      links: []
    }),
    created_at: nowIso()
  });
  await audit(store, session.id, "official_openclaw_read_only_observation_snapshot_captured", {
    browserRunId: browserRun.id,
    title: page.title,
    url: page.url,
    profile: config.profile,
    browserProfile: config.browserProfile,
    skillKey: config.skillKey,
    ocrSkillKey: config.ocrSkillKey,
    signals: extraction.signals,
    visualOcr: {
      status: visualOcr.status,
      confidence: visualOcr.confidence,
      wordCount: visualOcr.wordCount,
      screenshotPath: screenshot.filePath
    },
    actionsTaken
  });
  return {
    browserRunId: browserRun.id,
    connected: true,
    status: "official_openclaw_snapshot_captured",
    page,
    extraction,
    actionsTaken,
    officialOpenClaw: {
      config,
      commandResults: {
        start: { ok: start.ok, stderr: start.stderr },
        opened: { ok: opened.ok, stdout: opened.stdout, stderr: opened.stderr },
        snapshot: { ok: snapshot.ok, stderr: snapshot.stderr }
      },
      screenshot,
      visualOcr: {
        status: visualOcr.status,
        confidence: visualOcr.confidence,
        wordCount: visualOcr.wordCount,
        imagePath: visualOcr.imagePath
      }
    }
  };
}
