import type { FastifyInstance } from "fastify";
import OpenAI from "openai";
import { z } from "zod";
import { pool } from "../db/client.js";
import { EMBEDDING_DIM } from "../services/llm/client.js";
import {
  isLocalUrl,
  llmConfig,
  readLlmSettingsRow,
  refreshLlmConfig,
  resolveLlmConfig,
} from "../services/llm/settings.js";

// Model provider settings for the web Settings page. Keys are write-only:
// the browser gets back whether one is saved and its last four characters,
// never the key itself.

const hint = (key: string | null | undefined) =>
  key ? `…${key.slice(-4)}` : null;

const text = z.string().trim().max(500);
const url = text.url().or(z.literal(""));

const putSchema = z.object({
  provider: text.optional(),
  llm_base_url: url.optional(),
  // undefined = keep the saved key, "" = delete it, anything else = replace.
  llm_api_key: text.optional(),
  agent_model: text.optional(),
  heavy_model: text.optional(),
  llm_tool_mode: z.enum(["native", "hermes-xml", ""]).optional(),
  embeddings_base_url: url.optional(),
  embeddings_api_key: text.optional(),
  embeddings_model: text.optional(),
  vision_base_url: url.optional(),
  vision_model: text.optional(),
});

const errMsg = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).slice(0, 300);

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/api/settings/llm", async () => {
    const row = await readLlmSettingsRow();
    const c = llmConfig();
    return {
      saved: {
        provider: row?.provider ?? "",
        llm_base_url: row?.llm_base_url ?? "",
        agent_model: row?.agent_model ?? "",
        heavy_model: row?.heavy_model ?? "",
        llm_tool_mode: row?.llm_tool_mode ?? "",
        embeddings_base_url: row?.embeddings_base_url ?? "",
        embeddings_model: row?.embeddings_model ?? "",
        vision_base_url: row?.vision_base_url ?? "",
        vision_model: row?.vision_model ?? "",
        llm_api_key_hint: hint(row?.llm_api_key),
        embeddings_api_key_hint: hint(row?.embeddings_api_key),
      },
      // What is actually in use, blanks filled from the environment.
      effective: {
        baseUrl: c.baseUrl,
        agentModel: c.agentModel,
        heavyModel: c.heavyModel,
        toolMode: c.toolMode,
        embeddingsBaseUrl: c.embeddingsBaseUrl,
        embeddingsModel: c.embeddingsModel,
        visionBaseUrl: c.visionBaseUrl,
        visionModel: c.visionModel,
        hasChatKey: Boolean(c.apiKey),
        hasEmbeddingsKey: Boolean(c.embeddingsApiKey),
        hasVisionKey: Boolean(c.visionApiKey),
      },
    };
  });

  app.put("/api/settings/llm", async (req, reply) => {
    const parsed = putSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid settings", issues: parsed.error.issues });
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [col, v] of Object.entries(parsed.data)) {
      if (v === undefined) continue;
      vals.push(v === "" ? null : v);
      sets.push(`${col} = $${vals.length}`);
    }
    if (sets.length > 0) {
      await pool.query(
        `UPDATE llm_settings SET ${sets.join(", ")}, updated_at = NOW() WHERE id`,
        vals
      );
    }
    await refreshLlmConfig();
    return { updated: true };
  });

  // Lists the models a provider offers (GET {base}/models), so the owner
  // picks a real model name instead of typing one from memory. Uses the key
  // typed in the form, or the saved key when the URL is the saved one.
  const modelsSchema = z.object({ base_url: text.url(), api_key: text.optional() });
  app.post("/api/settings/llm/models", async (req, reply) => {
    const parsed = modelsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "a provider URL is needed" });
    const c = resolveLlmConfig(await readLlmSettingsRow());
    const apiKey =
      parsed.data.api_key ||
      (parsed.data.base_url === c.baseUrl ? c.apiKey : undefined) ||
      (isLocalUrl(parsed.data.base_url) ? "local" : undefined);
    if (!apiKey) return { ok: false, error: "Paste the API key first." };
    const client = new OpenAI({ apiKey, baseURL: parsed.data.base_url, timeout: 20_000, maxRetries: 0 });
    try {
      const ids: string[] = [];
      for await (const m of client.models.list()) {
        ids.push(m.id);
        if (ids.length >= 1000) break;
      }
      return { ok: true, models: [...new Set(ids)].sort() };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  // Sends one tiny chat request (and one embedding, if configured) with the
  // saved settings, so a wrong key or model name shows up here instead of in
  // the middle of a conversation.
  app.post("/api/settings/llm/test", async () => {
    const c = resolveLlmConfig(await readLlmSettingsRow());
    if (!c.apiKey) {
      return { ok: false, error: "No API key saved. The app is using canned stub answers." };
    }
    const result: {
      ok: boolean;
      model: string;
      error?: string;
      embeddings?: { ok: boolean; model: string; error?: string };
    } = { ok: false, model: c.agentModel };
    try {
      const chat = new OpenAI({ apiKey: c.apiKey, baseURL: c.baseUrl, timeout: 30_000, maxRetries: 0 });
      await chat.chat.completions.create({
        model: c.agentModel,
        messages: [{ role: "user", content: "Reply with the word OK." }],
        max_tokens: 5,
      });
      result.ok = true;
    } catch (err) {
      result.error = errMsg(err);
    }
    if (c.embeddingsApiKey) {
      try {
        const emb = new OpenAI({
          apiKey: c.embeddingsApiKey,
          baseURL: c.embeddingsBaseUrl,
          timeout: 30_000,
          maxRetries: 0,
        });
        const res = await emb.embeddings.create({
          model: c.embeddingsModel,
          input: ["test"],
          encoding_format: "float",
          ...(/text-embedding-3|gemini-embedding/.test(c.embeddingsModel)
            ? { dimensions: EMBEDDING_DIM }
            : {}),
        });
        const dim = res.data[0]?.embedding.length;
        result.embeddings =
          dim === EMBEDDING_DIM
            ? { ok: true, model: c.embeddingsModel }
            : {
                ok: false,
                model: c.embeddingsModel,
                error: `returns ${dim} dimensions, needs ${EMBEDDING_DIM}; search will use keywords only`,
              };
      } catch (err) {
        result.embeddings = { ok: false, model: c.embeddingsModel, error: errMsg(err) };
      }
    }
    return result;
  });
}
