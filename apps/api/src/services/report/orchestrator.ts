import { env } from "../../env.js";
import { pool } from "../../db/client.js";
import { callLLM, getChatClient } from "../llm/client.js";
import { runAgentLoop, type RunResult } from "../agent/loop.js";
import { buildSystemPrompt, loadWorkspaceProfile } from "../agent/prompts.js";
import { dimensionsForProfile, type Dimension } from "./rubric.js";
import { llmConfig } from "../llm/settings.js";

// Report orchestration: ONE agent run (one cost cap, one transcript) walks
// the rubric dimensions SEQUENTIALLY, but each dimension starts from a fresh
// task message instead of carrying the previous dimension's tool chatter —
// that per-dimension context reset is how 7 investigations fit in a 131K
// window. The executive summary is synthesized from the written sections on
// the heavy model (quality matters most there).

export async function createReport(args: {
  workspaceId: string;
  createdBy?: string | null;
  period?: "manual" | "weekly" | "monthly";
}): Promise<{ reportId: string; runId: string }> {
  const profile = await loadWorkspaceProfile(args.workspaceId);
  const dims = dimensionsForProfile(profile.business_profile ?? {});

  const period = args.period ?? "manual";
  const prefix =
    period === "weekly"
      ? "Weekly Business Health Report"
      : period === "monthly"
        ? "Monthly Business Health Report"
        : "Business Health Report";

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO reports (workspace_id, title, rubric, period)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      args.workspaceId,
      `${prefix} — ${new Date().toISOString().slice(0, 10)}`,
      JSON.stringify({ dimensions: dims.map((d) => d.key) }),
      period,
    ]
  );
  const reportId = rows[0].id;

  for (let i = 0; i < dims.length; i++) {
    await pool.query(
      `INSERT INTO report_sections (report_id, section_key, title, position)
       VALUES ($1, $2, $3, $4)`,
      [reportId, dims[i].key, dims[i].title, i + 1]
    );
  }

  // The run is created by the caller (createAgentRun with kind=report and
  // this reportId); circular-import-free seam.
  return { reportId, runId: "" };
}

function dimensionTask(dim: Dimension): string {
  return `Investigate the "${dim.title}" dimension of this business (section_key: ${dim.key}).

${dim.guidance}

Steps: check the skills catalog for a relevant playbook (use_skill), inventory the available data (list_documents / search_business_data), read what matters, compute real numbers with aggregate_table / run_calculation, then call write_report_section once with section_key "${dim.key}" — markdown findings with citations, and a 0-100 score. If the data needed for this dimension simply wasn't shared, that IS the finding: score low and state exactly what to upload or connect. Then reply "SECTION COMPLETE".`;
}

type ReportRunRow = {
  id: string;
  workspace_id: string;
  session_id: string | null;
  kind: "report";
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

export async function runReportOrchestration(
  run: ReportRunRow
): Promise<RunResult> {
  if (!run.report_id) {
    return { status: "failed", finalText: "", error: "report run without report_id" };
  }

  const systemPrompt = await buildSystemPrompt({
    workspaceId: run.workspace_id,
    kind: "report",
    sessionId: null,
  });

  const profile = await loadWorkspaceProfile(run.workspace_id);
  const dims = dimensionsForProfile(profile.business_profile ?? {});

  for (const dim of dims) {
    // Skip already-written sections (resume after a failure re-runs only
    // what's pending).
    const { rows } = await pool.query<{ status: string }>(
      "SELECT status FROM report_sections WHERE report_id = $1 AND section_key = $2",
      [run.report_id, dim.key]
    );
    if (rows.length === 0 || rows[0].status === "written") continue;

    const task = dimensionTask(dim);
    await pool.query(
      `INSERT INTO agent_messages (run_id, session_id, workspace_id, seq, role, content)
       VALUES ($1, NULL, $2, $3, 'user', $4)`,
      [run.id, run.workspace_id, await nextSeq(run.id), task]
    );

    // Fresh per-dimension context: only this dimension's task message.
    const result = await runAgentLoop({
      // Carry both counters forward from the database: each dimension's loop
      // starts from them, so a stale cost would reset the run's total and let
      // every dimension spend up to the whole report cap.
      run: { ...run, ...(await currentProgress(run.id)) },
      systemPrompt,
      history: [{ role: "user", content: task }],
    });

    if (result.status !== "done") {
      // Cap/failure mid-report: mark what we have; the report stays
      // resumable (pending sections re-run on retry).
      await finalizeReport(run, /* partial */ true);
      return result;
    }

    // Some models finish a dimension by writing their findings as a reply
    // instead of calling write_report_section, which left the section empty
    // while the report showed "ready" (seen with DeepSeek, 2026-09-28). Ask
    // once more in the same context; if the section is still empty, keep the
    // findings the model did write rather than a hole in the report.
    if (await sectionPending(run.report_id, dim.key)) {
      const nudge =
        `You wrote your findings but did not save them. Call write_report_section now ` +
        `for section_key "${dim.key}" with those findings as markdown and a 0-100 score, ` +
        `then say "SECTION COMPLETE".`;
      await pool.query(
        `INSERT INTO agent_messages (run_id, session_id, workspace_id, seq, role, content)
         VALUES ($1, NULL, $2, $3, 'user', $4)`,
        [run.id, run.workspace_id, await nextSeq(run.id), nudge]
      );
      const retry = await runAgentLoop({
        run: { ...run, ...(await currentProgress(run.id)) },
        systemPrompt,
        history: [
          { role: "user", content: task },
          { role: "assistant", content: result.finalText },
          { role: "user", content: nudge },
        ],
      });
      if (retry.status !== "done") {
        await finalizeReport(run, /* partial */ true);
        return retry;
      }
      if (await sectionPending(run.report_id, dim.key)) {
        await pool.query(
          `UPDATE report_sections SET content_md = $3, status = 'written'
            WHERE report_id = $1 AND section_key = $2 AND status = 'pending'`,
          [
            run.report_id,
            dim.key,
            result.finalText.trim() || "This section could not be completed.",
          ]
        );
      }
    }
  }

  await writeExecutiveSummary(run);
  await finalizeReport(run, false);
  return { status: "done", finalText: "Report complete." };
}

async function sectionPending(reportId: string | null, key: string): Promise<boolean> {
  const { rows } = await pool.query<{ status: string }>(
    "SELECT status FROM report_sections WHERE report_id = $1 AND section_key = $2",
    [reportId, key]
  );
  return rows[0]?.status === "pending";
}

async function currentProgress(
  runId: string
): Promise<{ iterations: number; cost_usd_micros: string }> {
  const { rows } = await pool.query<{ iterations: number; cost_usd_micros: string }>(
    "SELECT iterations, cost_usd_micros::text FROM agent_runs WHERE id = $1",
    [runId]
  );
  return {
    iterations: rows[0]?.iterations ?? 0,
    cost_usd_micros: rows[0]?.cost_usd_micros ?? "0",
  };
}

async function writeExecutiveSummary(run: ReportRunRow): Promise<void> {
  const { rows: sections } = await pool.query<{
    title: string;
    content_md: string;
    score: number | null;
  }>(
    `SELECT title, content_md, score FROM report_sections
      WHERE report_id = $1 AND status = 'written' AND section_key <> 'executive_summary'
      ORDER BY position`,
    [run.report_id]
  );
  if (sections.length === 0) return;

  let summaryMd: string;
  if (getChatClient()) {
    const sectionText = sections
      .map((s) => `## ${s.title} (score ${s.score ?? "n/a"})\n${s.content_md}`)
      .join("\n\n")
      .slice(0, 60_000);
    const { completion } = await callLLM({
      workspaceId: run.workspace_id,
      operation: "report",
      params: {
        model: llmConfig().heavyModel,
        max_tokens: 6000,
        messages: [
          {
            role: "system",
            content:
              "You write the executive summary of a small-business health report from its section findings. Output markdown: 2-3 sentences of overall assessment, then a '## Top 5 gaps' numbered list — each gap one line with its consequence and the single next action. Direct, concrete, no filler.",
          },
          { role: "user", content: sectionText },
        ],
      },
      timeoutMs: 120_000,
    });
    summaryMd = completion.choices[0]?.message?.content ?? "";
  } else {
    summaryMd =
      "## Top gaps\n" +
      sections
        .filter((s) => (s.score ?? 100) < 70)
        .slice(0, 5)
        .map((s, i) => `${i + 1}. ${s.title} scored ${s.score} — see section for details.`)
        .join("\n");
  }

  await pool.query(
    `INSERT INTO report_sections (report_id, section_key, title, position, content_md, status)
     VALUES ($1, 'executive_summary', 'Executive Summary', 0, $2, 'written')
     ON CONFLICT (report_id, section_key)
     DO UPDATE SET content_md = EXCLUDED.content_md, status = 'written'`,
    [run.report_id, summaryMd]
  );
}

async function finalizeReport(run: ReportRunRow, partial: boolean): Promise<void> {
  const { rows } = await pool.query<{ avg: string | null; pending: string }>(
    `SELECT AVG(score)::text AS avg,
            COUNT(*) FILTER (WHERE status = 'pending')::text AS pending
       FROM report_sections
      WHERE report_id = $1 AND section_key <> 'executive_summary'`,
    [run.report_id]
  );
  const overall = rows[0].avg ? Math.round(Number(rows[0].avg)) : null;
  await pool.query(
    `UPDATE reports SET status = $2, overall_score = $3 WHERE id = $1`,
    [run.report_id, partial && Number(rows[0].pending) > 0 ? "failed" : "ready", overall]
  );
}
