import { pool } from "../../db/client.js";
import { env } from "../../env.js";
import { escapeHtml, isMailerConfigured, sendEmail } from "../../lib/mailer.js";

// Imminent-alert email notifications (ported from Mentapath). Email is a
// scarce channel: the owner sees every alert in-app (and in the nav badge), so
// we only push email when a business problem is about to happen — an alert's
// due_at entering a small window. Severity alone never triggers email, and
// undated alerts never reach the inbox.

export const NOTIFY_WINDOW_DAYS = 5;
// A deadline that slipped past before it was ever notified still gets one
// email for up to this many days; anything more overdue is history the owner
// can find in-app.
export const OVERDUE_GRACE_DAYS = 2;

export type DueAlert = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  severity: string;
  title: string;
  description: string | null;
  due_at: Date;
};

// Atomically claim (stamp notified_at on) every open, dated, never-notified
// alert whose deadline is inside the notify window. The UPDATE *is* the claim,
// so two concurrent sweeps can't both pick up the same alert.
export async function claimDueAlerts(): Promise<DueAlert[]> {
  const { rows } = await pool.query<DueAlert>(
    `UPDATE alerts a
        SET notified_at = NOW()
       FROM workspaces w
      WHERE w.id = a.workspace_id
        AND a.status = 'open'
        AND a.notified_at IS NULL
        AND a.due_at IS NOT NULL
        AND a.due_at >= NOW() - make_interval(days => $1)
        AND a.due_at <= NOW() + make_interval(days => $2)
      RETURNING a.id, a.workspace_id, w.name AS workspace_name,
                a.severity, a.title, a.description, a.due_at`,
    [OVERDUE_GRACE_DAYS, NOTIFY_WINDOW_DAYS]
  );
  return rows;
}

// Release a failed batch so the next sweep retries it.
export async function unclaimAlerts(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await pool.query("UPDATE alerts SET notified_at = NULL WHERE id = ANY($1::uuid[])", [
    ids,
  ]);
}

// Workspace members who haven't opted out of alert emails.
async function alertRecipients(workspaceId: string): Promise<string[]> {
  const { rows } = await pool.query<{ email: string }>(
    `SELECT u.email
       FROM memberships m
       JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = $1 AND u.alert_emails = TRUE AND u.email IS NOT NULL
      ORDER BY u.email
      LIMIT 50`,
    [workspaceId]
  );
  return rows.map((r) => r.email);
}

export function duePhrase(due: Date, now: Date = new Date()): string {
  const days = Math.round((due.getTime() - now.getTime()) / 86_400_000);
  if (days < -1) return `overdue by ${-days} days`;
  if (days === -1) return "overdue by 1 day";
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
};

export function renderAlertEmail(
  workspaceName: string,
  alerts: DueAlert[],
  now: Date = new Date()
): { subject: string; html: string } {
  const subject =
    alerts.length === 1
      ? `${alerts[0].title} — ${duePhrase(alerts[0].due_at, now)}`
      : `${alerts.length} deadlines approaching in ${workspaceName}`;

  const items = alerts
    .map((a) => {
      const color = SEVERITY_COLORS[a.severity] ?? "#737373";
      const dateLabel = a.due_at.toISOString().slice(0, 10);
      const desc = (a.description ?? "").slice(0, 280);
      return `<li style="margin:0 0 16px">
          <div style="font-weight:600;color:#111">${escapeHtml(a.title)}</div>
          <div style="font-size:13px;margin-top:2px">
            <span style="color:${color};text-transform:uppercase;font-size:11px;letter-spacing:0.05em">${escapeHtml(a.severity)}</span>
            <span style="color:#555"> · ${escapeHtml(duePhrase(a.due_at, now))} (${dateLabel})</span>
          </div>
          ${desc ? `<div style="font-size:13px;color:#444;margin-top:4px">${escapeHtml(desc)}</div>` : ""}
        </li>`;
    })
    .join("");

  const origin = env.WEB_ORIGIN[0] ?? "http://localhost:3000";
  const html = `
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#171717">
      <p style="font-weight:600;font-size:18px;margin:0 0 4px">MentaAgent</p>
      <h2 style="margin:0 0 4px;font-size:18px">Deadlines approaching</h2>
      <p style="margin:0 0 16px;color:#555;font-size:13px">${escapeHtml(workspaceName)}</p>
      <ul style="list-style:none;padding:0;margin:0 0 20px">${items}</ul>
      <a href="${origin}/alerts" style="display:inline-block;background:#171717;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:14px">Review alerts →</a>
      <p style="margin:24px 0 0;color:#888;font-size:12px">
        You're a member of ${escapeHtml(workspaceName)} on MentaAgent and one of these has a deadline coming up.
      </p>
    </div>`;
  return { subject, html };
}

export type ImminentSweepResult = {
  claimed: number;
  emailed: number;
  workspaces: number;
  failed: number;
};

// One sweep: claim due alerts, group by workspace, email opted-in members.
// Driven by the maintenance tick. No-ops when the mailer isn't configured —
// checked BEFORE claiming so we never mark an alert notified with no email
// actually sent.
export async function runImminentAlertSweep(): Promise<ImminentSweepResult> {
  if (!isMailerConfigured()) {
    return { claimed: 0, emailed: 0, workspaces: 0, failed: 0 };
  }

  const claimed = await claimDueAlerts();
  if (claimed.length === 0) {
    return { claimed: 0, emailed: 0, workspaces: 0, failed: 0 };
  }

  const byWorkspace = new Map<string, DueAlert[]>();
  for (const alert of claimed) {
    const list = byWorkspace.get(alert.workspace_id) ?? [];
    list.push(alert);
    byWorkspace.set(alert.workspace_id, list);
  }

  let emailed = 0;
  let failed = 0;
  for (const [workspaceId, alerts] of byWorkspace) {
    const recipients = await alertRecipients(workspaceId);
    if (recipients.length === 0) {
      // Everyone opted out — the claim stands (alerts stay visible in-app).
      continue;
    }
    const { subject, html } = renderAlertEmail(alerts[0].workspace_name, alerts);
    try {
      await sendEmail({ to: recipients, subject, html });
      emailed += alerts.length;
      await pool.query(
        `INSERT INTO activity_log (workspace_id, action, description, details)
         VALUES ($1, 'notify', $2, $3)`,
        [
          workspaceId,
          `Emailed ${recipients.length} member(s) about ${alerts.length} imminent alert(s)`,
          JSON.stringify({ alert_ids: alerts.map((a) => a.id), recipients: recipients.length }),
        ]
      );
    } catch (err) {
      // Release the batch so the next sweep retries it.
      failed += alerts.length;
      await unclaimAlerts(alerts.map((a) => a.id));
      console.error(
        `[notify] alert email failed for workspace ${workspaceId}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return { claimed: claimed.length, emailed, workspaces: byWorkspace.size, failed };
}
