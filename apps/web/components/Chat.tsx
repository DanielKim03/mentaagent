"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// The chat surface: sends a message (202 + run id), then tails the run's SSE
// stream — assistant text deltas render live, tool calls show as activity
// lines ("Searching contracts…"), and a reconnect falls back to fetching the
// run from the DB. All requests go through /api/proxy/*.

type ToolActivity = { name: string; done: boolean };

type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: ToolActivity[];
  pending?: boolean;
};

type ServerMessage = {
  id: string;
  role: string;
  content: string;
  tool_calls: { function: { name: string } }[] | null;
  name: string | null;
};

const TOOL_LABELS: Record<string, string> = {
  search_business_data: "Searching the business data",
  read_document: "Reading a document",
  list_documents: "Reviewing what data is available",
  get_business_profile: "Checking the business profile",
  run_calculation: "Running a calculation",
  aggregate_table: "Crunching spreadsheet numbers",
  create_alert: "Filing a finding",
  remember: "Saving a note for later",
  use_skill: "Consulting a playbook",
  update_watchlist: "Updating the watchlist",
  search_history: "Checking past conversations",
};

export default function Chat({ initialSessionId }: { initialSessionId: string | null }) {
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load transcript when a session exists.
  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      const res = await fetch(`/api/proxy/api/sessions/${sessionId}`);
      if (!res.ok) return;
      const data = (await res.json()) as { messages: ServerMessage[] };
      const display: DisplayMessage[] = [];
      for (const m of data.messages) {
        if (m.role === "user" && !m.content.startsWith("[")) {
          display.push({ id: m.id, role: "user", content: m.content });
        } else if (m.role === "assistant") {
          const tools = (m.tool_calls ?? []).map((tc) => ({
            name: tc.function.name,
            done: true,
          }));
          if (m.content || tools.length > 0) {
            const last = display[display.length - 1];
            if (last?.role === "assistant" && !m.content && tools.length > 0) {
              last.tools = [...(last.tools ?? []), ...tools];
            } else {
              display.push({
                id: m.id,
                role: "assistant",
                content: m.content,
                tools: tools.length > 0 ? tools : undefined,
              });
            }
          }
        }
      }
      setMessages(display);
    })();
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const tailRun = useCallback((runId: string) => {
    const es = new EventSource(`/api/proxy/api/runs/${runId}/events`);
    const assistantId = `live-${runId}`;
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", tools: [], pending: true },
    ]);

    const update = (fn: (m: DisplayMessage) => DisplayMessage) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? fn(m) : m))
      );
    };

    es.addEventListener("assistant.delta", (e) => {
      const { delta } = JSON.parse((e as MessageEvent).data) as { delta: string };
      update((m) => ({ ...m, content: m.content + delta }));
    });
    es.addEventListener("tool.call", (e) => {
      const { name } = JSON.parse((e as MessageEvent).data) as { name: string };
      update((m) => ({ ...m, tools: [...(m.tools ?? []), { name, done: false }] }));
    });
    es.addEventListener("tool.result", (e) => {
      const { name } = JSON.parse((e as MessageEvent).data) as { name: string };
      update((m) => ({
        ...m,
        tools: (m.tools ?? []).map((t) =>
          t.name === name && !t.done ? { ...t, done: true } : t
        ),
      }));
    });
    es.addEventListener("run.finished", (e) => {
      const { content } = JSON.parse((e as MessageEvent).data) as { content: string };
      update((m) => ({ ...m, content: content || m.content, pending: false }));
      es.close();
      setBusy(false);
    });
    es.addEventListener("run.failed", (e) => {
      const { error } = JSON.parse((e as MessageEvent).data) as { error: string };
      update((m) => ({
        ...m,
        content: m.content || `Something went wrong: ${error}`,
        pending: false,
      }));
      es.close();
      setBusy(false);
    });
    es.addEventListener("run.paused", () => {
      update((m) => ({
        ...m,
        content:
          m.content ||
          "I had to pause — this conversation hit its budget. Upgrade your plan or try again later.",
        pending: false,
      }));
      es.close();
      setBusy(false);
    });
    es.addEventListener("done", async () => {
      // Stream opened after the run already finished — fetch the final state.
      es.close();
      const res = await fetch(`/api/proxy/api/runs/${runId}`);
      if (res.ok) {
        const data = (await res.json()) as { messages: ServerMessage[] };
        const final = [...data.messages].reverse().find((m) => m.role === "assistant" && m.content);
        update((m) => ({ ...m, content: final?.content ?? m.content, pending: false }));
      }
      setBusy(false);
    });
    es.onerror = () => {
      // EventSource auto-reconnects; if the run finished meanwhile the
      // "done" path above resolves it.
    };
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setBusy(true);
    setInput("");

    let sid = sessionId;
    if (!sid) {
      const res = await fetch("/api/proxy/api/sessions", { method: "POST" });
      if (!res.ok) {
        setError("Could not start a conversation.");
        setBusy(false);
        return;
      }
      sid = ((await res.json()) as { session_id: string }).session_id;
      setSessionId(sid);
      window.history.replaceState(null, "", `/chat?session=${sid}`);
    }

    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: text },
    ]);

    const res = await fetch(`/api/proxy/api/sessions/${sid}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    if (res.status === 402) {
      setError("You've reached your plan's usage limit this period.");
      setBusy(false);
      return;
    }
    if (!res.ok) {
      setError("Could not send the message.");
      setBusy(false);
      return;
    }
    const { run_id } = (await res.json()) as { run_id: string };
    tailRun(run_id);
  }, [input, busy, sessionId, tailRun]);

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="mt-16 text-center text-neutral-500">
            <p className="text-lg font-medium">Ask your analyst anything.</p>
            <p className="mt-1 text-sm">
              &ldquo;Which customer makes up most of my revenue?&rdquo; ·
              &ldquo;What contracts renew soon?&rdquo; · &ldquo;Where am I
              losing money?&rdquo;
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[80%] rounded-2xl bg-neutral-900 px-4 py-2 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "max-w-[90%]"
              }
            >
              {m.tools && m.tools.length > 0 && (
                <div className="mb-2 space-y-1">
                  {m.tools.map((t, i) => (
                    <p key={i} className="text-xs text-neutral-500">
                      {t.done ? "✓" : "…"} {TOOL_LABELS[t.name] ?? t.name}
                    </p>
                  ))}
                </div>
              )}
              {m.role === "assistant" ? (
                <div className="prose prose-sm prose-neutral max-w-none dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {m.content || (m.pending ? "_Thinking…_" : "")}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={busy ? "The analyst is working…" : "Ask about your business…"}
          disabled={busy}
          className="flex-1 rounded-xl border border-neutral-300 bg-transparent px-4 py-3 dark:border-neutral-700"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-neutral-900 px-5 py-3 font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
        >
          Send
        </button>
      </form>
    </div>
  );
}
