import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractStructuredInsuranceData } from "../concierge/structuredExtraction.mjs";

async function fixture(name) {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

test("sanitized captured Aetna fixture parses balances, claims, prior authorization, and sections", async () => {
  const structured = extractStructuredInsuranceData(await fixture("aetna-captured-home-sanitized.txt"));

  assert.deepEqual(
    structured.coverageBalances.map((item) => ({
      balance_type: item.balance_type,
      total_amount: item.total_amount,
      spent_amount: item.spent_amount,
      remaining_amount: item.remaining_amount
    })),
    [
      {
        balance_type: "deductible",
        total_amount: 600,
        spent_amount: 558.72,
        remaining_amount: 41.28
      },
      {
        balance_type: "out_of_pocket_max",
        total_amount: 9000,
        spent_amount: 1476.98,
        remaining_amount: 7523.02
      }
    ]
  );
  assert.equal(structured.claims.length, 5);
  assert.equal(structured.claims[0].description, "Generic Office Visit");
  assert.equal(structured.claims[0].member_name, "Fixture Member");
  assert.equal(structured.claims[0].service_date, "May 12, 2026");
  assert.equal(structured.claims[0].share_amount, 3.81);
  assert.equal(structured.priorAuthorizations[0].provider_or_facility, "Sample Hospital");
  assert.equal(structured.priorAuthorizations[0].service_date, "Mar 6, 2026");
  assert.ok(structured.sectionEvidence.reachable.includes("documents"));
  assert.ok(structured.sectionEvidence.reachable.includes("pharmacy"));
  assert.ok(structured.sectionEvidence.reachable.includes("network"));
  assert.equal(structured.documentSignals.policy.documentDownloadAttempted, false);
});
