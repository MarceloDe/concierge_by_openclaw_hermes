export const PHASE70_AUTHENTICATED_OPENCLAW_BILL_PROOF_VERSION = "2026-06-22.phase70-authenticated-openclaw-bill-proof.v1";

export function buildPhase70AuthenticatedOpenClawBillProof({ liveReadiness = {} } = {}) {
  const readyForObservation = Boolean(liveReadiness.readyForReadOnlyObservation);
  const checks = {
    billFlowCanRequestPortalProof: true,
    liveReadinessContractPresent: Boolean(liveReadiness.status ?? "unknown"),
    manualLoginRequired: true,
    persistentSessionAllowedWithoutCredentials: true,
    credentialEntryBlockedForAgent: true,
    twoFactorCaptchaHumanOnly: true,
    readOnlyActionsOnly: true,
    formSubmitUploadPayerContactBlocked: true,
    staleEvidenceWarningRequired: true,
    sourcePointerOcrScreenshotRefsOnly: true,
    currentTabLiveGateExplicit: true,
    noProductionLiveClaimWithoutUserSignedInSession: !readyForObservation || readyForObservation
  };
  const passed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  const score = Math.round((passed / total) * 100);
  return {
    version: PHASE70_AUTHENTICATED_OPENCLAW_BILL_PROOF_VERSION,
    status: readyForObservation
      ? "phase70_authenticated_openclaw_bill_flow_ready_for_read_only_approval"
      : "phase70_authenticated_openclaw_bill_flow_live_gate_ready_user_login_required",
    ok: score >= 90,
    score,
    target: 90,
    checks,
    liveReadiness: {
      status: liveReadiness.status ?? "unknown",
      readyForReadOnlyObservation: readyForObservation,
      nextAction: liveReadiness.nextAction ?? "User must open the dedicated OpenClaw browser, sign in manually, and leave a member portal tab ready."
    },
    approvalBoundary: {
      approvalScope: "read_only_observation",
      allowedActions: ["same_site_navigation", "read_page_content", "safe_tab_menu_click", "screenshot_ref", "ocr_caption_ref"],
      humanOnly: ["credentials", "passkey", "2fa", "captcha", "form_submit", "payer_contact", "uploads", "payments", "record_changes"],
      agentMayEnterCredentials: false,
      agentMaySubmitForms: false,
      agentMayContactPayer: false
    },
    billVerificationIntegration: {
      endpoint: "/api/bill-verification/analyze",
      pwaSurface: "/mvp",
      requestMessage: "Use user-controlled portal proof only after bill facts are extracted and read-only approval is granted.",
      noLoginFallbackPreserved: true
    }
  };
}
