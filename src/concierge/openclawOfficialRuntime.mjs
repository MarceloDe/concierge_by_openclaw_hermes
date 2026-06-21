import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { audit } from "./audit.mjs";
import { consumeWriteActionApproval, WRITE_ACTION_EXECUTION_MODE } from "./approvalResume.mjs";
import { createId, nowIso } from "./database.mjs";
import { READ_ONLY_DOCUMENT_ALLOWED_ACTION, candidateIdFor } from "./documentCandidateApproval.mjs";
import { recordOutboundPayloadObservation } from "./outboundPayloadObservability.mjs";
import { evaluatePortalAction } from "./policy.mjs";

const execFileAsync = promisify(execFile);

export const OFFICIAL_OPENCLAW_RUNTIME_VERSION = "2026-05-30.official-openclaw-runtime.v3";

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
    allowedActions: [
      "browser_start",
      "open_url",
      "open_internal_read_only_link",
      "snapshot_accessibility_tree",
      "screenshot_capture",
      "local_ocr",
      "portal_search_affordance_scan",
      "document_candidate_discovery"
    ],
    blockedActions: ["credential_entry", "payer_contact", "form_submission", "medical_advice", "external_message"]
  };
}

export function getExecutionV2WriteConfig(env = process.env) {
  return {
    version: "2026-06-21.execution-v2-write-config.v1",
    workerRuntime: env.BRAINSTY_WORKER_RUNTIME === "llm_manager" ? "llm_manager" : "deterministic",
    writeEnabled: env.WEFELLA_EXECUTION_WRITE_ENABLED === "1",
    killSwitchEngaged: env.BRAINSTY_EXECUTION_KILL_SWITCH === "1",
    executionMode: WRITE_ACTION_EXECUTION_MODE
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

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value ?? "");
  } catch {
    return fallback;
  }
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

function urlOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return compact(value);
  }
}

function safeFileSlug(value) {
  return String(value ?? "page")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "page";
}

function safeReadOnlyPortalUrl(candidateUrl, startUrl) {
  try {
    const candidate = new URL(candidateUrl, startUrl);
    const start = new URL(startUrl);
    const combined = `${candidate.href}\n${candidate.pathname}`.toLowerCase();
    if (candidate.protocol !== "https:") return false;
    if (candidate.hostname.replace(/^www\./, "") !== start.hostname.replace(/^www\./, "")) return false;
    if (canonicalUrl(candidate.href) === canonicalUrl(start.href)) return false;
    if (/#(?:main|live-chat-access-point)$/i.test(candidate.href)) return false;
    if (/\/(?:logout|sign-?out)\b/i.test(combined)) return false;
    if (/\/(?:digital-claims|documents-and-forms|forms?)\b/i.test(combined)) return false;
    if (/\/(?:messages|preferences|profile|id-cards?)\b/i.test(combined)) return false;
    return true;
  } catch {
    return false;
  }
}

function targetGoalForLink(link = {}) {
  const combined = `${link.text ?? ""}\n${link.href ?? ""}`.toLowerCase();
  if (/\/benefits\/medical-plan-summary\b/i.test(combined)) {
    return { goal: "benefits", score: 100 };
  }
  if (/(benefits?\b|coverage\b|medical-plan-summary\b|plan documents?\b|deductible\b|out[- ]of[- ]pocket\b)/i.test(combined)) {
    return { goal: "benefits", score: 94 };
  }
  if (/\/spending\//i.test(combined)) {
    return { goal: "spending", score: 98 };
  }
  if (/(spending\b|costs?\b|medical spending\b)/i.test(combined)) {
    return { goal: "spending", score: 82 };
  }
  if (/\/manage\/claims\b/i.test(combined)) {
    return { goal: "claims", score: 96 };
  }
  if (/(claims?\b|eob\b|explanation of benefits\b)/i.test(combined)) {
    return { goal: "claims", score: 84 };
  }
  if (/\/manage\/prior-authorizations\b/i.test(combined)) {
    return { goal: "prior_authorizations", score: 90 };
  }
  if (/(prior authorization\b|precert\b|authorizations?\b)/i.test(combined)) {
    return { goal: "prior_authorizations", score: 76 };
  }
  return { goal: null, score: 0 };
}

const PORTAL_SECTION_PATTERNS = [
  ["benefits", /\bbenefits?\b|coverage|medical-plan-summary/i],
  ["spending", /\bspending\b|costs?|out[- ]of[- ]pocket|deductible/i],
  ["claims", /\bclaims?\b|eob|explanation of benefits/i],
  ["prior_authorizations", /prior authorization|precert|authorizations?/i],
  ["documents", /\bdocuments?\b|forms?|summary of benefits|sbc|pdf/i],
  ["pharmacy", /pharmacy|prescription|rx\b/i],
  ["id_card", /id card|member card/i],
  ["network", /network|find care|provider/i],
  ["profile", /member profile|account profile/i]
];

const DOCUMENT_TYPE_PATTERNS = [
  ["summary_of_benefits_and_coverage", /summary of benefits and coverage|\bsbc\b/i],
  ["pdf", /\.pdf(?:$|[?#])|\bpdf\b/i],
  ["plan_document", /plan documents?|benefit documents?|coverage documents?/i],
  ["benefits_summary", /benefits? summary|coverage summary/i],
  ["id_card", /id cards?|member cards?/i],
  ["eob", /explanation of benefits|\beob\b/i],
  ["claims_pdf", /claims?.{0,30}\bpdf\b|claim documents?/i],
  ["document_center", /\bdocuments?\b|documents-and-forms/i]
];

function safeDiscoveryUrl(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl);
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

function safeDiscoveryLabel(type, text = "") {
  const compactText = compact(text);
  if (/summary of benefits and coverage|\bsbc\b/i.test(compactText)) return "Summary of Benefits and Coverage";
  if (/id cards?/i.test(compactText)) return "ID card";
  if (/explanation of benefits|\beob\b/i.test(compactText)) return "Explanation of Benefits";
  if (/claims?/i.test(compactText) && /pdf|document/i.test(compactText)) return "Claims document";
  if (/plan documents?/i.test(compactText)) return "Plan document";
  if (/benefits? summary|coverage summary/i.test(compactText)) return "Benefits summary";
  if (/\.pdf\b|pdf/i.test(compactText)) return "PDF document";
  return String(type ?? "document").replaceAll("_", " ");
}

function sameSiteHttps(candidateUrl, startUrl) {
  try {
    const candidate = new URL(candidateUrl, startUrl);
    const start = new URL(startUrl);
    return candidate.protocol === "https:" && candidate.hostname.replace(/^www\./, "") === start.hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

function unsafeDocumentPathReason(url = "") {
  const text = String(url).toLowerCase();
  if (/\/(?:upload|submit|send|messages?|payments?|preferences|profile)\b/.test(text)) return "not_read_only_portal_area";
  if (/document-submission|digital-claims|appeals?|authorizations?\/new/.test(text)) return "submission_or_case_creation_area";
  if (/documents-and-forms|\/forms?\b/.test(text)) return "mixed_document_and_form_area_needs_user_confirmation";
  return null;
}

function classifyDocumentCandidate(link = {}, startUrl) {
  const normalized = normalizeLink(link, startUrl);
  if (!normalized) return null;
  const combined = `${normalized.text ?? ""}\n${normalized.href ?? ""}`;
  const matchedType = DOCUMENT_TYPE_PATTERNS.find(([, pattern]) => pattern.test(combined))?.[0] ?? null;
  if (!matchedType) return null;
  const safeUrl = safeDiscoveryUrl(normalized.href, startUrl);
  const blockedReason = !sameSiteHttps(normalized.href, startUrl)
    ? "offsite_document_candidate"
    : unsafeDocumentPathReason(normalized.href);
  return {
    type: matchedType,
    label: safeDiscoveryLabel(matchedType, normalized.text || normalized.href),
    url: safeUrl,
    source: normalized.source,
    sameSite: sameSiteHttps(normalized.href, startUrl),
    readOnlyOpenAllowed: !blockedReason,
    blockedReason,
    sbcOrPdf: matchedType === "summary_of_benefits_and_coverage" || matchedType === "pdf" || /\.pdf(?:$|[?#])/i.test(normalized.href)
  };
}

function detectPortalSections({ text = "", links = [], navigationPlan = null } = {}) {
  const sectionSignals = new Map();
  for (const [section, pattern] of PORTAL_SECTION_PATTERNS) {
    if (pattern.test(text)) sectionSignals.set(section, "observed_in_page_text");
  }
  for (const link of links) {
    const combined = `${link.text ?? ""}\n${link.href ?? ""}`;
    for (const [section, pattern] of PORTAL_SECTION_PATTERNS) {
      if (pattern.test(combined) && !sectionSignals.has(section)) {
        sectionSignals.set(section, "reachable_link_detected");
      }
    }
  }
  const tried = new Set((navigationPlan?.targets ?? []).map((target) => target.goal).filter(Boolean));
  return {
    tried: [...tried],
    reachable: [...sectionSignals.entries()].map(([section, source]) => ({ section, source }))
  };
}

function detectPortalSearchAffordances({ links = [], buttons = [], inputs = [], text = "" } = {}) {
  const searchInputs = inputs
    .filter((input) => {
      const combined = `${input.type ?? ""} ${input.role ?? ""} ${input.placeholder ?? ""} ${input.label ?? ""}`.toLowerCase();
      return /\bsearch\b|find|lookup|filter/.test(combined);
    })
    .slice(0, 6)
    .map((input) => ({
      type: input.type ?? null,
      role: input.role ?? null,
      label: safeDiscoveryLabel("search", input.label ?? input.placeholder ?? "Portal search"),
      disabled: Boolean(input.disabled)
    }));
  const searchButtons = buttons
    .filter((button) => /\bsearch\b|find|lookup|filter/i.test(button.text ?? ""))
    .slice(0, 6)
    .map((button) => ({
      label: safeDiscoveryLabel("search", button.text ?? "Portal search"),
      disabled: Boolean(button.disabled)
    }));
  const searchLinks = links
    .filter((link) => /\bsearch\b|find care|find provider|lookup|filter/i.test(`${link.text ?? ""}\n${link.href ?? ""}`))
    .slice(0, 8)
    .map((link) => ({
      label: safeDiscoveryLabel("search", link.text ?? "Portal search"),
      url: safeDiscoveryUrl(link.href, link.href),
      source: link.source ?? "dom_link"
    }));
  const textSignal = /\b(search|find care|find a provider|lookup|filter)\b/i.test(text);
  const available = Boolean(searchInputs.length || searchButtons.length || searchLinks.length || textSignal);
  return {
    affordanceScanAttempted: true,
    querySubmitted: false,
    available,
    status: available ? "portal_search_available_not_submitted" : "no_portal_search_affordance_found",
    searchInputs,
    searchButtons,
    searchLinks,
    textSignal
  };
}

export function buildOfficialOpenClawDiscoveryReport({ startUrl, observations = [], navigationPlan = null, pageBlockers = [] } = {}) {
  const flattenedLinks = observations.flatMap((observation) => observation.page?.links ?? []);
  const flattenedButtons = observations.flatMap((observation) => observation.page?.buttons ?? observation.buttons ?? observation.screenshot?.buttons ?? []);
  const flattenedInputs = observations.flatMap((observation) => observation.page?.inputs ?? observation.inputs ?? observation.screenshot?.inputs ?? []);
  const aggregateText = observations.map((observation) => observation.page?.text ?? "").join("\n");
  const seenDocuments = new Set();
  const documentCandidates = flattenedLinks
    .map((link) => classifyDocumentCandidate(link, startUrl))
    .filter(Boolean)
    .filter((candidate) => {
      const key = `${candidate.type}:${candidate.url}:${candidate.label}`;
      if (seenDocuments.has(key)) return false;
      seenDocuments.add(key);
      return true;
    })
    .slice(0, 16);
  const blockedCandidates = documentCandidates.filter((candidate) => !candidate.readOnlyOpenAllowed);
  const readOnlyCandidates = documentCandidates.filter((candidate) => candidate.readOnlyOpenAllowed);
  const portalSearch = detectPortalSearchAffordances({
    links: flattenedLinks,
    buttons: flattenedButtons,
    inputs: flattenedInputs,
    text: aggregateText
  });
  const portalSections = detectPortalSections({ text: aggregateText, links: flattenedLinks, navigationPlan });
  const sbcPdfCandidateCount = documentCandidates.filter((candidate) => candidate.sbcOrPdf).length;
  return {
    version: "2026-05-30.phase8o.openclaw-discovery.v1",
    status:
      portalSearch.available || documentCandidates.length || portalSections.reachable.length
        ? "discovery_signals_recorded"
        : "no_search_or_document_signals_found",
    portalSearch,
    documentDiscovery: {
      attempted: true,
      status: documentCandidates.length ? "document_candidates_recorded" : "no_document_candidates_found",
      candidateCount: documentCandidates.length,
      readOnlyCandidateCount: readOnlyCandidates.length,
      blockedCandidateCount: blockedCandidates.length,
      sbcPdfCandidateCount,
      candidates: documentCandidates.map((candidate) => ({
        candidateId: candidateIdFor(candidate),
        type: candidate.type,
        label: candidate.label,
        url: candidate.url,
        readOnlyOpenAllowed: candidate.readOnlyOpenAllowed,
        blockedReason: candidate.blockedReason,
        sbcOrPdf: candidate.sbcOrPdf,
        source: candidate.source
      })),
      blockedCandidates: blockedCandidates.map((candidate) => ({
        candidateId: candidateIdFor(candidate),
        type: candidate.type,
        label: candidate.label,
        url: candidate.url,
        blockedReason: candidate.blockedReason
      })),
      policy: {
        readOnlyDocumentsAllowedWhenNeeded: true,
        rawDocumentDumpAllowed: false,
        downloadAttempted: false,
        pdfAnalysisAttempted: false,
        requiresUserApprovalForMixedFormAreas: true
      }
    },
    portalSections,
    pageBlockers,
    fallbackChain: ["same_site_navigation", "portal_search_if_available", "official_document_or_pdf_if_needed", "manual_user_export"],
    actionsTaken: ["openclaw_portal_search_affordance_scan", "openclaw_document_candidate_discovery"],
    readOnlyBoundary: {
      credentialEntryAttempted: false,
      formSubmissionAttempted: false,
      payerContactAttempted: false,
      passwordManagerUsed: false,
      medicalAdviceAttempted: false
    }
  };
}

function normalizeLink(link = {}, baseUrl) {
  const href = link.href ?? link.url ?? link.sourceUrl ?? "";
  if (!href) return null;
  try {
    const url = new URL(href, baseUrl);
    return {
      href: url.href,
      text: compact(link.text ?? link.label ?? link.title ?? url.pathname),
      source: link.source ?? "dom_link"
    };
  } catch {
    return null;
  }
}

export function buildOfficialOpenClawReadOnlyNavigationPlan({ startUrl, links = [], maxPages = 4 } = {}) {
  const normalized = links.map((link) => normalizeLink(link, startUrl)).filter(Boolean);
  const seen = new Set();
  const candidates = normalized
    .filter((link) => safeReadOnlyPortalUrl(link.href, startUrl))
    .map((link) => ({ ...link, ...targetGoalForLink(link) }))
    .filter((link) => link.goal)
    .sort((a, b) => b.score - a.score || a.href.localeCompare(b.href))
    .filter((link) => {
      const key = canonicalUrl(link.href);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const selected = [];
  const selectedGoals = new Set();
  for (const candidate of candidates) {
    if (selectedGoals.has(candidate.goal)) continue;
    selected.push({
      url: candidate.href,
      label: candidate.text,
      goal: candidate.goal,
      source: candidate.source,
      score: candidate.score
    });
    selectedGoals.add(candidate.goal);
    if (selected.length >= maxPages) break;
  }
  return {
    startUrl,
    origin: urlOrigin(startUrl),
    status: selected.length ? "read_only_navigation_targets_selected" : "no_read_only_navigation_targets_found",
    maxPages,
    targets: selected,
    rejectedCount: normalized.length - candidates.length
  };
}

function normalizeTab(tab = {}) {
  const id = tab.id ?? tab.targetId ?? tab.target_id ?? tab.tabId ?? tab.label ?? null;
  return {
    id,
    targetId: tab.targetId ?? tab.target_id ?? tab.id ?? null,
    tabId: tab.tabId ?? tab.tab_id ?? null,
    label: tab.label ?? tab.name ?? null,
    title: tab.title ?? tab.pageTitle ?? tab.label ?? null,
    url: tab.url ?? tab.href ?? null,
    type: tab.type ?? "page",
    active: Boolean(tab.active ?? tab.focused ?? tab.current ?? tab.selected),
    raw: tab
  };
}

function chooseCurrentTab(tabs = []) {
  return tabs.find((tab) => tab.active && tab.url) ?? tabs.find((tab) => tab.type === "page" && tab.url) ?? tabs.find((tab) => tab.url) ?? null;
}

async function listOfficialOpenClawTabs({ config = getOfficialOpenClawConfig() } = {}) {
  const result = await execOpenClaw(["browser", "--browser-profile", config.browserProfile, "--json", "tabs"], {
    config,
    timeoutMs: 20000
  });
  if (!result.ok) {
    return { ok: false, status: "official_openclaw_tabs_failed", tabs: [], currentTab: null, commandResult: result, error: result.error ?? result.stderr };
  }
  const parsed = parseJson(result.stdout, {});
  const sourceTabs = Array.isArray(parsed) ? parsed : Array.isArray(parsed.tabs) ? parsed.tabs : [];
  const tabs = sourceTabs.map(normalizeTab).filter((tab) => tab.type === "page" || tab.url);
  return {
    ok: true,
    status: tabs.length ? "official_openclaw_tabs_available" : "official_openclaw_no_tabs",
    tabs,
    currentTab: chooseCurrentTab(tabs),
    commandResult: { ok: result.ok, stderr: result.stderr }
  };
}

async function focusOfficialOpenClawTab({ config, tab }) {
  const target = tab?.id ?? tab?.targetId ?? tab?.tabId ?? tab?.label;
  if (!target) return { ok: true, status: "official_openclaw_focus_skipped_no_tab_id" };
  const result = await execOpenClaw(["browser", "--browser-profile", config.browserProfile, "focus", String(target)], {
    config,
    timeoutMs: 20000
  });
  return {
    ok: result.ok,
    status: result.ok ? "official_openclaw_current_tab_focused" : "official_openclaw_current_tab_focus_failed",
    commandResult: result,
    error: result.ok ? null : result.error ?? result.stderr
  };
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

async function readDomEvidenceViaCdp(client) {
  try {
    const result = await client.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const compact = (value) => String(value || "").replace(/\\s+/g, " ").trim();
        const links = Array.from(document.querySelectorAll("a[href]")).slice(0, 240).map((anchor) => ({
          href: anchor.href,
          text: compact(anchor.innerText || anchor.textContent || anchor.getAttribute("aria-label") || anchor.href),
          source: "cdp_dom_link"
        }));
        const buttons = Array.from(document.querySelectorAll("button, [role='button']")).slice(0, 120).map((button) => ({
          text: compact(button.innerText || button.textContent || button.getAttribute("aria-label") || ""),
          disabled: Boolean(button.disabled || button.getAttribute("aria-disabled") === "true")
        }));
        const inputs = Array.from(document.querySelectorAll("input, [role='searchbox'], textarea, select")).slice(0, 120).map((input) => ({
          type: compact(input.getAttribute("type") || input.tagName || ""),
          role: compact(input.getAttribute("role") || ""),
          placeholder: compact(input.getAttribute("placeholder") || ""),
          label: compact(input.getAttribute("aria-label") || input.getAttribute("name") || input.getAttribute("id") || ""),
          disabled: Boolean(input.disabled || input.getAttribute("aria-disabled") === "true")
        }));
        return JSON.stringify({
          title: document.title,
          url: location.href,
          links,
          buttons,
          inputs
        });
      })()`
    });
    const parsed = parseJson(result?.result?.value, {});
    return {
      ok: true,
      status: "official_openclaw_cdp_dom_evidence_captured",
      title: parsed.title ?? null,
      url: parsed.url ?? null,
      links: Array.isArray(parsed.links) ? parsed.links : [],
      buttons: Array.isArray(parsed.buttons) ? parsed.buttons : [],
      inputs: Array.isArray(parsed.inputs) ? parsed.inputs : []
    };
  } catch (error) {
    return {
      ok: false,
      status: "official_openclaw_cdp_dom_evidence_failed",
      error: error.message,
      links: [],
      buttons: [],
      inputs: []
    };
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

async function captureScreenshotViaCdp({ config, targetUrl = null, browserRunId, preferredTab = null, artifactKey = null }) {
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
    (preferredTab?.targetId || preferredTab?.id
      ? tabs.find((tab) => tab.id === preferredTab.targetId || tab.id === preferredTab.id)
      : null) ??
    (targetUrl ? tabs.find((tab) => tab.type === "page" && canonicalUrl(tab.url) === canonicalUrl(targetUrl)) : null) ??
    (targetUrl ? tabs.find((tab) => tab.type === "page" && hostMatches(tab.url, targetUrl)) : null) ??
    (preferredTab?.url ? tabs.find((tab) => tab.type === "page" && tab.url === preferredTab.url) : null) ??
    tabs.find((tab) => tab.type === "page" && tab.webSocketDebuggerUrl);
  if (!target?.webSocketDebuggerUrl) {
    return { ok: false, status: "official_openclaw_cdp_target_missing", error: "No page target with a websocket debugger URL was available." };
  }
  const client = await new CdpScreenshotClient(target.webSocketDebuggerUrl).connect();
  try {
    await client.send("Page.enable");
    const domEvidence = await readDomEvidenceViaCdp(client);
    const result = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
      fromSurface: true
    });
    const filePath = join(config.visualEvidenceDir, `${safeFileSlug(artifactKey ?? browserRunId)}.png`);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from(result.data, "base64"));
    return {
      ok: true,
      status: "official_openclaw_screenshot_captured",
      filePath,
      targetUrl: target.url,
      title: target.title ?? null,
      browser,
      domEvidence,
      links: domEvidence.links,
      buttons: domEvidence.buttons,
      inputs: domEvidence.inputs,
      bytes: Buffer.byteLength(result.data, "base64")
    };
  } finally {
    client.close();
  }
}

// Resolve the live page CDP websocket for the dedicated OpenClaw browser so the
// remote-view/takeover controller (Phase 11) can attach a screencast + human input
// relay. Returns only connection metadata; it performs no navigation or actions —
// the read-only/agent-never-acts invariants live in browserStreamController.mjs.
export async function resolveActivePageCdpTarget({
  config = getOfficialOpenClawConfig(),
  targetUrl = null,
  preferredTab = null
} = {}) {
  const status = await execOpenClaw(["browser", "--browser-profile", config.browserProfile, "status"], {
    config,
    timeoutMs: 20000
  });
  if (!status.ok) {
    return { ok: false, status: "official_openclaw_browser_status_failed", error: status.error ?? status.stderr };
  }
  const browser = parseBrowserStatus(status.stdout);
  if (!browser.cdpUrl) {
    return { ok: false, status: "official_openclaw_cdp_url_missing", error: "OpenClaw browser status did not expose cdpUrl." };
  }
  let tabs;
  try {
    const tabsResponse = await fetch(`${browser.cdpUrl}/json/list`);
    if (!tabsResponse.ok) {
      return { ok: false, status: "official_openclaw_cdp_tabs_failed", error: `HTTP ${tabsResponse.status} from ${browser.cdpUrl}/json/list` };
    }
    tabs = await tabsResponse.json();
  } catch (error) {
    return { ok: false, status: "official_openclaw_cdp_tabs_failed", error: error.message };
  }
  const target =
    (preferredTab?.targetId || preferredTab?.id
      ? tabs.find((tab) => tab.id === preferredTab.targetId || tab.id === preferredTab.id)
      : null) ??
    (targetUrl ? tabs.find((tab) => tab.type === "page" && canonicalUrl(tab.url) === canonicalUrl(targetUrl)) : null) ??
    tabs.find((tab) => tab.type === "page" && tab.webSocketDebuggerUrl);
  if (!target?.webSocketDebuggerUrl) {
    return { ok: false, status: "official_openclaw_cdp_target_missing", error: "No page target with a websocket debugger URL was available." };
  }
  return {
    ok: true,
    status: "official_openclaw_cdp_target_resolved",
    webSocketDebuggerUrl: target.webSocketDebuggerUrl,
    targetId: target.id ?? null,
    url: target.url ?? null,
    title: target.title ?? null,
    cdpUrl: browser.cdpUrl,
    browser
  };
}

export async function openOfficialOpenClawBrowserUrl({
  config = getOfficialOpenClawConfig(),
  targetUrl
} = {}) {
  if (!targetUrl) return { ok: false, status: "official_openclaw_target_url_missing", error: "targetUrl is required." };
  try {
    const parsed = new URL(targetUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { ok: false, status: "official_openclaw_target_url_unsupported", error: "Only http and https URLs can be opened." };
    }
  } catch {
    return { ok: false, status: "official_openclaw_target_url_invalid", error: "targetUrl must be a valid URL." };
  }

  const start = await execOpenClaw(["browser", "--browser-profile", config.browserProfile, "start"], { config });
  if (!start.ok) {
    return {
      ok: false,
      status: "official_openclaw_browser_start_failed",
      targetUrl,
      error: start.error ?? start.stderr,
      commandResults: { start }
    };
  }
  const opened = await execOpenClaw(["browser", "--browser-profile", config.browserProfile, "open", targetUrl], { config });
  return {
    ok: opened.ok,
    status: opened.ok ? "official_openclaw_url_opened" : "official_openclaw_open_url_failed",
    targetUrl: extractOpenedUrl(opened.stdout, targetUrl),
    error: opened.ok ? null : opened.error ?? opened.stderr,
    commandResults: { start, opened }
  };
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
  const tabs = browser.running ? await listOfficialOpenClawTabs({ config }) : { ok: false, status: "official_openclaw_browser_not_running", tabs: [], currentTab: null };
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
    },
    tabs: {
      status: tabs.status,
      count: tabs.tabs.length,
      currentTab: tabs.currentTab
        ? {
            id: tabs.currentTab.id,
            title: tabs.currentTab.title,
            url: tabs.currentTab.url,
            active: tabs.currentTab.active
          }
        : null,
      items: tabs.tabs.slice(0, 5).map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        active: tab.active
      }))
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

async function captureOpenClawVisiblePage({ store, browserRunId, config, targetUrl, currentTab = null, actionsTaken, pageLabel = "current_page" }) {
  let snapshot = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    if (attempt > 1) await sleep(2000);
    snapshot = await execOpenClaw(["browser", "--browser-profile", config.browserProfile, "snapshot", "--format", "aria", "--limit", "4000"], {
      config
    });
    if (!snapshot.ok || snapshotReadyForVerification(snapshot.stdout)) break;
  }
  actionsTaken.push("openclaw_browser_snapshot_aria");
  await insertAction(store, browserRunId, {
    actionType: "openclaw_browser_snapshot_aria",
    targetUrl,
    description: `Captured a read-only accessibility-tree snapshot from the official OpenClaw browser for ${pageLabel}.`,
    status: snapshot.ok ? "completed" : "failed"
  });
  if (!snapshot.ok) {
    return {
      ok: false,
      status: "official_openclaw_snapshot_failed",
      message: snapshot.error ?? snapshot.stderr,
      commandResults: { snapshot }
    };
  }

  const screenshot = await captureScreenshotViaCdp({
    config,
    targetUrl,
    browserRunId,
    preferredTab: currentTab,
    artifactKey: `${browserRunId}-${pageLabel}`
  });
  actionsTaken.push("openclaw_browser_screenshot_cdp");
  await insertAction(store, browserRunId, {
    actionType: "openclaw_browser_screenshot_cdp",
    targetUrl,
    description: `Captured a read-only screenshot from the dedicated OpenClaw browser via CDP for ${pageLabel}.`,
    status: screenshot.ok ? "completed" : "failed"
  });
  if (!screenshot.ok) {
    return {
      ok: false,
      status: screenshot.status,
      message: screenshot.error,
      commandResults: { snapshot },
      screenshot
    };
  }

  const visualOcr = await runLocalOcr({ config, imagePath: screenshot.filePath });
  actionsTaken.push("openclaw_browser_visual_ocr_local");
  await insertAction(store, browserRunId, {
    actionType: "openclaw_browser_visual_ocr_local",
    targetUrl,
    description: `Ran local OCR against the read-only OpenClaw browser screenshot for ${pageLabel}.`,
    status: visualOcr.ok ? "completed" : "failed"
  });
  if (!visualOcr.ok) {
    return {
      ok: false,
      status: visualOcr.status,
      message: visualOcr.error,
      commandResults: { snapshot },
      screenshot,
      visualOcr
    };
  }

  const pageUrl = screenshot.domEvidence?.url ?? screenshot.targetUrl ?? targetUrl;
  const pageTitle = screenshot.domEvidence?.title ?? screenshot.title ?? extractTitleFromAriaSnapshot(snapshot.stdout);
  const page = {
    title: pageTitle,
    url: pageUrl,
    text: [snapshot.stdout, "\n\n[Visual OCR]\n", visualOcr.text].join(""),
    links: screenshot.links ?? [],
    buttons: screenshot.buttons ?? [],
    inputs: screenshot.inputs ?? []
  };
  const extraction = {
    ...summarizeOpenClawSnapshot(page.text),
    ariaTextPreview: compact(snapshot.stdout).slice(0, 4000),
    visualOcrTextPreview: compact(visualOcr.text).slice(0, 4000),
    visualOcrConfidence: visualOcr.confidence,
    visualOcrWordCount: visualOcr.wordCount,
    screenshotPath: screenshot.filePath
  };
  const artifact = {
    id: createId("artifact"),
    browser_run_id: browserRunId,
    artifact_type: "official_openclaw_page_observation",
    content: JSON.stringify({
      title: page.title,
      url: page.url,
      pageLabel,
      text: extraction.textPreview,
      ariaText: extraction.ariaTextPreview,
      visualOcrText: extraction.visualOcrTextPreview,
      visualOcrConfidence: extraction.visualOcrConfidence,
      screenshotPath: extraction.screenshotPath,
      links: page.links,
      buttons: page.buttons,
      inputs: page.inputs
    }),
    created_at: nowIso()
  };
  await store.insert("extraction_artifacts", artifact);
  return {
    ok: true,
    status: "official_openclaw_page_captured",
    pageLabel,
    page,
    extraction,
    artifact,
    commandResults: { snapshot: { ok: snapshot.ok, stderr: snapshot.stderr } },
    screenshot,
    visualOcr
  };
}

export async function runOfficialOpenClawReadOnlyObservation({
  store,
  session,
  portal,
  targetUrl = null,
  config = getOfficialOpenClawConfig(),
  approval = null,
  approvedDocumentCandidate = null,
  useCurrentTab = false,
  multiPage = false,
  maxPages = 4
}) {
  const requestedUrl = targetUrl ?? approvedDocumentCandidate?.url ?? portal.portal_url;
  const documentObservation = Boolean(approvedDocumentCandidate);
  if (documentObservation && canonicalUrl(requestedUrl) !== canonicalUrl(approvedDocumentCandidate.url)) {
    return {
      browserRunId: null,
      connected: false,
      status: "official_openclaw_document_candidate_scope_mismatch",
      message: "Approved document observation can open only the exact candidate URL bound to the approval.",
      page: null,
      extraction: null,
      actionsTaken: [],
      officialOpenClaw: { config, approvedDocumentCandidate }
    };
  }
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
  if (documentObservation) {
    actionsTaken.push("openclaw_approved_document_candidate_scope_bound");
    await insertAction(store, browserRun.id, {
      actionType: "openclaw_approved_document_candidate_scope_bound",
      targetUrl: requestedUrl,
      description: `Bound official OpenClaw observation to one approved read-only document candidate: ${approvedDocumentCandidate.label}.`,
      status: "completed"
    });
  }
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
      useCurrentTab,
      multiPage,
      maxPages,
      allowedAction: documentObservation ? READ_ONLY_DOCUMENT_ALLOWED_ACTION : "read_only_observation",
      approvedDocumentCandidate: approvedDocumentCandidate
        ? {
            candidateId: approvedDocumentCandidate.candidateId,
            type: approvedDocumentCandidate.type,
            label: approvedDocumentCandidate.label,
            url: approvedDocumentCandidate.url,
            source: approvedDocumentCandidate.source
          }
        : null,
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
    approvedDocumentCandidate: approvedDocumentCandidate
      ? {
          candidateId: approvedDocumentCandidate.candidateId,
          type: approvedDocumentCandidate.type,
          label: approvedDocumentCandidate.label,
          url: approvedDocumentCandidate.url,
          source: approvedDocumentCandidate.source
        }
      : null,
    multiPage,
    maxPages,
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

  let opened = null;
  let currentTab = null;
  let focus = null;
  let openedUrl = requestedUrl;
  if (useCurrentTab) {
    const tabs = await listOfficialOpenClawTabs({ config });
    currentTab = tabs.currentTab;
    actionsTaken.push("openclaw_browser_use_current_tab");
    await insertAction(store, browserRun.id, {
      actionType: "openclaw_browser_use_current_tab",
      targetUrl: currentTab?.url ?? requestedUrl,
      description: "Used the already-authenticated current tab in the dedicated official OpenClaw browser profile.",
      status: currentTab?.url ? "completed" : "failed"
    });
    if (!currentTab?.url) {
      await store.update("browser_runs", { status: "official_openclaw_current_tab_missing", updated_at: nowIso() }, { id: browserRun.id });
      await audit(store, session.id, "official_openclaw_read_only_observation_blocked", {
        browserRunId: browserRun.id,
        status: "official_openclaw_current_tab_missing",
        message: "No current OpenClaw browser tab is available. The user must manually sign in and leave the member portal tab open.",
        actionsTaken
      });
      return {
        browserRunId: browserRun.id,
        connected: false,
        status: "official_openclaw_current_tab_missing",
        message: "No current OpenClaw browser tab is available. The user must manually sign in and leave the member portal tab open.",
        page: null,
        extraction: null,
        actionsTaken,
        officialOpenClaw: { config, commandResults: { start }, tabs }
      };
    }
    focus = await focusOfficialOpenClawTab({ config, tab: currentTab });
    openedUrl = currentTab.url;
  } else {
    opened = await execOpenClaw(["browser", "--browser-profile", config.browserProfile, "open", requestedUrl], { config });
    actionsTaken.push("openclaw_browser_open_url");
    openedUrl = extractOpenedUrl(opened.stdout, requestedUrl);
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
  }

  const firstObservation = await captureOpenClawVisiblePage({
    store,
    browserRunId: browserRun.id,
    config,
    targetUrl: openedUrl,
    currentTab,
    actionsTaken,
    pageLabel: "start_page"
  });
  if (!firstObservation.ok) {
    await store.update(
      "browser_runs",
      {
        status: firstObservation.status,
        current_url: openedUrl,
        updated_at: nowIso()
      },
      { id: browserRun.id }
    );
    await audit(store, session.id, "official_openclaw_read_only_observation_blocked", {
      browserRunId: browserRun.id,
      status: firstObservation.status,
      error: firstObservation.message,
      actionsTaken
    });
    return {
      browserRunId: browserRun.id,
      connected: false,
      status: firstObservation.status,
      message: firstObservation.message,
      page: null,
      extraction: null,
      actionsTaken,
      officialOpenClaw: { config, commandResults: { start, opened, ...firstObservation.commandResults }, screenshot: firstObservation.screenshot }
    };
  }

  const pageObservations = [firstObservation];
  const pageBlockers = [];
  const navigationPlan = multiPage
    ? buildOfficialOpenClawReadOnlyNavigationPlan({
        startUrl: firstObservation.page.url,
        links: firstObservation.page.links,
        maxPages: Math.max(0, Number(maxPages) - 1)
      })
    : {
        startUrl: firstObservation.page.url,
        origin: urlOrigin(firstObservation.page.url),
        status: "single_page_observation",
        maxPages: 1,
        targets: [],
        rejectedCount: 0
      };

  for (const target of navigationPlan.targets) {
    const navigation = await execOpenClaw(["browser", "--browser-profile", config.browserProfile, "open", target.url], { config });
    actionsTaken.push("openclaw_browser_open_internal_link");
    await insertAction(store, browserRun.id, {
      actionType: "openclaw_browser_open_internal_link",
      targetUrl: target.url,
      description: `Opened same-site read-only portal target selected by OpenClaw worker planning: ${target.goal}.`,
      status: navigation.ok ? "completed" : "failed"
    });
    if (!navigation.ok) {
      pageBlockers.push({
        status: "official_openclaw_internal_navigation_failed",
        target,
        message: navigation.error ?? navigation.stderr
      });
      continue;
    }
    await sleep(1500);
    const nextObservation = await captureOpenClawVisiblePage({
      store,
      browserRunId: browserRun.id,
      config,
      targetUrl: target.url,
      actionsTaken,
      pageLabel: target.goal
    });
    if (nextObservation.ok) {
      pageObservations.push(nextObservation);
    } else {
      pageBlockers.push({
        status: nextObservation.status,
        target,
        message: nextObservation.message
      });
    }
  }

  const pages = pageObservations.map((observation) => observation.page);
  const aggregateText = pageObservations
    .map((observation) => `[${observation.pageLabel}] ${observation.page.title}\n${observation.page.url}\n${observation.page.text}`)
    .join("\n\n---\n\n");
  const page = pages[0];
  const discoveryReport = buildOfficialOpenClawDiscoveryReport({
    startUrl: openedUrl,
    observations: pageObservations,
    navigationPlan,
    pageBlockers
  });
  if (documentObservation) {
    discoveryReport.approvedDocumentCandidate = {
      candidateId: approvedDocumentCandidate.candidateId,
      type: approvedDocumentCandidate.type,
      label: approvedDocumentCandidate.label,
      url: approvedDocumentCandidate.url,
      source: approvedDocumentCandidate.source
    };
    discoveryReport.documentObservationPolicy = {
      status: "approved_single_candidate_observation",
      broadDocumentCrawlAttempted: false,
      rawDocumentDumpAllowed: false,
      approvedCandidateOnly: true
    };
    actionsTaken.push("openclaw_approved_document_candidate_observation");
    await insertAction(store, browserRun.id, {
      actionType: "openclaw_approved_document_candidate_observation",
      targetUrl: page.url,
      description: "Observed exactly one approved read-only document candidate; no broad document crawl or raw document dump was performed.",
      status: "completed"
    });
  }
  for (const actionType of discoveryReport.actionsTaken) {
    actionsTaken.push(actionType);
    await insertAction(store, browserRun.id, {
      actionType,
      targetUrl: page.url,
      description:
        actionType === "openclaw_portal_search_affordance_scan"
          ? "Scanned visible DOM controls and links for portal search affordances without submitting a query."
          : "Scanned visible same-site portal links for official document, SBC, or PDF candidates without downloading documents.",
      status: "completed"
    });
  }
  const extraction = {
    ...summarizeOpenClawSnapshot(aggregateText),
    ariaTextPreview: pageObservations.map((item) => `[${item.pageLabel}] ${item.extraction.ariaTextPreview}`).join("\n\n").slice(0, 4000),
    visualOcrTextPreview: pageObservations
      .map((item) => `[${item.pageLabel}] ${item.extraction.visualOcrTextPreview}`)
      .join("\n\n")
      .slice(0, 4000),
    visualOcrConfidence: firstObservation.visualOcr.confidence,
    visualOcrWordCount: pageObservations.reduce((sum, item) => sum + (item.visualOcr.wordCount ?? 0), 0),
    screenshotPath: firstObservation.screenshot.filePath,
    pageCount: pageObservations.length,
    pageSummaries: pageObservations.map((item) => ({
      pageLabel: item.pageLabel,
      title: item.page.title,
      url: item.page.url,
      signals: item.extraction.signals,
      artifactId: item.artifact.id,
      visualOcrConfidence: item.visualOcr.confidence,
      visualOcrWordCount: item.visualOcr.wordCount
    })),
    navigationPlan,
    discoveryReport
  };
  await store.update(
    "browser_runs",
    {
      status: pageObservations.length > 1 ? "official_openclaw_multi_page_snapshot_captured" : "official_openclaw_snapshot_captured",
      current_url: pages.at(-1)?.url ?? page.url,
      page_title: page.title,
      updated_at: nowIso()
    },
    { id: browserRun.id }
  );
  await audit(store, session.id, "official_openclaw_read_only_observation_snapshot_captured", {
    browserRunId: browserRun.id,
    title: page.title,
    url: page.url,
    pageCount: pageObservations.length,
    navigationPlan,
    pageBlockers,
    discoveryReport,
    approvedDocumentCandidate: approvedDocumentCandidate
      ? {
          candidateId: approvedDocumentCandidate.candidateId,
          type: approvedDocumentCandidate.type,
          label: approvedDocumentCandidate.label,
          url: approvedDocumentCandidate.url,
          source: approvedDocumentCandidate.source
        }
      : null,
    profile: config.profile,
    browserProfile: config.browserProfile,
    skillKey: config.skillKey,
    ocrSkillKey: config.ocrSkillKey,
    signals: extraction.signals,
    visualOcr: {
      status: firstObservation.visualOcr.status,
      confidence: firstObservation.visualOcr.confidence,
      wordCount: firstObservation.visualOcr.wordCount,
      screenshotPath: firstObservation.screenshot.filePath
    },
    actionsTaken
  });
  return {
    browserRunId: browserRun.id,
    connected: true,
    status: pageObservations.length > 1 ? "official_openclaw_multi_page_snapshot_captured" : "official_openclaw_snapshot_captured",
    page,
    pages,
    extraction,
    actionsTaken,
    officialOpenClaw: {
      config,
      commandResults: {
        start: { ok: start.ok, stderr: start.stderr },
        opened: opened ? { ok: opened.ok, stdout: opened.stdout, stderr: opened.stderr } : null,
        currentTab: currentTab ? { id: currentTab.id, title: currentTab.title, url: currentTab.url, active: currentTab.active } : null,
        focus: focus ? { ok: focus.ok, status: focus.status, error: focus.error } : null,
        snapshot: firstObservation.commandResults.snapshot
      },
      screenshot: firstObservation.screenshot,
      visualOcr: {
        status: firstObservation.visualOcr.status,
        confidence: firstObservation.visualOcr.confidence,
        wordCount: firstObservation.visualOcr.wordCount,
        imagePath: firstObservation.visualOcr.imagePath
      },
      navigationPlan,
      pageBlockers,
      discoveryReport,
      approvedDocumentCandidate: approvedDocumentCandidate
        ? {
            candidateId: approvedDocumentCandidate.candidateId,
            type: approvedDocumentCandidate.type,
            label: approvedDocumentCandidate.label,
            url: approvedDocumentCandidate.url,
            source: approvedDocumentCandidate.source
          }
        : null,
      pageObservations: pageObservations.map((item) => ({
        pageLabel: item.pageLabel,
        title: item.page.title,
        url: item.page.url,
        artifactId: item.artifact.id,
        screenshotPath: item.screenshot.filePath,
        visualOcrConfidence: item.visualOcr.confidence,
        visualOcrWordCount: item.visualOcr.wordCount,
        linkCount: item.page.links.length,
        buttonCount: item.page.buttons.length,
        inputCount: item.page.inputs.length
      }))
    }
  };
}

export async function runOfficialOpenClawApprovedWriteAction({
  store,
  session,
  taskId,
  userId,
  workflow,
  approvalToken,
  actionSchema,
  targetUrl = actionSchema?.targetUrl ?? actionSchema?.url ?? null,
  config = getOfficialOpenClawConfig(),
  executionV2 = getExecutionV2WriteConfig(),
  executeApprovedAction = null
}) {
  const startedAt = nowIso();
  const actionsTaken = [];
  const blocked = async (status, reason, extra = {}) => {
    await audit(store, session.id, "official_openclaw_single_write_action_blocked", {
      status,
      reason,
      taskId: taskId ?? null,
      userId: userId ?? null,
      workflow: workflow ?? null,
      targetUrl,
      executionMode: WRITE_ACTION_EXECUTION_MODE,
      workerRuntime: executionV2.workerRuntime,
      writeEnabled: executionV2.writeEnabled,
      killSwitchEngaged: executionV2.killSwitchEngaged,
      actionsTaken,
      ...extra
    });
    return {
      ok: false,
      connected: false,
      status,
      reason,
      executionMode: WRITE_ACTION_EXECUTION_MODE,
      actionsTaken,
      officialOpenClaw: { config, executionV2 },
      ...extra
    };
  };

  await audit(store, session.id, "official_openclaw_single_write_action_attempted", {
    taskId: taskId ?? null,
    userId: userId ?? null,
    workflow: workflow ?? null,
    targetUrl,
    executionMode: WRITE_ACTION_EXECUTION_MODE,
    workerRuntime: executionV2.workerRuntime,
    writeEnabled: executionV2.writeEnabled,
    killSwitchEngaged: executionV2.killSwitchEngaged,
    actionsTaken: []
  });

  if (executionV2.killSwitchEngaged) {
    return blocked("execution_v2_kill_switch_engaged", "Execution V2 write path is blocked by the hard kill switch.");
  }
  if (!executionV2.writeEnabled) {
    return blocked(
      "execution_v2_write_gate_disabled",
      "WEFELLA_EXECUTION_WRITE_ENABLED is not enabled; committed defaults never execute irreversible portal writes."
    );
  }
  const consumed = await consumeWriteActionApproval(store, {
    approvalToken,
    taskId,
    sessionId: session.id,
    userId,
    workflow,
    actionSchema,
    targetUrl
  });
  if (!consumed.ok) {
    return blocked(consumed.status, consumed.reason ?? "Write action approval was not valid.", {
      approvalStatus: consumed.status,
      approvalGateId: consumed.approvalGateId ?? null
    });
  }
  actionsTaken.push("approved_single_write_action_token_consumed");
  const policy = evaluatePortalAction({
    action: consumed.actionSchema?.actionType ?? actionSchema?.actionType ?? "",
    targetUrl,
    actionSchema,
    approvalToken: consumed
  });
  if (!policy.allowed) {
    return blocked("portal_action_policy_denied", policy.reason, {
      approvalGateId: consumed.approvalGateId,
      actionSchemaDigest: consumed.actionSchemaDigest,
      policy
    });
  }
  actionsTaken.push("approved_single_write_action_policy_passed");
  await audit(store, session.id, "official_openclaw_single_write_action_authorized", {
    taskId,
    userId,
    workflow,
    approvalGateId: consumed.approvalGateId,
    actionSchemaDigest: consumed.actionSchemaDigest,
    targetUrl: consumed.targetUrl,
    executionMode: WRITE_ACTION_EXECUTION_MODE,
    actionsTaken
  });
  if (typeof executeApprovedAction !== "function") {
    return blocked(
      "execution_v2_no_private_executor",
      "A private approved-action executor is required; no committed code path performs live portal writes.",
      {
        approvalGateId: consumed.approvalGateId,
        actionSchemaDigest: consumed.actionSchemaDigest,
        authorizedAt: startedAt
      }
    );
  }
  const result = await executeApprovedAction({ actionSchema: consumed.actionSchema, approval: consumed, config });
  actionsTaken.push("approved_single_write_action_executor_returned");
  await audit(store, session.id, "official_openclaw_single_write_action_completed", {
    taskId,
    userId,
    workflow,
    approvalGateId: consumed.approvalGateId,
    actionSchemaDigest: consumed.actionSchemaDigest,
    targetUrl: consumed.targetUrl,
    executionMode: WRITE_ACTION_EXECUTION_MODE,
    executorStatus: result?.status ?? "unknown",
    actionsTaken
  });
  return {
    ok: result?.ok === true,
    connected: result?.ok === true,
    status: result?.status ?? "approved_single_write_action_executor_returned",
    executionMode: WRITE_ACTION_EXECUTION_MODE,
    approval: consumed,
    actionsTaken,
    officialOpenClaw: { config, executionV2 },
    result
  };
}
