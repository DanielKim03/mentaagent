"use client";

import { useEffect, useState } from "react";

// Minimal typing for the bits of Paddle.js v2 we use.
declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: string) => void };
      Initialize: (opts: {
        token: string;
        eventCallback?: (event: { name?: string }) => void;
      }) => void;
      Checkout: { open: (opts: Record<string, unknown>) => void };
    };
  }
}

const PADDLE_JS = "https://cdn.paddle.com/paddle/v2/paddle.js";

export default function CheckoutClient({
  token,
  environment,
}: {
  token: string;
  environment: "sandbox" | "production";
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ptxn = new URLSearchParams(window.location.search).get("_ptxn");
    if (!ptxn) {
      setError("Missing transaction — start checkout from the billing page.");
      return;
    }
    if (!token) {
      setError(
        "Checkout isn't configured. Set PADDLE_CLIENT_TOKEN on the web service."
      );
      return;
    }
    const successUrl = `${window.location.origin}/settings/billing?success=1`;

    const open = () => {
      const Paddle = window.Paddle;
      if (!Paddle) {
        setError("Paddle.js failed to load.");
        return;
      }
      try {
        // Environment must be set before Initialize.
        if (environment === "sandbox") Paddle.Environment.set("sandbox");
        Paddle.Initialize({
          token,
          eventCallback: (event) => {
            if (event?.name === "checkout.completed") {
              window.location.href = successUrl;
            }
          },
        });
        Paddle.Checkout.open({ transactionId: ptxn, settings: { successUrl } });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    if (window.Paddle) {
      open();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-paddle]"
    );
    if (existing) {
      existing.addEventListener("load", open);
      return;
    }
    const script = document.createElement("script");
    script.src = PADDLE_JS;
    script.async = true;
    script.dataset.paddle = "true";
    script.onload = open;
    script.onerror = () => setError("Couldn't load Paddle.js (network/adblock?).");
    document.body.appendChild(script);
  }, [token, environment]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      {error ? (
        <>
          <p className="max-w-sm text-sm text-red-600">{error}</p>
          <a href="/settings/billing" className="text-sm text-neutral-900 underline">
            Back to billing
          </a>
        </>
      ) : (
        <p className="text-sm text-neutral-500">Opening secure checkout…</p>
      )}
    </div>
  );
}
