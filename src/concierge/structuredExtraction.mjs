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

function inferredBalanceAmounts(region) {
  const amounts = [...region.matchAll(moneyRegex())].map((match) => parseMoney(match[0])).filter((value) => value !== null);
  if (!amounts.length) return null;

  const total =
    amountNearLabel(region, "\\b(?:total|maximum|max|limit|annual|plan)\\b") ??
    amountNearLabel(region, "\\b(?:total|maximum|max|limit|annual|plan)\\b", "before") ??
    amounts[0];
  const remainingAfter = amountNearLabel(region, "\\b(?:remaining|left|remain)\\b");
  const remainingBefore = amountNearLabel(region, "\\b(?:remaining|left|remain)\\b", "before");
  const remaining = remainingAfter ?? remainingBefore ?? (amounts.length >= 3 ? amounts[2] : null);
  const spentAfter = amountNearLabel(region, "\\b(?:spent|met|used|applied|paid)\\b");
  const spentBefore = amountNearLabel(region, "\\b(?:spent|met|used|applied|paid)\\b", "before");
  const spent =
    spentAfter !== null && spentBefore !== null && remainingAfter === null && remainingBefore !== null && spentAfter === remainingBefore
      ? spentBefore
      : spentAfter ?? spentBefore ?? (amounts.length >= 3 ? amounts[1] : null);

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
      const end = Math.min(normalized.length, match.index + 260);
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
    priorAuthorizations: parsePriorAuthorizations(text)
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

  const reviewPayload = { coverageBalances, claims, priorAuthorizations };
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
