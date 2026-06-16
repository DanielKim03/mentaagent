import { env } from "../../env.js";
import { pool } from "../../db/client.js";
import { escapeHtml, isMailerConfigured, sendEmail } from "../../lib/mailer.js";

// Emails a finished report to the workspace's members. Best-effort: if Resend
// isn't configured (no key) or there are no opted-in recipients, this no-ops
// — the report still lives in the Reports section regardless.

function scoreColor(score: number | null): string {
  if (score === null) return "#737373";
  if (score >= 70) return "#16a34a";
  if (score >= 40) return "#d97706";
  return "#dc2626";
}

export async function emailReport(reportId: string): Promise<void> {
  if (!isMailerConfigured()) return;

  const { rows } = await pool.query<{
    workspace_id: string;
    title: string;
    status: string;
    overall_score: number | null;
  }>(
    "SELECT workspace_id, title, status, overall_score FROM reports WHERE id = $1",
    [reportId]
  );
  const report = rows[0];
  if (!report || report.status !== "ready") return;

  // Recipients: workspace members who haven't opted out of emails.
  const { rows: people } = await pool.query<{ email: string }>(
    `SELECT u.email FROM memberships m
       JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = $1 AND u.alert_emails = TRUE AND u.email IS NOT NULL`,
    [report.workspace_id]
  );
  if (people.length === 0) return;

  const { rows: summary } = await pool.query<{ content_md: string }>(
    `SELECT content_md FROM report_sections
      WHERE report_id = $1 AND section_key = 'executive_summary' AND status = 'written'`,
    [reportId]
  );
  // Light markdown → HTML for the email body (headings + list items + bold).
  const summaryHtml = (summary[0]?.content_md ?? "")
    .split("\n")
    .map((line) => {
      const l = escapeHtml(line.trim());
      if (!l) return "";
      if (l.startsWith("## ")) return `<h3 style="margin:16px 0 6px">${l.slice(3)}</h3>`;
      if (/^\d+\.\s/.test(l)) return `<div style="margin:3px 0">${l}</div>`;
      if (l.startsWith("- ")) return `<div style="margin:3px 0">• ${l.slice(2)}</div>`;
      return `<p style="margin:6px 0">${l}</p>`;
    })
    .join("")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  const url = `${env.WEB_ORIGIN[0] ?? "http://localhost:3000"}/reports/${reportId}`;
  const score = report.overall_score;

  const html = `
  <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#171717">
    <p style="font-weight:600;font-size:18px;margin:0 0 4px">MentaAgent</p>
    <h2 style="margin:0 0 12px">${escapeHtml(report.title)}</h2>
    ${
      score !== null
        ? `<div style="display:inline-block;background:${scoreColor(score)};color:#fff;font-weight:700;border-radius:9999px;padding:6px 16px;font-size:16px">Overall ${score}/100</div>`
        : ""
    }
    <div style="margin-top:16px;font-size:14px;line-height:1.5">${summaryHtml}</div>
    <a href="${url}" style="display:inline-block;margin-top:20px;background:#171717;color:#fff;text-decoration:none;border-radius:8px;padding:10px 18px;font-weight:600">View the full report →</a>
    <p style="margin-top:24px;font-size:12px;color:#737373">Your AI business analyst runs this automatically. Manage emails in your settings.</p>
  </div>`;

  try {
    await sendEmail({
      to: people.map((p) => p.email),
      subject: report.title,
      html,
    });
  } catch (err) {
    // Email failure must not affect the report itself.
    console.error("[report-email] send failed:", err);
  }
}
