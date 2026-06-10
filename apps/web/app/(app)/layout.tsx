import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";

const NAV = [
  { href: "/chat", label: "Chat" },
  { href: "/reports", label: "Reports" },
  { href: "/alerts", label: "Alerts" },
  { href: "/sources", label: "Data" },
  { href: "/memory", label: "Memory" },
  { href: "/skills", label: "Skills" },
  { href: "/onboarding", label: "Profile" },
];

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

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-52 shrink-0 flex-col border-r border-neutral-200 p-4 dark:border-neutral-800">
        <Link href="/chat" className="mb-6 text-lg font-bold">
          MentaAgent
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-4 text-xs text-neutral-500">
          <p className="truncate">{session.user.email}</p>
          <form action={logout}>
            <button type="submit" className="mt-1 underline">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
