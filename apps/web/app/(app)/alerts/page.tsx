import AlertCard from "@/components/AlertCard";
import { apiGet } from "@/lib/api";

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

export default async function AlertsPage() {
  const { alerts } = await apiGet<{ alerts: Alert[] }>("/api/alerts");
  const open = alerts.filter((a) => a.status === "open");
  const resolved = alerts.filter((a) => a.status === "resolved");
  const dismissed = alerts.filter((a) => a.status === "dismissed");

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Risks, opportunities, and actions your analyst found in your data.
          Tap “Ask about this” to dig into any of them in chat.
        </p>
      </div>

      <div className="space-y-3">
        {open.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
            No open findings. Your analyst reviews your data on a schedule and
            will flag anything new.
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

      {dismissed.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-500">Dismissed</h2>
          <p className="text-xs text-neutral-400">
            Dismissed alerts stay here for 24 hours in case you change your
            mind, then they&apos;re removed automatically.
          </p>
          <div className="space-y-3 opacity-75">
            {dismissed.map((a) => (
              <AlertCard key={a.id} alert={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
