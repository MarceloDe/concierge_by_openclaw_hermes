import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyOfficialOpenClawLiveReadiness,
  OPENCLAW_BLOCKED_LIVE_ACTIONS,
  OPENCLAW_LIVE_FALLBACK_CHAIN
} from "../concierge/openclawLiveReadiness.mjs";

function baseReadiness(overrides = {}) {
  return {
    ready: true,
    status: "official_openclaw_profile_ready",
    checks: { browserEnabled: true },
    browser: { running: true, profile: "brainstyworkers-openclaw" },
    tabs: { currentTab: null, items: [], count: 0 },
    ...overrides
  };
}

test("official OpenClaw live readiness requires an authenticated current tab before approval", () => {
  const live = classifyOfficialOpenClawLiveReadiness(baseReadiness());
  assert.equal(live.status, "auth_required");
  assert.equal(live.readyForReadOnlyObservation, false);
  assert.equal(live.userActionRequired, true);
  assert.match(live.nextAction, /sign in manually/i);
});

test("official OpenClaw live readiness blocks credential or challenge pages", () => {
  const live = classifyOfficialOpenClawLiveReadiness(
    baseReadiness({
      tabs: {
        currentTab: {
          id: "tab_login",
          title: "Aetna Sign In - Password",
          url: "https://member.aetna.com/login",
          active: true
        },
        items: [],
        count: 1
      }
    })
  );
  assert.equal(live.status, "auth_or_challenge_required");
  assert.equal(live.readyForReadOnlyObservation, false);
  assert.match(live.nextAction, /password|2FA|captcha/i);
});

test("official OpenClaw live readiness asks user to navigate away from public marketing pages", () => {
  const live = classifyOfficialOpenClawLiveReadiness(
    baseReadiness({
      tabs: {
        currentTab: {
          id: "tab_public",
          title: "Aetna",
          url: "https://www.aetna.com/",
          active: true
        },
        items: [],
        count: 1
      }
    })
  );
  assert.equal(live.status, "portal_page_required");
  assert.equal(live.readyForReadOnlyObservation, false);
  assert.match(live.nextAction, /benefits|coverage|eligibility|claims/i);
});

test("official OpenClaw live readiness rejects unrelated offsite tabs", () => {
  const live = classifyOfficialOpenClawLiveReadiness(
    baseReadiness({
      tabs: {
        currentTab: {
          id: "tab_example",
          title: "Example Domain",
          url: "https://example.com/",
          active: true
        },
        items: [],
        count: 1
      }
    })
  );
  assert.equal(live.status, "portal_page_required");
  assert.equal(live.readyForReadOnlyObservation, false);
  assert.equal(live.userActionRequired, true);
  assert.match(live.nextAction, /benefits|coverage|eligibility|claims/i);
});

test("official OpenClaw live readiness marks member portal pages ready for read-only approval", () => {
  const live = classifyOfficialOpenClawLiveReadiness(
    baseReadiness({
      tabs: {
        currentTab: {
          id: "tab_benefits",
          title: "Member Benefits and Coverage",
          url: "https://member.aetna.com/benefits",
          active: true
        },
        items: [],
        count: 1
      }
    })
  );
  assert.equal(live.status, "ready_for_read_only_approval");
  assert.equal(live.readyForReadOnlyObservation, true);
  assert.equal(live.approvalScope, "read_only_observation");
  assert.equal(live.allowedAction, "read_only_observation");
  assert.match(live.safetyBoundary, /cannot handle credentials/i);
});

test("official OpenClaw live readiness accepts known authenticated member portal home pages", () => {
  const live = classifyOfficialOpenClawLiveReadiness(
    baseReadiness({
      tabs: {
        currentTab: {
          id: "tab_home",
          title: "Home - Aetna",
          url: "https://health.aetna.com/",
          active: true
        },
        items: [],
        count: 1
      }
    })
  );
  assert.equal(live.status, "ready_for_read_only_approval");
  assert.equal(live.readyForReadOnlyObservation, true);
  assert.match(live.nextAction, /Home - Aetna/i);
});

test("official OpenClaw live readiness preserves versatility, blocked actions, and fallback contract", () => {
  const live = classifyOfficialOpenClawLiveReadiness(baseReadiness());
  assert.deepEqual(live.blockedActions, OPENCLAW_BLOCKED_LIVE_ACTIONS);
  assert.deepEqual(live.fallbackChain, OPENCLAW_LIVE_FALLBACK_CHAIN);
  assert.ok(live.workerVersatility.some((item) => /same-site portal links/i.test(item)));
  assert.ok(live.workerVersatility.some((item) => /OCR/i.test(item)));
  assert.ok(live.terminalOutcomes.includes("not_possible_insurance_portal_block"));
});

test("official OpenClaw profile readiness failure blocks live worker approval", () => {
  const live = classifyOfficialOpenClawLiveReadiness(
    baseReadiness({
      ready: false,
      status: "official_openclaw_profile_not_ready",
      tabs: {
        currentTab: {
          id: "tab_benefits",
          title: "Member Benefits",
          url: "https://member.aetna.com/benefits",
          active: true
        },
        items: [],
        count: 1
      }
    })
  );
  assert.equal(live.status, "official_openclaw_profile_not_ready");
  assert.equal(live.readyForReadOnlyObservation, false);
  assert.match(live.nextAction, /profile|agent|skill|browser|OCR/i);
});
