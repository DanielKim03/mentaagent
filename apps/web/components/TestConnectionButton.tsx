"use client";

import { useState } from "react";

// Sends one tiny request with the saved settings and shows the result, so a
// wrong key or model name shows up here rather than in the middle of a chat.
export default function TestConnectionButton() {
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "testing" } | { kind: "ok" | "error"; text: string }
  >({ kind: "idle" });

  async function test() {
    setState({ kind: "testing" });
    try {
      const res = await fetch("/api/proxy/api/settings/llm/test", { method: "POST" });
      const body = (await res.json()) as {
        ok: boolean;
        model?: string;
        error?: string;
        embeddings?: { ok: boolean; model: string; error?: string };
      };
      const chat = body.ok
        ? `Chat works (${body.model}).`
        : `Chat failed: ${body.error ?? "unknown error"}`;
      const emb = !body.embeddings
        ? " Search: keywords only."
        : body.embeddings.ok
          ? ` Search works (${body.embeddings.model}).`
          : ` Search embeddings failed: ${body.embeddings.error}`;
      setState({ kind: body.ok && (!body.embeddings || body.embeddings.ok) ? "ok" : "error", text: chat + emb });
    } catch {
      setState({ kind: "error", text: "Could not reach the server." });
    }
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <button
        type="button"
        onClick={test}
        disabled={state.kind === "testing"}
        className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium transition-colors hover:border-neutral-500 disabled:opacity-50"
      >
        {state.kind === "testing" ? "Testing…" : "Test saved settings"}
      </button>
      {(state.kind === "ok" || state.kind === "error") && (
        <span className={`min-w-0 break-words text-xs ${state.kind === "ok" ? "text-green-700" : "text-red-600"}`}>
          {state.text}
        </span>
      )}
    </div>
  );
}
