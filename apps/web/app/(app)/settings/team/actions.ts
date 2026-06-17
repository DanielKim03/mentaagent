"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { createPasswordToken, sendPasswordEmail } from "@/lib/password-tokens";
import { logAudit } from "@/lib/audit";

// Multi-user workspaces (Pro/Max) have exactly ONE admin: the person who
// created the workspace. Teammates are always invited as members — they can
// chat, read, and upload, but config/destructive actions are admin-only
// (enforced at the API trust boundary via requireAdminRole). So there is no
// role selector here; every invite is a member.
const INVITE_ROLE = "member" as const;

const emailSchema = z.string().trim().toLowerCase().email().max(320);

function origin(): string {
  const h = headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function inviteUser(
  formData: FormData
): Promise<{ ok: boolean; message: string; previewUrl?: string }> {
  const admin = await requireAdmin();
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { ok: false, message: "Enter a valid email address." };
  }
  const email = parsed.data;

  const client = await pool.connect();
  let userId: string;
  let isNewUser = false;
  try {
    await client.query("BEGIN");

    // Seat-limit guard. Lock the workspace row so two parallel invites can't
    // both squeeze under the limit. seat_limit is set by the Paddle plan sync
    // (free 1, pro 5, max 25), so a free workspace — already at its single
    // seat — is blocked here, which is the intended "Pro/Max only" gate.
    const seatRes = await client.query<{
      seat_limit: number | null;
      member_count: string;
    }>(
      `SELECT w.seat_limit,
              (SELECT COUNT(*)::text FROM memberships
                WHERE workspace_id = w.id) AS member_count
         FROM workspaces w
        WHERE w.id = $1
        FOR UPDATE`,
      [admin.workspaceId]
    );
    const seatLimit = seatRes.rows[0]?.seat_limit ?? null;
    const memberCount = Number(seatRes.rows[0]?.member_count ?? 0);
    if (seatLimit !== null && memberCount >= seatLimit) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        message: `Seat limit reached (${memberCount}/${seatLimit}). Upgrade your plan to add more teammates.`,
      };
    }

    // Look up or create the user. Multi-workspace: an existing email is fine —
    // we just add a membership row for this workspace.
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE lower(email) = $1",
      [email]
    );
    if (existing.rows[0]) {
      userId = existing.rows[0].id;
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO users (email, workspace_id, role)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [email, admin.workspaceId, INVITE_ROLE]
      );
      userId = inserted.rows[0].id;
      isNewUser = true;
    }

    // Idempotent membership upsert — re-inviting just keeps them a member.
    await client.query(
      `INSERT INTO memberships (user_id, workspace_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, workspace_id) DO UPDATE SET role = EXCLUDED.role`,
      [userId, admin.workspaceId, INVITE_ROLE]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  await logAudit({
    workspaceId: admin.workspaceId,
    actorUserId: admin.userId,
    action: "user.invited",
    description: email,
    details: { invited_user_id: userId, email, is_new_user: isNewUser },
  });

  // Only send a setup email when the user is brand-new (no password yet). An
  // existing user (already a member of another workspace) keeps their login.
  if (isNewUser) {
    const token = await createPasswordToken(email);
    const result = await sendPasswordEmail({
      email,
      token,
      origin: origin(),
      kind: "invite",
    });
    revalidatePath("/settings/team");
    if (!result.ok && !result.previewUrl) {
      return {
        ok: false,
        message: `Member added, but the email failed: ${result.error ?? "unknown"}`,
      };
    }
    if (result.previewUrl) {
      return {
        ok: true,
        message: `Added ${email}. No Resend key set — copy this link and send it to them:`,
        previewUrl: result.previewUrl,
      };
    }
    return { ok: true, message: `Added ${email}. Setup email sent.` };
  }

  revalidatePath("/settings/team");
  return {
    ok: true,
    message: `${email} now has access. They can sign in with their existing password.`,
  };
}

const idSchema = z.string().uuid();

export async function revokeUser(
  userId: string
): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin();
  const parsed = idSchema.safeParse(userId);
  if (!parsed.success) return { ok: false, message: "invalid user id" };
  if (parsed.data === admin.userId) {
    return { ok: false, message: "You can't remove your own admin account." };
  }

  const { rows: revoked } = await pool.query<{ email: string }>(
    "SELECT email FROM users WHERE id = $1",
    [parsed.data]
  );
  // Remove from THIS workspace only — the user keeps their account and any
  // other memberships.
  await pool.query(
    "DELETE FROM memberships WHERE user_id = $1 AND workspace_id = $2",
    [parsed.data, admin.workspaceId]
  );
  // If this was their currently-active workspace, repoint it at a remaining
  // membership (or null) so their next sign-in resolves correctly.
  await pool.query(
    `UPDATE users
        SET workspace_id = (
          SELECT workspace_id FROM memberships
           WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1
        )
      WHERE id = $1 AND workspace_id = $2`,
    [parsed.data, admin.workspaceId]
  );

  await logAudit({
    workspaceId: admin.workspaceId,
    actorUserId: admin.userId,
    action: "user.revoked",
    description: revoked[0]?.email ?? parsed.data,
    details: { revoked_user_id: parsed.data },
  });

  revalidatePath("/settings/team");
  return { ok: true, message: "Removed from workspace." };
}

// Re-sends a setup / reset link. Used by the button next to each teammate.
export async function sendPasswordLink(
  email: string
): Promise<{ ok: boolean; message: string; previewUrl?: string }> {
  const admin = await requireAdmin();
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { ok: false, message: "invalid email" };

  // Only allow sending links to members of THIS workspace.
  const { rows } = await pool.query<{ id: string; password_hash: string | null }>(
    `SELECT u.id, u.password_hash
       FROM users u
       JOIN memberships m ON m.user_id = u.id
      WHERE lower(u.email) = $1 AND m.workspace_id = $2`,
    [parsed.data, admin.workspaceId]
  );
  if (rows.length === 0) return { ok: false, message: "user not found" };

  const kind = rows[0].password_hash ? "reset" : "invite";
  const token = await createPasswordToken(parsed.data);
  const result = await sendPasswordEmail({
    email: parsed.data,
    token,
    origin: origin(),
    kind,
  });

  await logAudit({
    workspaceId: admin.workspaceId,
    actorUserId: admin.userId,
    action: "user.password_link_sent",
    description: parsed.data,
    details: { target_user_id: rows[0].id, kind },
  });

  if (!result.ok && !result.previewUrl) {
    return { ok: false, message: result.error ?? "failed to send" };
  }
  if (result.previewUrl) {
    return {
      ok: true,
      message: "No Resend key set — share this link manually:",
      previewUrl: result.previewUrl,
    };
  }
  return {
    ok: true,
    message: kind === "invite" ? "Setup link sent." : "Reset link sent.",
  };
}
