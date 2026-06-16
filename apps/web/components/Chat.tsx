"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Square, Check, Loader2, Sparkles } from "lucide-react";

// Claude.ai-style chat surface: sends a message (202 + run id), then tails
// the run's SSE stream — assistant text deltas render live, tool calls show
// as a tidy "working" group, and a reconnect falls back to fetching the run
// from the DB. Stop button cancels an in-flight run. All via /api/proxy/*.

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
  search_business_data: "Searching your business data",
  read_document: "Reading a document",
  list_documents: "Reviewing available data",
  get_business_profile: "Checking your business profile",
  run_calculation: "Running the numbers",
  aggregate_table: "Crunching spreadsheet figures",
  create_alert: "Filing a finding",
  remember: "Saving a note for next time",
  use_skill: "Consulting a playbook",
  update_watchlist: "Updating the watchlist",
  search_history: "Checking past conversations",
};

const SUGGESTIONS = [
  "Which customer makes up most of my revenue?",
  "What contracts or renewals are coming up?",
  "Where might I be losing money?",
  "What's the single most useful thing I could upload next?",
];

function ToolGroup({ tools, pending }: { tools: ToolActivity[]; pending?: boolean }) {
  if (tools.length === 0) return null;
  return (
    <div className="mb-3 space-y-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
      {tools.map((t, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-neutral-500">
          {t.done ? (
            <Check className="h-3.5 w-3.5 text-neutral-900" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-400" />
          )}
          {TOOL_LABELS[t.name] ?? t.name}
        </div>
      ))}
      {pending && tools.every((t) => t.done) && (
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-400" />
          Thinking
        </div>
      )}
    </div>
  );
}

export default function Chat({
  initialSessionId,
  initialQuestion,
}: {
  initialSessionId: string | null;
  initialQuestion?: string | null;
}) {
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const jumpToBottom = useRef(false);
  const router = useRouter();

  // Load the transcript of the conversation this component was OPENED with.
  // Keyed on initialSessionId (the prop), NOT the sessionId state: when a new
  // chat creates its session mid-send we set sessionId, and reloading the
  // (near-empty) transcript then would wipe the optimistic messages +
  // streaming placeholder. A past chat is opened by remounting with a new
  // initialSessionId, so this still fires exactly when it should.
  useEffect(() => {
    if (!initialSessionId) return;
    (async () => {
      const res = await fetch(`/api/proxy/api/sessions/${initialSessionId}`);
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
          const last = display[display.length - 1];
          if (last?.role === "assistant" && !m.content && tools.length > 0) {
            last.tools = [...(last.tools ?? []), ...tools];
          } else if (m.content || tools.length > 0) {
            display.push({
              id: m.id,
              role: "assistant",
              content: m.content,
              tools: tools.length > 0 ? tools : undefined,
            });
          }
        }
      }
      setMessages(display);
      jumpToBottom.current = true; // opening a past chat → start at the bottom
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId]);

  // When a past conversation is opened, jump straight to the bottom (most
  // recent messages). After that, auto-scroll only when already near the
  // bottom so we don't yank the view while the user reads scrollback.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (jumpToBottom.current) {
      jumpToBottom.current = false;
      el.scrollTop = el.scrollHeight; // instant
      return;
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Auto-grow the composer.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [input]);

  useEffect(() => () => esRef.current?.close(), []);

  // Auto-send a question passed in via ?ask= (e.g. "Ask about this alert").
  // Fires once, only for a fresh conversation.
  const autoSent = useRef(false);
  useEffect(() => {
    if (initialQuestion && !initialSessionId && !autoSent.current) {
      autoSent.current = true;
      void send(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  const tailRun = useCallback(
    (rid: string, assistantId: string, isFirstMessage: boolean) => {
      const es = new EventSource(`/api/proxy/api/runs/${rid}/events`);
      esRef.current = es;

      const update = (fn: (m: DisplayMessage) => DisplayMessage) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? fn(m) : m)));

      const finish = () => {
        es.close();
        esRef.current = null;
        setBusy(false);
        setRunId(null);
        // First message titles the session — refresh the sidebar.
        if (isFirstMessage) router.refresh();
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
        finish();
      });
      es.addEventListener("run.failed", (e) => {
        const { error } = JSON.parse((e as MessageEvent).data) as { error: string };
        update((m) => ({
          ...m,
          content: m.content || `Something went wrong: ${error}`,
          pending: false,
        }));
        finish();
      });
      es.addEventListener("run.paused", () => {
        update((m) => ({
          ...m,
          content:
            m.content ||
            "I had to pause — this conversation hit its usage budget. Try again later or upgrade your plan.",
          pending: false,
        }));
        finish();
      });
      es.addEventListener("done", async () => {
        es.close();
        const res = await fetch(`/api/proxy/api/runs/${rid}`);
        if (res.ok) {
          const data = (await res.json()) as { messages: ServerMessage[] };
          const final = [...data.messages]
            .reverse()
            .find((m) => m.role === "assistant" && m.content);
          update((m) => ({ ...m, content: final?.content ?? m.content, pending: false }));
        }
        finish();
      });
      es.onerror = () => {
        // EventSource auto-reconnects; the "done" path resolves a finished run.
      };
    },
    [router]
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setError(null);
      setBusy(true);
      setInput("");

      // Show the user message AND the analyst's "thinking" placeholder
      // immediately — before any network round-trip — so it's always clear
      // the message is being processed.
      const assistantId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: "user", content: trimmed },
        { id: assistantId, role: "assistant", content: "", tools: [], pending: true },
      ]);
      const fail = (msg: string) => {
        setError(msg);
        setBusy(false);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      };

      let sid = sessionId;
      const isFirstMessage = !sid || messages.length === 0;
      if (!sid) {
        const res = await fetch("/api/proxy/api/sessions", { method: "POST" });
        if (!res.ok) return fail("Could not start a conversation.");
        sid = ((await res.json()) as { session_id: string }).session_id;
        setSessionId(sid);
        window.history.replaceState(null, "", `/chat?session=${sid}`);
      }

      const res = await fetch(`/api/proxy/api/sessions/${sid}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      if (res.status === 402) {
        return fail("You've reached your plan's usage limit this period.");
      }
      if (!res.ok) return fail("Could not send the message.");
      const { run_id } = (await res.json()) as { run_id: string };
      setRunId(run_id);
      tailRun(run_id, assistantId, isFirstMessage);
    },
    [busy, sessionId, messages.length, tailRun]
  );

  const stop = useCallback(async () => {
    if (!runId) return;
    await fetch(`/api/proxy/api/runs/${runId}/cancel`, { method: "POST" });
    esRef.current?.close();
    esRef.current = null;
    setBusy(false);
    setRunId(null);
    setMessages((prev) =>
      prev.map((m) => (m.pending ? { ...m, pending: false } : m))
    );
  }, [runId]);

  const empty = messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-8">
          {empty ? (
            <div className="mt-[12vh] text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-900 text-white">
                <Sparkles className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">
                What can I help you understand about your business?
              </h2>
              <p className="mt-2 text-sm text-neutral-500">
                I analyze your real data — ask me anything, or start with one of these.
              </p>
              <div className="mx-auto mt-6 grid max-w-xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left text-sm text-neutral-700 transition-colors hover:border-neutral-400 hover:bg-neutral-100"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-neutral-900 px-4 py-2.5 text-[15px] text-white">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex animate-fade-in gap-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-xs font-bold text-white">
                      M
                    </div>
                    <div className="min-w-0 flex-1">
                      <ToolGroup tools={m.tools ?? []} pending={m.pending} />
                      {m.content ? (
                        <div className="prose prose-neutral max-w-none prose-pre:bg-neutral-100 prose-pre:text-neutral-800">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {m.content}
                          </ReactMarkdown>
                          {m.pending && (
                            <span className="ml-0.5 inline-block h-4 w-1.5 animate-blink bg-neutral-400 align-middle" />
                          )}
                        </div>
                      ) : (
                        (m.tools ?? []).length === 0 && (
                          <div className="flex items-center gap-2 text-sm text-neutral-500">
                            <span className="flex gap-1">
                              <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.3s]" />
                              <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.15s]" />
                              <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-400" />
                            </span>
                            Analyzing your data…
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-neutral-200 bg-neutral-50/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-4">
          {error && (
            <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {busy && (
            <div className="mb-2 flex items-center gap-2 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Menta is analyzing your data…
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-neutral-300 bg-white p-2 shadow-sm focus-within:border-neutral-500 focus-within:ring-2 focus-within:ring-neutral-200">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              placeholder="Ask about your business…"
              className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none placeholder:text-neutral-400"
            />
            {busy ? (
              <button
                onClick={() => void stop()}
                title="Stop"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-800 text-white transition-colors hover:bg-neutral-700"
              >
                <Square className="h-4 w-4" fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={() => void send(input)}
                disabled={!input.trim()}
                title="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
              </button>
            )}
          </div>
          <p className="mt-2 text-center text-xs text-neutral-400">
            Menta analyzes your uploaded data. Double-check anything important.
          </p>
        </div>
      </div>
    </div>
  );
}
