// Phase 83: machine-readable phase ledger (founder decision #12, spine YAML
// phase_ledger_policy). Agents must never infer phase order from prose — this check
// schema-validates docs/db/phase-ledger.json and fails the blocking test:local gate
// on drift (missing phase, dangling dependency, missing acceptance pointer).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ledgerPath = join(repoRoot, "docs", "db", "phase-ledger.json");

const REQUIRED_FIELDS = ["phase", "title", "status", "dependencies", "docs_touched", "acceptance_criteria_file", "owner", "blockers"];
const ALLOWED_STATUSES = new Set(["planned", "in_progress", "landed", "blocked_external"]);
const PLAN_PHASE_RANGE = { from: 83, to: 96 };

function loadLedger() {
  return JSON.parse(readFileSync(ledgerPath, "utf8"));
}

test("phase ledger exists and parses", () => {
  assert.ok(existsSync(ledgerPath), "docs/db/phase-ledger.json must exist");
  const ledger = loadLedger();
  assert.ok(Array.isArray(ledger.phases) && ledger.phases.length > 0, "ledger.phases must be a non-empty array");
  assert.ok(String(ledger.version ?? "").includes("phase-ledger"), "ledger carries a version string");
});

test("every entry carries the founder-required fields with valid values", () => {
  const ledger = loadLedger();
  for (const entry of ledger.phases) {
    for (const field of REQUIRED_FIELDS) {
      assert.ok(field in entry, `phase ${entry.phase ?? "?"} missing required field '${field}'`);
    }
    assert.equal(typeof entry.phase, "number", `phase number must be numeric (${entry.title})`);
    assert.ok(ALLOWED_STATUSES.has(entry.status), `phase ${entry.phase} has unknown status '${entry.status}'`);
    assert.ok(Array.isArray(entry.dependencies), `phase ${entry.phase} dependencies must be an array`);
    assert.ok(Array.isArray(entry.blockers), `phase ${entry.phase} blockers must be an array`);
    assert.ok(Array.isArray(entry.docs_touched) && entry.docs_touched.length > 0, `phase ${entry.phase} must list docs_touched`);
    assert.ok(String(entry.acceptance_criteria_file ?? "").length > 0, `phase ${entry.phase} must point at its acceptance criteria`);
  }
});

test("every plan phase 83-96 has a ledger entry and dependencies resolve", () => {
  const ledger = loadLedger();
  const byPhase = new Map(ledger.phases.map((entry) => [entry.phase, entry]));
  for (let phase = PLAN_PHASE_RANGE.from; phase <= PLAN_PHASE_RANGE.to; phase += 1) {
    assert.ok(byPhase.has(phase), `plan phase ${phase} has no ledger entry — ledger drift fails the gate`);
  }
  for (const entry of ledger.phases) {
    for (const dep of entry.dependencies) {
      assert.ok(byPhase.has(dep), `phase ${entry.phase} depends on ${dep}, which has no ledger entry`);
      assert.ok(dep < entry.phase, `phase ${entry.phase} dependency ${dep} must be an earlier phase`);
    }
  }
});

test("CareRoute extension starts after Phase 90 without waiting for blocked Phases 91-92", () => {
  const ledger = loadLedger();
  const phase93 = ledger.phases.find((entry) => entry.phase === 93);
  assert.deepEqual(phase93.dependencies, [90]);
  assert.equal(phase93.status, "planned");
  assert.ok(!phase93.dependencies.includes(91));
  assert.ok(!phase93.dependencies.includes(92));

  for (const [phase, dependency] of [[94, 93], [95, 94], [96, 95]]) {
    const entry = ledger.phases.find((item) => item.phase === phase);
    assert.deepEqual(entry.dependencies, [dependency], `phase ${phase} must follow phase ${dependency}`);
    assert.equal(entry.status, "planned", `phase ${phase} must not be marked started before its dependency lands`);
  }
});

test("acceptance pointers reference files that exist; signature-gated phases stay blocked_external", () => {
  const ledger = loadLedger();
  for (const entry of ledger.phases) {
    const file = String(entry.acceptance_criteria_file).split("#")[0];
    assert.ok(existsSync(join(repoRoot, file)), `phase ${entry.phase} acceptance file missing: ${file}`);
    for (const doc of entry.docs_touched) {
      const docFile = String(doc).split("#")[0];
      assert.ok(existsSync(join(repoRoot, docFile)), `phase ${entry.phase} docs_touched missing: ${docFile}`);
    }
  }
  // Signature-gated connector phases (plan §9/§11) may not be marked plain "planned":
  // they carry the missing agreement as a blocker until the founder clears each gate.
  for (const phase of [91, 92]) {
    const entry = ledger.phases.find((item) => item.phase === phase);
    assert.equal(entry.status, "blocked_external", `phase ${phase} is signature-gated and must be blocked_external until cleared`);
    assert.ok(entry.blockers.some((blocker) => /SIGNATURE/i.test(blocker)), `phase ${phase} must name its signature blockers`);
  }
});
