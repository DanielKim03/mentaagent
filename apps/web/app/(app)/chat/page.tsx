import ChatWorkspace from "@/components/ChatWorkspace";
import { apiGet } from "@/lib/api";

type SessionRow = { id: string; title: string | null; created_at: string };

export default async function ChatPage({
  searchParams,
}: {
  searchParams: { session?: string; ask?: string; new?: string };
}) {
  const { sessions } = await apiGet<{ sessions: SessionRow[] }>("/api/sessions");

  // Opening Chat from another section (plain /chat) drops you back into a
  // still-running conversation so it "follows" you. Skip this when explicitly
  // starting fresh (?new=1 from the New button) or auto-asking (?ask=).
  let activeId = searchParams.session ?? null;
  if (!activeId && !searchParams.ask && !searchParams.new) {
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
