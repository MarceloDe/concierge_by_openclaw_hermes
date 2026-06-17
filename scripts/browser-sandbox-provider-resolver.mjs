import { fileURLToPath } from "node:url";
import { runBrowserSandboxProviderResolverSmoke } from "./browser-sandbox-provider-contract.mjs";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runBrowserSandboxProviderResolverSmoke()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
    })
    .catch((error) => {
      console.error(error.stack ?? error.message);
      process.exit(1);
    });
}
