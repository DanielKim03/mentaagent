import type { FastifyInstance } from "fastify";
import { pool } from "../db/client.js";

// Counts for the sidebar nav badges, so the owner sees at a glance when there
// is something to act on: open alerts to solve, and skills the analyst has
// proposed and is waiting on. Cheap (two filtered COUNTs); polled by the nav.
export async function notificationsRoutes(app: FastifyInstance) {
  app.get("/api/nav-badges", async (req) => {
    const { rows } = await pool.query<{
      open_alerts: string;
      pending_skills: string;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM alerts
            WHERE workspace_id = $1 AND status = 'open')::text       AS open_alerts,
         (SELECT COUNT(*) FROM skills
            WHERE workspace_id = $1 AND status = 'proposed')::text    AS pending_skills`,
      [req.workspaceId]
    );
    return {
      openAlerts: Number(rows[0]?.open_alerts ?? "0"),
      pendingSkills: Number(rows[0]?.pending_skills ?? "0"),
    };
  });
}
