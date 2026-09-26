import type { NextAuthConfig } from "next-auth";

// Edge-safe slice: trustHost + session strategy + page routes. Providers
// (which require the Postgres adapter) live only in the full config
// (auth.ts). Middleware constructs NextAuth with THIS config so it can read
// the JWT cookie without pulling in `pg`.
// A blank AUTH_SECRET falls back to a fixed dev-only value so a fresh clone
// can log in; production must set a real one (Auth.js refuses to start).
const secret =
  process.env.AUTH_SECRET ||
  (process.env.NODE_ENV !== "production"
    ? "mentaagent-dev-only-insecure-auth-secret"
    : undefined);

export const authConfig = {
  secret,
  trustHost: true,
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [],
} satisfies NextAuthConfig;
