import { runBrowserSandboxProviderWebrtcSignalingSmoke } from "./browser-sandbox-provider-contract.mjs";

runBrowserSandboxProviderWebrtcSignalingSmoke()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
