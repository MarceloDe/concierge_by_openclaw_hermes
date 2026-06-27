// Step 4 proof: PHI masking gate for planner-facing capability metadata. Identifiers
// (SSN/MRN/email/long-id) are scrubbed before they can reach the planner columns;
// the ingest guard refuses unmasked PHI. No mocks (pure transform).
import test from "node:test";
import assert from "node:assert/strict";
import { maskPlannerMetadata, assertPlannerMetadataSafe } from "../concierge/capabilityCatalog.mjs";

test("Step 4: identifiers are scrubbed and phiCleared is true on masked output", () => {
  const r = maskPlannerMetadata({
    shortDescription: "Use when member SSN 123-45-6789 and MRN 00984512 are referenced",
    whenToUse: "contact jane.doe@example.com or call 415-555-0142",
    whyUse: "claim id CLM-99887766 needs review",
    bestUsedFor: "general benefits"
  });
  const all = [r.shortDescription, r.whenToUse, r.whyUse, r.bestUsedFor].join(" | ");
  assert.doesNotMatch(all, /123-45-6789/, "SSN must be redacted");
  assert.doesNotMatch(all, /00984512/, "MRN/long id must be redacted");
  assert.doesNotMatch(all, /jane\.doe@example\.com/, "email must be redacted");
  assert.doesNotMatch(all, /CLM-99887766/, "claim id must be redacted");
  assert.equal(r.containedPhi, true, "raw contained PHI");
  assert.equal(r.phiCleared, true, "masked output is PHI-cleared");
  assert.match(r.rationaleHash, /^capmeta_/, "rationale hash set");
});

test("Step 4: clean metadata is preserved and flagged not-contained", () => {
  const r = maskPlannerMetadata({
    shortDescription: "Coverage, deductible, OOP max, copay lookup.",
    whenToUse: "user asks about coverage or what they owe",
    whyUse: "routes benefit questions to the eligibility journey",
    bestUsedFor: "benefits and coverage understanding"
  });
  assert.equal(r.containedPhi, false);
  assert.equal(r.phiCleared, true);
  assert.match(r.shortDescription, /Coverage, deductible/);
});

test("Step 4: the ingest guard refuses unmasked PHI but passes masked output", () => {
  const rawWithPhi = "member id MEM-12345678 SSN 222-33-4444";
  assert.throws(() => assertPlannerMetadataSafe(rawWithPhi), /unmasked_phi_detected/);
  const masked = maskPlannerMetadata({ shortDescription: rawWithPhi });
  assert.doesNotThrow(() => assertPlannerMetadataSafe(masked.shortDescription), "masked output must pass the guard");
});

test("Step 4: masking is idempotent (re-masking masked output is stable + safe)", () => {
  const once = maskPlannerMetadata({ shortDescription: "SSN 123-45-6789 here" });
  const twice = maskPlannerMetadata({ shortDescription: once.shortDescription });
  assert.equal(twice.phiCleared, true);
  assert.equal(twice.containedPhi, false, "already-masked text has no residual PHI");
  assert.equal(twice.shortDescription, once.shortDescription, "stable under re-masking");
});
