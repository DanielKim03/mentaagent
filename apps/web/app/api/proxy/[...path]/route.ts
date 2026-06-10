import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

// Generic authenticated proxy: browser → /api/proxy/* → private API. Injects
// the internal bearer secret plus server-derived x-user-id / x-workspace-id
// from the session — the API re-verifies the membership at its trust
// boundary. Streams response bodies (SSE included) straight through.

const API_URL = (process.env.API_INTERNAL_URL ?? "http://localhost:3001").replace(
  /\/+$/,
  ""
);
const SECRET = process.env.INTERNAL_API_SECRET;

const HOP_BY_HOP_REQ = new Set(["host", "connection", "content-length", "cookie"]);
const HOP_BY_HOP_RES = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
]);

async function forward(req: NextRequest, path: string[]) {
  if (!process.env.API_INTERNAL_URL && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "API_INTERNAL_URL is required in production" },
      { status: 500 }
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!session.workspaceId) {
    return NextResponse.json(
      { error: "no workspace assigned to user" },
      { status: 403 }
    );
  }

  const target = `${API_URL}/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_REQ.has(key.toLowerCase())) headers.set(key, value);
  });
  if (SECRET) headers.set("authorization", `Bearer ${SECRET}`);
  headers.set("x-user-id", session.user.id);
  headers.set("x-user-email", session.user.email);
  headers.set("x-workspace-id", session.workspaceId);

  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    redirect: "manual",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body;
    init.duplex = "half"; // required when streaming a request body in undici
  }

  const upstream = await fetch(target, init);

  const respHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_RES.has(key.toLowerCase())) respHeaders.set(key, value);
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

type Ctx = { params: { path: string[] } };

export async function GET(req: NextRequest, ctx: Ctx) {
  return forward(req, ctx.params.path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return forward(req, ctx.params.path);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return forward(req, ctx.params.path);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return forward(req, ctx.params.path);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return forward(req, ctx.params.path);
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
