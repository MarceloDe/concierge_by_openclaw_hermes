import { audit, approvalGate } from "./audit.mjs";
import { createId, nowIso } from "./database.mjs";
import { resolveManagedSession } from "./sessionManager.mjs";
import { CHANNELS, DEFAULT_APPROVALS, DEFAULT_MEMBER } from "./types.mjs";

export async function enrollDefaultMember(store, overrides = {}, sessionOptions = {}) {
  const member = { ...DEFAULT_MEMBER, ...overrides };
  const approvals = { ...DEFAULT_APPROVALS, ...(overrides.approvals ?? {}) };
  const existingUser = await store.findOne("users", { email: member.email });
  const user = existingUser ?? {
    id: createId("user"),
    name: member.name,
    email: member.email,
    created_at: nowIso()
  };
  if (!existingUser) {
    await store.insert("users", user);
  }

  const consent = {
    id: createId("consent"),
    user_id: user.id,
    screenshot_policy: approvals.screenshotPolicy,
    phi_storage_fields: approvals.phiStorageFields,
    read_only_extraction_approved: approvals.readOnlyExtractionApproved,
    website_actions_approved: approvals.websiteActionsApproved,
    credential_boundary: approvals.credentialBoundary,
    created_at: nowIso()
  };
  await store.insert("user_consents", consent);

  const portal = {
    id: createId("portal"),
    user_id: user.id,
    payer: member.payer,
    portal_url: member.portalUrl,
    status: "approved_for_user_authenticated_browser",
    created_at: nowIso()
  };
  await store.insert("portal_accounts", portal);

  const { session, resumed } = await resolveManagedSession(store, {
    user,
    portal,
    sessionId: sessionOptions.sessionId,
    resumeLatestSession: sessionOptions.resumeLatestSession,
    channel: CHANNELS.WEB_CHAT,
    title: sessionOptions.title
  });

  if (!resumed) {
    await approvalGate(store, session.id, "local_phi_storage", "approved", {
      screenshotPolicy: consent.screenshot_policy,
      phiStorageFields: consent.phi_storage_fields,
      readOnlyExtractionApproved: Boolean(consent.read_only_extraction_approved),
      websiteActionsApproved: Boolean(consent.website_actions_approved)
    });
    await approvalGate(store, session.id, "credential_boundary", "user_controlled", {
      boundary: consent.credential_boundary
    });
  }
  await audit(store, session.id, resumed ? "member_session_resumed" : "member_enrolled", {
    userId: user.id,
    email: user.email,
    portalUrl: portal.portal_url,
    payer: portal.payer,
    resumed
  });

  return { user, consent, portal, session, sessionResumed: resumed };
}
