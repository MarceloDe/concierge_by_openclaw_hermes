#!/usr/bin/env node
import { runBrowserSandboxProviderSteelRemoteReadinessSmoke } from "./browser-sandbox-provider-contract.mjs";

const result = await runBrowserSandboxProviderSteelRemoteReadinessSmoke();
console.log(JSON.stringify(result, null, 2));
if (!result.deployment?.ok) {
  process.exitCode = 1;
}
