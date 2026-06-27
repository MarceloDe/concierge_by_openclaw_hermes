export const FAILURE_CLASSES = Object.freeze({
  ROUTING_ERROR: "ROUTING_ERROR",
  PLANNER_EMPTY: "PLANNER_EMPTY",
  PLAN_INVALID: "PLAN_INVALID",
  PROFILE_NOT_FOUND: "PROFILE_NOT_FOUND",
  MEMORY_READ_ERROR: "MEMORY_READ_ERROR",
  MEMORY_WRITE_ERROR: "MEMORY_WRITE_ERROR",
  RETRIEVAL_EMPTY: "RETRIEVAL_EMPTY",
  RETRIEVAL_IRRELEVANT: "RETRIEVAL_IRRELEVANT",
  TOOL_SCHEMA_ERROR: "TOOL_SCHEMA_ERROR",
  TOOL_TIMEOUT: "TOOL_TIMEOUT",
  TOOL_AUTH_ERROR: "TOOL_AUTH_ERROR",
  TOOL_BAD_RESPONSE: "TOOL_BAD_RESPONSE",
  WORKER_TIMEOUT: "WORKER_TIMEOUT",
  WORKER_REJECTED: "WORKER_REJECTED",
  OPENCLAW_APPROVAL_REQUIRED: "OPENCLAW_APPROVAL_REQUIRED",
  OPENCLAW_APPROVAL_DENIED: "OPENCLAW_APPROVAL_DENIED",
  OPENCLAW_GATEWAY_ERROR: "OPENCLAW_GATEWAY_ERROR",
  GUARDRAIL_BLOCKED: "GUARDRAIL_BLOCKED",
  LLM_TIMEOUT: "LLM_TIMEOUT",
  LLM_SCHEMA_ERROR: "LLM_SCHEMA_ERROR",
  FINAL_RESPONSE_INVALID: "FINAL_RESPONSE_INVALID",
  UNKNOWN_ERROR: "UNKNOWN_ERROR"
});

export function classifyFailureClass(error, fallback = FAILURE_CLASSES.UNKNOWN_ERROR) {
  const text = `${error?.code ?? ""} ${error?.name ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (!text.trim()) return fallback;
  if (/approval.*required|pending.*approval/.test(text)) return FAILURE_CLASSES.OPENCLAW_APPROVAL_REQUIRED;
  if (/approval.*denied|rejected/.test(text)) return FAILURE_CLASSES.OPENCLAW_APPROVAL_DENIED;
  if (/openclaw|gateway|cli_unavailable/.test(text)) return FAILURE_CLASSES.OPENCLAW_GATEWAY_ERROR;
  if (/worker.*timeout|continuation.*timeout/.test(text)) return FAILURE_CLASSES.WORKER_TIMEOUT;
  if (/worker.*reject|worker.*blocked/.test(text)) return FAILURE_CLASSES.WORKER_REJECTED;
  if (/tool.*schema|schema.*tool|invalid.*schema/.test(text)) return FAILURE_CLASSES.TOOL_SCHEMA_ERROR;
  if (/tool.*timeout|timeout.*tool/.test(text)) return FAILURE_CLASSES.TOOL_TIMEOUT;
  if (/auth|unauthorized|forbidden|permission/.test(text)) return FAILURE_CLASSES.TOOL_AUTH_ERROR;
  if (/bad.*response|invalid.*response/.test(text)) return FAILURE_CLASSES.TOOL_BAD_RESPONSE;
  if (/routing|route/.test(text)) return FAILURE_CLASSES.ROUTING_ERROR;
  if (/planner.*empty|empty.*plan/.test(text)) return FAILURE_CLASSES.PLANNER_EMPTY;
  if (/plan.*invalid|invalid.*plan/.test(text)) return FAILURE_CLASSES.PLAN_INVALID;
  if (/profile.*not.*found/.test(text)) return FAILURE_CLASSES.PROFILE_NOT_FOUND;
  if (/memory.*read|recall/.test(text)) return FAILURE_CLASSES.MEMORY_READ_ERROR;
  if (/memory.*write|retain/.test(text)) return FAILURE_CLASSES.MEMORY_WRITE_ERROR;
  if (/retrieval.*empty|no.*retriev/.test(text)) return FAILURE_CLASSES.RETRIEVAL_EMPTY;
  if (/irrelevant/.test(text)) return FAILURE_CLASSES.RETRIEVAL_IRRELEVANT;
  if (/guardrail|policy.*blocked|blocked.*policy/.test(text)) return FAILURE_CLASSES.GUARDRAIL_BLOCKED;
  if (/llm.*timeout|timeout.*llm|openai.*timeout/.test(text)) return FAILURE_CLASSES.LLM_TIMEOUT;
  if (/llm.*schema|json|parseable|structured.*invalid/.test(text)) return FAILURE_CLASSES.LLM_SCHEMA_ERROR;
  if (/final.*response.*invalid|answer.*invalid/.test(text)) return FAILURE_CLASSES.FINAL_RESPONSE_INVALID;
  return fallback;
}
