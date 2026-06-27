// Honest remote-browser readiness classification. The directive forbids claiming
// "remote browser ready" when only a local CDP harness or a localhost self-hosted
// sandbox is in use. This classifier separates three tiers so dashboards/readiness
// never overstate production remote readiness.
export const BROWSER_REMOTE_READINESS_VERSION = "2026-06-27.browser-remote-readiness.v1";

export const BROWSER_READINESS_TIERS = Object.freeze({
  DISABLED: "disabled",
  LOCAL_CDP_HARNESS: "local_cdp_harness",
  SELF_HOSTED_SANDBOX: "self_hosted_sandbox",
  PRODUCTION_HOSTED_REMOTE: "production_hosted_remote"
});

function isLocal(url) {
  return Boolean(url) && /(localhost|127\.0\.0\.1|\[?::1\]?|0\.0\.0\.0)/i.test(url);
}
function isExternalHttps(url) {
  return Boolean(url) && /^https:\/\//i.test(url) && !isLocal(url);
}

export function classifyBrowserRemoteReadiness(env = process.env) {
  const ready = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_READY === "1";
  const provider = env.WEFELLA_BROWSER_SANDBOX_PROVIDER || "disabled";
  const providerName = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_NAME || null;
  const cdpUrl = env.WEFELLA_BROWSER_SANDBOX_CDP_URL || null;
  const steelApiUrl = env.WEFELLA_BROWSER_SANDBOX_STEEL_API_URL || null;
  const devDirect = env.WEFELLA_BROWSER_SANDBOX_STEEL_DEV_DIRECT === "1";
  const reasons = [];

  let tier;
  if (!ready || provider === "disabled" || (!cdpUrl && !steelApiUrl)) {
    tier = BROWSER_READINESS_TIERS.DISABLED;
    reasons.push("provider_not_ready_or_no_endpoints");
  } else if (devDirect || isLocal(cdpUrl) || isLocal(steelApiUrl)) {
    tier = steelApiUrl ? BROWSER_READINESS_TIERS.SELF_HOSTED_SANDBOX : BROWSER_READINESS_TIERS.LOCAL_CDP_HARNESS;
    reasons.push(devDirect ? "steel_dev_direct" : "localhost_endpoints");
  } else if (provider === "hosted_remote" && isExternalHttps(steelApiUrl)) {
    tier = BROWSER_READINESS_TIERS.PRODUCTION_HOSTED_REMOTE;
    reasons.push("external_https_steel_api");
  } else {
    // Non-local, non-https endpoints are NOT production-grade; treat conservatively.
    tier = BROWSER_READINESS_TIERS.SELF_HOSTED_SANDBOX;
    reasons.push("non_local_non_https_treated_as_self_hosted");
  }

  return {
    version: BROWSER_REMOTE_READINESS_VERSION,
    tier,
    productionReady: tier === BROWSER_READINESS_TIERS.PRODUCTION_HOSTED_REMOTE,
    provider,
    providerName,
    cdpUrl,
    steelApiUrl,
    devDirect,
    reasons
  };
}

// Live reachability probe of the configured CDP endpoint (ws -> http /json/version).
export async function probeBrowserCdpReachable(env = process.env, { timeoutMs = 3000 } = {}) {
  const cdp = env.WEFELLA_BROWSER_SANDBOX_CDP_URL || null;
  if (!cdp) return { reachable: false, reason: "no_cdp_url", endpoint: null };
  const endpoint = `${cdp.replace(/^ws/i, "http").replace(/\/$/, "")}/json/version`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, { signal: controller.signal });
    return { reachable: res.ok, status: res.status, endpoint };
  } catch (error) {
    return { reachable: false, error: error.message, endpoint };
  } finally {
    clearTimeout(timer);
  }
}
