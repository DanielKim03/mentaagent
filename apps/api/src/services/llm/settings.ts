import { env } from "../../env.js";
import { pool } from "../../db/client.js";

// Model provider settings. The owner picks a provider and pastes a key on the
// web Settings page (stored in the one-row llm_settings table); anything left
// blank there falls back to the environment (.env). The API and the worker
// each keep a copy in memory and re-read the row every few seconds, so a key
// saved in the browser reaches the worker without a restart.
//
// Three endpoints, each any OpenAI-compatible host: chat (the agent),
// embeddings (semantic search) and vision (reading uploaded photos). One key
// is reused across them only when they point at the same host, so a key is
// never sent to a provider it was not issued by.

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
  provider: string | null;
  llm_base_url: string | null;
  llm_api_key: string | null;
  agent_model: string | null;
  heavy_model: string | null;
  llm_tool_mode: "native" | "hermes-xml" | null;
  embeddings_base_url: string | null;
  embeddings_api_key: string | null;
  embeddings_model: string | null;
  vision_base_url: string | null;
  vision_model: string | null;
};

const blank = (s: string | null | undefined) => {
  const t = s?.trim();
  return t ? t : undefined;
};

function host(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

// A model server on this machine or the local network (Ollama, LM Studio,
// vLLM) usually needs no key. Such URLs get a placeholder key so the app
// calls them instead of falling back to the stub model.
export function isLocalUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return (
      h === "localhost" ||
      h === "host.docker.internal" ||
      h.endsWith(".local") ||
      /^127\./.test(h) ||
      /^10\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h)
    );
  } catch {
    return false;
  }
}

export function resolveLlmConfig(row: Partial<LlmSettingsRow> | null): LlmConfig {
  const baseUrl = blank(row?.llm_base_url) ?? env.LLM_BASE_URL;
  const apiKey =
    blank(row?.llm_api_key) ??
    blank(env.LLM_API_KEY) ??
    (isLocalUrl(baseUrl) ? "local" : undefined);

  const embeddingsBaseUrl = blank(row?.embeddings_base_url) ?? env.EMBEDDINGS_BASE_URL;
  const embeddingsApiKey =
    blank(row?.embeddings_api_key) ??
    blank(env.EMBEDDINGS_API_KEY) ??
    (host(embeddingsBaseUrl) === host(baseUrl) ? apiKey : undefined) ??
    (isLocalUrl(embeddingsBaseUrl) ? "local" : undefined);

  const visionBaseUrl =
    blank(row?.vision_base_url) ?? blank(env.VISION_BASE_URL) ?? embeddingsBaseUrl;
  const visionApiKey =
    blank(env.VISION_API_KEY) ??
    (host(visionBaseUrl) === host(baseUrl)
      ? apiKey
      : host(visionBaseUrl) === host(embeddingsBaseUrl)
        ? embeddingsApiKey
        : isLocalUrl(visionBaseUrl)
          ? "local"
          : undefined);

  // The default embeddings/vision model names (bge-m3, Qwen3-VL) are
  // DeepInfra's. On any other host a blank model means the feature is off,
  // rather than asking that provider for a model it doesn't have.
  const defaultHost = host(env.EMBEDDINGS_BASE_URL);
  const embeddingsModel =
    blank(row?.embeddings_model) ??
    (host(embeddingsBaseUrl) === defaultHost ? env.EMBEDDINGS_MODEL : undefined);
  const visionModel =
    blank(row?.vision_model) ??
    (host(visionBaseUrl) === defaultHost ? env.VISION_MODEL : undefined);

  return {
    baseUrl,
    apiKey,
    agentModel: blank(row?.agent_model) ?? env.AGENT_MODEL,
    heavyModel: blank(row?.heavy_model) ?? blank(row?.agent_model) ?? env.HEAVY_MODEL,
    toolMode: row?.llm_tool_mode ?? env.LLM_TOOL_MODE,
    embeddingsBaseUrl,
    embeddingsApiKey: embeddingsModel ? embeddingsApiKey : undefined,
    embeddingsModel: embeddingsModel ?? "",
    visionBaseUrl,
    visionApiKey: visionModel ? visionApiKey : undefined,
    visionModel: visionModel ?? "",
  };
}

let current: LlmConfig = resolveLlmConfig(null);

export function llmConfig(): LlmConfig {
  return current;
}

export async function readLlmSettingsRow(): Promise<LlmSettingsRow | null> {
  const { rows } = await pool.query<LlmSettingsRow>(
    `SELECT provider, llm_base_url, llm_api_key, agent_model, heavy_model, llm_tool_mode,
            embeddings_base_url, embeddings_api_key, embeddings_model,
            vision_base_url, vision_model
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
