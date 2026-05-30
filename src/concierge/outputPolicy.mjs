function money(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "unknown";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));
}

function structuredBenefitLine(structured) {
  const balances = structured?.coverageBalances ?? [];
  if (!balances.length) return "Structured benefits evidence: no deductible or out-of-pocket rows were extracted yet.";
  return `Structured benefits evidence: ${balances
    .map(
      (balance) =>
        `${balance.label}: total ${money(balance.total_amount)}, spent ${money(balance.spent_amount)}, remaining ${money(balance.remaining_amount)} (source ${balance.source})`
    )
    .join("; ")}.`;
}

function sourcePointerLine(sourcePointers = []) {
  if (!sourcePointers.length) return "Source pointers: none stored yet.";
  return `Source pointers: ${sourcePointers.map((pointer) => `${pointer.table}/${pointer.id}`).join(", ")}.`;
}

function compactEvidenceResponse({ browserResult, eligibility, sourcePointers = [], evidenceObservation = {} }) {
  const structured = eligibility?.structured;
  const observationMode =
    evidenceObservation.status === "captured_official_openclaw_read_only_observation"
      ? "The approved read-only observation was executed by the dedicated official OpenClaw profile with DOM/accessibility and visual OCR checks before LangGraph retained evidence."
      : "The approved read-only portal observation was verified by LangGraph before evidence was retained.";
  const pageTitle = browserResult?.page?.title ? `Observed page: ${browserResult.page.title}.` : null;
  return [
    "I captured approved read-only portal evidence and prepared the benefits answer from stored source pointers.",
    structuredBenefitLine(structured),
    sourcePointerLine(sourcePointers),
    pageTitle,
    observationMode,
    "No payer contact, external message, credential entry, medical advice, or irreversible portal action was performed.",
    "This answer was composed inside the LangGraph product runtime."
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function composeResponse({ user, portal, policyResult, intent, browserResult, eligibility, sourcePointers = null, evidenceObservation = null }) {
  if (Array.isArray(sourcePointers)) {
    return compactEvidenceResponse({ browserResult, eligibility, sourcePointers, evidenceObservation });
  }

  const checks = policyResult.checks.map((check) => `${check.name}: ${check.severity}`).join("; ");
  const structured = eligibility?.structured;
  const structuredLine = structured
    ? `Structured records prepared for review: ${structured.coverageBalances.length} coverage balances, ${structured.claims.length} claims, ${structured.priorAuthorizations.length} prior authorizations.`
    : "Structured record review is pending.";
  const browserLine = browserResult.connected
    ? `Chrome remote debugger connected. Current portal page: ${browserResult.page?.title || "untitled"} (${browserResult.page?.url || portal.portal_url}).`
    : `Chrome remote debugger is not connected yet. ${browserResult.message}`;

  const extractedLine =
    browserResult.connected && eligibility
      ? eligibility.snapshot.summary
      : "Eligibility/benefits extraction is queued until your logged Chrome session is available.";

  return [
    `Enrollment complete for ${user.name} (${user.email}) in the local Brainstyworkers prototype database.`,
    browserLine,
    extractedLine,
    structuredLine,
    structuredBenefitLine(structured),
    `Workflow intent: ${intent}. Policy checks: ${checks}.`,
    "No payer API was used, no external message was sent, and Brainstyworkers is not providing medical advice.",
    "Your approval allows local PHI storage and portal extraction for this prototype; passwords, passkeys, SSNs, and 2FA remain under your direct control in Chrome."
  ].join("\n\n");
}
