import "server-only";
import { auth } from "@/auth";

// Server-component API client: calls the private API directly with the
// internal secret + session-derived identity headers (same contract as the
// browser proxy). Always no-store — the app renders live tenant data.

const API_URL = (process.env.API_INTERNAL_URL ?? "http://localhost:3001").replace(
  /\/+$/,
  ""
);

export async function apiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id || !session.workspaceId) {
    throw new Error("unauthorized");
  }
  const headers = new Headers(init?.headers);
  const secret = process.env.INTERNAL_API_SECRET;
  if (secret) headers.set("authorization", `Bearer ${secret}`);
  headers.set("x-user-id", session.user.id);
  headers.set("x-user-email", session.user.email);
  headers.set("x-workspace-id", session.workspaceId);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}
