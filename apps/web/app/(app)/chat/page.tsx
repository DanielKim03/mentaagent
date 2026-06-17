import ChatWorkspace from "@/components/ChatWorkspace";
import { apiGet } from "@/lib/api";

// Re-resolve the active session on every visit so opening /chat from another
// section always picks up (and resumes) a still-running conversation rather
// than a cached render. Pairs with experimental.staleTimes.dynamic=0.
export const dynamic = "force-dynamic";

type SessionRow = { id: string; title: string | null; created_at: string };

export default async function ChatPage({
  searchParams,
}: {
  searchParams: { session?: string; ask?: string; new?: string };
}) {
  const { sessions } = await apiGet<{ sessions: SessionRow[] }>("/api/sessions");

  // Opening Chat from another section (plain /chat) drops you back into the
  // conversation you were last in — running OR done — so it "follows" you and
  // stays put until you start a New chat. Skip this when explicitly starting
  // fresh (?new=1 from the New button) or auto-asking from an alert (?ask=),
  // both of which should open a brand-new chat.
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
