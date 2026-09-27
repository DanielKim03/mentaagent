import { env } from "../../env.js";
import { pool } from "../../db/client.js";

// Model provider settings. The owner enters them on the web Settings page
// (stored in the one-row llm_settings table); anything left blank there falls
// back to the environment (.env). The API and the worker each keep a copy in
// memory and re-read the row every few seconds, so a key saved in the browser
// reaches the worker without a restart.

export type LlmConfig = {
  baseUrl: string;
  apiKey: string | undefined;
  agentModel: string;
  heavyModel: string;
  toolMode: "native" | "hermes-xml";
  embeddingsBaseUrl: string;
  embeddingsApiKey: string | undefined;
  embeddingsModel: string;
  visionBaseUrl: string;
  visionApiKey: string | undefined;
  visionModel: string;
};

export type LlmSettingsRow = {
  llm_base_url: string | null;
  llm_api_key: string | null;
  agent_model: string | null;
  heavy_model: string | null;
  llm_tool_mode: "native" | "hermes-xml" | null;
  embeddings_base_url: string | null;
  embeddings_api_key: string | null;
  embeddings_model: string | null;
  vision_model: string | null;
};

const blank = (s: string | null | undefined) => {
  const t = s?.trim();
  return t ? t : undefined;
};

export function resolveLlmConfig(row: Partial<LlmSettingsRow> | null): LlmConfig {
  const baseUrl = blank(row?.llm_base_url) ?? env.LLM_BASE_URL;
  const apiKey = blank(row?.llm_api_key) ?? blank(env.LLM_API_KEY);
  const embeddingsBaseUrl = blank(row?.embeddings_base_url) ?? env.EMBEDDINGS_BASE_URL;
  // One key often covers chat and embeddings (DeepInfra does both). Reuse the
  // chat key only when both point at the same host, so a key is never sent to
  // a provider it was not issued by.
  const embeddingsApiKey =
    blank(row?.embeddings_api_key) ??
    blank(env.EMBEDDINGS_API_KEY) ??
    (sameHost(embeddingsBaseUrl, baseUrl) ? apiKey : undefined);
  return {
    baseUrl,
    apiKey,
    agentModel: blank(row?.agent_model) ?? env.AGENT_MODEL,
    heavyModel: blank(row?.heavy_model) ?? env.HEAVY_MODEL,
    toolMode: row?.llm_tool_mode ?? env.LLM_TOOL_MODE,
    embeddingsBaseUrl,
    embeddingsApiKey,
    embeddingsModel: blank(row?.embeddings_model) ?? env.EMBEDDINGS_MODEL,
    // Vision falls back to the embeddings provider (Qwen3-VL and bge-m3 live
    // on the same DeepInfra account).
    visionBaseUrl: env.VISION_BASE_URL ?? embeddingsBaseUrl,
    visionApiKey: blank(env.VISION_API_KEY) ?? embeddingsApiKey,
    visionModel: blank(row?.vision_model) ?? env.VISION_MODEL,
  };
}

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return false;
  }
}

let current: LlmConfig = resolveLlmConfig(null);

export function llmConfig(): LlmConfig {
  return current;
}

export async function readLlmSettingsRow(): Promise<LlmSettingsRow | null> {
  const { rows } = await pool.query<LlmSettingsRow>(
    `SELECT llm_base_url, llm_api_key, agent_model, heavy_model, llm_tool_mode,
            embeddings_base_url, embeddings_api_key, embeddings_model, vision_model
       FROM llm_settings WHERE id`
  );
  return rows[0] ?? null;
}

// Re-reads the settings row. A failed read (e.g. before migrations ran) keeps
// the last known config rather than dropping to the stub provider.
// Tests share the dev database and must never call a paid model, so they
// ignore a key saved in the browser and run on the environment alone.
export async function refreshLlmConfig(): Promise<void> {
  if (env.NODE_ENV === "test") return;
  try {
    current = resolveLlmConfig(await readLlmSettingsRow());
  } catch {
    // keep `current`
  }
}

export function startLlmConfigRefresh(intervalMs = 5_000): () => void {
  void refreshLlmConfig();
  const id = setInterval(() => void refreshLlmConfig(), intervalMs);
  id.unref();
  return () => clearInterval(id);
}
