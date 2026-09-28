// Model providers offered on the Settings page. Every one of them speaks the
// OpenAI API, so picking one only fills in its URL and suggested models; the
// owner can change any field, and "Load models" lists what the provider
// actually offers.
//
// embeddings: a model returning 1024-dimension vectors (the search index
// size), or null when the provider has none; search then uses keywords only.
// vision: a model that can read images, or null (photo uploads are off).
// Ordered by how widely each provider is used (an estimate, not measured).
// DeepInfra and DeepSeek have been tested end to end with real keys; the rest
// follow each provider's OpenAI-compatibility documentation.

export type Provider = {
  id: string;
  label: string;
  baseUrl: string;
  keyUrl?: string;
  needsKey: boolean;
  chatModel: string;
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
    chatModel: "gpt-4.1-mini",
    heavyModel: "gpt-4.1",
    embeddingsModel: "text-embedding-3-small",
    visionModel: "gpt-4.1-mini",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com/v1/",
    keyUrl: "https://console.anthropic.com/settings/keys",
    needsKey: true,
    chatModel: "claude-haiku-4-5-20251001",
    heavyModel: "claude-sonnet-5",
    embeddingsModel: null,
    visionModel: "claude-haiku-4-5-20251001",
    note: "Anthropic has no embeddings, so search uses keywords only. Add an embeddings provider under Advanced to change that.",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    keyUrl: "https://aistudio.google.com/apikey",
    needsKey: true,
    chatModel: "gemini-2.5-flash",
    heavyModel: "gemini-2.5-pro",
    embeddingsModel: "gemini-embedding-001",
    visionModel: "gemini-2.5-flash",
  },
  {
    id: "openrouter",
    label: "OpenRouter (many models, one key)",
    baseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/settings/keys",
    needsKey: true,
    chatModel: "openai/gpt-4.1-mini",
    heavyModel: "openai/gpt-4.1",
    embeddingsModel: null,
    visionModel: "openai/gpt-4.1-mini",
    note: "Search uses keywords only unless you add an embeddings provider under Advanced.",
  },
  {
    id: "deepseek",
    label: "DeepSeek (tested)",
    baseUrl: "https://api.deepseek.com",
    keyUrl: "https://platform.deepseek.com/api_keys",
    needsKey: true,
    chatModel: "deepseek-v4-flash",
    heavyModel: "deepseek-v4-pro",
    embeddingsModel: null,
    visionModel: null,
    note: "No embeddings or image reading on DeepSeek: search uses keywords only, photo uploads are off.",
  },
  {
    id: "ollama",
    label: "Ollama (models on your own computer, free)",
    baseUrl: "http://host.docker.internal:11434/v1",
    needsKey: false,
    chatModel: "qwen3",
    heavyModel: "qwen3",
    embeddingsModel: "bge-m3",
    visionModel: null,
    note: "No key needed. Install Ollama, then run `ollama pull qwen3` and `ollama pull bge-m3`. Pick a model that supports tool calling.",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    keyUrl: "https://console.groq.com/keys",
    needsKey: true,
    chatModel: "llama-3.3-70b-versatile",
    heavyModel: "llama-3.3-70b-versatile",
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
    heavyModel: "mistral-large-latest",
    embeddingsModel: "mistral-embed",
    visionModel: "mistral-small-latest",
  },
  {
    id: "together",
    label: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    keyUrl: "https://api.together.ai/settings/api-keys",
    needsKey: true,
    chatModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    heavyModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    embeddingsModel: "BAAI/bge-large-en-v1.5",
    visionModel: null,
  },
  {
    id: "deepinfra",
    label: "DeepInfra (recommended, tested)",
    baseUrl: "https://api.deepinfra.com/v1/openai",
    keyUrl: "https://deepinfra.com/dash/api_keys",
    needsKey: true,
    chatModel: "deepseek-ai/DeepSeek-V4-Flash",
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
