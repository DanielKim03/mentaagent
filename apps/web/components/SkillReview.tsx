"use client";

import { useRouter } from "next/navigation";

export default function SkillReview({ skillId }: { skillId: string }) {
  const router = useRouter();

  async function review(decision: "approve" | "reject") {
    await fetch(`/api/proxy/api/skills/${skillId}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => void review("approve")}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
      >
        Approve
      </button>
      <button
        onClick={() => void review("reject")}
        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
      >
        Reject
      </button>
    </div>
  );
}
