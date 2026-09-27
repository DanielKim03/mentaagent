import Link from "next/link";
import SidebarNav from "@/components/SidebarNav";
import AppShell from "@/components/AppShell";
import { apiGet } from "@/lib/api";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  // Until a model key is set the agent gives canned stub answers; say so on
  // every page and point at where the key goes.
  let hasKey = true;
  try {
    const s = await apiGet<{ effective: { hasChatKey: boolean } }>("/api/settings/llm");
    hasKey = s.effective.hasChatKey;
  } catch {
    // Unknown: show no banner rather than a wrong one.
  }

  const sidebar = (
    <>
      <Link href="/chat" className="mb-6 flex items-center gap-2 px-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark.jpg" alt="MentaAgent" className="h-7 w-7 rounded-lg object-cover" />
        <span className="text-base font-semibold tracking-tight">MentaAgent</span>
      </Link>
      <SidebarNav initialBadges={initialBadges} />
    </>
  );

  const notice = hasKey ? null : (
    <>
      No model API key yet, so answers are canned examples.{" "}
      <Link href="/settings" className="font-medium text-neutral-900 underline">
        Add a key
      </Link>
    </>
  );

  return (
    <AppShell sidebar={sidebar} notice={notice}>
      {children}
    </AppShell>
  );
}
