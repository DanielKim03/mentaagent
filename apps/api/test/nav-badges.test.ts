import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/client.js";

// Locks the sidebar badge counts (mirrors routes/notifications.ts): only OPEN
// alerts and PROPOSED skills count — dismissed/resolved alerts and active
// skills must not. DB-backed, random-UUID workspace, no paid LLM.

const ws = randomUUID();

async function counts(): Promise<{ openAlerts: number; pendingSkills: number }> {
  const { rows } = await pool.query<{ open_alerts: string; pending_skills: string }>(
    `SELECT
       (SELECT COUNT(*) FROM alerts
          WHERE workspace_id = $1 AND status = 'open')::text    AS open_alerts,
       (SELECT COUNT(*) FROM skills
          WHERE workspace_id = $1 AND status = 'proposed')::text AS pending_skills`,
    [ws]
  );
  return {
    openAlerts: Number(rows[0].open_alerts),
    pendingSkills: Number(rows[0].pending_skills),
  };
}

beforeAll(async () => {
  await pool.query("INSERT INTO workspaces (id, name) VALUES ($1, 'nav-badge-test')", [ws]);
  await pool.query(
    `INSERT INTO alerts (workspace_id, alert_type, severity, title, status) VALUES
       ($1, 'suggestion:risk', 'high', 'Open one', 'open'),
       ($1, 'suggestion:risk', 'high', 'Open two', 'open'),
       ($1, 'suggestion:risk', 'high', 'Dismissed one', 'dismissed'),
       ($1, 'suggestion:risk', 'high', 'Resolved one', 'resolved')`,
    [ws]
  );
  await pool.query(
    `INSERT INTO skills (workspace_id, name, description, body, source, status) VALUES
       ($1, 'proposed-skill', 'd', 'b', 'agent', 'proposed'),
       ($1, 'active-skill', 'd', 'b', 'agent', 'active')`,
    [ws]
  );
});

afterAll(async () => {
  await pool.query("DELETE FROM workspaces WHERE id = $1", [ws]);
  await pool.end();
});

describe("nav badge counts", () => {
  it("counts only open alerts and proposed skills", async () => {
    const c = await counts();
    expect(c.openAlerts).toBe(2);
    expect(c.pendingSkills).toBe(1);
  });
});
