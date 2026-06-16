/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

// Pragmatic CSP for a Next.js App Router app behind Cloudflare. 'unsafe-inline'
// is required for Next's inline bootstrap/hydration scripts and Tailwind's
// injected styles (a nonce-based policy is a future hardening). It still locks
// down the high-value vectors: object-src none, base-uri self, frame-ancestors
// none (clickjacking), form-action self, and an explicit allowlist of the only
// external origins we load — Cloudflare Turnstile and Paddle checkout.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://cdn.paddle.com https://sandbox-cdn.paddle.com",
  "frame-src https://challenges.cloudflare.com https://*.paddle.com",
  "connect-src 'self' https://*.paddle.com https://challenges.cloudflare.com",
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

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Behind Railway's edge proxy on a custom domain, the forwarded
    // x-forwarded-host (mentapath.com) doesn't match the container's own
    // Host, so Next 14's Server Actions CSRF guard rejects the action POST
    // and the form silently does nothing. Allow the real public origins.
    serverActions: {
      allowedOrigins: ["mentapath.com", "www.mentapath.com", "*.up.railway.app"],
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
