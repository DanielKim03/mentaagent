import { describe, expect, it } from "vitest";
import { resolveLlmConfig } from "../src/services/llm/settings.js";

// Which key goes to which host. A key must only ever be sent to the provider
// it was saved for. Pure function, no DB, no network.

const DEEPINFRA = "https://api.deepinfra.com/v1/openai";

describe("resolveLlmConfig", () => {
  it("DeepInfra: one key covers chat, embeddings and vision", () => {
    const c = resolveLlmConfig({ llm_base_url: DEEPINFRA, llm_api_key: "k-di" });
    expect(c.apiKey).toBe("k-di");
    expect(c.embeddingsApiKey).toBe("k-di");
    expect(c.embeddingsModel).toBe("BAAI/bge-m3");
    expect(c.visionApiKey).toBe("k-di");
  });

  it("OpenAI chat never sends its key to the default (DeepInfra) embeddings host", () => {
    const c = resolveLlmConfig({
      llm_base_url: "https://api.openai.com/v1",
      llm_api_key: "k-openai",
      agent_model: "gpt-4.1-mini",
    });
    expect(c.apiKey).toBe("k-openai");
    expect(c.embeddingsApiKey).toBeUndefined();
    expect(c.visionApiKey).toBeUndefined();
  });

  it("OpenAI with its own embeddings and vision reuses the key on the same host", () => {
    const c = resolveLlmConfig({
      llm_base_url: "https://api.openai.com/v1",
      llm_api_key: "k-openai",
      embeddings_base_url: "https://api.openai.com/v1",
      embeddings_model: "text-embedding-3-small",
      vision_base_url: "https://api.openai.com/v1",
      vision_model: "gpt-4.1-mini",
    });
    expect(c.embeddingsApiKey).toBe("k-openai");
    expect(c.visionApiKey).toBe("k-openai");
  });

  it("blank embeddings/vision model on a non-DeepInfra host means off", () => {
    const c = resolveLlmConfig({
      llm_base_url: "https://api.mistral.ai/v1",
      llm_api_key: "k-m",
      embeddings_base_url: "https://api.mistral.ai/v1",
      embeddings_model: "",
      vision_base_url: "https://api.mistral.ai/v1",
      vision_model: "",
    });
    expect(c.embeddingsApiKey).toBeUndefined();
    expect(c.visionApiKey).toBeUndefined();
  });

  it("a local server needs no key", () => {
    const c = resolveLlmConfig({
      llm_base_url: "http://host.docker.internal:11434/v1",
      agent_model: "qwen3",
      embeddings_base_url: "http://host.docker.internal:11434/v1",
      embeddings_model: "bge-m3",
    });
    expect(c.apiKey).toBe("local");
    expect(c.embeddingsApiKey).toBe("local");
  });

  it("a public provider with no key stays on the stub model", () => {
    const c = resolveLlmConfig({ llm_base_url: "https://api.groq.com/openai/v1" });
    expect(c.apiKey).toBeUndefined();
  });

  it("report model falls back to the chat model, not another provider's default", () => {
    const c = resolveLlmConfig({
      llm_base_url: "https://api.groq.com/openai/v1",
      llm_api_key: "k-g",
      agent_model: "llama-3.3-70b-versatile",
    });
    expect(c.heavyModel).toBe("llama-3.3-70b-versatile");
  });
});
