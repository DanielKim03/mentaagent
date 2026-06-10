import Link from "next/link";
import GenerateReportButton from "@/components/GenerateReportButton";
import { apiGet } from "@/lib/api";

type ReportRow = {
  id: string;
  title: string;
  status: string;
  overall_score: number | null;
  created_at: string;
};

export default async function ReportsPage() {
  const { reports } = await apiGet<{ reports: ReportRow[] }>("/api/reports");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Business Health Reports</h1>
          <p className="text-sm text-neutral-500">
            A full investigation across finance, customers, contracts,
            operations, and more — scored and cited from your data.
          </p>
        </div>
        <GenerateReportButton />
      </div>
      <div className="space-y-3">
        {reports.length === 0 && (
          <p className="text-sm text-neutral-500">
            No reports yet. Upload some business data first, then generate
            your first report.
          </p>
        )}
        {reports.map((r) => (
          <Link
            key={r.id}
            href={`/reports/${r.id}`}
            className="flex items-center justify-between rounded-lg border border-neutral-200 p-4 hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-900"
          >
            <div>
              <p className="font-medium">{r.title}</p>
              <p className="text-xs text-neutral-500">
                {new Date(r.created_at).toLocaleDateString()} · {r.status}
              </p>
            </div>
            {r.overall_score !== null && (
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold ${
                  r.overall_score >= 70
                    ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                    : r.overall_score >= 40
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                }`}
              >
                {r.overall_score}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
