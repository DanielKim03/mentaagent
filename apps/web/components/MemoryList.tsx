"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// "What your analyst knows" — every memory row is visible, editable, and
// deletable. Memory the user can see and correct is memory they trust.

type MemoryRow = {
  id: string;
  category: string;
  content: string;
  due_at: string | null;
  updated_at: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  business_facts: "Facts about your business",
  owner_preferences: "How you like to work",
  advisor_notes: "Analysis notes",
  open_loops: "Things to follow up on",
};

export default function MemoryList({ memory }: { memory: MemoryRow[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const router = useRouter();

  async function save(id: string) {
    await fetch(`/api/proxy/api/memory/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: draft }),
    });
    setEditing(null);
    router.refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/proxy/api/memory/${id}`, { method: "DELETE" });
    router.refresh();
  }

  const categories = Object.keys(CATEGORY_LABELS).filter((c) =>
    memory.some((m) => m.category === c)
  );

  if (memory.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Nothing yet. As you talk with your analyst, it remembers durable facts,
        preferences, and follow-ups here — and you can edit or delete any of it.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {categories.map((cat) => (
        <div key={cat}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {CATEGORY_LABELS[cat]}
          </h2>
          <ul className="space-y-2">
            {memory
              .filter((m) => m.category === cat)
              .map((m) => (
                <li
                  key={m.id}
                  className="group rounded-lg border border-neutral-200 bg-white p-3"
                >
                  {editing === m.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void save(m.id);
                      }}
                      className="flex gap-2"
                    >
                      <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        className="flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm focus:border-neutral-500 outline-none"
                        autoFocus
                      />
                      <button type="submit" className="text-sm underline">
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="text-sm text-neutral-500"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm">
                        {m.content}
                        {m.due_at && (
                          <span className="ml-2 text-xs text-neutral-500">
                            (due {new Date(m.due_at).toLocaleDateString()})
                          </span>
                        )}
                      </p>
                      <span className="flex shrink-0 gap-2 text-xs opacity-0 transition group-hover:opacity-100">
                        <button
                          onClick={() => {
                            setEditing(m.id);
                            setDraft(m.content);
                          }}
                          className="underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void remove(m.id)}
                          className="text-red-600 underline"
                        >
                          Delete
                        </button>
                      </span>
                    </div>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
