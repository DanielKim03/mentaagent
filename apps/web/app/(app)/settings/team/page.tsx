import { InviteForm } from "@/components/InviteForm";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { inviteUser, revokeUser, sendPasswordLink } from "./actions";

// Admin-only. requireAdmin() redirects members away. The whole feature is a
// Pro/Max capability — a free workspace has seat_limit 1, so invites are
// blocked in the action even though an admin can open this page.
export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  email: string;
  role: string;
  last_seen_at: Date | null;
};

export default async function TeamPage() {
  const admin = await requireAdmin();

  const { rows: seatRows } = await pool.query<{
    seat_limit: number | null;
    plan: string;
  }>("SELECT seat_limit, plan FROM workspaces WHERE id = $1", [
    admin.workspaceId,
  ]);
  const seatLimit = seatRows[0]?.seat_limit ?? 1;
  const plan = seatRows[0]?.plan ?? "free";

  const { rows: users } = await pool.query<UserRow>(
    `SELECT u.id, u.email, m.role, u.last_seen_at
       FROM memberships m
       JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = $1
      ORDER BY m.created_at ASC`,
    [admin.workspaceId]
  );

  const seatsUsed = users.length;
  const atLimit = seatLimit !== null && seatsUsed >= seatLimit;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Add teammates to this workspace. They sign in and can chat, read, and
          upload data. You&apos;re the workspace admin — only you can change
          settings, manage the team, and handle billing.
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          {plan === "free"
            ? "The free plan is single-user. Upgrade to Pro or Max to invite teammates."
            : `${seatsUsed} of ${seatLimit} seats used.`}
        </p>
      </div>

      {!atLimit && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-700">
            Add a teammate
          </h2>
          <InviteForm invite={inviteUser} />
        </section>
      )}

      <section className="mt-10 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-700">
          Members · {seatsUsed}
        </h2>
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Last seen</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {users.map((u) => (
                <UserRowView key={u.id} user={u} isSelf={u.id === admin.userId} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function UserRowView({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const sendLink = async () => {
    "use server";
    await sendPasswordLink(user.email);
  };
  const revoke = async () => {
    "use server";
    await revokeUser(user.id);
  };

  const setupNeeded = user.last_seen_at == null;

  return (
    <tr>
      <td className="px-4 py-2 font-mono text-xs">
        {user.email}
        {isSelf && (
          <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
            you
          </span>
        )}
      </td>
      <td className="px-4 py-2 text-xs capitalize">{user.role}</td>
      <td className="px-4 py-2 text-xs text-neutral-500">
        {user.last_seen_at
          ? new Date(user.last_seen_at).toLocaleString()
          : "never"}
      </td>
      <td className="px-4 py-2 text-right">
        <div className="flex justify-end gap-2 text-xs">
          {!isSelf && (
            <>
              <form action={sendLink}>
                <button
                  type="submit"
                  className="rounded-md border border-neutral-200 px-2 py-1 hover:bg-neutral-100"
                >
                  {setupNeeded ? "Send setup link" : "Send reset link"}
                </button>
              </form>
              <form action={revoke}>
                <button
                  type="submit"
                  className="rounded-md border border-red-300 bg-red-50 px-2 py-1 font-medium text-red-700 hover:bg-red-100"
                  title="Remove this teammate from the workspace"
                >
                  Remove
                </button>
              </form>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
