"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  FileBarChart,
  Bell,
  Database,
  Share2,
  Brain,
  BookOpen,
  Settings,
  CreditCard,
} from "lucide-react";

const NAV = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/sources", label: "Data", icon: Database },
  { href: "/graph", label: "Graph", icon: Share2 },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/skills", label: "Skills", icon: BookOpen },
  { href: "/onboarding", label: "Profile", icon: Settings },
  { href: "/settings/billing", label: "Billing", icon: CreditCard },
];

export default function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
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
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
