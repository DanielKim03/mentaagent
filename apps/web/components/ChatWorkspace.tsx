"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, History, Pencil, Trash2, Check, X } from "lucide-react";
import Chat from "./Chat";

// Wraps the chat with a compact toolbar: a "New" button and a "History"
// dropdown holding the conversation list (rename/delete). This replaces the
// old always-on wide sidebar so the chat gets the full width.

type SessionRow = { id: string; title: string | null; created_at: string };

export default function ChatWorkspace({
  sessions,
  activeId,
  initialQuestion,
}: {
  sessions: SessionRow[];
  activeId: string | null;
  initialQuestion?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function rename(id: string) {
    if (draft.trim()) {
      await fetch(`/api/proxy/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: draft.trim() }),
      });
    }
    setEditing(null);
    router.refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/proxy/api/sessions/${id}`, { method: "DELETE" });
    if (id === activeId) router.push("/chat?new=1");
    else router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-2">
        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            <History className="h-4 w-4" />
            History
            {sessions.length > 0 && (
              <span className="rounded-full bg-neutral-200 px-1.5 text-xs text-neutral-600">
                {sessions.length}
              </span>
            )}
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute left-0 z-20 mt-1 max-h-[70vh] w-80 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-lg">
                {sessions.length === 0 && (
                  <p className="px-3 py-4 text-sm text-neutral-400">
                    No conversations yet.
                  </p>
                )}
                {sessions.map((s) =>
                  editing === s.id ? (
                    <div key={s.id} className="flex items-center gap-1 px-1 py-0.5">
                      <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void rename(s.id);
                          if (e.key === "Escape") setEditing(null);
                        }}
                        autoFocus
                        className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-500"
                      />
                      <button onClick={() => void rename(s.id)} className="p-1 text-neutral-500 hover:text-neutral-900">
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={() => setEditing(null)} className="p-1 text-neutral-400 hover:text-neutral-600">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div
                      key={s.id}
                      className={`group flex items-center gap-1 rounded-lg ${
                        s.id === activeId ? "bg-neutral-100" : "hover:bg-neutral-50"
                      }`}
                    >
                      <Link
                        href={`/chat?session=${s.id}`}
                        onClick={() => setOpen(false)}
                        className="min-w-0 flex-1 truncate px-2.5 py-2 text-sm text-neutral-700"
                        title={s.title ?? "Untitled"}
                      >
                        {s.title ?? "New conversation"}
                      </Link>
                      <div className="flex shrink-0 pr-1 opacity-0 transition group-hover:opacity-100">
                        <button
                          onClick={() => {
                            setEditing(s.id);
                            setDraft(s.title ?? "");
                          }}
                          title="Rename"
                          className="p-1.5 text-neutral-400 hover:text-neutral-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => void remove(s.id)}
                          title="Delete"
                          className="p-1.5 text-neutral-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </div>
        <Link
          href="/chat?new=1"
          className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
        >
          <Plus className="h-4 w-4" />
          New
        </Link>
      </div>
      <div className="min-h-0 flex-1">
        <Chat
          key={activeId ?? "new"}
          initialSessionId={activeId}
          initialQuestion={initialQuestion}
        />
      </div>
    </div>
  );
}
