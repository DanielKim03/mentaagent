import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, "../../../.env") });

const isProd = process.env.NODE_ENV === "production";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6380"),
  PORT: z.coerce.number().int().positive().default(3001),
  PGSSL: z.enum(["require"]).optional(),

  // --- LLM (agent brain). Provider-agnostic OpenAI-compatible endpoint.
  // Unset LLM_API_KEY → stub provider: the agent loop runs with canned
  // responses so the whole pipeline is exercisable without spend.
  // .trim() on the credentials/URLs/models is load-bearing: a stray leading or
  // trailing space pasted into an env var would otherwise be sent as part of the bearer token and
  // get rejected with a 401, or break the model name / base URL.
  LLM_BASE_URL: z.string().trim().url().default("https://api.deepinfra.com/v1/openai"),
  LLM_API_KEY: z.string().trim().optional(),
  AGENT_MODEL: z.string().trim().default("deepseek-ai/DeepSeek-V4-Flash"),
  HEAVY_MODEL: z.string().trim().default("deepseek-ai/DeepSeek-V4-Pro"),
  // "native" = OpenAI tools param (Nebius Hermes 4); "hermes-xml" = schemas
  // in system prompt + <tool_call> parsing (hosts without native tools).
  LLM_TOOL_MODE: z.enum(["native", "hermes-xml"]).default("native"),

  // --- Embeddings. May be a different provider than the chat LLM.
  // Must produce 1024-dim vectors (chunks.embedding is vector(1024)).
  EMBEDDINGS_BASE_URL: z
    .string()
    .trim()
    .url()
    .default("https://api.deepinfra.com/v1/openai"),
  EMBEDDINGS_API_KEY: z.string().trim().optional(),
  EMBEDDINGS_MODEL: z.string().trim().default("BAAI/bge-m3"),

  // --- Vision (image ingest). An OpenAI-compatible vision-language host that
  // turns uploaded photos/screenshots into faithful text for the text-RAG
  // pipeline. BASE_URL/API_KEY fall back to the embeddings provider when unset
  // (Qwen3-VL lives on the same DeepInfra account as bge-m3), so the default
  // single-DeepInfra-key setup gets image support with no extra config. When
  // NEITHER a vision nor an embeddings key is configured, image uploads are
  // rejected at the door (see lib/storage.ts) — graceful degradation, no
  // wasted upload.
  VISION_BASE_URL: z.string().trim().url().optional(),
  VISION_API_KEY: z.string().trim().optional(),
  VISION_MODEL: z.string().trim().default("Qwen/Qwen3-VL-30B-A3B-Instruct"),

  // Instance-wide soft cap on total LLM spend per UTC day, in whole USD.
  // 0 disables. Fail-safe even if per-workspace gating misbehaves.
  LLM_DAILY_USD_CAP: z.coerce.number().nonnegative().default(0),

  STORAGE_PATH: z.string().min(1).default("./data"),
  WEB_ORIGIN: z
    .string()
    .min(1)
    .default("http://localhost:3000")
    .transform((s) =>
      s
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    ),
  // Shared secret the web proxy uses to call the API. Required in production.
  INTERNAL_API_SECRET: z.string().min(32).optional(),
});

// Treat empty-string vars as unset so a copied .env.example (with blank
// optional values) validates — zod's .optional() doesn't cover "".
const cleanedEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, v]) => v !== "")
);

const parsed = schema.safeParse(cleanedEnv);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

if (isProd && !process.env.WEB_ORIGIN) {
  // eslint-disable-next-line no-console
  console.error("WEB_ORIGIN must be set explicitly in production");
  process.exit(1);
}

if (isProd && !parsed.data.INTERNAL_API_SECRET) {
  // eslint-disable-next-line no-console
  console.error("INTERNAL_API_SECRET must be set in production (>=32 chars)");
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
export type Env = typeof env;
