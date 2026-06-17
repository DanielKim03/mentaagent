"use client";

import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";

// Click-to-select pricing (ported from Mentapath's PricingTable). The previous
// landing page hard-highlighted Pro; here the owner picks the plan and the
// highlight + CTA follow their choice. Pro is the default selection.
type Plan = {
  id: "free" | "pro" | "max";
  name: string;
  price: string;
  tagline: string;
  features: string[];
  cta: string;
  href: string;
};

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    tagline: "Kick the tires",
    features: ["4 files + 8 questions", "Chat with your analyst", "1 seat"],
    cta: "Get started free",
    href: "/signup",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$10/mo",
    tagline: "For an owner who wants answers",
    features: [
      "Generous upload limits",
      "Full health reports",
      "Weekly monitoring + alerts",
      "Up to 5 seats",
    ],
    cta: "Choose Pro",
    href: "/signup?plan=pro",
  },
  {
    id: "max",
    name: "Max",
    price: "$40/mo",
    tagline: "Heavier use, more team",
    features: ["~4× the monthly allowance", "Everything in Pro", "Up to 25 seats"],
    cta: "Choose Max",
    href: "/signup?plan=max",
  },
];

export function PricingTable() {
  const [selectedId, setSelectedId] = useState<Plan["id"]>("pro");

  return (
    <div className="mt-8 grid gap-4 md:grid-cols-3">
      {PLANS.map((p) => {
        const selected = p.id === selectedId;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelectedId(p.id)}
            aria-pressed={selected}
            className={`flex flex-col rounded-2xl border p-6 text-left transition-all ${
              selected
                ? "border-neutral-900 shadow-sm ring-2 ring-neutral-900/10"
                : "border-neutral-200 hover:border-neutral-400"
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{p.name}</h3>
              {selected && (
                <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-800">
                  Selected
                </span>
              )}
            </div>
            <div className="mt-2 text-2xl font-semibold">{p.price}</div>
            <p className="mt-1 text-sm text-neutral-500">{p.tagline}</p>
            <ul className="mt-4 flex-1 space-y-2 text-sm">
              {p.features.map((feat) => (
                <li key={feat} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-neutral-900" />
                  {feat}
                </li>
              ))}
            </ul>
            <Link
              href={p.href}
              onClick={(e) => e.stopPropagation()}
              className={`mt-6 block rounded-md px-4 py-2 text-center text-sm font-medium transition-colors ${
                selected
                  ? "bg-white text-stone-950 hover:bg-stone-200"
                  : "border border-neutral-300 bg-neutral-100 text-neutral-900 hover:bg-neutral-50"
              }`}
            >
              {p.cta}
            </Link>
          </button>
        );
      })}
    </div>
  );
}
