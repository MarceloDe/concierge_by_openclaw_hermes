import { WORKFLOWS } from "./types.mjs";

// Policy -> safety-intent mapping only. Workflow classification is owned by the
// planner decision object (state.llm_orchestration_decision); ordinary free text
// yields a null intent here.
export function classifyIntent(message, policyResult) {
  if (policyResult.urgentEscalationRequired) {
    return WORKFLOWS.URGENT_HUMAN_HANDOFF;
  }

  if (!policyResult.allowed) {
    if (policyResult.checks.some((check) => !check.passed && check.name === "prompt_injection_boundary")) {
      return WORKFLOWS.REFUSE_PROMPT_INJECTION;
    }
    if (policyResult.checks.some((check) => !check.passed && check.name === "medical_advice_boundary")) {
      return WORKFLOWS.REFUSE_MEDICAL_ADVICE;
    }
    if (policyResult.checks.some((check) => !check.passed && check.name === "credential_boundary")) {
      return WORKFLOWS.REFUSE_CREDENTIAL_ENTRY;
    }
    if (policyResult.checks.some((check) => !check.passed && check.name === "healthcare_domain_boundary")) {
      return WORKFLOWS.REFUSE_OUT_OF_SCOPE;
    }
  }

  if (policyResult.approvalRequired) return WORKFLOWS.ESCALATE_APPROVAL;

  return null;
}
