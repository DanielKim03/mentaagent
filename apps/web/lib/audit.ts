import { pool } from "./db";

// Minimal audit logging into the shared activity_log table.
export async function logAudit(args: {
  workspaceId: string;
  actorUserId?: string | null;
  action: string;
  description?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO activity_log (workspace_id, action, description, details)
       VALUES ($1, $2, $3, $4)`,
      [
        args.workspaceId,
        args.action,
        args.description ?? null,
        JSON.stringify({ ...(args.details ?? {}), actor: args.actorUserId ?? null }),
      ]
    );
  } catch (err) {
    // Audit must never break the user-facing flow.
    console.error("[audit] failed:", err);
  }
}

export async function workspaceForUser(userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ workspace_id: string | null }>(
    "SELECT workspace_id FROM users WHERE id = $1",
    [userId]
  );
  return rows[0]?.workspace_id ?? null;
}
