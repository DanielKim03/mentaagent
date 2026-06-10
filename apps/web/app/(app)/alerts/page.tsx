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
};

export default async function AlertsPage() {
  const { alerts } = await apiGet<{ alerts: Alert[] }>("/api/alerts");
  const open = alerts.filter((a) => a.status === "open");
  const resolved = alerts.filter((a) => a.status === "resolved");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Alerts</h1>
        <p className="text-sm text-neutral-500">
          Risks, opportunities, and actions your analyst found in your data.
        </p>
      </div>
      <div className="space-y-3">
        {open.length === 0 && (
          <p className="text-sm text-neutral-500">
            No open findings. Your analyst reviews your data on a schedule and
            will flag anything new.
          </p>
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
  );
}
