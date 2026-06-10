import type { NextAuthConfig } from "next-auth";

// Edge-safe slice: trustHost + session strategy + page routes. Providers
// (which require the Postgres adapter) live only in the full config
// (auth.ts). Middleware constructs NextAuth with THIS config so it can read
// the JWT cookie without pulling in `pg`.
export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [],
} satisfies NextAuthConfig;
