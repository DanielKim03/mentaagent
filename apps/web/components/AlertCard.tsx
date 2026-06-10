"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
};

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  high: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  medium: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
};

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

  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{alert.title}</p>
          {alert.description && (
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              {alert.description}
            </p>
          )}
          {alert.recommended_action && (
            <p className="mt-2 text-sm">
              <span className="font-medium">Do this:</span>{" "}
              {alert.recommended_action}
            </p>
          )}
          {alert.due_at && (
            <p className="mt-1 text-xs text-neutral-500">
              Due {new Date(alert.due_at).toLocaleDateString()}
            </p>
          )}
          {alert.outcome && (
            <p className="mt-2 rounded-md bg-green-50 p-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
              Outcome: {alert.outcome}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${SEVERITY_TONE[alert.severity] ?? ""}`}
        >
          {alert.severity}
        </span>
      </div>
      {alert.status === "open" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <button
            onClick={() => setShowOutcome((v) => !v)}
            className="rounded-md border border-neutral-300 px-3 py-1 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            I acted on this
          </button>
          <button
            onClick={() => void patch({ status: "dismissed" })}
            className="rounded-md px-3 py-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Dismiss
          </button>
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
            className="flex-1 rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-sm dark:border-neutral-700"
          />
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white dark:bg-white dark:text-neutral-900"
          >
            Save
          </button>
        </form>
      )}
    </div>
  );
}
