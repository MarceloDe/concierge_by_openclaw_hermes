import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const GOAL_PATH = new URL("../../docs/goal_final_system.md", import.meta.url);
const REPORT_PATH = new URL("../../docs/FINAL_SYSTEM_VERIFICATION_REPORT.md", import.meta.url);

const ALLOWED_STATUSES = new Set([
  "PASSING",
  "IMPLEMENTED DURING THIS RUN",
  "BLOCKED BY EXTERNAL DEPENDENCY",
  "FAILING / NEEDS FIX"
]);

function explicitGoalIds(goalText) {
  const ids = new Set();
  for (const match of goalText.matchAll(/^([A-G][0-9]+)\.\s+/gm)) {
    ids.add(match[1]);
  }
  for (let index = 1; index <= 24; index += 1) {
    ids.add(`H${index}`);
  }
  return Array.from(ids).sort((left, right) => {
    const leftPrefix = left[0];
    const rightPrefix = right[0];
    if (leftPrefix !== rightPrefix) return leftPrefix.localeCompare(rightPrefix);
    return Number(left.slice(1)) - Number(right.slice(1));
  });
}

function reportRows(reportText) {
  const rows = new Map();
  for (const line of reportText.split("\n")) {
    const match = line.match(/^\|\s*([A-H][0-9]+)\s*\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|$/);
    if (!match) continue;
    const [, id, rawStatus, evidence] = match;
    if (id === "ID") continue;
    rows.set(id, { status: rawStatus.trim(), evidence: evidence.trim() });
  }
  return rows;
}

test("final system verification report covers every explicit goal item with allowed statuses", async () => {
  const [goalText, reportText] = await Promise.all([
    readFile(GOAL_PATH, "utf8"),
    readFile(REPORT_PATH, "utf8")
  ]);
  const expectedIds = explicitGoalIds(goalText);
  const rows = reportRows(reportText);

  assert.ok(expectedIds.length > 100, "goal file should expose the broad final-system matrix");
  for (const id of expectedIds) {
    assert.ok(rows.has(id), `Missing final verification row for ${id}`);
    assert.ok(ALLOWED_STATUSES.has(rows.get(id).status), `Unexpected status for ${id}: ${rows.get(id).status}`);
    assert.ok(rows.get(id).evidence.length > 12, `Verification row for ${id} needs concrete evidence or next action`);
  }

  const extraIds = Array.from(rows.keys()).filter((id) => !expectedIds.includes(id));
  assert.deepEqual(extraIds, [], `Report contains IDs not present in the goal file: ${extraIds.join(", ")}`);
});

test("final system verification report keeps failures, blockers, and next-phase work visible", async () => {
  const reportText = await readFile(REPORT_PATH, "utf8");
  const rows = Array.from(reportRows(reportText).values());
  const statusCounts = rows.reduce((counts, row) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }, {});

  assert.ok(statusCounts.PASSING > 75, "Most of the local MVP contract should be passing by Phase 10Q");
  assert.ok(statusCounts["FAILING / NEEDS FIX"] > 0, "Known remaining gaps must not be hidden");
  assert.ok(statusCounts["BLOCKED BY EXTERNAL DEPENDENCY"] > 0, "Live worker/provider blockers must stay explicit");
  assert.match(reportText, /Urgent\/emergency safe escalation/);
  assert.match(reportText, /Chat\/Split\/Guided\/Bento/);
  assert.match(reportText, /research knowledge-base PDF upload/i);
});
