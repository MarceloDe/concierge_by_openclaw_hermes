// Honest remote-browser readiness classification — the three tiers must never
// overstate production readiness. Pure/deterministic (hermetic env), in test:local.
import test from "node:test";
import assert from "node:assert/strict";
import { classifyBrowserRemoteReadiness, BROWSER_READINESS_TIERS } from "../concierge/browserRemoteReadiness.mjs";

test("localhost self-hosted Steel (dev-direct) is self_hosted_sandbox, NOT production-ready", () => {
  const r = classifyBrowserRemoteReadiness({
    WEFELLA_BROWSER_SANDBOX_PROVIDER_READY: "1",
    WEFELLA_BROWSER_SANDBOX_PROVIDER: "hosted_remote",
    WEFELLA_BROWSER_SANDBOX_PROVIDER_NAME: "steel-self-host",
    WEFELLA_BROWSER_SANDBOX_CDP_URL: "ws://127.0.0.1:9223",
    WEFELLA_BROWSER_SANDBOX_STEEL_API_URL: "http://127.0.0.1:3000",
    WEFELLA_BROWSER_SANDBOX_STEEL_DEV_DIRECT: "1"
  });
  assert.equal(r.tier, BROWSER_READINESS_TIERS.SELF_HOSTED_SANDBOX);
  assert.equal(r.productionReady, false, "provider=hosted_remote must NOT be production-ready when dev-direct/localhost");
});

test("bare localhost CDP with no Steel API is a local_cdp_harness", () => {
  const r = classifyBrowserRemoteReadiness({
    WEFELLA_BROWSER_SANDBOX_PROVIDER_READY: "1",
    WEFELLA_BROWSER_SANDBOX_PROVIDER: "hosted_remote",
    WEFELLA_BROWSER_SANDBOX_CDP_URL: "ws://127.0.0.1:9223"
  });
  assert.equal(r.tier, BROWSER_READINESS_TIERS.LOCAL_CDP_HARNESS);
  assert.equal(r.productionReady, false);
});

test("external https Steel API (no dev-direct) is production_hosted_remote", () => {
  const r = classifyBrowserRemoteReadiness({
    WEFELLA_BROWSER_SANDBOX_PROVIDER_READY: "1",
    WEFELLA_BROWSER_SANDBOX_PROVIDER: "hosted_remote",
    WEFELLA_BROWSER_SANDBOX_PROVIDER_NAME: "steel-cloud",
    WEFELLA_BROWSER_SANDBOX_CDP_URL: "wss://sessions.steel.example.com/cdp",
    WEFELLA_BROWSER_SANDBOX_STEEL_API_URL: "https://api.steel.example.com"
  });
  assert.equal(r.tier, BROWSER_READINESS_TIERS.PRODUCTION_HOSTED_REMOTE);
  assert.equal(r.productionReady, true);
});

test("not ready / no endpoints is disabled", () => {
  assert.equal(classifyBrowserRemoteReadiness({ WEFELLA_BROWSER_SANDBOX_PROVIDER_READY: "0" }).tier, BROWSER_READINESS_TIERS.DISABLED);
  assert.equal(classifyBrowserRemoteReadiness({}).tier, BROWSER_READINESS_TIERS.DISABLED);
});
