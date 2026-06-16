import { env } from "../../env.js";
import { pool } from "../../db/client.js";
import { emitAgentEvent } from "../../queue/events.js";
import { redisConnection } from "../../queue/queue.js";
import { BudgetExceededError } from "../llm/client.js";
import { getProvider } from "./provider.js";
import { executeTool, getTools, toolSchemas } from "./registry.js";
import type {
  AgentContext,
  ChatMessage,
  NormalizedToolCall,
  RunKind,
} from "./types.js";
import { RUN_POLICY } from "./types.js";

// The tool-calling loop. Every message is persisted to agent_messages as it
// is produced (single source of truth: streaming replay, resume, and the UI
// all derive from these rows). Guards each iteration: max iterations,
// per-run cost cap, wall clock, cancellation flag, consecutive tool
// failures. Never throws for model/tool misbehavior — the run row carries
// the terminal status.

const MAX_OUTPUT_TOKENS = 4000;
// Chat answers should be tight, so cap them lower than report sections — fewer
// output tokens = faster final reply. Other kinds keep the larger budget.
const CHAT_MAX_OUTPUT_TOKENS = 1500;
// ~80K input tokens at ~4 chars/token. Hermes context is 131K; leave head-
// room for output + safety. Oldest non-system messages are dropped when
// over (the Phase-2 pre-compaction memory flush hooks in here later).
const CONTEXT_CHAR_BUDGET = 320_000;

// Consecutive all-tool-calls-failed iterations before a nudge / a hard fail.
const NUDGE_AFTER_FAILURES = 2;
const FAIL_AFTER_FAILURES = 4;

export type RunResult = {
  status: "done" | "failed" | "paused_budget" | "cancelled";
  finalText: string;
  error?: string;
};

type RunRow = {
  id: string;
  workspace_id: string;
  session_id: string | null;
  kind: RunKind;
  iterations: number;
  max_iterations: number;
  cost_cap_usd_micros: string;
  cost_usd_micros: string;
  report_id: string | null;
  model: string | null;
};

async function nextSeq(runId: string): Promise<number> {
  const { rows } = await pool.query<{ max: number | null }>(
    "SELECT MAX(seq) AS max FROM agent_messages WHERE run_id = $1",
    [runId]
  );
  return (rows[0].max ?? -1) + 1;
}

async function persistMessage(args: {
  ctx: AgentContext;
  seq: number;
  role: ChatMessage["role"];
  content: string;
  toolCalls?: NormalizedToolCall[];
  toolCallId?: string;
  name?: string;
  promptTokens?: number;
  completionTokens?: number;
}): Promise<void> {
  await pool.query(
    `INSERT INTO agent_messages
       (run_id, session_id, workspace_id, seq, role, content, tool_calls, tool_call_id, name, prompt_tokens, completion_tokens)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      args.ctx.runId,
      args.ctx.sessionId,
      args.ctx.workspaceId,
      args.seq,
      args.role,
      args.content,
      args.toolCalls ? JSON.stringify(args.toolCalls) : null,
      args.toolCallId ?? null,
      args.name ?? null,
      args.promptTokens ?? null,
      args.completionTokens ?? null,
    ]
  );
}

// Trim oldest non-leading messages when over the context budget. The leading
// user message (the task) is always kept; dropped spans are replaced with a
// placeholder so the model knows history was elided.
function fitContext(messages: ChatMessage[]): ChatMessage[] {
  const total = messages.reduce((n, m) => n + m.content.length, 0);
  if (total <= CONTEXT_CHAR_BUDGET) return messages;
  const kept: ChatMessage[] = [];
  let dropped = 0;
  let budget = total;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const isProtected =
      i === 0 || // first task/user message
      i >= messages.length - 20 || // recent tail
      budget <= CONTEXT_CHAR_BUDGET;
    if (isProtected) {
      kept.push(m);
    } else {
      budget -= m.content.length;
      dropped += 1;
    }
  }
  if (dropped > 0) {
    kept.splice(1, 0, {
      role: "user",
      content: `[${dropped} earlier messages elided to fit the context window]`,
    });
  }
  return kept;
}

async function isCancelled(runId: string): Promise<boolean> {
  try {
    return (await redisConnection.exists(`agent-cancel:${runId}`)) === 1;
  } catch {
    return false;
  }
}

// Run the loop for an already-loaded run. `history` is the LLM-visible
// conversation (prior session turns + this run's messages, WITHOUT the
// system prompt — that's passed separately and rebuilt fresh per run).
export async function runAgentLoop(args: {
  run: RunRow;
  systemPrompt: string;
  history: ChatMessage[];
}): Promise<RunResult> {
  const { run } = args;
  const ctx: AgentContext = {
    workspaceId: run.workspace_id,
    runId: run.id,
    sessionId: run.session_id,
    kind: run.kind,
    reportId: run.report_id,
  };
  const policy = RUN_POLICY[run.kind];
  const defs = getTools(policy.tools);
  const schemas = toolSchemas(defs);
  const defsByName = new Map(defs.map((d) => [d.name, d]));
  const provider = getProvider();
  const model =
    run.model ?? (policy.model === "heavy" ? env.HEAVY_MODEL : env.AGENT_MODEL);
  const operation = run.kind === "report" ? "report" : run.kind === "reflect" ? "reflect" : "agent";

  const startedAt = Date.now();
  let iterations = run.iterations;
  let costMicros = BigInt(run.cost_usd_micros);
  const capMicros = BigInt(run.cost_cap_usd_micros);
  let consecutiveFailures = 0;
  let seq = await nextSeq(run.id);
  let messages: ChatMessage[] = [...args.history];
  let finalText = "";

  emitAgentEvent({ type: "run.started", runId: run.id });

  while (true) {
    // --- guards ------------------------------------------------------------
    if (iterations >= run.max_iterations) {
      finalText =
        finalText ||
        "I hit my step limit for this task. Here's where I got to — ask me to continue if you'd like me to keep going.";
      await persistMessage({ ctx, seq: seq++, role: "assistant", content: finalText });
      return { status: "done", finalText };
    }
    if (costMicros >= capMicros) {
      return {
        status: "paused_budget",
        finalText,
        error: `run cost cap reached ($${(Number(capMicros) / 1e6).toFixed(2)})`,
      };
    }
    if (Date.now() - startedAt > policy.wallClockMs) {
      return { status: "failed", finalText, error: "run wall-clock ceiling reached" };
    }
    if (await isCancelled(run.id)) {
      return { status: "cancelled", finalText };
    }

    // --- one LLM turn --------------------------------------------------------
    iterations += 1;
    let turn;
    try {
      turn = await provider.complete({
        workspaceId: run.workspace_id,
        operation,
        model,
        messages: fitContext([
          { role: "system", content: args.systemPrompt },
          ...messages,
        ]),
        tools: schemas,
        maxTokens: run.kind === "chat" ? CHAT_MAX_OUTPUT_TOKENS : MAX_OUTPUT_TOKENS,
        onDelta: (delta) =>
          emitAgentEvent({ type: "assistant.delta", runId: run.id, seq, delta }),
      });
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        return { status: "paused_budget", finalText, error: err.message };
      }
      const message = err instanceof Error ? err.message : String(err);
      return { status: "failed", finalText, error: `LLM call failed: ${message}` };
    }

    costMicros += BigInt(turn.costUsdMicros);
    await pool.query(
      "UPDATE agent_runs SET iterations = $2, cost_usd_micros = $3 WHERE id = $1",
      [run.id, iterations, costMicros.toString()]
    );
    emitAgentEvent({
      type: "cost.updated",
      runId: run.id,
      costUsdMicros: Number(costMicros),
    });

    const assistantSeq = seq++;
    await persistMessage({
      ctx,
      seq: assistantSeq,
      role: "assistant",
      content: turn.content,
      toolCalls: turn.toolCalls.length > 0 ? turn.toolCalls : undefined,
      promptTokens: turn.usage?.prompt_tokens,
      completionTokens: turn.usage?.completion_tokens,
    });
    messages.push({
      role: "assistant",
      content: turn.content,
      tool_calls: turn.toolCalls.length > 0 ? turn.toolCalls : undefined,
    });

    // --- final answer? -------------------------------------------------------
    if (turn.toolCalls.length === 0) {
      finalText = turn.content;
      return { status: "done", finalText };
    }

    // --- execute tool calls (parallel, never throws) -------------------------
    for (const tc of turn.toolCalls) {
      emitAgentEvent({
        type: "tool.call",
        runId: run.id,
        seq: assistantSeq,
        toolCallId: tc.id,
        name: tc.function.name,
        args: safeParse(tc.function.arguments),
      });
    }
    const results = await Promise.all(
      turn.toolCalls.map((tc) =>
        executeTool(defsByName.get(tc.function.name), tc.function.name, tc.function.arguments, ctx)
      )
    );

    let allFailed = true;
    for (let i = 0; i < turn.toolCalls.length; i++) {
      const tc = turn.toolCalls[i];
      const { result, isError } = results[i];
      if (!isError) allFailed = false;
      const toolSeq = seq++;
      await persistMessage({
        ctx,
        seq: toolSeq,
        role: "tool",
        content: result,
        toolCallId: tc.id,
        name: tc.function.name,
      });
      messages.push({
        role: "tool",
        content: result,
        tool_call_id: tc.id,
        name: tc.function.name,
      });
      emitAgentEvent({
        type: "tool.result",
        runId: run.id,
        seq: toolSeq,
        toolCallId: tc.id,
        name: tc.function.name,
        result: result.slice(0, 500),
      });
    }

    // --- failure tracking -----------------------------------------------------
    if (allFailed) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= FAIL_AFTER_FAILURES) {
        return {
          status: "failed",
          finalText,
          error: "tool calls failed repeatedly — aborting run",
        };
      }
      if (consecutiveFailures === NUDGE_AFTER_FAILURES) {
        const nudge =
          "Your recent tool calls all failed (see the error messages above). Fix the arguments based on the errors, try a different tool, or answer with what you already have.";
        await persistMessage({ ctx, seq: seq++, role: "user", content: nudge });
        messages.push({ role: "user", content: nudge });
      }
    } else {
      consecutiveFailures = 0;
    }
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
