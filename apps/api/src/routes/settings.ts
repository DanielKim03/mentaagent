import type { FastifyInstance } from "fastify";
import OpenAI from "openai";
import { z } from "zod";
import { pool } from "../db/client.js";
import {
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

const putSchema = z.object({
  llm_base_url: text.url().or(z.literal("")).optional(),
  // undefined = keep the saved key, "" = delete it, anything else = replace.
  llm_api_key: text.optional(),
  agent_model: text.optional(),
  heavy_model: text.optional(),
  llm_tool_mode: z.enum(["native", "hermes-xml", ""]).optional(),
  embeddings_base_url: text.url().or(z.literal("")).optional(),
  embeddings_api_key: text.optional(),
  embeddings_model: text.optional(),
  vision_model: text.optional(),
});

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/api/settings/llm", async () => {
    const row = await readLlmSettingsRow();
    const c = llmConfig();
    return {
      saved: {
        llm_base_url: row?.llm_base_url ?? "",
        agent_model: row?.agent_model ?? "",
        heavy_model: row?.heavy_model ?? "",
        llm_tool_mode: row?.llm_tool_mode ?? "",
        embeddings_base_url: row?.embeddings_base_url ?? "",
        embeddings_model: row?.embeddings_model ?? "",
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

  // Sends one tiny chat request with the saved settings, so the owner finds
  // out about a wrong key or model name here instead of mid-conversation.
  app.post("/api/settings/llm/test", async () => {
    const c = resolveLlmConfig(await readLlmSettingsRow());
    if (!c.apiKey) {
      return { ok: false, error: "No API key saved. The app is using canned stub answers." };
    }
    const client = new OpenAI({
      apiKey: c.apiKey,
      baseURL: c.baseUrl,
      timeout: 30_000,
      maxRetries: 0,
    });
    try {
      const res = await client.chat.completions.create({
        model: c.agentModel,
        messages: [{ role: "user", content: "Reply with the word OK." }],
        max_tokens: 5,
      });
      return { ok: true, model: c.agentModel, reply: res.choices[0]?.message?.content ?? "" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, model: c.agentModel, error: msg.slice(0, 300) };
    }
  });
}
