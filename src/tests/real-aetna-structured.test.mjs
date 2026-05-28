import test from "node:test";
import assert from "node:assert/strict";
import { SqliteStore, DEFAULT_DB_PATH } from "../concierge/database.mjs";
import { extractStructuredInsuranceData } from "../concierge/structuredExtraction.mjs";

test("real logged Aetna extraction parses structured balances, claims, and prior authorization", async () => {
  const store = await new SqliteStore(DEFAULT_DB_PATH).initialize();
  const snapshot = await store.get(
    "SELECT * FROM eligibility_snapshots WHERE source_url = 'https://health.aetna.com/' AND raw_text LIKE '%Welcome, Marcelo%' AND raw_text LIKE '%SOUTH MIAMI HOSPITAL INC%' ORDER BY created_at DESC LIMIT 1;"
  );

  assert.ok(snapshot, "Run the earlier logged Aetna home extraction with SOUTH MIAMI prior authorization before this real-data test.");
  const structured = extractStructuredInsuranceData(snapshot.raw_text);

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
  assert.ok(structured.claims.length >= 5);
  assert.equal(structured.claims[0].description, "Lamotrigine Tab 25mg");
  assert.equal(structured.claims[0].member_name, "Rodrigo");
  assert.equal(structured.claims[0].service_date, "May 12, 2026");
  assert.equal(structured.claims[0].share_amount, 3.81);
  assert.equal(structured.priorAuthorizations[0].provider_or_facility, "SOUTH MIAMI HOSPITAL INC");
  assert.equal(structured.priorAuthorizations[0].service_date, "Mar 6, 2026");
});
