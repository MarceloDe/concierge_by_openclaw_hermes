import { createId, nowIso } from "./database.mjs";

function parseMoney(value) {
  if (!value) return null;
  return Number(value.replace(/[$,]/g, ""));
}

function moneyPattern() {
  return "\\$[0-9][0-9,]*(?:\\.[0-9]{2})?";
}

function moneyRegex(flags = "g") {
  return new RegExp(moneyPattern(), flags);
}

function amountNearLabel(region, labelPattern, direction = "after") {
  const money = moneyPattern();
  const regex =
    direction === "before"
      ? new RegExp(`(${money})\\s*(?:\\w+\\s*){0,4}${labelPattern}`, "i")
      : new RegExp(`${labelPattern}(?:\\W+\\w+){0,8}?\\W*(${money})`, "i");
  return parseMoney(region.match(regex)?.[1]);
}

function lastMoneyBeforeLabel(region, labelPattern) {
  const label = region.match(new RegExp(labelPattern, "i"));
  if (!label || label.index === undefined) return null;
  const amounts = [...region.slice(0, label.index).matchAll(moneyRegex())]
    .map((match) => parseMoney(match[0]))
    .filter((value) => value !== null);
  return amounts.at(-1) ?? null;
}

function inferredBalanceAmounts(region) {
  const rawAmounts = [...region.matchAll(moneyRegex())].map((match) => parseMoney(match[0])).filter((value) => value !== null);
  const amounts = rawAmounts.filter((value, index) => index === 0 || value !== rawAmounts[index - 1]);
  if (!amounts.length) return null;
  const ariaLike = /\b(?:StaticText|InlineTextBox|LabelText|heading|link)\b/i.test(region);

  const total =
    amounts[0] ??
    amountNearLabel(region, "\\b(?:total|maximum|max|limit|annual|plan)\\b") ??
    amountNearLabel(region, "\\b(?:total|maximum|max|limit|annual|plan)\\b", "before") ??
    null;
  const ariaRemaining = ariaLike ? lastMoneyBeforeLabel(region, "\\b(?:remaining|left|remain)\\b") : null;
  const ariaSpent = ariaLike ? lastMoneyBeforeLabel(region, "\\b(?:spent|met|used|applied|paid)\\b") : null;
  const remainingAfter = amountNearLabel(region, "\\b(?:remaining|left|remain)\\b");
  const remainingBefore = amountNearLabel(region, "\\b(?:remaining|left|remain)\\b", "before");
  const remaining = ariaRemaining ?? remainingAfter ?? remainingBefore ?? (amounts.length >= 3 ? amounts[2] : null);
  const spentAfter = amountNearLabel(region, "\\b(?:spent|met|used|applied|paid)\\b");
  const spentBefore = amountNearLabel(region, "\\b(?:spent|met|used|applied|paid)\\b", "before");
  const nonAriaSpent =
    spentAfter !== null && spentBefore !== null && remainingAfter === null && remainingBefore !== null && spentAfter === remainingBefore
      ? spentBefore
      : spentAfter ?? spentBefore ?? (amounts.length >= 3 ? amounts[1] : null);
  const spent = ariaSpent ?? nonAriaSpent;

  const normalizedTotal = total ?? null;
  const normalizedSpent =
    spent ??
    (normalizedTotal !== null && remaining !== null ? Number((normalizedTotal - remaining).toFixed(2)) : null);
  const normalizedRemaining =
    remaining ??
    (normalizedTotal !== null && normalizedSpent !== null ? Number((normalizedTotal - normalizedSpent).toFixed(2)) : null);

  if (normalizedTotal === null && normalizedSpent === null && normalizedRemaining === null) return null;
  return {
    total_amount: normalizedTotal,
    spent_amount: normalizedSpent,
    remaining_amount: normalizedRemaining
  };
}

function balanceRegions(normalized, aliases) {
  const regions = [];
  for (const alias of aliases) {
    const regex = new RegExp(alias, "ig");
    let match;
    while ((match = regex.exec(normalized)) !== null) {
      const start = match.index;
      const end = Math.min(normalized.length, match.index + 700);
      regions.push(normalized.slice(start, end));
    }
  }
  return regions;
}

export function parseCoverageBalances(text) {
  const normalized = text.replace(/\s+/g, " ");
  const money = moneyPattern();
  const patterns = [
    {
      balance_type: "deductible",
      label: "Deductible",
      regex: new RegExp(`Deductible\\s*[–-]\\s*(${money}).{0,80}?(${money})\\s*Spent\\s*(${money})\\s*Remaining`, "i"),
      aliases: ["deductible"]
    },
    {
      balance_type: "out_of_pocket_max",
      label: "Out-of-Pocket Max",
      regex: new RegExp(`Out-of-Pocket Max\\s*[–-]\\s*(${money}).{0,120}?(${money})\\s*Spent\\s*(${money})\\s*Remaining`, "i"),
      aliases: ["out[- ]of[- ]pocket(?: max(?:imum)?| maximum)?", "\\boop(?: max)?\\b"]
    }
  ];

  const parsed = patterns.flatMap((pattern) => {
    const match = normalized.match(pattern.regex);
    if (match) {
      return [
        {
          balance_type: pattern.balance_type,
          label: pattern.label,
          total_amount: parseMoney(match[1]),
          spent_amount: parseMoney(match[2]),
          remaining_amount: parseMoney(match[3]),
          currency: "USD"
        }
      ];
    }
    for (const region of balanceRegions(normalized, pattern.aliases)) {
      const amounts = inferredBalanceAmounts(region);
      if (!amounts) continue;
      return [
        {
          balance_type: pattern.balance_type,
          label: pattern.label,
          ...amounts,
          currency: "USD"
        }
      ];
    }
    return [];
  });

  return parsed.filter((balance, index, rows) => rows.findIndex((row) => row.balance_type === balance.balance_type) === index);
}

function cleanLines(text) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizedText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function matchedSignals(normalized, signalDefinitions) {
  return signalDefinitions.filter((signal) => signal.pattern.test(normalized)).map((signal) => signal.label);
}

const PORTAL_SECTION_DEFINITIONS = [
  {
    section: "benefits",
    label: "Benefits",
    signals: [
      { label: "benefits", pattern: /\bbenefits?\b/i },
      { label: "coverage", pattern: /\bcoverage\b/i },
      { label: "plan details", pattern: /\bplan details?\b/i }
    ]
  },
  {
    section: "spending",
    label: "Spending",
    signals: [
      { label: "deductible", pattern: /\bdeductible\b/i },
      { label: "out-of-pocket", pattern: /\bout[- ]of[- ]pocket\b/i },
      { label: "plan spending", pattern: /\bplan spending\b/i },
      { label: "remaining", pattern: /\bremaining\b/i }
    ]
  },
  {
    section: "claims",
    label: "Claims",
    signals: [
      { label: "claims", pattern: /\bclaims?\b/i },
      { label: "view all claims", pattern: /\bview all claims\b/i },
      { label: "your share", pattern: /\byour share\b/i }
    ]
  },
  {
    section: "prior_authorizations",
    label: "Prior Authorizations",
    signals: [
      { label: "prior authorization", pattern: /\bprior authorizations?\b/i },
      { label: "authorization status", pattern: /\bauthorization status\b/i }
    ]
  },
  {
    section: "documents",
    label: "Documents",
    signals: [
      { label: "documents", pattern: /\bdocuments?\b/i },
      { label: "forms", pattern: /\bforms?\b/i },
      { label: "summary of benefits", pattern: /\bsummary of benefits\b/i },
      { label: "eob", pattern: /\b(?:eob|explanation of benefits)\b/i }
    ]
  },
  {
    section: "id_card",
    label: "ID Card",
    signals: [
      { label: "id card", pattern: /\bid card\b/i },
      { label: "member id", pattern: /\bmember id\b/i },
      { label: "digital id", pattern: /\bdigital id\b/i }
    ]
  },
  {
    section: "pharmacy",
    label: "Pharmacy",
    signals: [
      { label: "pharmacy", pattern: /\bpharmacy\b/i },
      { label: "prescription", pattern: /\bprescriptions?\b/i },
      { label: "rx", pattern: /\brx\b/i },
      { label: "drug list", pattern: /\bdrug list\b/i },
      { label: "formulary", pattern: /\bformulary\b/i }
    ]
  },
  {
    section: "network",
    label: "Network",
    signals: [
      { label: "network", pattern: /\bnetwork\b/i },
      { label: "find care", pattern: /\bfind care\b/i },
      { label: "in network", pattern: /\bin network\b/i },
      { label: "provider", pattern: /\bproviders?\b/i }
    ]
  }
];

const DOCUMENT_SIGNAL_DEFINITIONS = [
  {
    type: "summary_of_benefits_coverage",
    label: "Summary of Benefits and Coverage",
    signals: [
      { label: "summary of benefits and coverage", pattern: /\bsummary of benefits and coverage\b/i },
      { label: "sbc", pattern: /\bsbc\b/i }
    ],
    sbcOrPdf: true
  },
  {
    type: "plan_document",
    label: "Plan document",
    signals: [
      { label: "plan document", pattern: /\bplan documents?\b/i },
      { label: "benefit summary", pattern: /\bbenefit summar(?:y|ies)\b/i }
    ],
    sbcOrPdf: false
  },
  {
    type: "id_card",
    label: "ID card",
    signals: [
      { label: "id card", pattern: /\bid card\b/i },
      { label: "member card", pattern: /\bmember card\b/i }
    ],
    sbcOrPdf: false
  },
  {
    type: "explanation_of_benefits",
    label: "Explanation of Benefits",
    signals: [
      { label: "explanation of benefits", pattern: /\bexplanation of benefits\b/i },
      { label: "eob", pattern: /\beob\b/i }
    ],
    sbcOrPdf: true
  },
  {
    type: "pdf",
    label: "PDF",
    signals: [{ label: "pdf", pattern: /\bpdf\b/i }],
    sbcOrPdf: true
  }
];

export function parsePortalSectionEvidence(text) {
  const normalized = normalizedText(text);
  const sections = PORTAL_SECTION_DEFINITIONS.map((definition) => {
    const signals = unique(matchedSignals(normalized, definition.signals));
    if (!signals.length) return null;
    return {
      section: definition.section,
      label: definition.label,
      present: true,
      confidence: Math.min(0.95, Number((0.58 + signals.length * 0.1).toFixed(2))),
      signals
    };
  }).filter(Boolean);

  return {
    status: sections.length ? "section_signals_detected" : "no_section_signals_detected",
    sections,
    reachable: sections.map((section) => section.section),
    missing: PORTAL_SECTION_DEFINITIONS.map((definition) => definition.section).filter(
      (section) => !sections.some((item) => item.section === section)
    )
  };
}

export function parseDocumentSignals(text) {
  const normalized = normalizedText(text);
  const candidates = DOCUMENT_SIGNAL_DEFINITIONS.map((definition) => {
    const signals = unique(matchedSignals(normalized, definition.signals));
    if (!signals.length) return null;
    return {
      type: definition.type,
      label: definition.label,
      signals,
      readOnlyOpenAllowed: true,
      approvalRequired: true,
      sbcOrPdf: definition.sbcOrPdf
    };
  }).filter(Boolean);

  return {
    status: candidates.length ? "document_candidates_detected" : "no_document_candidates_detected",
    candidateCount: candidates.length,
    readOnlyCandidateCount: candidates.length,
    blockedCandidateCount: 0,
    sbcPdfCandidateCount: candidates.filter((candidate) => candidate.sbcOrPdf).length,
    candidates,
    policy: {
      documentDownloadAttempted: false,
      rawDocumentDumpAllowed: false,
      requiresCandidateSpecificApproval: true
    }
  };
}

export function parseIdCardSignals(text) {
  const normalized = normalizedText(text);
  const signals = unique(
    matchedSignals(normalized, [
      { label: "id card", pattern: /\bid card\b/i },
      { label: "member id label", pattern: /\bmember id\b/i },
      { label: "digital id", pattern: /\bdigital id\b/i },
      { label: "safe last-four marker", pattern: /\b(?:last four|last 4|ending in|ends in)\b/i }
    ])
  );
  return {
    present: signals.length > 0,
    signals,
    safeIdentifierOnly: signals.some((signal) => signal === "safe last-four marker"),
    directIdentifierExtracted: false
  };
}

export function parsePharmacySignals(text) {
  const normalized = normalizedText(text);
  const signals = unique(
    matchedSignals(normalized, [
      { label: "pharmacy", pattern: /\bpharmacy\b/i },
      { label: "prescription coverage", pattern: /\bprescription coverage\b/i },
      { label: "rx", pattern: /\brx\b/i },
      { label: "drug list", pattern: /\bdrug list\b/i },
      { label: "formulary", pattern: /\bformulary\b/i },
      { label: "mail order", pattern: /\bmail order\b/i }
    ])
  );
  return {
    present: signals.length > 0,
    signals
  };
}

export function parseNetworkSignals(text) {
  const normalized = normalizedText(text);
  const signals = unique(
    matchedSignals(normalized, [
      { label: "network", pattern: /\bnetwork\b/i },
      { label: "in network", pattern: /\bin network\b/i },
      { label: "out of network", pattern: /\bout of network\b/i },
      { label: "find care", pattern: /\bfind care\b/i },
      { label: "provider search", pattern: /\b(?:provider|doctor|facility) search\b/i }
    ])
  );
  return {
    present: signals.length > 0,
    signals
  };
}

export function parsePlanSignals(text) {
  const normalized = normalizedText(text);
  const effectiveDateMatch = normalized.match(
    /\b(?:effective date|coverage starts|coverage effective)\b.{0,40}?([A-Z][a-z]+ \d{1,2}, \d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i
  );
  const signals = unique(
    matchedSignals(normalized, [
      { label: "plan details", pattern: /\bplan details?\b/i },
      { label: "plan name", pattern: /\bplan name\b/i },
      { label: "plan type", pattern: /\b(?:ppo|hmo|epo|pos)\b/i },
      { label: "effective date", pattern: /\b(?:effective date|coverage starts|coverage effective)\b/i }
    ])
  );
  return {
    present: signals.length > 0,
    signals,
    effectiveDate: effectiveDateMatch?.[1] ?? null
  };
}

export function parseClaimItems(text) {
  const lines = cleanLines(text);
  const start = lines.findIndex((line, index) => line === "Claims" && lines[index + 1] === "View All Claims");
  const end = lines.findIndex((line, index) => index > start && line === "Submit a Claim");
  if (start < 0 || end < 0) {
    const normalized = text.replace(/\s+/g, " ");
    const fullPageRegion = normalized.match(/\d+\s*[–-]\s*\d+\s+of\s+\d+\s+Claims\s+(.+?)(?:Previous page|Next page|Terms of Use|$)/i);
    if (fullPageRegion) {
      const claims = [];
      const claimPattern =
        /Status\s+(\w+)\s+(.+?)\s+For\s+(.+?)\s+(Filled|Visited)\s+on\s+([A-Z][a-z]+ \d{1,2}, \d{4})\s+(.+?)\s+Your share\s+Your share\s+(\$[0-9][0-9,]*(?:\.[0-9]{2})?)\s+View Details/g;
      let match;
      while ((match = claimPattern.exec(fullPageRegion[1])) !== null) {
        claims.push({
          description: match[2].trim(),
          member_name: match[3].trim(),
          service_date: match[5].trim(),
          share_amount: parseMoney(match[7]),
          raw_text: match[0].trim()
        });
      }
      return claims;
    }

    const ariaRegion = normalized.match(/(?:region "Claims"|heading "Claims"|Claims).{0,800}?View All Claims(.+?)(?:Prior Authorization|Submit a Claim|$)/i);
    if (ariaRegion) {
      const claims = [];
      const claimPattern =
        /link "(.+?) For (.+?) - ([A-Z][a-z]+ \d{1,2}, \d{4}) Your share \$?([0-9][0-9,]*(?:\.[0-9]{2})?)"/g;
      let match;
      while ((match = claimPattern.exec(ariaRegion[1])) !== null) {
        claims.push({
          description: match[1].trim(),
          member_name: match[2].trim(),
          service_date: match[3].trim(),
          share_amount: parseMoney(`$${match[4]}`),
          raw_text: match[0].trim()
        });
      }
      if (claims.length) return claims;
    }

    const regionMatch = normalized.match(/Claims View All Claims (.+?) Submit a Claim/i);
    if (!regionMatch) return [];
    const claims = [];
    const claimPattern = /(.+?) For (.+?) - ([A-Z][a-z]+ \d{1,2}, \d{4}) Your share (\$[0-9][0-9,]*(?:\.[0-9]{2})?)/g;
    let match;
    while ((match = claimPattern.exec(regionMatch[1])) !== null) {
      claims.push({
        description: match[1].trim(),
        member_name: match[2].trim(),
        service_date: match[3].trim(),
        share_amount: parseMoney(match[4]),
        raw_text: match[0].trim()
      });
    }
    return claims;
  }

  const claimLines = lines.slice(start + 2, end);
  const claims = [];
  for (let i = 0; i < claimLines.length; i += 1) {
    const description = claimLines[i];
    const forLine = claimLines[i + 1] ?? "";
    const shareLabel = claimLines[i + 2] ?? "";
    const share = claimLines[i + 3] ?? "";
    const match = forLine.match(/^For\s+(.+?)\s+-\s+(.+)$/i);
    if (!match || !/^Your share$/i.test(shareLabel) || !/^\$/.test(share)) continue;
    claims.push({
      description,
      member_name: match[1],
      service_date: match[2],
      share_amount: parseMoney(share),
      raw_text: [description, forLine, shareLabel, share].join("\n")
    });
    i += 3;
  }
  return claims;
}

export function parsePriorAuthorizations(text) {
  const lines = cleanLines(text);
  const start = lines.findIndex((line, index) => line === "Prior Authorization" && lines[index + 1] === "View All");
  if (start < 0) {
    const normalized = text.replace(/\s+/g, " ");
    const ariaLinkMatch = normalized.match(/Prior Authorization.{0,800}?listitem.{0,80}?link "(.+?)\s+([A-Z][a-z]+ \d{1,2}, \d{4})"/i);
    if (ariaLinkMatch) {
      return [
        {
          provider_or_facility: ariaLinkMatch[1].trim(),
          service_date: ariaLinkMatch[2].trim(),
          status: "visible_in_portal",
          raw_text: ariaLinkMatch[0].trim()
        }
      ];
    }
    const match = normalized.match(/Prior Authorization View All (.+?) ([A-Z][a-z]+ \d{1,2}, \d{4})/);
    if (!match) return [];
    return [
      {
        provider_or_facility: match[1].trim(),
        service_date: match[2].trim(),
        status: "visible_in_portal",
        raw_text: match[0].trim()
      }
    ];
  }

  const provider = lines[start + 2];
  const serviceDate = lines[start + 3];
  if (!provider || !serviceDate) return [];
  return [
    {
      provider_or_facility: provider,
      service_date: serviceDate,
      status: "visible_in_portal",
      raw_text: [lines[start], lines[start + 1], provider, serviceDate].join("\n")
    }
  ];
}

export function extractStructuredInsuranceData(text) {
  return {
    coverageBalances: parseCoverageBalances(text),
    claims: parseClaimItems(text),
    priorAuthorizations: parsePriorAuthorizations(text),
    sectionEvidence: parsePortalSectionEvidence(text),
    documentSignals: parseDocumentSignals(text),
    idCardSignals: parseIdCardSignals(text),
    pharmacySignals: parsePharmacySignals(text),
    networkSignals: parseNetworkSignals(text),
    planSignals: parsePlanSignals(text)
  };
}

export async function persistStructuredExtraction(store, { snapshot, source }) {
  const structured = extractStructuredInsuranceData(snapshot.raw_text ?? "");

  const coverageBalances = [];
  for (const balance of structured.coverageBalances) {
    const row = {
      id: createId("balance"),
      snapshot_id: snapshot.id,
      ...balance,
      source,
      created_at: nowIso()
    };
    await store.insert("coverage_balances", row);
    coverageBalances.push(row);
  }

  const claims = [];
  for (const claim of structured.claims) {
    const row = {
      id: createId("claim"),
      snapshot_id: snapshot.id,
      ...claim,
      source,
      created_at: nowIso()
    };
    await store.insert("claim_items", row);
    claims.push(row);
  }

  const priorAuthorizations = [];
  for (const priorAuth of structured.priorAuthorizations) {
    const row = {
      id: createId("pa"),
      snapshot_id: snapshot.id,
      ...priorAuth,
      source,
      created_at: nowIso()
    };
    await store.insert("prior_authorizations", row);
    priorAuthorizations.push(row);
  }

  const reviewPayload = {
    coverageBalances,
    claims,
    priorAuthorizations,
    sectionEvidence: structured.sectionEvidence,
    documentSignals: structured.documentSignals,
    idCardSignals: structured.idCardSignals,
    pharmacySignals: structured.pharmacySignals,
    networkSignals: structured.networkSignals,
    planSignals: structured.planSignals
  };
  const review = {
    id: createId("review"),
    snapshot_id: snapshot.id,
    status: "pending_user_review",
    review_payload: JSON.stringify(reviewPayload),
    created_at: nowIso(),
    updated_at: nowIso()
  };
  await store.insert("extraction_reviews", review);

  return { ...reviewPayload, review };
}
