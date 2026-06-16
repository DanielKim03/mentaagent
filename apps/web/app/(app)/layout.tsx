import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { auth, signOut } from "@/auth";
import SidebarNav from "@/components/SidebarNav";
import AppShell from "@/components/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  const sidebar = (
    <>
      <Link href="/chat" className="mb-6 flex items-center gap-2 px-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-900 text-sm font-bold text-white">
          M
        </span>
        <span className="text-base font-semibold tracking-tight">MentaAgent</span>
      </Link>
      <SidebarNav />
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
