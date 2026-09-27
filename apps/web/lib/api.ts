import "server-only";

// Server-component API client: calls the private API directly with the
// internal secret (same contract as the browser proxy). Always no-store — the
// app renders live data.

const API_URL = (process.env.API_INTERNAL_URL ?? "http://localhost:3001").replace(
  /\/+$/,
  ""
);

export async function apiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const secret = process.env.INTERNAL_API_SECRET;
  if (secret) headers.set("authorization", `Bearer ${secret}`);
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
