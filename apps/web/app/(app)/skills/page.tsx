import SkillReview from "@/components/SkillReview";
import { apiGet } from "@/lib/api";

type SkillRow = {
  id: string;
  workspace_id: string | null;
  name: string;
  description: string;
  source: "curated" | "agent";
  status: "active" | "proposed" | "archived";
  use_count: number;
};

export default async function SkillsPage() {
  const { skills } = await apiGet<{ skills: SkillRow[] }>("/api/skills");
  const proposed = skills.filter((s) => s.status === "proposed");
  const active = skills.filter((s) => s.status === "active");

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Analysis playbooks</h1>
        <p className="text-sm text-neutral-500">
          The methods your analyst follows. It proposes new playbooks as it
          learns your business — you approve them.
        </p>
      </div>

      {proposed.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Your analyst is learning</h2>
          {proposed.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950"
            >
              <p className="font-medium">{s.name}</p>
              <p className="mb-3 mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {s.description}
              </p>
              <SkillReview skillId={s.id} />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {active.map((s) => (
          <div
            key={s.id}
            className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <div className="flex items-center justify-between">
              <p className="font-medium">{s.name}</p>
              <span className="text-xs text-neutral-500">
                {s.workspace_id ? "learned for your business" : "standard"} ·
                used {s.use_count}×
              </span>
            </div>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              {s.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
