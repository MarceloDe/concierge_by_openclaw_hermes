import { get_langfuse_client, is_langfuse_enabled } from "./langfuseClient.mjs";
import { safe_metadata } from "./redaction.mjs";

export const PROMPT_REGISTRY_VERSION = "2026-06-27.langfuse-prompt-registry.v1";

function renderTemplate(template, variables = {}) {
  return String(template ?? "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => String(variables[key] ?? ""));
}

export async function get_prompt(name, fallbackTemplate, variables = {}, metadata = {}) {
  const fallback = renderTemplate(fallbackTemplate, variables);
  if (!is_langfuse_enabled()) {
    return {
      name,
      version: "local-fallback",
      label: metadata.prompt_label ?? "local",
      source: "local_fallback",
      prompt: fallback,
      metadata: safe_metadata({ ...metadata, prompt_name: name, prompt_version: "local-fallback" })
    };
  }
  try {
    const client = await get_langfuse_client();
    const prompt = await client.getPrompt?.(name, undefined, { label: metadata.prompt_label ?? "production" });
    const compiled = typeof prompt?.compile === "function" ? prompt.compile(variables) : prompt?.prompt ?? fallback;
    return {
      name,
      version: String(prompt?.version ?? "langfuse"),
      label: metadata.prompt_label ?? "production",
      source: "langfuse",
      prompt: compiled,
      metadata: safe_metadata({ ...metadata, prompt_name: name, prompt_version: String(prompt?.version ?? "langfuse") })
    };
  } catch {
    return {
      name,
      version: "local-fallback",
      label: metadata.prompt_label ?? "local",
      source: "local_fallback_error",
      prompt: fallback,
      metadata: safe_metadata({ ...metadata, prompt_name: name, prompt_version: "local-fallback" })
    };
  }
}

export const getPrompt = get_prompt;
