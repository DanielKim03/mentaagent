"use client";

import { useEffect, useState } from "react";
import { PanelLeft, PanelLeftClose } from "lucide-react";

// App shell with a collapsible left sidebar. The sidebar content is rendered
// on the server (it needs the session + a sign-out server action) and passed
// in as a node; this client wrapper just owns the open/closed state and
// persists it. The slim top bar holds the toggle (and the brand when the
// sidebar is hidden).

export default function AppShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOpen(localStorage.getItem("menta-sidebar") !== "0");
    setReady(true);
  }, []);

  function toggle() {
    setOpen((v) => {
      localStorage.setItem("menta-sidebar", v ? "0" : "1");
      return !v;
    });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className={`${open ? "w-60" : "w-0"} shrink-0 overflow-hidden border-r border-neutral-200 bg-neutral-100/70 ${ready ? "transition-[width] duration-200" : ""}`}
      >
        <div className="flex h-full w-60 flex-col px-3 py-4">{sidebar}</div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-neutral-200 px-3">
          <button
            onClick={toggle}
            title={open ? "Collapse sidebar" : "Expand sidebar"}
            className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-900"
          >
            {open ? (
              <PanelLeftClose className="h-5 w-5" />
            ) : (
              <PanelLeft className="h-5 w-5" />
            )}
          </button>
          {!open && (
            <span className="text-sm font-semibold tracking-tight">MentaAgent</span>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
