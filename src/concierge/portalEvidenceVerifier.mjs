import { createHash } from "node:crypto";
import { audit } from "./audit.mjs";
import { createId, nowIso } from "./database.mjs";

const AUTHENTICATED_HOST_PATTERNS = [/^health\.aetna\.com$/i, /(^|\.)member\.aetna\.com$/i, /(^|\.)member\.cvsaetna\.com$/i];
const PUBLIC_MARKETING_HOST_PATTERNS = [/^(www\.)?aetna\.com$/i];

function hash(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "www.");
  } catch {
    return "";
  }
}

function classifyPageKind({ title = "", url = "", text = "" }) {
  const combined = `${url}\n${title}\n${text}`.toLowerCase();
  if (/\bclaim|claims|eob|explanation of benefits\b/.test(combined)) return "claims";
  if (/\bprior authorization|precert|authorization\b/.test(combined)) return "prior_authorizations";
  if (/\bbenefits?|coverage|deductible|out[- ]of[- ]pocket|spending\b/.test(combined)) return "benefits";
  if (/\bprofile|member id|plan|home\b/.test(combined)) return "home";
  return "unknown";
}

function evidenceFieldsFromText(text) {
  const compactText = compact(text);
  return {
    hasMemberSignal: /\b(member|member id|subscriber|plan|welcome)\b/i.test(compactText),
    hasBenefitsSignal: /\b(benefits?|coverage|deductible|out[- ]of[- ]pocket|copay|coinsurance)\b/i.test(compactText),
    hasClaimsSignal: /\b(claims?|eob|explanation of benefits|patient responsibility)\b/i.test(compactText),
    hasAuthorizationSignal: /\b(prior authorization|precert|authorization)\b/i.test(compactText),
    textLength: compactText.length
  };
}

export function verifyAuthenticatedPortalEvidence({ page, portal }) {
  const title = page?.title ?? "";
  const url = page?.url ?? "";
  const text = page?.text ?? "";
  const host = hostOf(url);
  const pageKind = classifyPageKind({ title, url, text });
  const evidenceFields = evidenceFieldsFromText(text);
  const issues = [];
  const warnings = [];
  const authenticatedHost = AUTHENTICATED_HOST_PATTERNS.some((pattern) => pattern.test(host));
  const publicMarketingHost = PUBLIC_MARKETING_HOST_PATTERNS.some((pattern) => pattern.test(host));

  if (!url) issues.push("Portal evidence page URL is missing.");
  if (!title) warnings.push("Portal evidence page title is missing.");
  if (publicMarketingHost) issues.push("Portal evidence points to public Aetna marketing content, not an authenticated member portal.");
  if (!authenticatedHost) issues.push(`Portal evidence host ${host || "unknown"} is not an approved authenticated member portal host.`);
  if (pageKind === "unknown") issues.push("Portal evidence page kind could not be classified as member benefits, claims, authorizations, or home.");
  if (!evidenceFields.hasMemberSignal) issues.push("Portal evidence is missing authenticated member-page signals.");
  if (!evidenceFields.hasBenefitsSignal && !evidenceFields.hasClaimsSignal && !evidenceFields.hasAuthorizationSignal) {
    issues.push("Portal evidence is missing healthcare insurance evidence fields.");
  }

  const extractedAt = nowIso();
  const extractionPayload = {
    title,
    url,
    pageKind,
    evidenceFields,
    textPreview: compact(text).slice(0, 1000)
  };
  return {
    valid: issues.length === 0,
    status: issues.length === 0 ? "authenticated_member_portal_verified" : "blocked_unverified_portal_evidence",
    issues,
    warnings,
    sourcePointer: {
      url,
      title,
      pageKind,
      extractedAt,
      domHash: hash(text),
      extractionHash: hash(JSON.stringify(extractionPayload)),
      evidenceFields,
      portalAccountId: portal?.id ?? null,
      payer: portal?.payer ?? null
    }
  };
}

export async function recordVerifiedPortalSourcePointer(store, { session, browserRunId, verification }) {
  const artifact = {
    id: createId("artifact"),
    browser_run_id: browserRunId,
    artifact_type: "verified_live_portal_source_pointer",
    content: JSON.stringify(verification.sourcePointer),
    created_at: nowIso()
  };
  await store.insert("extraction_artifacts", artifact);
  await audit(store, session.id, "live_portal_source_pointer_verified", {
    browserRunId,
    artifactId: artifact.id,
    status: verification.status,
    sourcePointer: verification.sourcePointer,
    issues: verification.issues,
    warnings: verification.warnings
  });
  return artifact;
}

export async function recordBlockedPortalEvidence(
  store,
  { session, portal, browserRunId = null, page = null, verification, source = "live_portal_proof", actionsTaken = [] }
) {
  const now = nowIso();
  let runId = browserRunId;
  if (runId) {
    await store.update(
      "browser_runs",
      {
        status: "blocked_live_portal_verification_failed",
        current_url: page?.url ?? null,
        page_title: page?.title ?? null,
        updated_at: now
      },
      { id: runId }
    );
  } else {
    runId = createId("browser");
    await store.insert("browser_runs", {
      id: runId,
      session_id: session.id,
      portal_account_id: portal.id,
      status: "blocked_live_portal_verification_failed",
      remote_debugger_url: source,
      start_url: portal.portal_url,
      current_url: page?.url ?? null,
      page_title: page?.title ?? null,
      created_at: now,
      updated_at: now
    });
  }
  await store.insert("browser_actions", {
    id: createId("action"),
    browser_run_id: runId,
    action_type: "verify_authenticated_member_portal",
    target_url: page?.url ?? null,
    description: `Live portal proof blocked: ${verification.issues.join("; ")}`,
    status: "blocked_live_portal_verification_failed",
    created_at: nowIso()
  });
  await audit(store, session.id, "live_portal_evidence_blocked", {
    browserRunId: runId,
    status: verification.status,
    issues: verification.issues,
    warnings: verification.warnings,
    sourcePointer: verification.sourcePointer,
    actionsTaken
  });
  return {
    browserRunId: runId,
    connected: false,
    status: "blocked_live_portal_verification_failed",
    message: verification.issues.join("; "),
    verification,
    extraction: null,
    actionsTaken
  };
}
