import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
  validateBrowserSandboxProviderContract,
  runBrowserSandboxProviderContractSmoke,
  runBrowserSandboxAdapterHarnessSmoke
} from "../../scripts/browser-sandbox-provider-contract.mjs";

test("hosted browser sandbox provider contract validates the safe remote provider shape", async () => {
  const source = await readFile(new URL("../../scripts/browser-sandbox-provider-contract.mjs", import.meta.url), "utf8");
  assert.match(BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION, /browser-sandbox-provider/);
  const validation = await validateBrowserSandboxProviderContract();
  assert.equal(validation.ok, true);
  assert.equal(validation.sanitizedConfig.provider, "hosted_remote");
  assert.equal(validation.sanitizedConfig.sessionPolicy.recordFrames, false);
  assert.equal(validation.sanitizedConfig.approvalPolicy.agentCredentialEntryAllowed, false);
  for (const fragment of [
    "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY",
    "endpoint_ref_must_not_be_raw_url",
    "agent_credential_entry_must_be_blocked",
    "external_write_actions_must_be_blocked",
    "hosted_browser_sandbox_contract_valid_not_configured"
  ]) {
    assert.match(source, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("hosted browser sandbox smoke does not claim readiness from the example config", async () => {
  const result = await runBrowserSandboxProviderContractSmoke({
    artifactPath: "/tmp/brainsty-browser-sandbox-provider-contract-smoke-test.json",
    providerReady: true
  });
  assert.equal(result.ok, true);
  assert.equal(result.hostedProviderReady, false);
  assert.equal(result.status, "hosted_browser_sandbox_contract_valid_not_configured");
  assert.equal(result.safety.rawEndpointUrlWritten, false);
  assert.equal(result.safety.rawSecretFilePathWritten, false);
  assert.equal(result.safety.rawOcrTextReturned, false);
  assert.equal(result.safety.frameRecordingEnabled, false);
});

test("hosted browser sandbox adapter harness proves lifecycle shape without claiming live provider", async () => {
  const result = await runBrowserSandboxAdapterHarnessSmoke({
    artifactPath: "/tmp/brainsty-browser-sandbox-adapter-harness-smoke-test.json"
  });
  assert.equal(result.ok, true);
  assert.equal(result.adapterHarnessReady, true);
  assert.equal(result.hostedProviderReady, false);
  assert.equal(result.status, "hosted_browser_sandbox_adapter_harness_ready");
  assert.equal(result.validation.sanitizedConfig.adapter.mode, "contract_harness");
  assert.equal(result.lifecycle.streamFrames, "contract_harness_sse_event_available");
  assert.equal(result.safety.rawEndpointUrlWritten, false);
  assert.equal(result.safety.rawOcrTextReturned, false);
});
