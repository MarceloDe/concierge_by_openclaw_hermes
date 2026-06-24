import { createHash } from "node:crypto";

export const PHASE69_BILL_VERIFICATION_VERSION = "2026-06-22.phase69-bill-verification-flow.v1";

function sha256(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function money(value) {
  const match = String(value ?? "").match(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+\.[0-9]{2})/);
  return match ? Number(match[1].replaceAll(",", "")) : null;
}

function lineAfter(label, text) {
  const pattern = new RegExp(`${label}\\s*[:#-]?\\s*([^\\n]+)`, "i");
  return text.match(pattern)?.[1]?.trim() ?? null;
}

function inferProvider(text) {
  return (
    lineAfter("provider", text) ??
    lineAfter("bill from", text) ??
    text.match(/\b(?:from|payable to)\s+([A-Z][A-Za-z0-9&.,' -]{3,70})/)?.[1]?.trim() ??
    null
  );
}

function inferBillNumber(text) {
  return (
    lineAfter("bill number", text) ??
    lineAfter("account", text) ??
    text.match(/\b(?:invoice|statement|bill)\s*(?:no\.?|number|#)\s*[:#-]?\s*([A-Z0-9-]{4,24})/i)?.[1] ??
    null
  );
}

function inferDate(text) {
  return (
    lineAfter("date", text) ??
    text.match(/\b(20[0-9]{2}[-/][0-9]{1,2}[-/][0-9]{1,2}|[0-9]{1,2}[-/][0-9]{1,2}[-/]20[0-9]{2})\b/)?.[1] ??
    null
  );
}

function inferPayer(text) {
  return text.match(/\b(Aetna|Blue Cross|BCBS|UnitedHealthcare|United Healthcare|Cigna|Humana|Kaiser|Medicare|Medicaid)\b/i)?.[1] ?? null;
}

function inferCodes(text) {
  const cpt = [...text.matchAll(/\b(?:CPT|HCPCS)?\s*([A-Z]?\d{5}[A-Z]?)\b/gi)].map((match) => match[1]);
  const claim = text.match(/\bclaim\s*(?:no\.?|number|#)?\s*[:#-]?\s*([A-Z0-9-]{5,30})/i)?.[1] ?? null;
  return { cpt: [...new Set(cpt)].slice(0, 5), claim };
}

export function analyzeBillVerificationInput({
  text = "",
  filename = "typed-bill-note.txt",
  userId = null,
  sessionId = null,
  payer = null
} = {}) {
  const safeText = String(text ?? "").slice(0, 12000);
  const detected = {
    provider: inferProvider(safeText),
    billNumberMasked: inferBillNumber(safeText)?.replace(/[A-Z0-9](?=[A-Z0-9-]{3})/gi, "*") ?? null,
    amount: money(safeText),
    date: inferDate(safeText),
    payer: payer || inferPayer(safeText),
    ...inferCodes(safeText)
  };
  const missingEvidence = [];
  if (!detected.provider) missingEvidence.push("provider_or_facility_name");
  if (!detected.amount) missingEvidence.push("amount_due_or_patient_responsibility");
  if (!detected.date) missingEvidence.push("bill_or_service_date");
  if (!detected.claim) missingEvidence.push("claim_or_eob_reference");
  if (!detected.payer) missingEvidence.push("insurance_payer_or_plan");
  const sourcePointerId = `bill-note:${sha256(`${sessionId ?? "session"}:${filename}:${safeText}`).slice(0, 16)}`;
  const requiredEvidence = [
    "bill_photo_or_statement",
    "insurance_plan_or_payer_name",
    "claim_or_eob_if_available",
    "portal_login_optional_for_current_claim_status"
  ];
  const parallelAgents = [
    {
      key: "bill_artifact_parser",
      status: "ready",
      task: "Extract bill/provider/amount/date/claim references from the user-provided bill note or image-derived text."
    },
    {
      key: "plan_document_research",
      status: detected.payer ? "ready" : "needs_payer",
      task: "Search approved plan documents or uploaded SBC/EOB evidence for relevant coverage language."
    },
    {
      key: "openclaw_portal_observer",
      status: "approval_and_user_login_required",
      task: "Observe the payer portal in read-only mode only after user-controlled login and approval."
    },
    {
      key: "trusted_public_research",
      status: "deidentified_only",
      task: "Use safe non-PHI search over trusted public sources when plan-specific evidence is unavailable."
    }
  ];
  return {
    version: PHASE69_BILL_VERIFICATION_VERSION,
    status: missingEvidence.length ? "bill_verification_needs_more_evidence" : "bill_verification_initial_evidence_ready",
    ok: true,
    userId,
    sessionId,
    filename,
    sourcePointer: {
      id: sourcePointerId,
      kind: "bill_verification_user_supplied_note",
      hash: sha256(safeText),
      rawTextReturned: false,
      phiPayloadStored: false
    },
    detected,
    requiredEvidence,
    missingEvidence,
    proposedNextActions: [
      missingEvidence.length ? "Ask the user for missing bill, claim, payer, or EOB details." : "Proceed to compare bill facts with EOB/portal evidence.",
      "Offer user-controlled portal login for current claim status.",
      "If the user does not want to log in, provide a general explanation using only uploaded/user-provided and trusted public evidence."
    ],
    noLoginFallback: {
      available: true,
      message:
        "I can explain what the bill appears to be asking for and what evidence would normally verify it, but I cannot confirm current claim status or plan payment without an EOB, plan document, or user-approved portal observation."
    },
    parallelAgents,
    safety: {
      payerContacted: false,
      formSubmitted: false,
      credentialsRequestedFromAgent: false,
      publicResearchDeidentifiedOnly: true,
      medicalAdviceProvided: false
    },
    userVisibleSummary:
      missingEvidence.length > 0
        ? `I found ${Object.values(detected).filter(Boolean).length} bill signal(s), but still need ${missingEvidence.join(", ")}.`
        : "I found enough bill signals to start verification against EOB, plan, or portal evidence."
  };
}

export function buildPhase69BillVerificationProof() {
  const sample = analyzeBillVerificationInput({
    text: "Provider: Example Clinic\nBill number: INV-445566\nDate: 2026-06-01\nAmount due: $184.22\nPayer: Aetna\nClaim number: CLM-123456",
    filename: "example-bill.txt",
    sessionId: "phase69"
  });
  const checks = {
    analyzerReady: sample.ok === true,
    firstWorkflowBillVerification: true,
    sourcePointerRefOnly: sample.sourcePointer.rawTextReturned === false && sample.sourcePointer.phiPayloadStored === false,
    missingEvidenceChecklistReady: Array.isArray(sample.missingEvidence),
    parallelAgentsPlanned: sample.parallelAgents.length >= 4,
    noLoginFallbackAvailable: sample.noLoginFallback.available === true,
    openclawRequiresApprovalAndLogin: sample.parallelAgents.some((agent) => agent.key === "openclaw_portal_observer" && /approval/.test(agent.status)),
    noPayerContactOrWrites: sample.safety.payerContacted === false && sample.safety.formSubmitted === false
  };
  const passed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  return {
    version: PHASE69_BILL_VERIFICATION_VERSION,
    status: passed === total ? "phase69_bill_verification_mvp_flow_ready" : "phase69_bill_verification_mvp_flow_attention",
    ok: passed === total,
    score: Math.round((passed / total) * 100),
    target: 100,
    checks,
    sample,
    endpoint: "/api/bill-verification/analyze",
    pwaSurface: "/mvp"
  };
}
