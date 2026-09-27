"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  MessageSquare,
  FileBarChart,
  Bell,
  Database,
  Share2,
  Brain,
  BookOpen,
  Building2,
  KeyRound,
} from "lucide-react";

type Badges = Record<string, number>;

// `badgeTone` items show a count pill when their badge > 0. Alerts are
// problems to solve (red); proposed skills are pending review (neutral).
const NAV = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/alerts", label: "Alerts", icon: Bell, badgeTone: "bg-red-500" },
  { href: "/sources", label: "Data", icon: Database },
  { href: "/graph", label: "Graph", icon: Share2 },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/skills", label: "Skills", icon: BookOpen, badgeTone: "bg-neutral-300" },
  { href: "/onboarding", label: "Profile", icon: Building2 },
  { href: "/settings", label: "Model & API key", icon: KeyRound },
];

export default function SidebarNav({
  initialBadges = {},
}: {
  initialBadges?: Badges;
}) {
  const pathname = usePathname();
  const [badges, setBadges] = useState<Badges>(initialBadges);

  // Seeded by the server render (no flash). Poll so an alert filed in the
  // background — e.g. by the on-upload review — shows up without a reload, and
  // re-check on navigation so counts settle right after the owner acts on one.
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch("/api/proxy/api/nav-badges", { cache: "no-store" });
        if (!res.ok) return;
        const b = (await res.json()) as { openAlerts: number; pendingSkills: number };
        if (!cancelled) {
          setBadges({ "/alerts": b.openAlerts, "/skills": b.pendingSkills });
        }
      } catch {
        // Keep the last known counts if the check fails.
      }
    }
    void refresh();
    const id = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pathname]);

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        const count = badges[item.href] ?? 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-neutral-200 text-neutral-900"
                : "text-neutral-600 hover:bg-neutral-200/60 hover:text-neutral-900"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span className="flex-1 truncate">{item.label}</span>
            {count > 0 && (
              <span
                aria-label={`${count} new`}
                className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-5 text-white ${item.badgeTone ?? "bg-neutral-300"}`}
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
