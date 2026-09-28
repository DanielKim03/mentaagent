import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// One .env at the repo root serves both apps (the API loads the same file).
// Node's loader never overrides variables already set; absent in Docker images.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

// Pragmatic CSP for a Next.js App Router app. 'unsafe-inline' is required for
// Next's inline bootstrap/hydration scripts and Tailwind's injected styles. It
// still locks down the high-value vectors: object-src none, base-uri self,
// frame-ancestors none (clickjacking), form-action self, and no external
// scripts, frames or connections.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "frame-src 'none'",
  "connect-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(), camera=()",
  },
];

// Enforce CSP + HSTS only in production: in dev, Next's HMR needs eval/ws and
// HSTS over http is pointless, so applying them locally would break dev.
if (isProd) {
  securityHeaders.push(
    {
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    },
    { key: "Content-Security-Policy", value: csp }
  );
}

// Public origins allowed to POST Server Actions when behind a proxy.
// Taken from WEB_ORIGIN (comma-separated), e.g. https://example.com
const allowedOrigins = (process.env.WEB_ORIGIN ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean)
  .map((o) => {
    try { return new URL(o).host; } catch { return o; }
  });

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Self-contained server with only the traced dependencies: keeps the Docker
  // image small. Note: this config (incl. allowedOrigins) is fixed at build
  // time in standalone mode, so WEB_ORIGIN is passed as a Docker build arg.
  output: "standalone",
  // The app never uses next/image. Next 14's image optimizer has open
  // advisories only fixed in 15 (GHSA-2xp9-vwfh-vxw4 and others), and it runs
  // before middleware, so switch it off rather than leave it reachable.
  images: { unoptimized: true },
  experimental: {
    // Trace from the monorepo root so workspace dependencies are included.
    outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
    // Behind a proxy on a custom domain, the forwarded host doesn't match the
    // container's own Host, so Next 14's Server Actions CSRF guard rejects the
    // POST and the form silently does nothing. Allow the public origins.
    serverActions: {
      allowedOrigins,
    },
    // Don't reuse a dynamic page's RSC payload from the client Router Cache on
    // soft navigation — every page renders live data (lib/api.ts is
    // always no-store). Without this, returning to /chat could serve a stale
    // render that missed an in-flight run, so a running chat wouldn't resume.
    staleTimes: { dynamic: 0 },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
