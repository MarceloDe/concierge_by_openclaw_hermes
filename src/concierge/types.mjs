export const DEFAULT_MEMBER = Object.freeze({
  name: "Marcelo Felix",
  email: "mocfelix@gmail.com",
  payer: "Aetna",
  portalUrl: "https://www.aetna.com/"
});

export const DEFAULT_APPROVALS = Object.freeze({
  screenshotPolicy: "all allowed",
  phiStorageFields: "all fields",
  readOnlyExtractionApproved: true,
  websiteActionsApproved: true,
  credentialBoundary: "User handles passwords, passkeys, SSNs, and 2FA directly in Chrome."
});

export const WORKFLOWS = Object.freeze({
  ENROLLMENT_PORTAL_DEPURATION: "enrollment_portal_depuration",
  ESCALATE_APPROVAL: "escalate_approval",
  REFUSE_MEDICAL_ADVICE: "refuse_medical_advice",
  REFUSE_CREDENTIAL_ENTRY: "refuse_credential_entry",
  REFUSE_PROMPT_INJECTION: "refuse_prompt_injection",
  REFUSE_OUT_OF_SCOPE: "refuse_out_of_scope"
});

export const CHANNELS = Object.freeze({
  WEB_CHAT: "local_web_chat"
});
