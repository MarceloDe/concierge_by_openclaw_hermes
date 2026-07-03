// Phase 89 (plan §9): the provider-directory sync job — the same function the nightly
// cadence runs, invocable ad hoc. LIVE Plan-Net paging via the shared fhirClient into
// provider_directory_entries, endpoint registered + probed in connector_endpoints
// (readiness is the stored probe fact). Fail-loud; prints a JSON summary.
import { SqliteStore } from "../src/concierge/database.mjs";
import { createFhirClient } from "../src/concierge/connectors/fhirClient.mjs";
import { probeConnectorEndpoint, upsertConnectorEndpoint } from "../src/concierge/connectors/endpointRegistry.mjs";
import { syncProviderDirectory } from "../src/concierge/connectors/planNetDirectory.mjs";

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
}

const dbPath = arg("db");
if (!dbPath) {
  console.error("[sync-provider-directory] --db <sqlite-path> is required");
  process.exit(1);
}
const payerKey = arg("payer", "humana");
const baseUrl = arg("base-url", "https://fhir.humana.com/api");
const specialty = arg("specialty", "207RC0000X");
const maxPages = Number(arg("max-pages", "2"));
const count = Number(arg("count", "25"));

const store = await new SqliteStore(dbPath).initialize();
await upsertConnectorEndpoint(store, {
  payerKey,
  connectorKind: "plan_net_directory",
  baseUrl,
  authMode: "none",
  quirks: {
    pagination: "opaque_continuation_token_follow_next_links_verbatim",
    chainedPostalCodeSearch: "server_504_geography_filters_apply_at_query_time"
  }
});
const probe = await probeConnectorEndpoint(store, { payerKey, connectorKind: "plan_net_directory" });
if (probe.status !== "connected") {
  console.error(`[sync-provider-directory] endpoint probe failed loud: ${JSON.stringify(probe)}`);
  process.exit(1);
}
const client = createFhirClient({ baseUrl, authMode: "none", defaultCount: count });
const result = await syncProviderDirectory(store, { client, payerKey, specialty, count, maxPages });
console.log(JSON.stringify({ probe: probe.status, ...result }));
if (result.pages < 1 || result.inserted + result.skipped < 1) {
  console.error("[sync-provider-directory] sync produced no rows — loud failure, not a silent empty mirror");
  process.exit(1);
}
