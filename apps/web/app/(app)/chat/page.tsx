import Link from "next/link";
import Chat from "@/components/Chat";
import { apiGet } from "@/lib/api";

type SessionRow = { id: string; title: string | null; created_at: string };

export default async function ChatPage({
  searchParams,
}: {
  searchParams: { session?: string };
}) {
  const { sessions } = await apiGet<{ sessions: SessionRow[] }>("/api/sessions");
  const active = searchParams.session ?? null;

  return (
    <div className="flex gap-6">
      <div className="hidden w-56 shrink-0 lg:block">
        <Link
          href="/chat"
          className="mb-3 block rounded-md border border-neutral-300 px-3 py-2 text-center text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          New conversation
        </Link>
        <div className="space-y-1">
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/chat?session=${s.id}`}
              className={`block truncate rounded-md px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                s.id === active ? "bg-neutral-100 dark:bg-neutral-800" : ""
              }`}
            >
              {s.title ?? "Untitled"}
            </Link>
          ))}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <Chat key={active ?? "new"} initialSessionId={active} />
      </div>
    </div>
  );
}
