import OpenAI from "openai";
import type { PoolClient } from "pg";
import { env } from "../../env.js";
import { pool } from "../../db/client.js";

// Provider-agnostic OpenAI-compatible clients. Two endpoints:
//   - chat (the agent brain): Nebius Token Factory serving Nous Hermes 4
//     (native function calling), or any compatible host via LLM_BASE_URL.
//   - embeddings: DeepInfra serving BAAI/bge-m3 by default (cheap, 1024-dim).
//
// Models (Jun 2026):
//   - NousResearch/Hermes-4-70B:  $0.13/M in, $0.40/M out, 131K ctx (Nebius)
//   - NousResearch/Hermes-4-405B: $1.00/M in, $3.00/M out, 131K ctx (Nebius)
//   - Fallback NousResearch/Hermes-3-Llama-3.1-405B on DeepInfra ($1/$1)
//     via the hermes-xml tool mode (no native tools param there).

let chatCached: OpenAI | null | undefined = undefined;
let embedCached: OpenAI | null | undefined = undefined;

// Returns null when LLM_API_KEY is unset; the agent loop uses the stub
// provider in that case so the rest of the pipeline can still be exercised
// end-to-end (dev, tests).
export function getChatClient(): OpenAI | null {
  if (chatCached !== undefined) return chatCached;
  const apiKey = env.LLM_API_KEY;
  if (!apiKey) {
    chatCached = null;
    return null;
  }
  // Bound each request: the SDK default is a 10-minute timeout with 2
  // retries. The per-call timeout in callLLM is the real ceiling; this 300s
  // default just covers any path that doesn't set one. 1 retry caps
  // latency/cost on 429/5xx.
  chatCached = new OpenAI({
    apiKey,
    baseURL: env.LLM_BASE_URL,
    timeout: 300_000,
    maxRetries: 1,
  });
  return chatCached;
}

export function getEmbeddingsClient(): OpenAI | null {
  if (embedCached !== undefined) return embedCached;
  const apiKey = env.EMBEDDINGS_API_KEY;
  if (!apiKey) {
    embedCached = null;
    return null;
  }
  embedCached = new OpenAI({
    apiKey,
    baseURL: env.EMBEDDINGS_BASE_URL,
    timeout: 60_000,
    maxRetries: 1,
  });
  return embedCached;
}

// Pricing in micros (millionths of USD) per million tokens. Reverify at
// deploy time — these drift. Sources: Nebius Token Factory + DeepInfra
// pricing pages as of Jun 2026.
const PRICING_MICROS_PER_MILLION: Record<
  string,
  { input: number; output: number }
> = {
  "NousResearch/Hermes-4-70B": { input: 130_000, output: 400_000 },
  "NousResearch/Hermes-4-405B": { input: 1_000_000, output: 3_000_000 },
  "NousResearch/Hermes-3-Llama-3.1-405B": {
    input: 1_000_000,
    output: 1_000_000,
  },
  // DeepSeek's first-party API (api.deepseek.com). V4 model IDs as of May
  // 2026; cache-MISS input prices (we can't know the cache-hit ratio
  // pre-call, so we bill the higher rate — consistent with never
  // under-charging). The deepseek-chat/deepseek-reasoner aliases (deprecated
  // 2026-07-24) map to deepseek-v4-flash and share its token pricing.
  "deepseek-v4-flash": { input: 100_000, output: 200_000 },
  "deepseek-v4-pro": { input: 1_300_000, output: 2_600_000 },
  "deepseek-chat": { input: 100_000, output: 200_000 },
  "deepseek-reasoner": { input: 100_000, output: 200_000 },
  // Same models hosted on DeepInfra (different namespacing). Verified against
  // DeepInfra's published rates Jun 2026: V4-Flash $0.10/$0.20 per M tokens,
  // V4-Pro $1.30/$2.60 per M tokens.
  "deepseek-ai/DeepSeek-V4-Flash": { input: 100_000, output: 200_000 },
  "deepseek-ai/DeepSeek-V4-Pro": { input: 1_300_000, output: 2_600_000 },
  // Embeddings ($0.01/M tokens on DeepInfra).
  "BAAI/bge-m3": { input: 10_000, output: 0 },
};

// Fallback for unknown models — assume costliest tier so we never under-bill.
const FALLBACK_PRICING = { input: 1_000_000, output: 3_000_000 };

// Models we've already warned about, so the log line below fires once per
// unknown model rather than on every call.
const warnedModels = new Set<string>();

export function computeCostMicros(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const p = PRICING_MICROS_PER_MILLION[model];
  if (!p && !warnedModels.has(model)) {
    warnedModels.add(model);
    // A configured model with no pricing entry bills at the costliest
    // fallback — which silently over-consumes a paying workspace's cap. Make
    // the misconfiguration visible so pricing can be added (see the table
    // above). Not fatal: over-billing is the safe direction.
    // eslint-disable-next-line no-console
    console.warn(
      `[llm] no pricing entry for model "${model}" — billing at the costliest fallback ($1/$3 per M). Add it to PRICING_MICROS_PER_MILLION.`
    );
  }
  const pricing = p ?? FALLBACK_PRICING;
  // ceil so partial-micro costs round up (we'd rather over-account by <1
  // micro than systematically under-account).
  return Math.ceil(
    (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000
  );
}

export type BudgetScope = "workspace" | "instance";

export class BudgetExceededError extends Error {
  readonly scope: BudgetScope;
  readonly usedUsd: number;
  readonly capUsd: number;
  constructor(scope: BudgetScope, usedUsd: number, capUsd: number) {
    super(
      `LLM budget exceeded (${scope}): $${usedUsd.toFixed(2)} used, cap $${capUsd.toFixed(2)}`
    );
    this.name = "BudgetExceededError";
    this.scope = scope;
    this.usedUsd = usedUsd;
    this.capUsd = capUsd;
  }
}

// Reads spend within the active window using the passed transaction client
// (so the read sees rows committed by other callers that held the same
// per-workspace advisory lock). Throws BudgetExceededError if the workspace
// monthly cap or the instance-wide daily cap is already at/over its ceiling.
async function assertWithinBudget(
  tx: PoolClient,
  workspaceId: string
): Promise<void> {
  // Per-workspace monthly cap. NULL = no cap; 0 = blocked; >0 = enforced.
  const { rows: wsRows } = await tx.query<{ cap: string | null }>(
    "SELECT llm_cap_usd_micros::text AS cap FROM workspaces WHERE id = $1",
    [workspaceId]
  );
  const capStr = wsRows[0]?.cap ?? null;
  if (capStr !== null) {
    const capMicros = BigInt(capStr);
    if (capMicros === 0n) {
      throw new BudgetExceededError("workspace", 0, 0);
    }
    const { rows } = await tx.query<{ total: string }>(
      // Window the spend on the current billing period when the workspace
      // has one (resets on renewal); fall back to the UTC calendar month for
      // workspaces with no active subscription.
      `SELECT COALESCE(SUM(cost_usd_micros), 0)::text AS total
         FROM llm_usage
        WHERE workspace_id = $1
          AND created_at >= COALESCE(
                (SELECT current_period_start FROM workspaces WHERE id = $1),
                date_trunc('month', NOW() AT TIME ZONE 'UTC'))`,
      [workspaceId]
    );
    const usedMicros = BigInt(rows[0].total);
    if (usedMicros >= capMicros) {
      throw new BudgetExceededError(
        "workspace",
        Number(usedMicros) / 1_000_000,
        Number(capMicros) / 1_000_000
      );
    }
  }

  // Instance-wide daily soft cap. 0 disables. Sums across all workspaces.
  const dailyCapUsd = env.LLM_DAILY_USD_CAP;
  if (dailyCapUsd > 0) {
    const { rows } = await tx.query<{ total: string }>(
      `SELECT COALESCE(SUM(cost_usd_micros), 0)::text AS total
         FROM llm_usage
        WHERE created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`
    );
    const usedMicros = BigInt(rows[0].total);
    const capMicros = BigInt(Math.floor(dailyCapUsd * 1_000_000));
    if (usedMicros >= capMicros) {
      throw new BudgetExceededError(
        "instance",
        Number(usedMicros) / 1_000_000,
        dailyCapUsd
      );
    }
  }
}

// Rough pre-call token estimate. ~4 chars per token; assume the request
// spends its full max_tokens of output. We intentionally over-estimate so
// the reservation never under-charges; the post-call reconcile settles it
// to the real token counts.
function estimateTokens(params: {
  messages?: { content?: unknown }[];
  max_tokens?: number | null;
}): { prompt: number; completion: number } {
  const chars = (params.messages ?? []).reduce((n, m) => {
    const c =
      typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "");
    return n + c.length;
  }, 0);
  return {
    prompt: Math.ceil(chars / 4),
    completion: params.max_tokens ?? 2000,
  };
}

// Atomically checks the budget and INSERTs a usage row pre-charged with the
// estimated cost, all under a per-workspace advisory lock. Because the
// reservation is committed before the lock is released, a concurrent call
// for the same workspace blocks until it can see this spend — closing the
// check-then-act race. The lock is transaction-scoped and held ONLY across
// these fast DB ops, never across the LLM network call.
async function reserveBudget(args: {
  workspaceId: string;
  model: string;
  operation: string;
  estPromptTokens: number;
  estCompletionTokens: number;
}): Promise<string> {
  const estCost = computeCostMicros(
    args.model,
    args.estPromptTokens,
    args.estCompletionTokens
  );
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [
      args.workspaceId,
    ]);
    await assertWithinBudget(tx, args.workspaceId);
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO llm_usage
         (workspace_id, model, operation, prompt_tokens, completion_tokens, cost_usd_micros)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        args.workspaceId,
        args.model,
        args.operation,
        args.estPromptTokens,
        args.estCompletionTokens,
        estCost,
      ]
    );
    await tx.query("COMMIT");
    return rows[0].id;
  } catch (err) {
    await tx.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    tx.release();
  }
}

async function reconcileUsage(
  reservationId: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): Promise<number> {
  const cost = computeCostMicros(model, promptTokens, completionTokens);
  await pool.query(
    `UPDATE llm_usage
        SET prompt_tokens = $2, completion_tokens = $3, cost_usd_micros = $4
      WHERE id = $1`,
    [reservationId, promptTokens, completionTokens, cost]
  );
  return cost;
}

async function releaseReservation(reservationId: string): Promise<void> {
  await pool
    .query("DELETE FROM llm_usage WHERE id = $1", [reservationId])
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error("[llm] failed to release reservation:", e);
    });
}

export type LLMOperation =
  | "agent"
  | "summarize"
  | "report"
  | "reflect"
  | "embed";

// Wraps client.chat.completions.create with an atomic pre-call budget
// reservation and a post-call reconcile. Callers pass through the OpenAI
// request params unchanged (including `tools`); the return shape matches
// client.chat.completions.create. Returns the actual cost in micros
// alongside the completion so the agent loop can enforce per-run caps.
//
// Throws BudgetExceededError before contacting the provider if either the
// workspace's monthly cap or the instance-wide daily cap is exhausted.
export async function callLLM(args: {
  workspaceId: string;
  operation: LLMOperation;
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
  timeoutMs?: number;
}): Promise<{
  completion: OpenAI.Chat.Completions.ChatCompletion;
  costUsdMicros: number;
}> {
  const client = getChatClient();
  if (!client) {
    throw new Error(
      "LLM_API_KEY not set — callLLM requires a real client. " +
        "Callers should check getChatClient() and stub when null."
    );
  }

  const est = estimateTokens(args.params);
  const reservationId = await reserveBudget({
    workspaceId: args.workspaceId,
    model: args.params.model,
    operation: args.operation,
    estPromptTokens: est.prompt,
    estCompletionTokens: est.completion,
  });

  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await client.chat.completions.create(args.params, {
      timeout: args.timeoutMs ?? 120_000,
    });
  } catch (err) {
    // The call produced no output — drop the reservation so a failed call
    // isn't billed, then surface the original error.
    await releaseReservation(reservationId);
    throw err;
  }

  // Reconcile the reservation to actual token usage. AWAITED so the next
  // budget check sees committed spend (no fire-and-forget gap). If usage is
  // missing we keep the (over-)estimate — fail-safe toward over-accounting.
  const usage = completion.usage;
  let cost = computeCostMicros(args.params.model, est.prompt, est.completion);
  if (usage) {
    cost = await reconcileUsage(
      reservationId,
      args.params.model,
      usage.prompt_tokens,
      usage.completion_tokens
    ).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[llm] usage reconcile failed:", err);
      return cost;
    });
  }

  return { completion, costUsdMicros: cost };
}

// Streaming twin of callLLM for the interactive agent loop: same budget
// reservation/reconcile, but deltas are surfaced via onDelta as they arrive
// and the accumulated completion (message + tool_calls + usage) is returned
// at the end. `stream_options.include_usage` makes OpenAI-compatible hosts
// send real token counts in the final chunk.
export async function callLLMStreaming(args: {
  workspaceId: string;
  operation: LLMOperation;
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
  onDelta?: (text: string) => void;
  timeoutMs?: number;
}): Promise<{
  message: OpenAI.Chat.Completions.ChatCompletionMessage;
  usage: { prompt_tokens: number; completion_tokens: number } | null;
  costUsdMicros: number;
}> {
  const client = getChatClient();
  if (!client) {
    throw new Error("LLM_API_KEY not set — callLLMStreaming requires a real client.");
  }

  const est = estimateTokens(args.params);
  const reservationId = await reserveBudget({
    workspaceId: args.workspaceId,
    model: args.params.model,
    operation: args.operation,
    estPromptTokens: est.prompt,
    estCompletionTokens: est.completion,
  });

  let content = "";
  let usage: { prompt_tokens: number; completion_tokens: number } | null = null;
  // Accumulate streamed tool calls by index (the wire format sends the name
  // first, then argument fragments).
  const toolCalls = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();

  try {
    const stream = await client.chat.completions.create(
      {
        ...args.params,
        stream: true,
        stream_options: { include_usage: true },
      },
      { timeout: args.timeoutMs ?? 120_000 }
    );
    for await (const chunk of stream) {
      if (chunk.usage) {
        usage = {
          prompt_tokens: chunk.usage.prompt_tokens,
          completion_tokens: chunk.usage.completion_tokens,
        };
      }
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        content += delta.content;
        args.onDelta?.(delta.content);
      }
      for (const tc of delta.tool_calls ?? []) {
        const cur = toolCalls.get(tc.index) ?? {
          id: "",
          name: "",
          arguments: "",
        };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.arguments += tc.function.arguments;
        toolCalls.set(tc.index, cur);
      }
    }
  } catch (err) {
    await releaseReservation(reservationId);
    throw err;
  }

  let cost = computeCostMicros(args.params.model, est.prompt, est.completion);
  if (usage) {
    cost = await reconcileUsage(
      reservationId,
      args.params.model,
      usage.prompt_tokens,
      usage.completion_tokens
    ).catch(() => cost);
  }

  const message = {
    role: "assistant",
    content: content || null,
    refusal: null,
    tool_calls:
      toolCalls.size > 0
        ? [...toolCalls.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, tc]) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.name, arguments: tc.arguments },
            }))
        : undefined,
  } as OpenAI.Chat.Completions.ChatCompletionMessage;

  return { message, usage, costUsdMicros: cost };
}

// Embeddings twin of callLLM: same atomic budget reservation and reconcile,
// against the (possibly different) embeddings provider. Embedding spend is
// ~1% of chat spend but it still counts toward the caps — a runaway
// backfill must hit the same wall.
export async function callEmbeddings(args: {
  workspaceId: string;
  input: string[];
}): Promise<number[][]> {
  const client = getEmbeddingsClient();
  if (!client) {
    throw new Error(
      "EMBEDDINGS_API_KEY not set — callEmbeddings requires a real client."
    );
  }
  const model = env.EMBEDDINGS_MODEL;

  const estPrompt = Math.ceil(
    args.input.reduce((n, t) => n + t.length, 0) / 4
  );
  const reservationId = await reserveBudget({
    workspaceId: args.workspaceId,
    model,
    operation: "embed",
    estPromptTokens: estPrompt,
    estCompletionTokens: 0,
  });

  let res: OpenAI.Embeddings.CreateEmbeddingResponse;
  try {
    res = await client.embeddings.create(
      { model, input: args.input, encoding_format: "float" },
      { timeout: 60_000 }
    );
  } catch (err) {
    await releaseReservation(reservationId);
    throw err;
  }

  if (res.usage) {
    await reconcileUsage(reservationId, model, res.usage.prompt_tokens, 0).catch(
      (err) => {
        // eslint-disable-next-line no-console
        console.error("[llm] embed usage reconcile failed:", err);
      }
    );
  }

  // The API may return out of order in theory — sort by index to be safe.
  return res.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
