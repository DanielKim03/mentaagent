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

export const RUN_POLICY: Record<RunKind, RunPolicy> = {
  chat: {
    maxIterations: 12,
    costCapUsdMicros: 100_000, // $0.10
    wallClockMs: 120_000,
    tools: [
      "search_business_data",
      "read_document",
      "list_documents",
      "get_business_profile",
      "run_calculation",
      "aggregate_table",
      "create_alert",
      "remember",
      "use_skill",
      "update_watchlist",
      "search_history",
    ],
    model: "agent",
  },
  report: {
    maxIterations: 40,
    costCapUsdMicros: 2_000_000, // $2.00
    wallClockMs: 600_000,
    tools: [
      "search_business_data",
      "read_document",
      "list_documents",
      "get_business_profile",
      "run_calculation",
      "aggregate_table",
      "create_alert",
      "use_skill",
      "write_report_section",
    ],
    model: "agent",
  },
  monitor: {
    maxIterations: 15,
    costCapUsdMicros: 500_000, // $0.50
    wallClockMs: 300_000,
    tools: [
      "search_business_data",
      "read_document",
      "list_documents",
      "get_business_profile",
      "run_calculation",
      "aggregate_table",
      "create_alert",
      "remember",
      "use_skill",
      "update_watchlist",
      "search_history",
    ],
    model: "agent",
  },
  reflect: {
    maxIterations: 8,
    costCapUsdMicros: 30_000, // $0.03
    wallClockMs: 120_000,
    tools: ["remember", "propose_skill", "update_watchlist"],
    model: "agent",
  },
  consolidate: {
    maxIterations: 8,
    costCapUsdMicros: 30_000, // $0.03
    wallClockMs: 120_000,
    tools: ["remember"],
    model: "agent",
  },
};
