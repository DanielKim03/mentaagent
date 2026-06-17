"use client";

import { useRef, useState, useTransition } from "react";

type Result = { ok: boolean; message: string; previewUrl?: string };

export function InviteForm({
  invite,
}: {
  invite: (formData: FormData) => Promise<Result>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  return (
    <form
      ref={formRef}
      action={(formData) => {
        setResult(null);
        startTransition(async () => {
          const r = await invite(formData);
          setResult(r);
          if (r.ok) formRef.current?.reset();
        });
      }}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4"
    >
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-neutral-700">Email</span>
        <input
          type="email"
          name="email"
          required
          placeholder="teammate@company.com"
          className="w-72 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add teammate"}
      </button>
      {result && (
        <div
          className={`flex w-full flex-col gap-1 text-xs ${
            result.ok ? "text-emerald-700" : "text-red-700"
          }`}
        >
          <span>{result.message}</span>
          {result.previewUrl && (
            <a href={result.previewUrl} className="break-all text-blue-600 underline">
              {result.previewUrl}
            </a>
          )}
        </div>
      )}
    </form>
  );
}
