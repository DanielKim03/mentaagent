"use client";

import { useEffect, useRef } from "react";

// Lightweight wrapper around Cloudflare's Turnstile widget. Renders nothing
// when the site key is unset (dev mode). The token is written to a hidden
// input inside the parent form so plain server actions read it via FormData.

const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_ID = "cf-turnstile-script";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: {
          sitekey: string;
          theme?: "light" | "dark" | "auto";
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
        }
      ) => string;
      remove?: (id: string) => void;
      reset?: (id: string) => void;
    };
  }
}

function ensureScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolveLoad, rejectLoad) => {
    const existing = document.getElementById(SCRIPT_ID) as
      | HTMLScriptElement
      | null;
    if (existing) {
      existing.addEventListener("load", () => resolveLoad());
      existing.addEventListener("error", () => rejectLoad());
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolveLoad();
    script.onerror = () => rejectLoad();
    document.head.appendChild(script);
  });
}

export function Turnstile({
  siteKey,
  inputName = "cf-turnstile-response",
}: {
  siteKey: string;
  inputName?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    ensureScript()
      .then(() => {
        if (cancelled) return;
        if (!containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "auto",
          callback: (token) => {
            if (inputRef.current) inputRef.current.value = token;
          },
          "expired-callback": () => {
            if (inputRef.current) inputRef.current.value = "";
          },
          "error-callback": () => {
            if (inputRef.current) inputRef.current.value = "";
          },
        });
      })
      .catch(() => {
        /* swallow: script blocked → server-side verify will reject */
      });
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [siteKey]);

  if (!siteKey) return null;

  return (
    <div>
      <div ref={containerRef} />
      <input type="hidden" name={inputName} ref={inputRef} defaultValue="" />
    </div>
  );
}
