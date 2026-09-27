import { pool } from "../../db/client.js";
import { callEmbeddings, getEmbeddingsClient } from "../llm/client.js";
import {
  createAgentRun,
  enqueueReflectForSession,
} from "../agent/runner.js";
import { backfillEntities } from "../graph/entities.js";
import { createReport } from "../report/orchestrator.js";

export { backfillEntities };

// Maintenance sweeps, driven by a single repeatable tick (Mentapath's
// digest-scheduler fan-out pattern). Each sweep is idempotent and gated on
// timestamps so a missed/double tick is harmless.

// Chat sessions idle >30min with new content since the last reflection →
// background reflect run (memory extraction + session summary).
export async function sweepIdleSessions(): Promise<number> {
  const { rows } = await pool.query<{ id: string; workspace_id: string }>(
    `SELECT s.id, s.workspace_id
       FROM agent_sessions s
      WHERE s.kind = 'chat'
        AND NOT EXISTS (SELECT 1 FROM agent_runs r
                         WHERE r.session_id = s.id AND r.status IN ('queued', 'running'))
        AND (SELECT MAX(m.created_at) FROM agent_messages m
              WHERE m.session_id = s.id AND m.role IN ('user', 'assistant'))
            < NOW() - INTERVAL '30 minutes'
        AND COALESCE(s.summarized_at, 'epoch'::timestamptz)
            < (SELECT MAX(m.created_at) FROM agent_messages m
                WHERE m.session_id = s.id AND m.role IN ('user', 'assistant'))
      LIMIT 20`
  );
  for (const s of rows) {
    await enqueueReflectForSession(s.workspace_id, s.id);
  }
  return rows.length;
}

// Weekly autonomous review per workspace that has data. The prompt carries
// the due watchlist items and what changed since the last sweep; the agent
// replies NOTHING_NOTEWORTHY (suppressed) or files deduped alerts.
export async function sweepMonitorRuns(): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT w.id FROM workspaces w
      WHERE COALESCE(w.last_monitor_at, 'epoch'::timestamptz) < NOW() - INTERVAL '7 days'
        AND EXISTS (SELECT 1 FROM documents d WHERE d.workspace_id = w.id)
      LIMIT 10`
  );
  for (const ws of rows) {
    const { rows: due } = await pool.query<{ text: string; cadence: string }>(
      `SELECT text, cadence FROM watch_items
        WHERE workspace_id = $1 AND next_due_at <= NOW()
        ORDER BY next_due_at LIMIT 25`,
      [ws.id]
    );
    const { rows: changed } = await pool.query<{ title: string }>(
      `SELECT d.title FROM documents d
        JOIN workspaces w ON w.id = d.workspace_id
       WHERE d.workspace_id = $1
         AND d.created_at > COALESCE(w.last_monitor_at, 'epoch'::timestamptz)
       LIMIT 25`,
      [ws.id]
    );

    const dueList = due.length
      ? `Due watchlist items:\n${due.map((d) => `- ${d.text} (${d.cadence})`).join("\n")}`
      : "No watchlist items are due.";
    const changedList = changed.length
      ? `Documents added/updated since the last review:\n${changed.map((d) => `- ${d.title}`).join("\n")}`
      : "No new documents since the last review.";

    await pool.query(
      "UPDATE workspaces SET last_monitor_at = NOW() WHERE id = $1",
      [ws.id]
    );
    await createAgentRun({
      workspaceId: ws.id,
      kind: "monitor",
      trigger: "schedule",
      userMessage: `Scheduled business review.\n\n${dueList}\n\n${changedList}\n\nCheck each due item, look at what changed, and file only genuinely new findings. Mark checked watchlist items complete with update_watchlist.`,
    });
  }
  return rows.length;
}

// Triggered right after a file finishes ingesting: review the freshly added
// data NOW (instead of waiting up to a week for the scheduled sweep) and file
// crucial fixes the owner should act on. Reuses the monitor run kind (it has
// create_alert + the read tools), so the same dedup/severity gates apply —
// including suppression of anything the owner already dismissed.
//
// Collapses a burst of uploads into ONE review: if a monitor run is already
// in flight for the workspace we skip, and the prompt covers everything added
// in the last day, so a multi-file drop is reviewed together. Does NOT touch
// last_monitor_at, so the weekly sweep's cadence is unaffected. Returns
// whether a review was enqueued.
export async function enqueueNewDataReview(workspaceId: string): Promise<boolean> {
  const { rows: active } = await pool.query(
    `SELECT 1 FROM agent_runs
      WHERE workspace_id = $1 AND kind = 'monitor' AND status IN ('queued', 'running')
      LIMIT 1`,
    [workspaceId]
  );
  if (active.length > 0) return false;

  const { rows: recent } = await pool.query<{ title: string }>(
    `SELECT title FROM documents
      WHERE workspace_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC LIMIT 25`,
    [workspaceId]
  );
  if (recent.length === 0) return false;

  const list = recent.map((d) => `- ${d.title}`).join("\n");
  await createAgentRun({
    workspaceId,
    kind: "monitor",
    trigger: "system",
    userMessage:
      `New business data was just added. Recently uploaded documents:\n${list}\n\n` +
      `Investigate this new data for crucial risks, issues, or fixes the owner should act on now — ` +
      `cross-check it against the existing data where useful. File only genuinely new, consequential ` +
      `findings with create_alert. Do NOT re-file anything already covered by an existing alert ` +
      `(including ones the owner has dismissed).`,
  });
  return true;
}

// Nightly memory consolidation (OpenClaw "dreaming", mandatory): one cheap
// run per workspace whose memory changed since the last consolidation.
export async function sweepConsolidation(): Promise<number> {
  const { rows } = await pool.query<{ workspace_id: string }>(
    `SELECT DISTINCT m.workspace_id
       FROM workspace_memory m
      WHERE m.updated_at > NOW() - INTERVAL '24 hours'
        AND NOT EXISTS (
          SELECT 1 FROM agent_runs r
           WHERE r.workspace_id = m.workspace_id AND r.kind = 'consolidate'
             AND r.created_at > NOW() - INTERVAL '20 hours')
      LIMIT 20`
  );
  for (const ws of rows) {
    await createAgentRun({
      workspaceId: ws.workspace_id,
      kind: "consolidate",
      trigger: "schedule",
      userMessage:
        "Run memory maintenance now: merge overlapping entries, drop stale ones, close resolved or expired open loops.",
    });
  }
  return rows.length;
}

// Embed backfill: chunks that missed embedding (provider hiccup, key added
// later) get re-tried until done. No-op without an embeddings key.
export async function sweepEmbedBackfill(): Promise<number> {
  if (!getEmbeddingsClient()) return 0;
  const { rows: hasCol } = await pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'chunks' AND column_name = 'embedding'`
  );
  if (hasCol.length === 0) return 0;

  const { rows } = await pool.query<{
    id: string;
    workspace_id: string;
    content: string;
  }>(
    `SELECT id, workspace_id, content FROM chunks
      WHERE embedding IS NULL ORDER BY created_at LIMIT 64`
  );
  if (rows.length === 0) return 0;

  // Group by workspace so budget metering lands on the right tenant.
  const byWorkspace = new Map<string, { id: string; content: string }[]>();
  for (const r of rows) {
    const list = byWorkspace.get(r.workspace_id) ?? [];
    list.push({ id: r.id, content: r.content });
    byWorkspace.set(r.workspace_id, list);
  }
  let embedded = 0;
  for (const [workspaceId, chunks] of byWorkspace) {
    try {
      const vectors = await callEmbeddings({
        workspaceId,
        input: chunks.map((c) => c.content),
      });
      for (let i = 0; i < chunks.length; i++) {
        await pool.query("UPDATE chunks SET embedding = $2 WHERE id = $1", [
          chunks[i].id,
          `[${vectors[i].join(",")}]`,
        ]);
        embedded += 1;
      }
    } catch (err) {
      console.error("[backfill] embed failed for workspace", workspaceId, err);
    }
  }
  return embedded;
}

// Auto-generate reports on a cadence. Monthly takes precedence over weekly
// (a monthly report also satisfies the week). The run is kind=report,
// trigger=schedule; when it finishes ready it's emailed to members
// (see runner afterRun). Stamped BEFORE enqueuing so a double tick can't
// double-generate.
export async function sweepScheduledReports(): Promise<number> {
  const { rows } = await pool.query<{
    id: string;
    monthly_due: boolean;
    weekly_due: boolean;
  }>(
    `SELECT w.id,
            (w.last_monthly_report_at IS NULL OR w.last_monthly_report_at < NOW() - INTERVAL '30 days') AS monthly_due,
            (w.last_weekly_report_at  IS NULL OR w.last_weekly_report_at  < NOW() - INTERVAL '7 days')  AS weekly_due
       FROM workspaces w
      WHERE EXISTS (SELECT 1 FROM documents d WHERE d.workspace_id = w.id)
        AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.workspace_id = w.id AND r.status = 'generating')
        AND ( (w.last_monthly_report_at IS NULL OR w.last_monthly_report_at < NOW() - INTERVAL '30 days')
           OR (w.last_weekly_report_at  IS NULL OR w.last_weekly_report_at  < NOW() - INTERVAL '7 days') )
      LIMIT 5`
  );
  let count = 0;
  for (const w of rows) {
    const period = w.monthly_due ? "monthly" : "weekly";
    if (period === "monthly") {
      await pool.query(
        "UPDATE workspaces SET last_monthly_report_at = NOW(), last_weekly_report_at = NOW() WHERE id = $1",
        [w.id]
      );
    } else {
      await pool.query(
        "UPDATE workspaces SET last_weekly_report_at = NOW() WHERE id = $1",
        [w.id]
      );
    }
    const { reportId } = await createReport({ workspaceId: w.id, period });
    const { runId } = await createAgentRun({
      workspaceId: w.id,
      kind: "report",
      trigger: "schedule",
      reportId,
    });
    await pool.query("UPDATE reports SET run_id = $2 WHERE id = $1", [reportId, runId]);
    count += 1;
  }
  return count;
}

// NOTE: dismissed alerts are intentionally NOT purged. They're kept as
// permanent tombstones so create_alert's dedup can suppress anything the owner
// already dismissed — re-surfacing a rejected finding is noise. They stay in
// the Dismissed section and remain restorable.
