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
        className="rounded-md bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
      >
        Approve
      </button>
      <button
        onClick={() => void review("reject")}
        className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        Reject
      </button>
    </div>
  );
}
