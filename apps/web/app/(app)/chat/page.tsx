import ChatWorkspace from "@/components/ChatWorkspace";
import { apiGet } from "@/lib/api";

type SessionRow = { id: string; title: string | null; created_at: string };

export default async function ChatPage({
  searchParams,
}: {
  searchParams: { session?: string; ask?: string };
}) {
  const { sessions } = await apiGet<{ sessions: SessionRow[] }>("/api/sessions");

  // Default into a still-running conversation when the user opens chat with no
  // specific session (and isn't starting a fresh ?ask= question), so coming
  // back lands them in the chat that's still thinking.
  let activeId = searchParams.session ?? null;
  if (!activeId && !searchParams.ask) {
    const { session_id } = await apiGet<{ session_id: string | null }>(
      "/api/sessions/active"
    );
    activeId = session_id;
  }

  return (
    <ChatWorkspace
      sessions={sessions}
      activeId={activeId}
      initialQuestion={searchParams.ask ?? null}
    />
  );
}
