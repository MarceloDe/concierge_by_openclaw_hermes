#!/usr/bin/env node
import { runBrowserSandboxProviderSelectionSmoke } from "./browser-sandbox-provider-contract.mjs";

runBrowserSandboxProviderSelectionSmoke()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
  })
  .catch((error) => {
    console.error(error.stack ?? error.message);
    process.exit(1);
  });
