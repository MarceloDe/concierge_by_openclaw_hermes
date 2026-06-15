export const OPENCLAW_LIVE_READINESS_VERSION = "2026-05-30.phase8k";

export const OPENCLAW_ALLOWED_WORKER_ATTEMPTS = [
  "reuse the dedicated project OpenClaw current tab",
  "navigate same-site portal links in read-only mode",
  "scrape visible DOM and accessibility-tree content",
  "capture visual screenshot evidence for OCR-assisted review",
  "compare OCR text with DOM evidence before reporting",
  "try public or configured read-only API sources when available",
  "ask for manual export or user navigation when the portal blocks automation"
];

export const OPENCLAW_BLOCKED_LIVE_ACTIONS = [
  "credential entry",
  "password manager access",
  "passkey or 2FA handling",
  "SSN entry",
  "payer contact",
  "external email or message sending",
  "form submission",
  "record modification",
  "medical advice"
];

export const OPENCLAW_LIVE_FALLBACK_CHAIN = [
  "current dedicated OpenClaw tab",
  "same-site read-only portal navigation",
  "DOM/accessibility scrape",
  "visual OCR confirmation",
  "public or configured read-only source lookup",
  "manual export request",
  "not-possible result with blocker and next user action"
];

const AUTH_CHALLENGE_RE =
  /\b(login|log in|sign in|signin|password|passcode|passkey|two[- ]?factor|2fa|mfa|verification code|captcha|authenticate|session expired)\b/i;
const MEMBER_PORTAL_RE = /\b(member|account|dashboard|benefit|benefits|coverage|eligibility|claims?|deductible|oop|out[- ]of[- ]pocket|secure)\b/i;
const PUBLIC_MARKETING_PATH_RE =
  /^\/?$|\/individuals-families\b|\/employers-organizations\b|\/health-care-professionals\b|\/about-us\b|\/news\b|\/contact-us\b/i;
const KNOWN_MEMBER_PORTAL_HOSTS = new Set(["health.aetna.com", "member.aetna.com"]);

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function tabText(tab = {}) {
  return compact([tab.title, tab.url].filter(Boolean).join(" "));
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function looksLikeAuthChallenge(tab = {}) {
  return AUTH_CHALLENGE_RE.test(tabText(tab));
}

function looksLikeMemberPortal(tab = {}) {
  return MEMBER_PORTAL_RE.test(tabText(tab));
}

function looksLikeKnownMemberPortalHost(tab = {}) {
  const url = parseUrl(tab.url);
  if (!url) return false;
  return KNOWN_MEMBER_PORTAL_HOSTS.has(url.hostname.toLowerCase());
}

function looksLikePublicMarketingPage(tab = {}) {
  const url = parseUrl(tab.url);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  if (!/(^|\.)aetna\.com$|(^|\.)healthsafe-id\.com$|(^|\.)cvs\.com$/.test(host)) return false;
  if (looksLikeKnownMemberPortalHost(tab)) return false;
  if (looksLikeMemberPortal(tab)) return false;
  return PUBLIC_MARKETING_PATH_RE.test(url.pathname);
}

function looksLikeApprovedPortalTab(tab = {}) {
  return looksLikeKnownMemberPortalHost(tab) || looksLikeMemberPortal(tab);
}

function statusDetails(status, tab) {
  if (status === "official_openclaw_profile_not_ready") {
    return {
      readyForReadOnlyObservation: false,
      userActionRequired: true,
      nextAction: "Fix the dedicated project OpenClaw profile, agent, skill, browser, or OCR readiness before running live proof."
    };
  }
  if (status === "official_openclaw_browser_not_running") {
    return {
      readyForReadOnlyObservation: false,
      userActionRequired: true,
      nextAction: "Start the dedicated project OpenClaw browser profile, then open the member portal manually."
    };
  }
  if (status === "auth_required") {
    return {
      readyForReadOnlyObservation: false,
      userActionRequired: true,
      nextAction: "Open the member portal in the dedicated OpenClaw browser profile and sign in manually. Leave the authenticated tab open."
    };
  }
  if (status === "auth_or_challenge_required") {
    return {
      readyForReadOnlyObservation: false,
      userActionRequired: true,
      nextAction: "Complete login, password, passkey, 2FA, captcha, or session challenge yourself, then check the live worker again."
    };
  }
  if (status === "portal_page_required") {
    return {
      readyForReadOnlyObservation: false,
      userActionRequired: true,
      nextAction: "Navigate the already signed-in portal to a benefits, coverage, eligibility, or claims page before approving the worker."
    };
  }
  return {
    readyForReadOnlyObservation: true,
    userActionRequired: false,
    nextAction: `Ready to request approval for read-only observation of ${compact(tab?.title) || "the current portal tab"}.`
  };
}

export function classifyOfficialOpenClawLiveReadiness(readiness = {}) {
  const currentTab = readiness.tabs?.currentTab ?? null;
  const browserRunning = Boolean(readiness.browser?.running ?? readiness.checks?.browserEnabled);
  let status = "ready_for_read_only_approval";

  if (!readiness.ready) status = "official_openclaw_profile_not_ready";
  else if (!browserRunning) status = "official_openclaw_browser_not_running";
  else if (!currentTab?.url) status = "auth_required";
  else if (looksLikeAuthChallenge(currentTab)) status = "auth_or_challenge_required";
  else if (looksLikePublicMarketingPage(currentTab) || !looksLikeApprovedPortalTab(currentTab)) status = "portal_page_required";

  const details = statusDetails(status, currentTab);
  return {
    version: OPENCLAW_LIVE_READINESS_VERSION,
    status,
    workflow: "eligibility_benefits",
    executionMode: "approval_gated_official_openclaw",
    approvalScope: "read_only_observation",
    allowedAction: "read_only_observation",
    readyForReadOnlyObservation: details.readyForReadOnlyObservation,
    userActionRequired: details.userActionRequired,
    nextAction: details.nextAction,
    currentTab: currentTab
      ? {
          id: currentTab.id ?? null,
          title: currentTab.title ?? null,
          url: currentTab.url ?? null,
          active: Boolean(currentTab.active)
        }
      : null,
    workerVersatility: OPENCLAW_ALLOWED_WORKER_ATTEMPTS,
    blockedActions: OPENCLAW_BLOCKED_LIVE_ACTIONS,
    fallbackChain: OPENCLAW_LIVE_FALLBACK_CHAIN,
    safetyBoundary:
      "OpenClaw may adapt its read-only observation strategy after LangGraph approval, but it cannot handle credentials, bypass auth, contact payers, submit forms, change records, or give medical advice.",
    terminalOutcomes: [
      "completed_with_sourced_result",
      "not_possible_missing_user_data",
      "not_possible_insurance_portal_block",
      "needs_user_manual_export",
      "needs_long_running_followup"
    ]
  };
}
