"use client";

import { useState, type ReactNode } from "react";
import { FileText, TriangleAlert } from "lucide-react";

// A canned, no-backend preview of the product for the landing page (ported in
// spirit from Mentapath's LandingDemo, re-themed for MentaAgent): left = a
// gap-analysis "business health" card, right = the analyst answering sample
// questions with citations. Everything here is illustrative — clicking a
// question just swaps the canned answer; nothing hits the API.

type Sample = {
  question: string;
  answer: ReactNode;
  citations: string[];
};

const SAMPLES: Sample[] = [
  {
    question: "What's my single biggest risk right now?",
    answer: (
      <>
        <p className="text-sm leading-relaxed text-neutral-800">
          Customer concentration. <strong>Acme Robotics</strong> is{" "}
          <strong>38%</strong> of trailing revenue — if they churned, runway
          drops from <strong>16 months</strong> to{" "}
          <span className="font-medium text-red-600">~5</span>. No other client
          is above 12%.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-800">
          The two Q2 deals in your pipeline would bring Acme under 30% — worth
          prioritizing.
        </p>
      </>
    ),
    citations: ["Q1-revenue-by-client.xlsx", "cash-runway-2026Q1.pdf"],
  },
  {
    question: "Where is spending creeping up?",
    answer: (
      <>
        <p className="text-sm leading-relaxed text-neutral-800">
          <strong>Software / SaaS</strong> is your fastest-growing cost — up{" "}
          <strong>64%</strong> YoY ($3.2K → $5.2K/mo), now <strong>19%</strong>{" "}
          of operating expense. Three tools overlap on analytics.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-800">
          Consolidating them would save about <strong>$1.8K/mo</strong>.
        </p>
      </>
    ),
    citations: ["expenses-2026.xlsx", "vendor-list.csv"],
  },
  {
    question: "Is my Pro plan priced right?",
    answer: (
      <>
        <p className="text-sm leading-relaxed text-neutral-800">
          Your <strong>Pro</strong> plan margin is <strong>71%</strong> — above
          the ~55% typical for this category — yet it&apos;s <strong>40%</strong>{" "}
          cheaper than the two competitors in your notes.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-800">
          12 of your last 15 signups chose Pro, so there&apos;s room to raise
          price or add a higher tier.
        </p>
      </>
    ),
    citations: ["pricing-model.xlsx", "competitor-notes.pdf"],
  },
];

const DIMENSIONS = [
  { label: "Finance", score: 72 },
  { label: "Customers", score: 48 },
  { label: "Contracts", score: 65 },
  { label: "Operations", score: 81 },
  { label: "Marketing", score: 39 },
];

const GAPS = [
  { text: "Customer concentration — Acme is 38% of revenue", severity: "high" as const },
  { text: "No renewal owner on 2 expiring contracts", severity: "medium" as const },
];

const REVENUE = [
  { label: "Nov", value: 31 },
  { label: "Dec", value: 36 },
  { label: "Jan", value: 42 },
  { label: "Feb", value: 51 },
  { label: "Mar", value: 61 },
  { label: "Apr", value: 64 },
];

export function LandingDemo() {
  const [activeIdx, setActiveIdx] = useState(0);
  const sample = SAMPLES[activeIdx];

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 shadow-sm">
      <div className="grid gap-0 lg:grid-cols-5">
        {/* Left: gap-analysis report card — mirrors the real /reports view */}
        <div className="border-b border-neutral-200 p-6 lg:col-span-3 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2 font-mono text-[11px] text-neutral-500">
            <FileText className="h-3 w-3" />
            reports/business-health · Q1 2026
          </div>

          <h3 className="mt-2 text-xl font-semibold">Business health</h3>
          <p className="mt-1 text-sm text-neutral-600">
            Scored across seven dimensions, with the top gaps surfaced.
          </p>

          <div className="mt-4 space-y-2.5">
            {DIMENSIONS.map((d) => (
              <ScoreBar key={d.label} label={d.label} score={d.score} />
            ))}
          </div>

          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Revenue — last 6 months ($K)
          </h4>
          <BarChart data={REVENUE} />

          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Top gaps
          </h4>
          <ul className="mt-2 space-y-1.5">
            {GAPS.map((g) => (
              <li key={g.text} className="flex items-start gap-2 text-sm text-neutral-700">
                <TriangleAlert
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    g.severity === "high" ? "text-red-500" : "text-amber-500"
                  }`}
                />
                {g.text}
              </li>
            ))}
          </ul>
        </div>

        {/* Right: ask panel — mirrors the real chat */}
        <div className="flex flex-col bg-neutral-50/60 p-6 lg:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Ask your analyst
          </div>

          <div className="mt-3 space-y-2">
            {SAMPLES.map((s, i) => (
              <button
                key={s.question}
                type="button"
                onClick={() => setActiveIdx(i)}
                aria-pressed={i === activeIdx}
                className={`w-full rounded-lg border px-3 py-2 text-left text-xs leading-snug transition-colors ${
                  i === activeIdx
                    ? "border-neutral-900 bg-white text-stone-950 shadow-sm"
                    : "border-neutral-200 bg-neutral-100 text-neutral-700 hover:border-neutral-400"
                }`}
              >
                {s.question}
              </button>
            ))}
          </div>

          {/* User bubble — replays the active question */}
          <div className="mt-5 flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-white px-3 py-2 text-xs text-stone-950">
              {sample.question}
            </div>
          </div>

          {/* Assistant bubble */}
          <div className="mt-3 rounded-2xl rounded-bl-sm border border-neutral-200 bg-neutral-100 p-4 shadow-sm">
            {sample.answer}

            <div className="mt-3 border-t border-neutral-100 pt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                Sources
              </div>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {sample.citations.map((c) => (
                  <li key={c}>
                    <Cite>{c}</Cite>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-auto pt-6 text-[11px] text-neutral-500">
            Every answer cites the file it came from. No invented numbers.
          </div>
        </div>
      </div>
    </div>
  );
}

function Cite({ children }: { children: ReactNode }) {
  // Inert in the demo — this is just the visual style of a real citation.
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-600">
      <FileText className="h-2.5 w-2.5" />
      {children}
    </span>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const tone =
    score >= 75 ? "bg-green-500" : score >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-neutral-600">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${score}%` }} />
      </div>
      <span className="w-7 shrink-0 text-right text-xs tabular-nums text-neutral-500">
        {score}
      </span>
    </div>
  );
}

function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const W = 320;
  const H = 140;
  const PAD_L = 28;
  const PAD_R = 8;
  const PAD_T = 16;
  const PAD_B = 22;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const max = Math.ceil(Math.max(...data.map((d) => d.value)) / 10) * 10;
  const step = innerW / data.length;
  const barW = step * 0.6;
  const yTicks = [0, max / 2, max];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-2 h-36 w-full"
      role="img"
      aria-label="Monthly revenue bar chart"
    >
      {yTicks.map((t) => {
        const y = PAD_T + innerH - (t / max) * innerH;
        return (
          <g key={t}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y}
              y2={y}
              stroke="currentColor"
              className="text-neutral-200"
              strokeWidth="1"
            />
            <text
              x={PAD_L - 6}
              y={y + 3}
              textAnchor="end"
              fontSize="9"
              className="fill-neutral-500"
            >
              {t}
            </text>
          </g>
        );
      })}

      {data.map((d, i) => {
        const x = PAD_L + i * step + (step - barW) / 2;
        const h = (d.value / max) * innerH;
        const y = PAD_T + innerH - h;
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={barW} height={h} rx={2} className="fill-neutral-900" />
            <text
              x={x + barW / 2}
              y={y - 4}
              textAnchor="middle"
              fontSize="9"
              className="fill-neutral-600"
            >
              {d.value}
            </text>
            <text
              x={x + barW / 2}
              y={H - 6}
              textAnchor="middle"
              fontSize="10"
              className="fill-neutral-500"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
