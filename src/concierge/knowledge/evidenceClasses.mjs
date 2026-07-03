// The canonical source-pointer/evidence-class vocabulary (plan §8.7 — founder-approved
// 2026-07-02, spine YAML evidence_classes). ONE vocabulary, no local variants: wherever
// the runtime names an evidence/source-pointer class it MUST be one of these values.
// `memberSpecificTruth` marks the ONLY classes that may assert member-specific truth
// (balances, claims, coverage status) — the hard rule enforced at answer composition.
export const EVIDENCE_CLASSES = Object.freeze({
  authenticated_portal: { trustRank: 1, memberSpecificTruth: true },
  member_authorized_api: { trustRank: 1, memberSpecificTruth: true },
  official_payer_public: { trustRank: 2, memberSpecificTruth: false },
  official_employer_public: { trustRank: 2, memberSpecificTruth: false },
  cms_public: { trustRank: 2, memberSpecificTruth: false },
  mrf_public: { trustRank: 2, memberSpecificTruth: false },
  user_uploaded: { trustRank: 2, memberSpecificTruth: true },
  user_reported: { trustRank: 4, memberSpecificTruth: false },
  // §7 scraper class (founder #9): public web facts NOT from an official
  // payer/employer/CMS source. verifyAuthenticatedPortalEvidence stays Aetna-only and
  // is bypassed ONLY for this class — never for portal truth.
  unauthenticated_public: { trustRank: 5, memberSpecificTruth: false },
  social_confusion_signal: { trustRank: 6, memberSpecificTruth: false }
});

export function isKnownEvidenceClass(value) {
  return Object.prototype.hasOwnProperty.call(EVIDENCE_CLASSES, String(value ?? ""));
}

export function evidenceClassSupportsMemberTruth(value) {
  return EVIDENCE_CLASSES[String(value ?? "")]?.memberSpecificTruth === true;
}
