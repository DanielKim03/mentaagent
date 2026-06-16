import ChatWorkspace from "@/components/ChatWorkspace";
import { apiGet } from "@/lib/api";

type SessionRow = { id: string; title: string | null; created_at: string };

export default async function ChatPage({
  searchParams,
}: {
  searchParams: { session?: string; ask?: string };
}) {
  const { sessions } = await apiGet<{ sessions: SessionRow[] }>("/api/sessions");
  return (
    <ChatWorkspace
      sessions={sessions}
      activeId={searchParams.session ?? null}
      initialQuestion={searchParams.ask ?? null}
    />
  );
}
