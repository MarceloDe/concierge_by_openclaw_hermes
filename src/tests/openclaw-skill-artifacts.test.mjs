import test from "node:test";
import assert from "node:assert/strict";
import { listOpenClawSkillArtifacts, loadOpenClawSkillArtifact } from "../concierge/openclawSkillArtifacts.mjs";

test("insurance portal browser OpenClaw skill artifact is present and gated", async () => {
  const artifact = await loadOpenClawSkillArtifact("insurance_portal_browser");

  assert.equal(artifact.validation.valid, true, artifact.validation.issues.join("; "));
  assert.equal(artifact.manifest.skill_key, "insurance_portal_browser");
  assert.equal(artifact.manifest.status, "repo_artifact_ready_adapter_execution_gated");
  assert.equal(artifact.manifest.approval_gates.credential_entry, "user_only");
  assert.equal(artifact.manifest.approval_gates.medical_advice, "not_allowed");
  assert.ok(artifact.manifest.fallback_strategy.order.includes("manual_user_export"));
  assert.deepEqual(artifact.manifest.required_companion_skills, ["browser-automation", "ocr-local"]);
  assert.equal(artifact.manifest.browser_control_policy.required_skill, "browser-automation");
  assert.equal(artifact.manifest.visual_evidence_policy.ocr_engine, "ocr-local");
  assert.ok(artifact.manifest.allowed_tools.includes("portal_search"));
  assert.ok(artifact.manifest.allowed_tools.includes("read_only_document_download"));
  assert.ok(artifact.manifest.allowed_tools.includes("pdf_extraction_analysis"));
  assert.equal(artifact.manifest.adaptive_worker_policy.worker_may_decompose_assigned_task, true);
  assert.equal(artifact.manifest.adaptive_worker_policy.langgraph_remains_workflow_master, true);
  assert.equal(artifact.manifest.progress_protocol.report_every_seconds, 30);
  assert.equal(artifact.manifest.progress_protocol.silent_failure_allowed, false);
  assert.ok(artifact.manifest.portal_section_strategy.likely_sections.includes("Summary of Benefits and Coverage"));
  assert.ok(artifact.manifest.portal_section_strategy.likely_sections.includes("Pharmacy"));
  assert.ok(artifact.manifest.portal_section_strategy.likely_sections.includes("Claims"));
  assert.ok(artifact.manifest.structured_answer_schema.data_collected_fields.includes("deductible"));
  assert.ok(artifact.manifest.structured_answer_schema.data_collected_fields.includes("out_of_pocket_max"));
  assert.ok(artifact.manifest.structured_answer_schema.data_collected_fields.includes("documents_found"));
  assert.ok(artifact.manifest.outputs.required.includes("status_updates"));
  assert.ok(artifact.manifest.outputs.required.includes("data_collected"));
  assert.ok(artifact.manifest.outputs.required.includes("evidence"));
  assert.ok(artifact.manifest.terminal_outcomes.includes("not_possible_missing_user_data"));
  assert.ok(artifact.skillMd.includes("Never enter credentials"));
  assert.ok(artifact.skillMd.includes("untrusted context"));
  assert.ok(artifact.skillMd.includes("does not replace `browser-automation`"));
  assert.ok(artifact.skillMd.includes("Report to LangGraph every 30 seconds"));
  assert.ok(artifact.skillMd.includes("Insurance Site Tooling Strategy"));
  assert.ok(artifact.skillMd.includes("Structured Return Payload"));
  assert.ok(artifact.skillMd.includes("Quality Bar"));
  assert.ok(artifact.skillMd.includes("Summary of Benefits and Coverage"));
  assert.ok(artifact.skillMd.includes("approval-gated official OpenClaw read-only worker path"));
});

test("OpenClaw skill artifact list exposes validation state", async () => {
  const result = await listOpenClawSkillArtifacts();

  assert.ok(result.artifacts.some((artifact) => artifact.skillKey === "insurance_portal_browser"));
  assert.ok(result.artifacts.every((artifact) => artifact.validation.valid));
});
