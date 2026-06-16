"use client";

import { useState } from "react";
import AlertCard from "./AlertCard";

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

// Two clickable tabs: Alerts (open findings + wins) and Dismissed.
export default function AlertsView({ alerts }: { alerts: Alert[] }) {
  const [tab, setTab] = useState<"alerts" | "dismissed">("alerts");
  const open = alerts.filter((a) => a.status === "open");
  const resolved = alerts.filter((a) => a.status === "resolved");
  const dismissed = alerts.filter((a) => a.status === "dismissed");

  const tabBtn = (active: boolean) =>
    `rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
      active
        ? "bg-white text-neutral-900 shadow-sm"
        : "text-neutral-500 hover:text-neutral-900"
    }`;
  const count = (n: number) =>
    n > 0 ? (
      <span className="ml-1.5 rounded-full bg-neutral-200 px-1.5 text-xs text-neutral-600">
        {n}
      </span>
    ) : null;

  return (
    <div className="space-y-6">
      <div className="flex w-fit gap-1 rounded-lg border border-neutral-200 bg-neutral-100 p-1">
        <button onClick={() => setTab("alerts")} className={tabBtn(tab === "alerts")}>
          Alerts{count(open.length)}
        </button>
        <button onClick={() => setTab("dismissed")} className={tabBtn(tab === "dismissed")}>
          Dismissed{count(dismissed.length)}
        </button>
      </div>

      {tab === "alerts" ? (
        <div className="space-y-6">
          <div className="space-y-3">
            {open.length === 0 && (
              <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
                No open findings. Your analyst reviews your data on a schedule
                and will flag anything new here.
              </div>
            )}
            {open.map((a) => (
              <AlertCard key={a.id} alert={a} />
            ))}
          </div>
          {resolved.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Wins</h2>
              {resolved.map((a) => (
                <AlertCard key={a.id} alert={a} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-neutral-400">
            Dismissed alerts stay here for 24 hours in case you change your
            mind, then they&apos;re removed automatically. Restore any to bring
            it back to the Alerts tab.
          </p>
          {dismissed.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
              Nothing dismissed.
            </div>
          ) : (
            dismissed.map((a) => <AlertCard key={a.id} alert={a} />)
          )}
        </div>
      )}
    </div>
  );
}
