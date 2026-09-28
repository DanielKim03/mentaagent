// Model providers offered on the Settings page. Every one of them speaks the
// OpenAI API, so picking one only fills in its URL and suggested models; the
// owner can change any field, and "Load models" lists what the provider
// actually offers.
//
// Ordered by how widely each provider is used (an estimate, not measured).
// Models, URLs and prices checked against each provider's docs on
// 2026-09-28; the per-provider request differences (thinking switches and
// the like) are handled in the API's adaptChatParams.
//
// chatModel: the standard choice. betterChatModel: better answers for more
// money, offered as a one-click switch; betterNote says roughly how much.
// embeddings: a model returning 1024-dimension vectors (the search index
// size), or null when the provider has none; search then uses keywords only.
// vision: a model that can read images, or null (photo uploads are off).

export type Provider = {
  id: string;
  label: string;
  baseUrl: string;
  keyUrl?: string;
  needsKey: boolean;
  chatModel: string;
  betterChatModel?: string;
  betterNote?: string;
  heavyModel: string;
  embeddingsModel: string | null;
  visionModel: string | null;
  note?: string;
};

export const PROVIDERS: Provider[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    keyUrl: "https://platform.openai.com/api-keys",
    needsKey: true,
    chatModel: "gpt-6-luna",
    betterChatModel: "gpt-6-sol",
    betterNote: "about 20× the cost",
    heavyModel: "gpt-6-sol",
    embeddingsModel: "text-embedding-3-small",
    visionModel: "gpt-6-luna",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com/v1/",
    keyUrl: "https://console.anthropic.com/settings/keys",
    needsKey: true,
    chatModel: "claude-sonnet-5",
    betterChatModel: "claude-opus-5-5",
    betterNote: "about 2× the cost",
    heavyModel: "claude-opus-5-5",
    embeddingsModel: null,
    visionModel: "claude-sonnet-5",
    note: "Anthropic has no embeddings, so search uses keywords only. Add an embeddings provider under Advanced to change that.",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    keyUrl: "https://aistudio.google.com/apikey",
    needsKey: true,
    chatModel: "gemini-3.5-flash-lite",
    betterChatModel: "gemini-3.8-flash",
    betterNote: "about 3× the cost",
    heavyModel: "gemini-3.8-flash",
    embeddingsModel: "gemini-embedding-001",
    visionModel: "gemini-3.8-flash",
  },
  {
    id: "openrouter",
    label: "OpenRouter (many models, one key)",
    baseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/settings/keys",
    needsKey: true,
    chatModel: "openai/gpt-4.1-mini",
    betterChatModel: "openai/gpt-4.1",
    betterNote: "about 5× the cost",
    heavyModel: "openai/gpt-4.1",
    embeddingsModel: "baai/bge-m3",
    visionModel: "openai/gpt-4.1-mini",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    keyUrl: "https://platform.deepseek.com/api_keys",
    needsKey: true,
    chatModel: "deepseek-flash",
    betterChatModel: "deepseek-v4-pro",
    betterNote: "about 3× the cost",
    heavyModel: "deepseek-v4-pro",
    embeddingsModel: null,
    visionModel: "deepseek-flash",
    note: "DeepSeek has no embeddings, so search uses keywords only. Add an embeddings provider under Advanced to change that.",
  },
  {
    id: "ollama",
    label: "Ollama (models on your own computer, free)",
    baseUrl: "http://host.docker.internal:11434/v1",
    needsKey: false,
    chatModel: "qwen3.5:4b",
    betterChatModel: "qwen3.5:9b",
    betterNote: "free, but needs more memory and is slower",
    heavyModel: "qwen3.5:9b",
    embeddingsModel: "bge-m3",
    visionModel: "qwen3.5:4b",
    note: "No key needed. Install Ollama, then run `ollama pull qwen3.5:4b` and `ollama pull bge-m3` (and `ollama pull qwen3.5:9b` for reports).",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    keyUrl: "https://console.groq.com/keys",
    needsKey: true,
    chatModel: "openai/gpt-oss-20b",
    betterChatModel: "openai/gpt-oss-120b",
    betterNote: "about 2× the cost",
    heavyModel: "openai/gpt-oss-120b",
    embeddingsModel: null,
    visionModel: null,
    note: "No embeddings or image reading on Groq: search uses keywords only, photo uploads are off.",
  },
  {
    id: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    keyUrl: "https://console.mistral.ai/api-keys",
    needsKey: true,
    chatModel: "mistral-small-latest",
    betterChatModel: "mistral-large-latest",
    betterNote: "about 3× the cost",
    heavyModel: "mistral-large-latest",
    embeddingsModel: "mistral-embed",
    visionModel: "mistral-small-latest",
  },
  {
    id: "together",
    label: "Together AI",
    baseUrl: "https://api.together.ai/v1",
    keyUrl: "https://api.together.ai/settings/api-keys",
    needsKey: true,
    chatModel: "deepseek-ai/DeepSeek-V4-Flash-0731",
    betterChatModel: "deepseek-ai/DeepSeek-V4.1-Flash",
    betterNote: "about 3× the cost",
    heavyModel: "deepseek-ai/DeepSeek-V4-Pro-0813",
    embeddingsModel: null,
    visionModel: "Qwen/Qwen3.5-9B",
    note: "Together no longer offers embeddings, so search uses keywords only. Add an embeddings provider under Advanced to change that.",
  },
  {
    id: "deepinfra",
    label: "DeepInfra (recommended)",
    baseUrl: "https://api.deepinfra.com/v1/openai",
    keyUrl: "https://deepinfra.com/dash/api_keys",
    needsKey: true,
    chatModel: "deepseek-ai/DeepSeek-V4-Flash-0731",
    betterChatModel: "deepseek-ai/DeepSeek-V4.1-Flash",
    betterNote: "about 3× the cost",
    heavyModel: "deepseek-ai/DeepSeek-V4-Pro",
    embeddingsModel: "BAAI/bge-m3",
    visionModel: "Qwen/Qwen3-VL-30B-A3B-Instruct",
    note: "One key covers chat, search and reading photos.",
  },
  {
    id: "custom",
    label: "Other (any OpenAI-compatible server)",
    baseUrl: "",
    needsKey: true,
    chatModel: "",
    heavyModel: "",
    embeddingsModel: null,
    visionModel: null,
    note: "Enter the server's URL (usually ending in /v1), then Load models.",
  },
];

export function providerById(id: string | null | undefined): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

// Best guess for settings saved before the provider field existed.
export function providerForUrl(url: string): Provider | undefined {
  if (!url) return undefined;
  return PROVIDERS.find((p) => p.baseUrl && url.startsWith(p.baseUrl.replace(/\/$/, "")));
}
