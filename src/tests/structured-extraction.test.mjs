import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractStructuredInsuranceData } from "../concierge/structuredExtraction.mjs";

async function fixture(name) {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

test("structured extraction reconciles DOM and OCR-style benefits balance text", () => {
  const structured = extractStructuredInsuranceData(`
    [Accessibility Tree]
    Plan spending
    Deductible
    Total $600
    Spent $558.72
    Remaining $41.28

    [Visual OCR]
    Out of pocket maximum $9,000 total $1,476.98 spent $7,523.02 remaining
  `);

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
});

test("structured extraction handles OpenClaw accessibility snapshot labels", () => {
  const structured = extractStructuredInsuranceData(`
    heading "Deductible - $600" StaticText "Deductible - $600" InlineTextBox "Deductible - $600"
    StaticText "$558.72" InlineTextBox "$558.72" LabelText StaticText "Spent" InlineTextBox "Spent"
    StaticText "$41.28" InlineTextBox "$41.28" LabelText StaticText "Remaining" InlineTextBox "Remaining"
    heading "Out-of-Pocket Max - $9,000" StaticText "Out-of-Pocket Max - $9,000" InlineTextBox "Out-of-Pocket Max - $9,000"
    StaticText "Full coverage starts after you spend $9,000 on services that count toward your out-of-pocket max."
    StaticText "$1,476.98" InlineTextBox "$1,476.98" LabelText StaticText "Spent" InlineTextBox "Spent"
    StaticText "$7,523.02" InlineTextBox "$7,523.02" LabelText StaticText "Remaining" InlineTextBox "Remaining"
    region "Claims" heading "Claims" link "View All Claims"
    listitem link "Lamotrigine Tab 25mg For Rodrigo - May 12, 2026 Your share $3.81"
    listitem link "Private For Rodrigo - Apr 15, 2026 Your share $8.92"
    heading "Prior Authorization" link "View All Prior Authorization"
    listitem link "SOUTH MIAMI HOSPITAL INC Mar 6, 2026"
  `);

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
  assert.equal(structured.claims.length, 2);
  assert.equal(structured.claims[0].description, "Lamotrigine Tab 25mg");
  assert.equal(structured.claims[0].share_amount, 3.81);
  assert.equal(structured.priorAuthorizations[0].provider_or_facility, "SOUTH MIAMI HOSPITAL INC");
});

test("structured extraction identifies section-specific captured portal evidence", async () => {
  const structured = extractStructuredInsuranceData(await fixture("aetna-captured-home-sanitized.txt"));

  assert.deepEqual(
    structured.sectionEvidence.reachable,
    ["benefits", "spending", "claims", "prior_authorizations", "documents", "id_card", "pharmacy", "network"]
  );
  assert.equal(structured.documentSignals.candidateCount, 5);
  assert.equal(structured.documentSignals.sbcPdfCandidateCount, 3);
  assert.equal(structured.idCardSignals.present, true);
  assert.equal(structured.idCardSignals.safeIdentifierOnly, true);
  assert.equal(structured.idCardSignals.directIdentifierExtracted, false);
  assert.equal(structured.pharmacySignals.present, true);
  assert.ok(structured.pharmacySignals.signals.includes("formulary"));
  assert.equal(structured.networkSignals.present, true);
  assert.equal(structured.planSignals.effectiveDate, "Jan 1, 2026");
});
