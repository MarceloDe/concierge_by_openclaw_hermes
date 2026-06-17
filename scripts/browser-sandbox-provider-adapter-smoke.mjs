import { fileURLToPath } from "node:url";
import { runBrowserSandboxProviderAdapterSmoke } from "./browser-sandbox-provider-contract.mjs";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runBrowserSandboxProviderAdapterSmoke()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
    })
    .catch((error) => {
      console.error(error.stack ?? error.message);
      process.exit(1);
    });
}
