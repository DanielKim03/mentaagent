import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/client.js";
import { setStubScript } from "../src/services/agent/provider.js";
import { runAgentLoop } from "../src/services/agent/loop.js";
import "../src/services/agent/tools/index.js";

// DB-backed loop test (Mentapath convention: random-UUID workspace, cascade
// cleanup, never calls a paid LLM — the stub provider is scripted per test).

const ws = randomUUID();

function call(name: string, args: object) {
  return {
    id: `tc_${randomUUID().slice(0, 8)}`,
    type: "function" as const,
    function: { name, arguments: JSON.stringify(args) },
  };
}

async function makeRun(kind: string): Promise<{
  id: string;
  workspace_id: string;
  session_id: string | null;
  kind: never;
  iterations: number;
  max_iterations: number;
  cost_cap_usd_micros: string;
  cost_usd_micros: string;
  report_id: string | null;
  model: string | null;
}> {
  const { rows } = await pool.query(
    `INSERT INTO agent_runs (workspace_id, kind, max_iterations, cost_cap_usd_micros)
     VALUES ($1, $2, 12, 100000)
     RETURNING id, workspace_id, session_id, kind, iterations, max_iterations,
               cost_cap_usd_micros::text, cost_usd_micros::text, report_id, model`,
    [ws, kind]
  );
  return rows[0];
}

beforeAll(async () => {
  await pool.query("INSERT INTO workspaces (id, name) VALUES ($1, 'loop-test')", [
    ws,
  ]);
});

afterAll(async () => {
  setStubScript(null);
  await pool.query("DELETE FROM workspaces WHERE id = $1", [ws]);
  await pool.end();
});

describe("agent loop", () => {
  it("executes tool calls, persists the transcript, and finishes", async () => {
    setStubScript([
      {
        content: "",
        toolCalls: [
          call("remember", {
            action: "add",
            category: "business_facts",
            content: "Revenue is seasonal: 60% lands in Q4.",
          }),
        ],
      },
      { content: "Saved that for next time." },
    ]);

    const run = await makeRun("chat");
    const result = await runAgentLoop({
      run,
      systemPrompt: "test system prompt",
      history: [{ role: "user", content: "Remember that my revenue is seasonal." }],
    });

    expect(result.status).toBe("done");
    expect(result.finalText).toBe("Saved that for next time.");

    // Transcript persisted: assistant w/ tool_calls, tool result, final.
    const { rows: messages } = await pool.query(
      "SELECT role, content, tool_calls FROM agent_messages WHERE run_id = $1 ORDER BY seq",
      [run.id]
    );
    expect(messages.map((m) => m.role)).toEqual(["assistant", "tool", "assistant"]);
    expect(messages[1].content).toContain("saved");

    // Memory row landed, scoped to this workspace.
    const { rows: memory } = await pool.query(
      "SELECT category, content FROM workspace_memory WHERE workspace_id = $1",
      [ws]
    );
    expect(memory).toHaveLength(1);
    expect(memory[0].category).toBe("business_facts");
  });

  it("returns validation errors to the model and lets it self-correct", async () => {
    setStubScript([
      // Bad category → tool returns a zod error as the result.
      {
        content: "",
        toolCalls: [
          call("remember", { action: "add", category: "nonsense", content: "x" }),
        ],
      },
      { content: "Understood, that category was invalid." },
    ]);

    const run = await makeRun("chat");
    const result = await runAgentLoop({
      run,
      systemPrompt: "test",
      history: [{ role: "user", content: "test self-correction" }],
    });

    expect(result.status).toBe("done");
    const { rows } = await pool.query(
      "SELECT content FROM agent_messages WHERE run_id = $1 AND role = 'tool'",
      [run.id]
    );
    expect(rows[0].content).toContain("invalid arguments");
  });

  it("enforces alert quality gates (dedup against open alerts)", async () => {
    const alertArgs = {
      type: "risk",
      severity: "high",
      title: "Top customer is 60% of revenue this year",
      description:
        "Acme Corp accounts for 60% of revenue per the sales spreadsheet — heavy concentration risk.",
      recommended_action: "Diversify: target two new accounts this quarter.",
    };
    setStubScript([
      { content: "", toolCalls: [call("create_alert", alertArgs)] },
      // Same finding again — must be rejected by trigram dedup.
      { content: "", toolCalls: [call("create_alert", alertArgs)] },
      { content: "Filed one finding; the duplicate was suppressed." },
    ]);

    const run = await makeRun("monitor");
    const result = await runAgentLoop({
      run,
      systemPrompt: "test",
      history: [{ role: "user", content: "review the business" }],
    });

    expect(result.status).toBe("done");
    const { rows } = await pool.query(
      "SELECT title FROM alerts WHERE workspace_id = $1",
      [ws]
    );
    expect(rows).toHaveLength(1);

    const { rows: toolResults } = await pool.query(
      "SELECT content FROM agent_messages WHERE run_id = $1 AND role = 'tool' ORDER BY seq",
      [run.id]
    );
    expect(toolResults[0].content).toContain("created");
    expect(toolResults[1].content).toContain("already covers this");
  });

  it("blocks tools outside the run kind's whitelist", async () => {
    // reflect runs may not search business data.
    setStubScript([
      { content: "", toolCalls: [call("search_business_data", { query: "revenue" })] },
      { content: "NOTHING_TO_SAVE" },
    ]);

    const run = await makeRun("reflect");
    const result = await runAgentLoop({
      run,
      systemPrompt: "test",
      history: [{ role: "user", content: "transcript..." }],
    });

    expect(result.status).toBe("done");
    const { rows } = await pool.query(
      "SELECT content FROM agent_messages WHERE run_id = $1 AND role = 'tool'",
      [run.id]
    );
    expect(rows[0].content).toContain("unknown tool");
  });

  it("respects the memory char budget with a consolidate error", async () => {
    const big = "x".repeat(1400);
    setStubScript([
      {
        content: "",
        toolCalls: [
          call("remember", { action: "add", category: "owner_preferences", content: big.slice(0, 490) }),
        ],
      },
      {
        content: "",
        toolCalls: [
          call("remember", { action: "add", category: "owner_preferences", content: big.slice(0, 490) }),
        ],
      },
      {
        content: "",
        toolCalls: [
          call("remember", { action: "add", category: "owner_preferences", content: big.slice(0, 490) }),
        ],
      },
      {
        content: "",
        toolCalls: [
          call("remember", { action: "add", category: "owner_preferences", content: big.slice(0, 490) }),
        ],
      },
      { content: "done" },
    ]);

    const run = await makeRun("chat");
    await runAgentLoop({
      run,
      systemPrompt: "test",
      history: [{ role: "user", content: "save a lot" }],
    });

    // owner_preferences budget is 1500 chars → the 4th add must be rejected.
    const { rows } = await pool.query(
      "SELECT content FROM agent_messages WHERE run_id = $1 AND role = 'tool' ORDER BY seq DESC LIMIT 1",
      [run.id]
    );
    expect(rows[0].content).toContain("over budget");
  });
});
