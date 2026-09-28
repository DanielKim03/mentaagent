import { NextResponse, type NextRequest } from "next/server";

// There is no login: the app trusts whoever can reach it, and Docker only
// publishes it on 127.0.0.1. That alone doesn't stop a web page open in the
// owner's own browser, which is on the same machine:
//
// - DNS rebinding: a site points its own domain at 127.0.0.1, and the
//   browser then treats this app as part of that site and lets it read the
//   responses (documents, chats, memory). Those requests carry the site's
//   name in the Host header, so only local names are accepted here.
// - Cross-site requests: any site can make the browser submit a form (a file
//   upload, say) to localhost. Browsers send an Origin header with those, so
//   requests that change data must come from this app's own pages.
//
// WEB_ORIGIN (comma-separated) adds the addresses the app is served on when
// it sits behind a reverse proxy or VPN name; see the README.

const LOCAL_NAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

const extraHosts = (process.env.WEB_ORIGIN ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean)
  .map((o) => {
    try {
      return new URL(o).host;
    } catch {
      return o;
    }
  });

function allowedHost(host: string | null): boolean {
  if (!host) return false;
  const name = host.replace(/:\d+$/, "");
  return LOCAL_NAMES.has(name) || extraHosts.includes(host);
}

const forbidden = () => new NextResponse("Forbidden", { status: 403 });

export function middleware(req: NextRequest) {
  const host = req.headers.get("host");
  if (!allowedHost(host)) return forbidden();

  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    // Browsers always send Origin on cross-site writes; a missing one is a
    // non-browser client on this machine (curl), which is trusted like the
    // owner.
    if (origin !== null) {
      let originHost: string;
      try {
        originHost = new URL(origin).host;
      } catch {
        return forbidden(); // "null" origins: sandboxed frames, files
      }
      if (originHost !== host && !extraHosts.includes(originHost)) return forbidden();
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
