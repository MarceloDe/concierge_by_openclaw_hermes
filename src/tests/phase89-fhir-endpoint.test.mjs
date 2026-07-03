// Phase 89 proofs (docs/NON_MOCKED_PROOF_RULES.md — no mocks): the FHIR client under test does
// REAL HTTP against a real local node:http server (hermetic arm), the endpoint registry writes
// and reads a REAL SQLite store (mkdtemp), and the live arm hits a REAL public payer FHIR base
// (skip-loud if none answers — never faked).
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { createFhirClient } from "../concierge/connectors/fhirClient.mjs";
import {
  upsertConnectorEndpoint,
  listConnectorEndpoints,
  probeConnectorEndpoint,
  connectorFeasibility,
  CONNECTOR_STATUS_VALUES
} from "../concierge/connectors/endpointRegistry.mjs";

const CAPABILITY = { resourceType: "CapabilityStatement", status: "active", fhirVersion: "4.0.1", format: ["json"] };

function startFhirShapedServer() {
  const seen = { metadataRequests: [], practitionerRoleRequests: [], rateLimitedRequests: 0 };
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sendJson = (status, body, headers = {}) => {
      res.writeHead(status, { "content-type": "application/fhir+json", ...headers });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/metadata") {
      seen.metadataRequests.push({ authorization: req.headers.authorization ?? null, accept: req.headers.accept ?? null });
      return sendJson(200, CAPABILITY);
    }
    if (url.pathname === "/PractitionerRole") {
      seen.practitionerRoleRequests.push({ page: url.searchParams.get("page") ?? "1", count: url.searchParams.get("_count") });
      const base = `http://${req.headers.host}`;
      if (url.searchParams.get("page") === "2") {
        return sendJson(200, {
          resourceType: "Bundle", type: "searchset", total: 3,
          link: [{ relation: "self", url: `${base}/PractitionerRole?page=2` }],
          entry: [{ resource: { resourceType: "PractitionerRole", id: "pr-3" } }]
        });
      }
      return sendJson(200, {
        resourceType: "Bundle", type: "searchset", total: 3,
        link: [
          { relation: "self", url: `${base}/PractitionerRole` },
          { relation: "next", url: `${base}/PractitionerRole?page=2&_count=${url.searchParams.get("_count") ?? ""}` }
        ],
        entry: [
          { resource: { resourceType: "PractitionerRole", id: "pr-1" } },
          { resource: { resourceType: "PractitionerRole", id: "pr-2" } }
        ]
      });
    }
    if (url.pathname === "/RateLimited") {
      seen.rateLimitedRequests += 1;
      if (seen.rateLimitedRequests === 1) {
        return sendJson(429, { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "throttled" }] }, { "retry-after": "1" });
      }
      return sendJson(200, { resourceType: "Bundle", type: "searchset", total: 0, entry: [] });
    }
    return sendJson(404, { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "not-found" }] });
  });
  return { server, seen };
}

test("Phase 89 hermetic: fhirClient capabilityStatement, 2-page searchAll, 429/Retry-After retry, Bearer injection", async () => {
  const { server, seen } = startFhirShapedServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const client = createFhirClient({ baseUrl, perHostMinIntervalMs: 10 });

    // capabilityStatement() works over real HTTP with the FHIR accept header.
    const capability = await client.capabilityStatement();
    assert.equal(capability.resourceType, "CapabilityStatement");
    assert.equal(capability.fhirVersion, "4.0.1");
    assert.match(seen.metadataRequests[0].accept, /application\/fhir\+json/);

    // searchAll iterates exactly 2 pages following Bundle.link[rel=next]; _count defaulted.
    const pages = [];
    for await (const bundle of client.searchAll("PractitionerRole", {})) pages.push(bundle);
    assert.equal(pages.length, 2, "iterates exactly 2 Bundle pages");
    assert.equal(pages[0].entry.length, 2);
    assert.equal(pages[1].entry.length, 1);
    assert.equal(pages[1].link.some((l) => l.relation === "next"), false, "page 2 has no next link");
    assert.equal(seen.practitionerRoleRequests[0].count, "50", "_count defaults to defaultCount=50");
    assert.equal(seen.practitionerRoleRequests.length, 2, "server saw exactly 2 page requests");
    assert.equal(pages[1].meta?.searchAllTruncated, undefined, "no truncation note when pagination completed");

    // maxPages truncation: stop at 1 page and record the note in the last page's meta.
    const truncated = [];
    for await (const bundle of client.searchAll("PractitionerRole", {}, { maxPages: 1 })) truncated.push(bundle);
    assert.equal(truncated.length, 1);
    assert.equal(truncated[0].meta.searchAllTruncated.maxPages, 1);
    assert.match(truncated[0].meta.searchAllTruncated.nextUrl, /page=2/);

    // 429 with Retry-After: 1 is honored (real elapsed wait), then the retry succeeds.
    const startedAt = Date.now();
    const retried = await client.get("RateLimited");
    const elapsedMs = Date.now() - startedAt;
    assert.equal(retried.resourceType, "Bundle");
    assert.equal(seen.rateLimitedRequests, 2, "server counted the 429 attempt plus the retried success");
    assert.ok(elapsedMs >= 900, `Retry-After: 1 honored (waited ${elapsedMs}ms)`);

    // Bearer header injected when configured — asserted server-side.
    const bearerClient = createFhirClient({ baseUrl, authMode: "bearer", bearerToken: "tok-phase89", perHostMinIntervalMs: 10 });
    await bearerClient.capabilityStatement();
    assert.equal(seen.metadataRequests.at(-1).authorization, "Bearer tok-phase89");

    // Classified fail-loud on HTTP error, never a silent null.
    await assert.rejects(() => client.get("NoSuchResource"), (error) => {
      assert.equal(error.failureClass, "fhir_http_error");
      assert.equal(error.httpStatus, 404);
      return true;
    });
  } finally {
    server.close();
  }
});

test("Phase 89 registry: probe write→read-back CHANGES feasibility; failed probe is a stored classified fact", async () => {
  const { server } = startFhirShapedServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const dir = await mkdtemp(join(tmpdir(), "brainsty-phase89-"));
  const store = await new SqliteStore(join(dir, "t.sqlite")).initialize();
  try {
    const row = await upsertConnectorEndpoint(store, {
      payerKey: "test_payer", connectorKind: "plan_net", baseUrl, quirks: { note: "hermetic" }
    });
    assert.match(row.id, /^endpoint_/);
    assert.equal(row.readiness_label, "unprobed");

    // Upsert on (payer_key, connector_kind) updates in place — no duplicate row.
    const updated = await upsertConnectorEndpoint(store, { payerKey: "test_payer", connectorKind: "plan_net", baseUrl });
    assert.equal(updated.id, row.id);
    assert.equal((await listConnectorEndpoints(store, { connectorKind: "plan_net" })).length, 1);

    // BEFORE the probe: not feasible — readiness is a probed stored fact, not an env switch.
    const before = await connectorFeasibility(store, { payerKey: "test_payer", connectorKind: "plan_net" });
    assert.equal(before.feasible, false);
    assert.equal(before.readinessLabel, "unprobed");
    assert.equal(before.lastProbeAt, null);

    const probe = await probeConnectorEndpoint(store, { payerKey: "test_payer", connectorKind: "plan_net" });
    assert.equal(probe.status, "connected");
    assert.equal(probe.capabilityFhirVersion, "4.0.1");
    assert.ok(CONNECTOR_STATUS_VALUES.includes(probe.status));

    // AFTER the probe: the stored fact flips feasibility true (write→read-back).
    const after = await connectorFeasibility(store, { payerKey: "test_payer", connectorKind: "plan_net" });
    assert.equal(after.feasible, true);
    assert.equal(after.readinessLabel, "probed_ok");
    assert.ok(after.lastProbeAt);
    const stored = await store.findOne("connector_endpoints", { id: row.id });
    assert.equal(stored.last_probe_status, "connected");

    // Negative arm: unreachable base_url → probe STORES "error" (classified), does NOT throw.
    await upsertConnectorEndpoint(store, { payerKey: "dead_payer", connectorKind: "plan_net", baseUrl: "http://127.0.0.1:1" });
    const deadProbe = await probeConnectorEndpoint(store, { payerKey: "dead_payer", connectorKind: "plan_net" });
    assert.equal(deadProbe.status, "error");
    assert.equal(deadProbe.failureClass, "fhir_request_failed");
    assert.ok(CONNECTOR_STATUS_VALUES.includes(deadProbe.status));
    const deadFeasibility = await connectorFeasibility(store, { payerKey: "dead_payer", connectorKind: "plan_net" });
    assert.equal(deadFeasibility.feasible, false);
    assert.equal(deadFeasibility.readinessLabel, "probe_failed");
    assert.ok(deadFeasibility.lastProbeAt, "the failed probe is a stored fact with a timestamp");
  } finally {
    store.close();
    server.close();
  }
});

// LIVE arm: a REAL public payer FHIR base that answers unauthenticated. Tried in order; the
// first that answers is asserted + logged. If none answers, SKIP-LOUD with the reason.
const LIVE_CANDIDATE_BASES = [
  "https://fhir.humana.com/api",
  "https://fhir.humana.com/sandbox/api"
];

test("Phase 89 LIVE: public payer FHIR CapabilityStatement answers unauthenticated", async (t) => {
  const failures = [];
  for (const liveBase of LIVE_CANDIDATE_BASES) {
    try {
      const client = createFhirClient({ baseUrl: liveBase, timeoutMs: 20000 });
      const capability = await client.capabilityStatement();
      assert.equal(capability.resourceType, "CapabilityStatement");
      console.log(
        `LIVE public payer FHIR endpoint answered: ${liveBase} — fhirVersion=${capability.fhirVersion ?? "unknown"}, ` +
        `software=${capability.software?.name ?? capability.title ?? "unknown"}`
      );
      return;
    } catch (error) {
      failures.push(`${liveBase}: ${error?.failureClass ?? "error"} ${error?.message ?? error}`);
    }
  }
  t.skip(`SKIP-LOUD: no public payer FHIR base answered unauthenticated — ${failures.join(" | ")}`);
});
