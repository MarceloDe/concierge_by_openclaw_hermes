import test from "node:test";
import assert from "node:assert/strict";
import { extractStructuredInsuranceData } from "../concierge/structuredExtraction.mjs";

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
