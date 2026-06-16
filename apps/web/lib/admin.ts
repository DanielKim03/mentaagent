import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

// Server-only gate for admin-only pages / server actions. Redirects
// non-admins away; the caller doesn't handle the rejection branch.
export async function requireAdmin(): Promise<{
  userId: string;
  email: string;
  workspaceId: string;
}> {
  const session = await auth();
  if (!session?.user?.id || !session.workspaceId) redirect("/login");
  const { rows } = await pool.query<{ role: string }>(
    "SELECT role FROM memberships WHERE user_id = $1 AND workspace_id = $2",
    [session.user.id, session.workspaceId]
  );
  if (rows[0]?.role !== "admin") redirect("/chat");
  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    workspaceId: session.workspaceId,
  };
}
