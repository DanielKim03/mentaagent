import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiFetch } from "@/lib/api";

type Section = {
  section_key: string;
  title: string;
  position: number;
  content_md: string;
  score: number | null;
  status: string;
};

type ReportDetail = {
  report: {
    id: string;
    title: string;
    status: string;
    overall_score: number | null;
    created_at: string;
  };
  sections: Section[];
};

function ScoreChip({ score, large }: { score: number | null; large?: boolean }) {
  if (score === null) return null;
  const tone =
    score >= 70
      ? "bg-green-100 text-green-700"
      : score >= 40
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";
  return (
    <span
      className={`rounded-full font-semibold ${tone} ${large ? "px-4 py-1.5 text-base" : "px-3 py-1 text-sm"}`}
    >
      {score}
      {large ? "/100" : ""}
    </span>
  );
}

export default async function ReportDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const res = await apiFetch(`/api/reports/${params.id}`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error("failed to load report");
  const { report, sections } = (await res.json()) as ReportDetail;
  const written = sections.filter((s) => s.status === "written");
  const pending = sections.filter((s) => s.status === "pending");

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 md:p-8 print:max-w-none">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{report.title}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {new Date(report.created_at).toLocaleDateString()} ·{" "}
            {report.status === "generating"
              ? "still generating — refresh in a minute"
              : report.status}
          </p>
        </div>
        <ScoreChip score={report.overall_score} large />
      </div>

      {written.map((s) => (
        <section key={s.section_key} className="space-y-3">
          <div className="flex items-center justify-between gap-3 border-b border-neutral-200 pb-2">
            <h2 className="text-lg font-semibold">{s.title}</h2>
            <ScoreChip score={s.score} />
          </div>
          <div className="prose prose-neutral max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.content_md}</ReactMarkdown>
          </div>
        </section>
      ))}

      {pending.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Still investigating: {pending.map((s) => s.title).join(", ")} — refresh shortly.
        </p>
      )}
    </div>
  );
}
