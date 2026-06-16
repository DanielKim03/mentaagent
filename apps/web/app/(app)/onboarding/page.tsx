import { redirect } from "next/navigation";
import { apiFetch, apiGet } from "@/lib/api";

type Workspace = {
  workspace: {
    id: string;
    name: string;
    business_profile: Record<string, unknown>;
  };
};

// Onboarding / profile page: the form that grounds every agent run. A
// server-action form keeps it dead simple.

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: { saved?: string };
}) {
  const { workspace } = await apiGet<Workspace>("/api/workspace");
  const bp = workspace.business_profile ?? {};

  async function save(formData: FormData) {
    "use server";
    const teamSize = Number(formData.get("team_size"));
    await apiFetch("/api/workspace", {
      method: "PATCH",
      body: JSON.stringify({
        name: String(formData.get("name") ?? "").trim() || undefined,
        business_profile: {
          industry: String(formData.get("industry") ?? ""),
          business_model: String(formData.get("business_model") ?? ""),
          team_size: Number.isFinite(teamSize) && teamSize > 0 ? teamSize : undefined,
          revenue_band: String(formData.get("revenue_band") ?? ""),
          goals: String(formData.get("goals") ?? ""),
          pains: String(formData.get("pains") ?? ""),
          advisor_style: String(formData.get("advisor_style") ?? "direct") as
            | "direct"
            | "coaching"
            | "detailed",
        },
      }),
    });
    redirect("/onboarding?saved=1");
  }

  const field =
    "rounded-lg border border-neutral-300 bg-white px-3 py-2.5 outline-none transition-colors focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200";

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tell your analyst about the business</h1>
        <p className="mt-1 text-sm text-neutral-500">
          This grounds every analysis. Five minutes here makes every answer
          sharper. No technical questions — ever.
        </p>
      </div>
      {searchParams.saved && (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          Saved. Your analyst will use this from the next conversation.
        </p>
      )}
      <form action={save} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Business name
          <input name="name" defaultValue={workspace.name} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Industry
          <input
            name="industry"
            defaultValue={String(bp.industry ?? "")}
            placeholder="e.g. restaurant, e-commerce, consulting"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          How the business makes money
          <input
            name="business_model"
            defaultValue={String(bp.business_model ?? "")}
            placeholder="e.g. weekly produce deliveries to local restaurants"
            className={field}
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Team size
            <input
              name="team_size"
              type="number"
              min={1}
              defaultValue={bp.team_size ? Number(bp.team_size) : ""}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Annual revenue (rough)
            <select
              name="revenue_band"
              defaultValue={String(bp.revenue_band ?? "")}
              className={field}
            >
              <option value="">Prefer not to say</option>
              <option value="under_100k">Under $100k</option>
              <option value="100k_500k">$100k – $500k</option>
              <option value="500k_2m">$500k – $2M</option>
              <option value="2m_10m">$2M – $10M</option>
              <option value="over_10m">Over $10M</option>
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Goals right now
          <textarea
            name="goals"
            rows={2}
            defaultValue={String(bp.goals ?? "")}
            placeholder="e.g. grow catering revenue, hire a second cook"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Biggest worries
          <textarea
            name="pains"
            rows={2}
            defaultValue={String(bp.pains ?? "")}
            placeholder="e.g. cash gets tight every winter, one client is half my income"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Advisor style
          <select
            name="advisor_style"
            defaultValue={String(bp.advisor_style ?? "direct")}
            className={field}
          >
            <option value="direct">Direct — bottom line first</option>
            <option value="coaching">Coaching — explain the why</option>
            <option value="detailed">Detailed — show the numbers</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-neutral-900 px-4 py-2.5 font-medium text-white transition-colors hover:bg-neutral-700"
        >
          Save profile
        </button>
      </form>
    </div>
  );
}
