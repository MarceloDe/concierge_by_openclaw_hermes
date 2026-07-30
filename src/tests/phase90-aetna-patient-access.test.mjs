import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "./support/sqliteTestStore.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { buildContextPacket } from "../concierge/memoryHarness.mjs";
import {
  AETNA_SANDBOX,
  buildAetnaSandboxAuthorizationUrl,
  completeAetnaSandboxOAuth,
  consumeAetnaOauthStateGate,
  createAetnaOauthStateGate,
  syncAetnaSandboxPatientAccess
} from "../concierge/connectors/aetnaPatientAccess.mjs";
import { memberDataRail } from "../concierge/connectors/tokenVault.mjs";
import { buildLlmOrchestrationDecisionMessages } from "../concierge/llmOrchestrationDecision.mjs";

process.env.BRAINSTY_REDIS_URL = "";
process.env.REDIS_URL = "";

async function seededStore(prefix) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return new SqliteStore(join(dir, "t.sqlite")).initialize();
}

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

test("Phase 90: Aetna sandbox authorization URL uses official audience, exact sandbox scope, state, and optional PKCE", () => {
  const url = new URL(buildAetnaSandboxAuthorizationUrl({
    clientId: "client-contract-id",
    redirectUri: "https://brainsty.ai/oauth/aetna/callback",
    state: "state-bound-to-session",
    codeChallenge: "pkce-challenge"
  }));
  assert.equal(`${url.origin}${url.pathname}`, AETNA_SANDBOX.authorizeUrl);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("aud"), AETNA_SANDBOX.audience);
  assert.equal(url.searchParams.get("scope"), "launch/patient patient/*.read");
  assert.equal(url.searchParams.get("state"), "state-bound-to-session");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
});

test("Phase 90: Aetna OAuth state is session-bound, expiring, and single-use", async () => {
  const store = await seededStore("brainsty-p90-aetna-state-");
  const { user, portal, session } = await enrollDefaultMember(store);
  const gate = await createAetnaOauthStateGate(store, {
    userId: user.id,
    sessionId: session.id,
    portalAccountId: portal.id,
    redirectUri: "https://brainsty.ai/api/connectors/aetna/oauth/callback"
  });
  const consumed = await consumeAetnaOauthStateGate(store, { state: gate.state });
  assert.equal(consumed.userId, user.id);
  assert.equal(consumed.sessionId, session.id);
  await assert.rejects(
    consumeAetnaOauthStateGate(store, { state: gate.state }),
    (error) => error.failureClass === "aetna_oauth_state_replayed"
  );
});

test("Phase 90: Aetna sandbox contract flow stores encrypted token, performs FHIR read, persists EOB/balance pointers, and records api_covered", async (t) => {
  let tokenRequest = null;
  const fhirRequests = [];
  const service = await listen(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (request.method === "POST" && url.pathname === "/oauth2/token") {
      let body = "";
      for await (const chunk of request) body += chunk;
      tokenRequest = { authorization: request.headers.authorization, body };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        access_token: "contract-access-token-never-persist-raw",
        token_type: "Bearer",
        expires_in: 300,
        scope: "launch/patient patient/*.read",
        patient: "sandbox-patient-1"
      }));
      return;
    }
    if (request.headers.authorization !== "Bearer contract-access-token-never-persist-raw") {
      response.writeHead(401, { "content-type": "application/fhir+json" });
      response.end(JSON.stringify({ resourceType: "OperationOutcome" }));
      return;
    }
    fhirRequests.push(url);
    response.writeHead(200, { "content-type": "application/fhir+json" });
    if (url.pathname.endsWith("/Patient/sandbox-patient-1")) {
      response.end(JSON.stringify({ resourceType: "Patient", id: "sandbox-patient-1" }));
      return;
    }
    if (url.pathname.endsWith("/Coverage")) {
      response.end(JSON.stringify({ resourceType: "Bundle", type: "searchset", entry: [{ resource: { resourceType: "Coverage", id: "coverage-1", status: "active" } }] }));
      return;
    }
    if (url.pathname.endsWith("/ExplanationOfBenefit")) {
      response.end(JSON.stringify({
        resourceType: "Bundle",
        type: "searchset",
        entry: [{ resource: {
          resourceType: "ExplanationOfBenefit",
          id: "eob-1",
          status: "active",
          outcome: "complete",
          type: { text: "Professional claim" },
          billablePeriod: { start: "2026-06-01" },
          total: [{ category: { coding: [{ code: "memberliability" }] }, amount: { value: 42.5, currency: "USD" } }],
          benefitBalance: [{
            category: { text: "Medical deductible" },
            financial: [{ type: { text: "Individual" }, allowedMoney: { value: 1000, currency: "USD" }, usedMoney: { value: 250, currency: "USD" } }]
          }]
        } }]
      }));
      return;
    }
    response.writeHead(404, { "content-type": "application/fhir+json" });
    response.end(JSON.stringify({ resourceType: "OperationOutcome" }));
  });
  t.after(service.close);

  const store = await seededStore("brainsty-p90-aetna-");
  const { user, portal, session } = await enrollDefaultMember(store);
  const oauth = await completeAetnaSandboxOAuth(store, {
    userId: user.id,
    sessionId: session.id,
    code: "authorization-code",
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "https://brainsty.ai/oauth/aetna/callback",
    tokenUrl: `${service.baseUrl}/oauth2/token`
  });
  assert.match(tokenRequest.authorization, /^Basic /);
  assert.match(tokenRequest.body, /grant_type=authorization_code/);
  const grantRow = await store.findOne("connector_oauth_grants", { id: oauth.grantId });
  assert.equal(JSON.stringify(grantRow).includes("contract-access-token-never-persist-raw"), false);

  const sync = await syncAetnaSandboxPatientAccess(store, {
    userId: user.id,
    sessionId: session.id,
    portalAccountId: portal.id,
    grantId: oauth.grantId,
    patientId: oauth.patientId,
    fhirBaseUrl: service.baseUrl
  });
  assert.equal(sync.synced, true);
  assert.equal(sync.structured.claims.length, 1);
  assert.equal(sync.structured.coverageBalances.length, 1);
  assert.equal(sync.structured.claims[0].share_amount, 42.5);
  assert.equal(sync.structured.coverageBalances[0].remaining_amount, 750);
  const coverageRequest = fhirRequests.find((url) => url.pathname.endsWith("/Coverage"));
  assert.equal(coverageRequest.searchParams.has("_revinclude"), false);
  assert.equal(coverageRequest.searchParams.has("_count"), false);
  const eobRequest = fhirRequests.find((url) => url.pathname.endsWith("/ExplanationOfBenefit"));
  assert.equal(eobRequest.searchParams.has("_count"), false);
  const rail = await memberDataRail(store, { userId: user.id, payerKey: "aetna" });
  assert.equal(rail.rail, "api_covered");
  assert.match(rail.probeEvidencePointer, /^audit_events#/);

  const laterContext = await buildContextPacket(store, { user, session, userInput: "What did my recent claim cost?" });
  assert.ok(laterContext.packet.dbPointers.some((pointer) => pointer.table === "claim_items"));
  assert.ok(laterContext.packet.dbPointers.some((pointer) => pointer.table === "coverage_balances"));

  const claimCountBeforeRepeat = await store.get("SELECT COUNT(*) AS count FROM claim_items;");
  const balanceCountBeforeRepeat = await store.get("SELECT COUNT(*) AS count FROM coverage_balances;");
  const repeatedSync = await syncAetnaSandboxPatientAccess(store, {
    userId: user.id,
    sessionId: session.id,
    portalAccountId: portal.id,
    grantId: oauth.grantId,
    patientId: oauth.patientId,
    fhirBaseUrl: service.baseUrl
  });
  assert.equal(repeatedSync.synced, true);
  assert.equal((await store.get("SELECT COUNT(*) AS count FROM claim_items;")).count, claimCountBeforeRepeat.count);
  assert.equal((await store.get("SELECT COUNT(*) AS count FROM coverage_balances;")).count, balanceCountBeforeRepeat.count);
});

test("Phase 90: planner prefers persisted Patient Access evidence over portal control", () => {
  const [system] = buildLlmOrchestrationDecisionMessages({
    user_input: "What did my recent claim cost?",
    context_packet: {
      dbPointers: [{
        table: "claim_items",
        id: "claim_pointer_only",
        sourceUrl: "https://vteapif1.aetna.com/fhirdemo/v1/patientaccess/ExplanationOfBenefit"
      }]
    }
  });
  assert.match(system.content, /persisted Patient Access Coverage\/EOB pointers/);
  assert.match(system.content, /never require portal control merely because the evidence came from the preferred API layer/);
});
