import AlertsView from "@/components/AlertsView";
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

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Risks, opportunities, and actions your analyst found in your data.
          Tap “Ask about this” to dig into any of them in chat.
        </p>
      </div>
      <AlertsView alerts={alerts} />
    </div>
  );
}
