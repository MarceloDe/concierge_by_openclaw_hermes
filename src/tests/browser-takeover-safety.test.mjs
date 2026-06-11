import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import {
  requestTakeover,
  grantTakeover,
  relayHumanInput,
  endTakeover,
  describeTakeover
} from "../concierge/browserStreamController.mjs";
import { verifyAuditChain } from "../concierge/audit.mjs";

async function freshStore(slug) {
  const dir = await mkdtemp(join(tmpdir(), `brainsty-${slug}-`));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

// The product invariant: the autonomous agent never types credentials. The ONLY way to
// produce keystrokes is relayHumanInput, and it must reject anything that is not an
// explicitly granted, human-originated relay. These tests pin that gate.

test("takeover request does not mint a relay token (stays pending approval)", async () => {
  const store = await freshStore("takeover-pending");
  const req = await requestTakeover({ store, sessionId: "s1", userId: "u1", reason: "captcha" });
  assert.equal(req.ok, true);
  assert.equal(req.status, "interactive_takeover_pending_approval");
  assert.ok(req.takeoverId);
  assert.equal(describeTakeover(req.takeoverId).status, "pending_approval");
});

test("relayHumanInput rejects non-human origin (agent can never type)", async () => {
  const store = await freshStore("takeover-origin");
  const req = await requestTakeover({ store, sessionId: "s2", userId: "u2" });
  const grant = await grantTakeover({ store, takeoverId: req.takeoverId, sessionId: "s2", userId: "u2" });
  const result = await relayHumanInput({
    store,
    takeoverId: req.takeoverId,
    grantToken: grant.grantToken,
    origin: "agent", // anything other than "human" must be refused
    input: { kind: "text", text: "secret" },
    sessionId: "s2"
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "interactive_takeover_human_origin_required");
  // the rejection is auditable and the audit chain stays valid
  const chain = await verifyAuditChain(store, { sessionId: "s2" });
  assert.equal(chain.valid, true);
});

test("relayHumanInput rejects input before an explicit grant", async () => {
  const store = await freshStore("takeover-ungranted");
  const req = await requestTakeover({ store, sessionId: "s3", userId: "u3" });
  const result = await relayHumanInput({
    store,
    takeoverId: req.takeoverId,
    grantToken: "guessed-token",
    origin: "human",
    input: { kind: "text", text: "x" }
  });
  assert.equal(result.ok, false);
  // pending grant has no token yet -> not active / token invalid
  assert.ok(["interactive_takeover_not_active", "interactive_takeover_token_invalid"].includes(result.status));
});

test("granted human relay passes the safety gate (fails only on no live browser in unit test)", async () => {
  const store = await freshStore("takeover-granted");
  const req = await requestTakeover({ store, sessionId: "s4", userId: "u4" });
  const grant = await grantTakeover({ store, takeoverId: req.takeoverId, sessionId: "s4", userId: "u4" });
  assert.equal(grant.ok, true);
  assert.ok(grant.grantToken);
  const result = await relayHumanInput({
    store,
    takeoverId: req.takeoverId,
    grantToken: grant.grantToken,
    origin: "human",
    input: { kind: "text", text: "captcha-answer" }
  });
  // origin + token gates passed; without a live CDP browser it stops here (no input leaves)
  assert.equal(result.ok, false);
  assert.equal(result.status, "interactive_takeover_no_live_browser");
});

test("wrong grant token is rejected", async () => {
  const store = await freshStore("takeover-badtoken");
  const req = await requestTakeover({ store, sessionId: "s5", userId: "u5" });
  await grantTakeover({ store, takeoverId: req.takeoverId, sessionId: "s5", userId: "u5" });
  const result = await relayHumanInput({
    store,
    takeoverId: req.takeoverId,
    grantToken: "not-the-real-token",
    origin: "human",
    input: { kind: "text", text: "x" }
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "interactive_takeover_token_invalid");
});

test("ended takeover blocks further input and records aggregate counts only", async () => {
  const store = await freshStore("takeover-ended");
  const req = await requestTakeover({ store, sessionId: "s6", userId: "u6" });
  const grant = await grantTakeover({ store, takeoverId: req.takeoverId, sessionId: "s6", userId: "u6" });
  const ended = await endTakeover({ store, takeoverId: req.takeoverId });
  assert.equal(ended.ok, true);
  assert.deepEqual(ended.relayedEventCounts, { key: 0, text: 0, mouse: 0, scroll: 0 });
  const result = await relayHumanInput({
    store,
    takeoverId: req.takeoverId,
    grantToken: grant.grantToken,
    origin: "human",
    input: { kind: "text", text: "x" }
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "interactive_takeover_not_found");
});
