import type { z } from "zod";

export type RunKind = "chat" | "report" | "monitor" | "reflect" | "consolidate";

// Everything a tool needs to act on behalf of a run. workspaceId comes from
// the trust boundary / job data — NEVER from model output — so a tool
// physically cannot touch another tenant.
export type AgentContext = {
  workspaceId: string;
  runId: string;
  sessionId: string | null;
  kind: RunKind;
  reportId: string | null;
};

// A tool the agent can call. Parameters are a zod object schema — validated
// before execute(); validation errors are returned to the model as the tool
// result so it can self-correct. execute() returns the string the model
// sees (truncated by the loop).
export type ToolDef<TArgs = unknown> = {
  name: string;
  description: string;
  parameters: z.ZodType<TArgs>;
  execute: (args: TArgs, ctx: AgentContext) => Promise<string>;
};

// OpenAI-wire-shaped message rows (agent_messages is the source of truth).
export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: NormalizedToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type NormalizedToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

// What one LLM turn produced, normalized across provider modes
// (native tools vs hermes-xml vs stub).
export type AssistantTurn = {
  content: string;
  toolCalls: NormalizedToolCall[];
  usage: { prompt_tokens: number; completion_tokens: number } | null;
  costUsdMicros: number;
};

// Per-kind run policy. Iteration/cost ceilings are guards, not targets —
// most runs finish well under them.
export type RunPolicy = {
  maxIterations: number;
  costCapUsdMicros: number;
  wallClockMs: number;
  // Tool names this kind may use. Reflect runs are whitelisted to the
  // learning tools only (Hermes background-review pattern).
  tools: string[];
  model: "agent" | "heavy";
};

// Per-run dollar caps are runaway BACKSTOPS, sized ~10x a heavy real run at
// the live DeepInfra pricing (V4-Flash $0.10/$0.20 per M tokens; the report's
// exec summary on the heavier model is pricier). A typical chat costs well
// under $0.05 and a full 7-dimension report well under $1; these ceilings only
// fire on a pathological loop. The per-workspace monthly cap (lib/plans.ts:
// free $1, pro $7, max $30) is the real spend limit — these sit on top of it.
export const RUN_POLICY: Record<RunKind, RunPolicy> = {
  chat: {
    // A guardrail, not a target: the prompt steers the agent to answer in
    // ~1-3 tool calls. 14 caps a pathological over-investigation loop without
    // truncating a genuinely complex multi-step question.
    maxIterations: 14,
    costCapUsdMicros: 250_000, // $0.25 backstop (~10x a heavy chat at $0.10/$0.20/M)
    wallClockMs: 300_000,
    tools: [
      "search_business_data",
      "read_document",
      "list_documents",
      "get_data_overview",
      "get_business_profile",
      "run_calculation",
      "aggregate_table",
      "find_connections",
      "create_alert",
      "remember",
      "use_skill",
      "update_watchlist",
      "search_history",
    ],
    model: "agent",
  },
  report: {
    // 7 dimensions share this budget; a single messy dimension (e.g. decoding
    // Excel serial dates) can burn 15-20 iterations, so give the whole report
    // generous room to finish all sections. Cost is still capped below.
    maxIterations: 200,
    costCapUsdMicros: 2_000_000, // $2.00 backstop (7 fresh-context dimensions + heavy exec summary)
    wallClockMs: 1_200_000,
    tools: [
      "search_business_data",
      "read_document",
      "list_documents",
      "get_data_overview",
      "get_business_profile",
      "run_calculation",
      "aggregate_table",
      "find_connections",
      "create_alert",
      "use_skill",
      "write_report_section",
    ],
    model: "agent",
  },
  monitor: {
    maxIterations: 40,
    costCapUsdMicros: 500_000, // $0.50 backstop (weekly per-workspace sweep)
    wallClockMs: 600_000,
    tools: [
      "search_business_data",
      "read_document",
      "list_documents",
      "get_business_profile",
      "run_calculation",
      "aggregate_table",
      "find_connections",
      "create_alert",
      "remember",
      "use_skill",
      "update_watchlist",
      "search_history",
    ],
    model: "agent",
  },
  reflect: {
    maxIterations: 15,
    costCapUsdMicros: 200_000, // $0.20 (testing)
    wallClockMs: 180_000,
    tools: ["remember", "propose_skill", "update_watchlist"],
    model: "agent",
  },
  consolidate: {
    maxIterations: 15,
    costCapUsdMicros: 200_000, // $0.20 (testing)
    wallClockMs: 180_000,
    tools: ["remember"],
    model: "agent",
  },
};
