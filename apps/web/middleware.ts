import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge-safe config slice — middleware cannot import the Postgres adapter.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (
    pathname === "/" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/paddle") || // Paddle webhook authenticates by HMAC, not session
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/terms" ||
    pathname === "/privacy" ||
    pathname === "/refund" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return;
  }

  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("from", pathname);
    return Response.redirect(loginUrl);
  }
});

export const config = {
  // Exclude /api/proxy: it does its own auth (see the proxy route), and
  // routing SSE/streaming responses through Edge middleware BUFFERS them —
  // so the chat would only render once the whole run finished instead of
  // streaming live. Keeping the proxy out of middleware lets events flush
  // incrementally.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/proxy|api/paddle|sw.js).*)"],
};
