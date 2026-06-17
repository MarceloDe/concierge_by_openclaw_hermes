#!/usr/bin/env node
import { runBrowserSandboxProviderLiveVerificationSmoke } from "./browser-sandbox-provider-contract.mjs";

runBrowserSandboxProviderLiveVerificationSmoke()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
  })
  .catch((error) => {
    console.error(error.stack ?? error.message);
    process.exit(1);
  });
