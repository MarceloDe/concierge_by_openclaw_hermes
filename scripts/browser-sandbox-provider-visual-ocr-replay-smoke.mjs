#!/usr/bin/env node
import { runBrowserSandboxProviderVisualOcrReplaySmoke } from "./browser-sandbox-provider-contract.mjs";

runBrowserSandboxProviderVisualOcrReplaySmoke()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(error.stack ?? error.message);
    process.exit(1);
  });
