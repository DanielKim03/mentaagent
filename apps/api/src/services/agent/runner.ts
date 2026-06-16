import { pool } from "../../db/client.js";
import { agentQueue } from "../../queue/queue.js";
import { emitAgentEvent } from "../../queue/events.js";
import { runReportOrchestration } from "../report/orchestrator.js";
import { emailReport } from "../report/email.js";
import { buildSystemPrompt } from "./prompts.js";
import { runAgentLoop } from "./loop.js";
import type { ChatMessage, NormalizedToolCall, RunKind } from "./types.js";
import { RUN_POLICY } from "./types.js";
// Tools self-register on import.
import "./tools/index.js";

// Create a run (+ optional seed user message) and enqueue it. The single
// entry point used by routes (chat turns, report requests) and schedulers
// (monitor, reflect, consolidate).
export async function createAgentRun(args: {
  workspaceId: string;
  kind: RunKind;
  sessionId?: string | null;
  userMessage?: string;
  trigger?: "user" | "schedule" | "system";
  reportId?: string | null;
  model?: string | null;
}): Promise<{ runId: string }> {
  const policy = RUN_POLICY[args.kind];
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO agent_runs
       (workspace_id, session_id, kind, trigger, max_iterations, cost_cap_usd_micros, report_id, model)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      args.workspaceId,
      args.sessionId ?? null,
      args.kind,
      args.trigger ?? "user",
      policy.maxIterations,
      policy.costCapUsdMicros,
      args.reportId ?? null,
      args.model ?? null,
    ]
  );
  const runId = rows[0].id;

  if (args.userMessage) {
    await pool.query(
      `INSERT INTO agent_messages (run_id, session_id, workspace_id, seq, role, content)
       VALUES ($1, $2, $3, 0, 'user', $4)`,
      [runId, args.sessionId ?? null, args.workspaceId, args.userMessage]
    );
  }

  await agentQueue.add("run", { runId, workspaceId: args.workspaceId });
  return { runId };
}

type MessageRow = {
  run_id: string;
  seq: number;
  role: ChatMessage["role"];
  content: string;
  tool_calls: NormalizedToolCall[] | null;
  tool_call_id: string | null;
  name: string | null;
};

// LLM-visible history for a run:
//  - chat: prior runs in the session contribute only their user/assistant
//    text (tool chatter from finished turns stays in the DB, out of context);
//    the CURRENT run contributes everything (handles resume mid-loop).
//  - other kinds: just this run's messages.
async function buildHistory(run: {
  id: string;
  session_id: string | null;
  kind: RunKind;
}): Promise<ChatMessage[]> {
  const { rows } = await pool.query<MessageRow>(
    run.kind === "chat" && run.session_id
      ? `SELECT m.run_id, m.seq, m.role, m.content, m.tool_calls, m.tool_call_id, m.name
           FROM agent_messages m
           JOIN agent_runs r ON r.id = m.run_id
          WHERE m.session_id = $1
          ORDER BY r.created_at, m.seq`
      : `SELECT run_id, seq, role, content, tool_calls, tool_call_id, name
           FROM agent_messages
          WHERE run_id = $1
          ORDER BY seq`,
    [run.kind === "chat" && run.session_id ? run.session_id : run.id]
  );

  const history: ChatMessage[] = [];
  for (const m of rows) {
    const isCurrentRun = m.run_id === run.id;
    if (!isCurrentRun) {
      if (m.role !== "user" && m.role !== "assistant") continue;
      if (m.role === "assistant" && !m.content) continue; // pure tool-call turns
      history.push({ role: m.role, content: m.content });
      continue;
    }
    history.push({
      role: m.role,
      content: m.content,
      tool_calls: m.tool_calls ?? undefined,
      tool_call_id: m.tool_call_id ?? undefined,
      name: m.name ?? undefined,
    });
  }
  return history;
}

// BullMQ processor for the agent queue. Loads the run, executes the loop,
// records the terminal state. Model/tool misbehavior never throws — only
// infrastructure errors do (and the queue won't retry; attempts: 1).
export async function handleAgentJob(data: {
  runId: string;
  workspaceId: string;
}): Promise<void> {
  const { rows } = await pool.query(
    `SELECT id, workspace_id, session_id, kind, trigger, iterations, max_iterations,
            cost_cap_usd_micros::text, cost_usd_micros::text, report_id, model, status
       FROM agent_runs WHERE id = $1 AND workspace_id = $2`,
    [data.runId, data.workspaceId]
  );
  if (rows.length === 0) {
    console.error(`[agent] run not found: ${data.runId}`);
    return;
  }
  const run = rows[0];
  if (run.status !== "queued" && run.status !== "running") {
    // Re-enqueued terminal run (e.g. duplicate job) — nothing to do.
    return;
  }

  await pool.query(
    "UPDATE agent_runs SET status = 'running', started_at = COALESCE(started_at, NOW()) WHERE id = $1",
    [run.id]
  );

  let result;
  try {
    if (run.kind === "report") {
      // Reports walk rubric dimensions with per-dimension context resets —
      // the orchestrator drives the loop itself.
      result = await runReportOrchestration(run);
    } else {
      const systemPrompt = await buildSystemPrompt({
        workspaceId: run.workspace_id,
        kind: run.kind,
        sessionId: run.session_id,
      });
      const history = await buildHistory(run);
      result = await runAgentLoop({ run, systemPrompt, history });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result = { status: "failed" as const, finalText: "", error: message };
  }

  await pool.query(
    `UPDATE agent_runs SET status = $2, error = $3, finished_at = NOW() WHERE id = $1`,
    [run.id, result.status, result.error ?? null]
  );

  switch (result.status) {
    case "done":
      emitAgentEvent({
        type: "run.finished",
        runId: run.id,
        content: result.finalText,
      });
      break;
    case "paused_budget":
      emitAgentEvent({
        type: "run.paused",
        runId: run.id,
        reason: result.error ?? "budget exceeded",
      });
      break;
    case "cancelled":
      emitAgentEvent({ type: "run.failed", runId: run.id, error: "cancelled" });
      break;
    default:
      emitAgentEvent({
        type: "run.failed",
        runId: run.id,
        error: result.error ?? "unknown error",
      });
  }

  await afterRun(run, result.status, result.finalText);
}

// Post-run hooks: reflect runs write the session summary; chat sessions get
// titled from their first user message; finished scheduled reports get
// emailed to the workspace's members.
async function afterRun(
  run: {
    id: string;
    workspace_id: string;
    session_id: string | null;
    kind: RunKind;
    trigger?: string;
    report_id?: string | null;
  },
  status: string,
  finalText: string
): Promise<void> {
  if (run.kind === "reflect" && run.session_id && status === "done") {
    const summary =
      finalText.trim() === "NOTHING_TO_SAVE" ? null : finalText.trim().slice(0, 500);
    await pool.query(
      "UPDATE agent_sessions SET summary = $2, summarized_at = NOW() WHERE id = $1",
      [run.session_id, summary]
    );
  }
  if (run.kind === "chat" && run.session_id) {
    await pool.query(
      `UPDATE agent_sessions s
          SET title = LEFT((SELECT content FROM agent_messages
                             WHERE session_id = s.id AND role = 'user'
                             ORDER BY created_at, seq LIMIT 1), 80)
        WHERE s.id = $1 AND s.title IS NULL`,
      [run.session_id]
    );
  }
  if (run.kind === "report" && run.report_id) {
    if (status === "done") {
      // Scheduled reports get emailed to the workspace's members once ready.
      if (run.trigger === "schedule") {
        await emailReport(run.report_id).catch((err) =>
          console.error("[runner] report email failed:", err)
        );
      }
    } else {
      // A crashed/cancelled report run must not leave the report stuck in
      // 'generating' (that would block future reports for this workspace).
      await pool.query(
        "UPDATE reports SET status = 'failed' WHERE id = $1 AND status = 'generating'",
        [run.report_id]
      );
    }
  }
}

// Reflect over an idle chat session: feed the transcript (conversation text
// only — tool noise and DOCUMENT CONTENT stay out, that's the prompt-
// injection firewall for memory writes) to a reflect run.
export async function enqueueReflectForSession(
  workspaceId: string,
  sessionId: string
): Promise<void> {
  const { rows } = await pool.query<{ role: string; content: string }>(
    `SELECT role, content FROM agent_messages
      WHERE session_id = $1 AND role IN ('user', 'assistant') AND content <> ''
      ORDER BY created_at, seq`,
    [sessionId]
  );
  if (rows.length < 2) {
    await pool.query(
      "UPDATE agent_sessions SET summarized_at = NOW() WHERE id = $1",
      [sessionId]
    );
    return;
  }
  const transcript = rows
    .map((r) => `${r.role === "user" ? "Owner" : "Menta"}: ${r.content}`)
    .join("\n\n")
    .slice(0, 60_000);
  await createAgentRun({
    workspaceId,
    kind: "reflect",
    sessionId,
    trigger: "system",
    userMessage: `Conversation transcript to review:\n\n${transcript}`,
  });
}
