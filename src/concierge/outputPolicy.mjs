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

function structuredClaimsLine(structured) {
  const claims = structured?.claims ?? [];
  const priorAuthorizations = structured?.priorAuthorizations ?? [];
  if (!claims.length && !priorAuthorizations.length) {
    return "Structured claims/prior authorization evidence: no claim or prior authorization rows were extracted yet.";
  }
  const parts = [];
  if (claims.length) {
    parts.push(
      `claims ${claims
        .slice(0, 3)
        .map((claim) => `${claim.description ?? "Claim"} on ${claim.service_date ?? "unknown date"} with share ${money(claim.share_amount)} (source ${claim.source})`)
        .join("; ")}`
    );
  }
  if (priorAuthorizations.length) {
    parts.push(
      `prior authorizations ${priorAuthorizations
        .slice(0, 3)
        .map((item) => `${item.provider_or_facility ?? "Prior authorization"} ${item.status ?? "visible"} on ${item.service_date ?? "unknown date"} (source ${item.source})`)
        .join("; ")}`
    );
  }
  return `Structured claims/prior authorization evidence: ${parts.join(" | ")}.`;
}

function structuredSectionsLine(structured) {
  const sectionNames = structured?.sectionEvidence?.sections?.map((section) => section.section) ?? [];
  const documentSignals = structured?.documentSignals;
  const extras = [];
  if (sectionNames.length) extras.push(`sections ${sectionNames.join(", ")}`);
  if (documentSignals?.candidateCount) {
    extras.push(`document candidates ${documentSignals.candidateCount} (${documentSignals.sbcPdfCandidateCount ?? 0} SBC/PDF)`);
  }
  if (structured?.idCardSignals?.present) extras.push("ID card signal");
  if (structured?.pharmacySignals?.present) extras.push("pharmacy signal");
  if (structured?.networkSignals?.present) extras.push("network signal");
  if (!extras.length) return "Structured section evidence: no section-specific signals were extracted yet.";
  return `Structured section evidence: ${extras.join("; ")}.`;
}

function sourcePointerLine(sourcePointers = []) {
  if (!sourcePointers.length) return "Source pointers: none stored yet.";
  return `Source pointers: ${sourcePointers.map((pointer) => `${pointer.table}/${pointer.id}`).join(", ")}.`;
}

function discoveryLine(evidenceObservation = {}) {
  const report = evidenceObservation.discoveryReport;
  if (!report) return "OpenClaw discovery proof: portal search and document/SBC/PDF discovery were not reported for this run.";
  const search = report.portalSearch?.status ?? "not_reported";
  const documents = report.documentDiscovery ?? {};
  const sections = report.portalSections?.tried?.length
    ? ` Sections tried: ${report.portalSections.tried.join(", ")}.`
    : "";
  return `OpenClaw discovery proof: portal search ${search}; document candidates ${documents.candidateCount ?? 0}; SBC/PDF candidates ${documents.sbcPdfCandidateCount ?? 0}.${sections}`;
}

function compactEvidenceResponse({ browserResult, eligibility, sourcePointers = [], evidenceObservation = {} }) {
  const structured = eligibility?.structured;
  const observationMode = (() => {
    if (evidenceObservation.status === "captured_official_openclaw_multi_page_read_only_observation") {
      const pages =
        evidenceObservation.pageCount && evidenceObservation.verifiedPageCount
          ? ` ${evidenceObservation.verifiedPageCount}/${evidenceObservation.pageCount} page(s) were verified.`
          : "";
      return `The approved multi-page read-only observation was executed by the dedicated official OpenClaw profile with same-site navigation, DOM/accessibility checks, and visual OCR before LangGraph retained evidence.${pages}`;
    }
    if (evidenceObservation.status === "captured_official_openclaw_read_only_observation") {
      return "The approved read-only observation was executed by the dedicated official OpenClaw profile with DOM/accessibility and visual OCR checks before LangGraph retained evidence.";
    }
    return "The approved read-only portal observation was verified by LangGraph before evidence was retained.";
  })();
  const pageTitle = browserResult?.page?.title ? `Observed page: ${browserResult.page.title}.` : null;
  return [
    "I captured approved read-only portal evidence and prepared the benefits answer from stored source pointers.",
    structuredBenefitLine(structured),
    structuredClaimsLine(structured),
    structuredSectionsLine(structured),
    discoveryLine(evidenceObservation),
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
    structuredSectionsLine(structured),
    `Workflow intent: ${intent}. Policy checks: ${checks}.`,
    "No payer API was used, no external message was sent, and Brainstyworkers is not providing medical advice.",
    "Your approval allows local PHI storage and portal extraction for this prototype; passwords, passkeys, SSNs, and 2FA remain under your direct control in Chrome."
  ].join("\n\n");
}
