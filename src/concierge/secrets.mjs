import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

let loaded = false;

function shouldReplaceEnvValue(key, currentValue) {
  if (currentValue === undefined) return true;
  if (key !== "OPENAI_API_KEY") return false;
  return ["", "local", "test", "placeholder", "dummy"].includes(String(currentValue).trim().toLowerCase());
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const index = trimmed.indexOf("=");
  if (index === -1) return null;
  const key = trimmed.slice(0, index).trim();
  let value = trimmed.slice(index + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return key ? { key, value } : null;
}

export async function loadLocalEnvOnce(envPath = resolve(".env.local")) {
  if (loaded) return;
  loaded = true;
  try {
    const content = await readFile(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (parsed && shouldReplaceEnvValue(parsed.key, process.env[parsed.key])) {
        process.env[parsed.key] = parsed.value;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export function getOpenAiConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  return {
    configured: Boolean(apiKey),
    model: process.env.OPENAI_MODEL || "gpt-5-mini",
    baseURL: process.env.BRAINSTY_OPENAI_BASE_URL || "https://api.openai.com/v1",
    apiKeyPreview: apiKey ? `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}` : null
  };
}
