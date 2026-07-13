#!/usr/bin/env node
// Phase 90 Part 2 preflight (plan §9/§11 Phase 90).
//
// Part 1 landed every piece the plan allows WITHOUT founder action S1. Part 2 is blocked
// on a real Aetna developer-portal registration and issued sandbox credentials; no code
// substitutes for them. This script
// answers one question honestly: "if the credentials landed, could Part 2 start right now?"
//
// It NEVER prints a secret value. It reports presence, not content.
// Exit code is always 0: a blocked preflight is the expected pre-S1 state, not a failure.
//
// Usage: node scripts/preflight-phase90-part2.mjs

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CAPABILITY_CATALOG_VERSION, CAPABILITY_CATALOG } from "../src/concierge/capabilityCatalogSeed.mjs";
import { createGraphCheckpointer } from "../src/concierge/graphCheckpointer.mjs";

const AETNA_SANDBOX_METADATA = "https://vteapif1.aetna.com/fhirdemo/v1/patientaccess/metadata";
const PART2_CONNECTORS = [
  "src/concierge/connectors/aetnaPatientAccess.mjs",
  "src/concierge/connectors/pdexFormulary.mjs",
  "src/concierge/connectors/eligibility270.mjs"
];
const PART2_PROCESSES = [
  "process:formulary_lookup",
  "process:eligibility_snapshot_refresh",
  "process:pa_packet_preparation"
];

// Mirrors databaseSecretProfile.readSecretFile (module-private): presence only, never value.
function secretPresent(envVar) {
  const path = process.env[envVar];
  if (!path) return { ok: false, reason: "env_var_unset", envVar };
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) return { ok: false, reason: "secret_file_missing", envVar, absolutePath };
  const filled = readFileSync(absolutePath, "utf8").trim().length > 0;
  return filled
    ? { ok: true, reason: "present", envVar, absolutePath }
    : { ok: false, reason: "secret_file_empty", envVar, absolutePath };
}

async function probeSandboxMetadata() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(AETNA_SANDBOX_METADATA, {
      headers: { accept: "application/fhir+json" },
      signal: controller.signal
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, status: null, error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

const rows = [];
const blockers = [];
// status: "pass" | "block" (an external precondition is missing) | "todo" (Part 2 work, expected)
const record = (name, ok, detail, status = null) =>
  rows.push({ name, detail, status: status ?? (ok ? "pass" : "block") });

// --- 1. Founder action S1: Aetna sandbox credentials ---
const aetnaSecrets = [
  ["BRAINSTY_AETNA_CLIENT_ID_FILE", "app client id"],
  ["BRAINSTY_AETNA_CLIENT_SECRET_FILE", "app client secret"],
  ["BRAINSTY_AETNA_TEST_MEMBER_FILE", "sandbox test-member credentials"]
];
let aetnaReady = true;
for (const [envVar, label] of aetnaSecrets) {
  const found = secretPresent(envVar);
  if (!found.ok) aetnaReady = false;
  record(`S1 · ${label}`, found.ok, found.ok ? `${envVar} → present` : `${envVar}: ${found.reason}`);
}
if (!process.env.BRAINSTY_AETNA_REDIRECT_URI) {
  aetnaReady = false;
  record("S1 · callback/redirect URI", false, "BRAINSTY_AETNA_REDIRECT_URI unset (must match the portal app)");
} else {
  record("S1 · callback/redirect URI", true, process.env.BRAINSTY_AETNA_REDIRECT_URI);
}
if (!aetnaReady) {
  blockers.push(
    "AETNA S1 — complete developerportal.aetna.com review and obtain issued sandbox credentials\n" +
      "    (app+callback URL, Provider Directory + sandbox Patient Access subscriptions,\n" +
      "    questionnaire IAL2=No, test member + client id/secret). Deliver via secret files, never in chat."
  );
}

// --- 2. Stedi (mock only at this stage) ---
const stedi = secretPresent("BRAINSTY_STEDI_TEST_API_KEY_FILE");
record("Stedi · free test/mock API key", stedi.ok, stedi.ok ? "present" : `BRAINSTY_STEDI_TEST_API_KEY_FILE: ${stedi.reason}`);
if (!stedi.ok) {
  blockers.push(
    "STEDI SIGNUP — self-serve at stedi.com for the FREE test/mock key.\n" +
      "    Do NOT sign the BAA and do NOT buy a production key: that is Phase 91, and it is\n" +
      "    sequenced AFTER information-receiver standing is confirmed (founder #7)."
  );
}

// --- 3. The one architectural question S1 must answer ---
const umScope = process.env.BRAINSTY_UM_PATIENT_ACCESS_IN_SCOPE;
record(
  "S1 · UM self-funded/TPA group in scope for Patient Access?",
  Boolean(umScope),
  umScope ? `recorded: ${umScope}` : "unanswered — set BRAINSTY_UM_PATIENT_ACCESS_IN_SCOPE=yes|no during registration"
);
if (!umScope) {
  blockers.push(
    "ANSWER DURING REGISTRATION — is UM's self-funded/TPA group IN SCOPE for Patient Access?\n" +
      "    Out of scope ⇒ that member's rail stays portal_only forever and the portal-login\n" +
      "    processes remain the offered route. The answer becomes a member_data_rails row."
  );
}

// --- 4. Substrate that Part 1 already landed (should all pass) ---
record("Catalog seed version", CAPABILITY_CATALOG_VERSION.includes(".v6"), CAPABILITY_CATALOG_VERSION);
const processKeys = new Set((CAPABILITY_CATALOG.processes ?? []).map((p) => p.process_key ?? p.processKey));
for (const key of PART2_PROCESSES) {
  record(`Process seeded · ${key}`, processKeys.has(key), processKeys.has(key) ? "offerable" : "MISSING from seed");
}
record(
  "Portal formulary process KEPT (§10 item 23)",
  processKeys.has("process:pharmacy_formulary_lookup"),
  "deleting the only working rail would strand commercial members"
);

// --- 5. Durable interrupts (Phase 91 — landed) ---
try {
  const { readiness } = createGraphCheckpointer({
    BRAINSTY_GRAPH_CHECKPOINTER: "postgres",
    BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY:
      process.env.BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY || Buffer.alloc(32, 7).toString("base64")
  });
  record("Durable checkpointer available", readiness.durable && readiness.survivesRestart, `mode=${readiness.mode}, phiAtRest=${readiness.phiAtRest}`);
} catch (error) {
  record("Durable checkpointer available", false, error.message);
}
if (!process.env.BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY) {
  record(
    "Checkpointer encryption key configured",
    false,
    "BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY unset — required before any member OAuth pause"
  );
  blockers.push(
    "SET BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY (32-byte base64/hex) before Part 2:\n" +
      "    a member consent pause must survive a restart, and graph state carries PHI."
  );
}

// --- 6. Live sandbox reachability (unauthenticated /metadata) ---
const probe = await probeSandboxMetadata();
record(
  "Aetna sandbox /metadata reachable",
  probe.ok,
  probe.ok ? `HTTP ${probe.status} unauthenticated` : `unreachable: ${probe.error ?? probe.status}`
);

// --- 7. Part 2 modules that do not exist yet (expected) ---
for (const file of PART2_CONNECTORS) {
  const exists = existsSync(resolve(file));
  // Absent is the HONEST expected state, not a blocker: these are Part 2's deliverables.
  // The registry rows that name them are runtime_selectable=0, so a dispatch fails loud.
  record(`Connector · ${file.split("/").pop()}`, exists, exists ? "present" : "absent — Part 2 deliverable", exists ? "pass" : "todo");
}

// --- report ---
const pad = Math.max(...rows.map((r) => r.name.length));
const label = { pass: "PASS ", block: "BLOCK", todo: "TODO " };
console.log("\nPhase 90 Part 2 — preflight\n" + "=".repeat(pad + 12));
for (const { name, status, detail } of rows) {
  console.log(`${label[status]}  ${name.padEnd(pad)}  ${detail}`);
}

if (blockers.length) {
  console.log(`\nBLOCKED on ${blockers.length} external action(s) — this is the expected pre-S1 state.\n`);
  blockers.forEach((b, i) => console.log(`  ${i + 1}. ${b}\n`));
  console.log("No code substitutes for these. See artifacts/phase90/phase90-part1-acceptance-proof.md.");
} else {
  console.log("\nREADY — every external precondition is satisfied. Part 2 can begin:");
  console.log("  1. connectors/aetnaPatientAccess.mjs — real sandbox OAuth authorization_code flow");
  console.log("  2. EOB fetch → persist claim_items / coverage_balances");
  console.log("  3. 5-min token expiry live arm → reauth_required, loud classified span");
  console.log("  4. rail probe flips portal_only → api_covered on a real member read");
  console.log("  5. connectors/pdexFormulary.mjs live reads");
  console.log("  6. connectors/eligibility270.mjs → Stedi mock, labeled contract_ready ONLY");
  console.log("  7. reseed + eval:planner rail-filtering arms");
}
console.log("");
