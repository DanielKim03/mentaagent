import { describe, expect, it } from "vitest";
import { adaptChatParams } from "../src/services/llm/client.js";

// Per-provider request differences. Pure function, no network.

const base = {
  model: "",
  max_tokens: 100,
  messages: [{ role: "user" as const, content: "hi" }],
  stream_options: { include_usage: true },
};
const adapt = (url: string, model: string) =>
  adaptChatParams(url, { ...base, model }) as Record<string, unknown>;

describe("adaptChatParams", () => {
  it("turns DeepSeek thinking off", () => {
    expect(adapt("https://api.deepseek.com", "deepseek-flash").thinking).toEqual({ type: "disabled" });
  });

  it("turns reasoning off for DeepSeek Flash on DeepInfra, not for V4 Pro", () => {
    expect(adapt("https://api.deepinfra.com/v1/openai", "deepseek-ai/DeepSeek-V4-Flash-0731").reasoning_effort).toBe("none");
    expect(adapt("https://api.deepinfra.com/v1/openai", "deepseek-ai/DeepSeek-V4.1-Flash").reasoning_effort).toBe("none");
    expect(adapt("https://api.deepinfra.com/v1/openai", "deepseek-ai/DeepSeek-V4-Pro").reasoning_effort).toBeUndefined();
  });

  it("uses max_completion_tokens on OpenAI, reasoning off only for reasoning models", () => {
    const r = adapt("https://api.openai.com/v1", "gpt-6-luna");
    expect(r.max_completion_tokens).toBe(100);
    expect(r.max_tokens).toBeUndefined();
    expect(r.reasoning_effort).toBe("none");
    expect(adapt("https://api.openai.com/v1", "gpt-4.1-mini").reasoning_effort).toBeUndefined();
  });

  it("keeps gpt-oss reasoning low and hidden on Groq", () => {
    const r = adapt("https://api.groq.com/openai/v1", "openai/gpt-oss-20b");
    expect(r.reasoning_effort).toBe("low");
    expect(r.include_reasoning).toBe(false);
    expect(r.max_completion_tokens).toBe(100);
  });

  it("drops stream_options for Mistral", () => {
    const r = adapt("https://api.mistral.ai/v1", "mistral-small-latest");
    expect(r.stream_options).toBeUndefined();
    expect(r.reasoning_effort).toBe("none");
    expect(adapt("https://api.mistral.ai/v1", "mistral-large-latest").reasoning_effort).toBeUndefined();
  });

  it("turns reasoning off for hybrid models on Together and Ollama", () => {
    expect(adapt("https://api.together.ai/v1", "deepseek-ai/DeepSeek-V4-Flash-0731").reasoning).toEqual({ enabled: false });
    expect(adapt("http://host.docker.internal:11434/v1", "qwen3.5:4b").reasoning_effort).toBe("none");
  });

  it("leaves other hosts and bad URLs untouched", () => {
    expect(adapt("https://openrouter.ai/api/v1", "openai/gpt-4.1-mini")).toEqual({ ...base, model: "openai/gpt-4.1-mini" });
    expect(adapt("not a url", "x")).toEqual({ ...base, model: "x" });
  });
});
