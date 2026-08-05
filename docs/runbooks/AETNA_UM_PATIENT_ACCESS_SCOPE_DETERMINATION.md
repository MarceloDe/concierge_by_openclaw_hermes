# Aetna Patient Access Scope Decision for the UM Plan

Date: 2026-07-30

## Current disposition

`no` — founder interim decision recorded 2026-07-30.

The University of Miami employer plan is `portal_only`. Do not initiate or
offer Aetna Patient Access API authorization for this plan. Keep
`BRAINSTY_UM_PATIENT_ACCESS_IN_SCOPE=no` and keep its `member_data_rails` outcome
`portal_only`.

This is a plan-specific decision. It does not disable the Aetna connector for
eligible plans or invalidate the Aetna-issued synthetic sandbox proof.

The approved Aetna Third-Party Developer app proves that the application may use
the sandbox. It does **not** prove that every Aetna-administered commercial plan
is available through the production Patient Access API.

During the live sandbox authorization proof on 2026-07-30, Aetna's authorization
page stated that its current member-data transfer supports Medicare member data.
CMS also states that employer-based commercial/group health plans are not
mandatory impacted payers under the interoperability rule; a payer may support
them voluntarily. Therefore the answer cannot safely be inferred from either the
developer approval or Aetna's role as TPA.

Official references:

- CMS, General interoperability FAQ:
  https://www.cms.gov/priorities/burden-reduction/overview/interoperability/frequently-asked-questions/general
- CMS, Patient Access API FAQ:
  https://www.cms.gov/priorities/burden-reduction/overview/interoperability/frequently-asked-questions/patient-access-api

## Reconsideration procedure

No external confirmation is required to keep the current conservative
`portal_only` decision. Complete the steps below only if the founder later asks
to reconsider API eligibility.

### 1. UM Benefits / plan administrator

Ask for a written answer to these non-PHI plan-level questions:

1. Is the medical plan self-funded, fully insured, or mixed?
2. Is Aetna acting as an ASO/TPA, the insurer, or both for this product?
3. Does the administrative-services agreement include third-party Patient
   Access API data sharing for members?
4. What non-member product or group identifier may be shared with Aetna support
   to determine API eligibility?

Do not send a member ID, claim number, date of birth, or other PHI.

### 2. Aetna Interoperability Developer Support

Send this plan-level question from the developer-portal account:

> Our Third-Party Developer sandbox app is approved. Does Aetna Patient Access
> API production support the University of Miami self-funded employer medical
> plan administered by Aetna? If yes, please identify the eligible
> product/group classification, supported FHIR resources, production onboarding
> requirements, and whether the member authorization screen will recognize this
> commercial plan. If no, please confirm that the plan is out of scope.

Do not include a member ID, credentials, claims, or PHI in the initial request.
If Aetna requires a group/product identifier, obtain the approved non-member
identifier from UM Benefits first.

## Recording the answer

Only after the written responses agree **and** the founder explicitly changes
the current decision:

- Eligible: set `BRAINSTY_UM_PATIENT_ACCESS_IN_SCOPE=yes`.
- Not eligible or no new founder decision: keep
  `BRAINSTY_UM_PATIENT_ACCESS_IN_SCOPE=no` and the member's data rail
  `portal_only`.
- Conflicting or conditional answers: leave the variable unset and keep the
  rail `portal_only`.

The environment value records a plan-level decision only. It must never contain
PHI, credentials, a member identifier, or free-form correspondence.

An eligible answer plus a new founder decision authorizes planning, not
production PHI access. Production
member OAuth and real-member proof remain Phase 91 work and require the
documented consent, standing, vault, audit, and deployment gates.
