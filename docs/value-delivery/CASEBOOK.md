# Two concrete first-value cases

## A. Emergency financial clarity, then an episode companion

### The moment

An authorized spouse says: “Hey Brain, we’re at Baptist South Miami. My husband has AFib. They may admit him to stabilize him and electrically restore his rhythm. What is the likely amount we pay, including doctors and procedures, and what is the worst case?”

The condition and procedure are **user-reported prospective context**, not verified clinical facts or a treatment instruction. A spouse must have established delegated patient access; marriage or a shared phone is not sufficient authorization by itself.

### First answer contract

Return useful verified parts before every source is complete. Engineering latency target: first bounded answer within 60 seconds when authenticated evidence is already available; this is a target, not achieved performance. If sources take longer, state what is known and the specific checks pending. Never hide missing procedure coverage behind a wide invented range.

Inputs for the pitch example, based on the previously reviewed plan rules:

| Evidence or assumption | Value | Treatment |
|---|---|---|
| Individual deductible | $200; already met in this example | Requires current member evidence |
| Individual annual out-of-pocket maximum | $3,000 | Applies to the matched tier / accumulator |
| Already credited | $828.06 | Current-example input, not the balance at the historical admission |
| Remaining eligible exposure | $2,171.94 | Arithmetic ceiling, not expected cost or all-charge cap |
| Emergency copay | $200; listed waiver if confined | Verify encounter classification and waiver conditions |
| Inpatient copay | $150/day for first five days | $750 cap on this component only |
| Hospital facility and inpatient physician/surgeon benefits | 100% after deductible for covered services | Do not extend to unverified procedure/anesthesia benefits |
| Hospital and network tier | South Miami / Maximum Savings | Explicit demo assumption; must be verified in a real run |
| 1–2-day admission | Scenario assumption | No claim about clinical length-of-stay probability |
| Cardioversion, sedation, tests, medicines | Exact benefits/coding unresolved | Complete episode quote remains pending |

Patient message: “Your $200 deductible is met. If formally admitted for one or two billable days, the known inpatient copay portion is $150–$300. Hospital and inpatient physician services under the matched benefit are covered at 100% after deductible. I’m still checking cardioversion, sedation and separately billed services, so this is not yet an all-inclusive estimate. Your remaining qualifying annual exposure is $2,171.94 under this same maximum. I’ll keep the episode open and update you when the admission classification and planned procedure details arrive.”

Do not label the one-to-two-day scenario “most probable” without a calibrated model and applicable evidence. Do not quote the hospital's gross bill as the patient's cost. The annual limit must not be shown as the predicted worst bill if excluded/noncovered charges remain unknown.

### What the historical review taught us

A real prior episode was distributed across ten claims from a facility and several professional groups. Its EOBs demonstrated a fixed facility copay, a separate deductible allocation, protected out-of-network interpretations, and a radiology claim arriving over four months after service. These are **design observations**, not proof that the hypothetical AFib case follows the same trajectory. Full personal records stay in the originating authorized local workspace.

Consequences:

- EOB statement totals can mix members and unrelated dates; group at claim/service level.
- Facility subclaim suffixes can sum to one parent claim; retain lineage instead of double-counting.
- Zero insurer payment can mean deductible/copay allocation rather than denial.
- Observation, inpatient admission and emergency-only care can have different benefits.
- A provider's clinical role does not establish its billing relationship or network tier.
- Discharge is not financial closure; a blanket 90-day closure misses late claims.
- EOB responsibility is not an unpaid balance. Bills, payments, reversals and refunds are separate evidence.

### Hospital team guide

| Patient question | Useful explanation | Required verification |
|---|---|---|
| Who is the hospitalist/internalist? | Usually the clinician coordinating general medical care during the stay; the hospital can confirm who is responsible today. | Care-team list or user-supplied name, role, attending identity |
| Is this doctor employed by the hospital? | Employment is distinct from permission to work there and from insurance participation. | Hospital/provider confirmation; never infer from job title |
| Why did cardiology send a separate bill? | Professional services may be billed separately from facility charges. | Billing group, rendering/billing NPI, tax ID when available, service dates |
| Is anesthesia included? | It may be separately billed; check the applicable benefit before quoting. | Planned service/code, anesthesiology group, coverage/network evidence |
| Is an out-of-network doctor a problem? | Check applicable emergency/surprise-billing protections and the EOB; out-of-network is not itself proof of an improper bill. | Setting, plan, applicable rules, EOB adjustments and provider invoice |

Clinical choices remain with the treating team. Do not recommend changing doctors, delaying cardioversion or leaving an emergency department to save money.

## B. Exact-prescription price comparison, then savings confirmation

User trigger: “My generic tadalafil 5 mg claim has no plan payment. Is another pharmacy or discount option cheaper?”

1. Read the actual latest valid claim: drug, strength, form, quantity, days' supply, service date, pharmacy, member responsibility, plan paid, status and reversals. Zero plan paid does not establish exclusion. Do not assume the displayed trailing number is quantity.
2. Confirm only missing matching fields and preferred location. The earlier search used 30 tablets and ZIP 33134; re-verify the prescription before acting.
3. Compare **the same drug, strength, form and quantity** through available public price channels and pharmacy pages. GoodRx and SingleCare are program sources; Costco/Sam's Club are pharmacies with potentially separate membership discounts. A coupon price is not evidence that buying a warehouse membership improves it.
4. Capture the actual branch, timestamp, stock/dispensing confirmation, coupon eligibility, one-time versus recurring price, shipping, taxes/fees, subscription renewal and cancellation terms.
5. Show today's outlay and a refill-horizon comparison. Distinguish existing membership from a new membership purchased solely for prescriptions. Do not recommend membership without a verified eligible drug price and positive net benefit.
6. Explain cash/coupon versus insurance tradeoffs from plan-specific evidence. Do not stack coupon and insurance unless expressly supported. Accumulator credit for cash fills is unknown until verified; future insured costs can change after deductible/OOP thresholds.
7. Prepare the selected option. A transfer, purchase, membership enrollment or message needs the exact approved action. The comparison itself does not send prescriptions or change treatment.
8. Confirm the pharmacy's final price and fill/payment receipt. Only then record realized savings; annual projections remain estimates.

The originating search found plausible cheaper options but did not complete a purchase or verify all coupon/stock details. Those old prices must not be reused as current offers. This design deliberately stores no live-price claims.

Patient card fields: current claim price; best verified same-prescription option; delivered/pickup total; recurring versus introductory price; membership required/not required/unverified; estimated net savings; what remains to confirm; next action; evidence date.
