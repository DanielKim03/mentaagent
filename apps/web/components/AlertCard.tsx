"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare, RotateCcw } from "lucide-react";

type Alert = {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string | null;
  recommended_action: string | null;
  status: string;
  due_at: string | null;
  outcome: string | null;
  dismissed_at: string | null;
};

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-amber-100 text-amber-700",
  medium: "bg-blue-100 text-blue-700",
};

// Hours left before a dismissed alert is auto-purged (24h after dismissal).
function hoursLeft(dismissedAt: string | null): number | null {
  if (!dismissedAt) return null;
  const ms = 24 * 3600 * 1000 - (Date.now() - new Date(dismissedAt).getTime());
  return Math.max(0, Math.ceil(ms / 3600_000));
}

export default function AlertCard({ alert }: { alert: Alert }) {
  const [outcome, setOutcome] = useState("");
  const [showOutcome, setShowOutcome] = useState(false);
  const router = useRouter();

  async function patch(body: Record<string, string>) {
    await fetch(`/api/proxy/api/alerts/${alert.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
  }

  // Pre-fills a chat question about this specific alert, connecting the two.
  const askHref = `/chat?ask=${encodeURIComponent(
    `About this alert — "${alert.title}"${alert.description ? `: ${alert.description}` : ""}. Walk me through the evidence in my data and tell me exactly what to do about it.`
  )}`;

  const left = hoursLeft(alert.dismissed_at);

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-100 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{alert.title}</p>
          {alert.description && (
            <p className="mt-1 text-sm text-neutral-600">{alert.description}</p>
          )}
          {alert.recommended_action && (
            <p className="mt-2 text-sm">
              <span className="font-medium text-neutral-900">Do this:</span>{" "}
              {alert.recommended_action}
            </p>
          )}
          {alert.due_at && (
            <p className="mt-1 text-xs text-neutral-500">
              Due {new Date(alert.due_at).toLocaleDateString()}
            </p>
          )}
          {alert.outcome && (
            <p className="mt-2 rounded-lg bg-green-50 p-2 text-sm text-green-700">
              ✓ {alert.outcome}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_TONE[alert.severity] ?? "bg-neutral-100 text-neutral-600"}`}
        >
          {alert.severity}
        </span>
      </div>

      {alert.status === "open" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <Link
            href={askHref}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-medium text-stone-950 transition-colors hover:bg-stone-200"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Ask about this
          </Link>
          <button
            onClick={() => setShowOutcome((v) => !v)}
            className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-1.5 font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
          >
            I acted on this
          </button>
          <button
            onClick={() => void patch({ status: "dismissed" })}
            className="rounded-lg px-3 py-1.5 text-neutral-500 transition-colors hover:bg-neutral-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {alert.status === "dismissed" && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <button
            onClick={() => void patch({ status: "open" })}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-1.5 font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restore
          </button>
          {left !== null && (
            <span className="text-xs text-neutral-400">
              {left === 0 ? "removing soon" : `auto-removes in ~${left}h`}
            </span>
          )}
        </div>
      )}

      {showOutcome && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (outcome.trim()) {
              void patch({ status: "resolved", outcome: outcome.trim() });
            }
          }}
          className="mt-2 flex gap-2"
        >
          <input
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder="What happened? (e.g. renegotiated the contract, saved $400/mo)"
            className="flex-1 rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-stone-950 transition-colors hover:bg-stone-200"
          >
            Save
          </button>
        </form>
      )}
    </div>
  );
}
