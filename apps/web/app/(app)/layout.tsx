import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { auth, signOut } from "@/auth";
import SidebarNav from "@/components/SidebarNav";
import AppShell from "@/components/AppShell";
import { apiGet } from "@/lib/api";
import { isWorkspaceAdmin } from "@/lib/admin";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Seed the nav badges from the server so they're right on first paint;
  // SidebarNav then polls for updates. Non-fatal if the count fetch fails.
  let initialBadges: Record<string, number> = {};
  try {
    const b = await apiGet<{ openAlerts: number; pendingSkills: number }>(
      "/api/nav-badges"
    );
    initialBadges = { "/alerts": b.openAlerts, "/skills": b.pendingSkills };
  } catch {
    // Leave badges empty — the nav still renders.
  }

  const admin = await isWorkspaceAdmin();

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  const sidebar = (
    <>
      <Link href="/chat" className="mb-6 flex items-center gap-2 px-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark.jpg" alt="MentaAgent" className="h-7 w-7 rounded-lg object-cover" />
        <span className="text-base font-semibold tracking-tight">MentaAgent</span>
      </Link>
      <SidebarNav initialBadges={initialBadges} isAdmin={admin} />
      <div className="mt-auto border-t border-neutral-200 pt-3">
        <p className="truncate px-2 text-xs text-neutral-500">{session.user.email}</p>
        <form action={logout}>
          <button
            type="submit"
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-900"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </form>
      </div>
    </>
  );

  return <AppShell sidebar={sidebar}>{children}</AppShell>;
}
