import type { DirectoryQuery, OwnershipGraph, PublicChannel, PublicFirm } from "@yt-equity/contracts";

const API_URL = (process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/$/, "");

export type PendingSubmission = {
  id: string;
  kind: string;
  channelId: string | null;
  payload: { explanation?: string; sources?: string[]; type?: "funding" | "acquisition"; claimId?: string; channelHandle?: string };
  contactEmail?: string | null;
  createdAt: string;
};

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string) { super(message); }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = typeof window === "undefined" ? `${API_URL}${path}` : path;
  const response = await fetch(url, { ...init, credentials: "include", cache: "no-store", headers: { accept: "application/json", ...init.headers } });
  if (!response.ok) {
    let message = `API request failed (${response.status})`;
    let code: string | undefined;
    try { const body = await response.json() as { error?: { message?: string; code?: string } }; message = body.error?.message ?? message; code = body.error?.code; } catch { /* preserve the status error when the response is not JSON */ }
    throw new ApiError(response.status, message, code);
  }
  return response.json() as Promise<T>;
}

export async function getChannels(filters: Partial<DirectoryQuery> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") params.set(key, String(value));
  return apiFetch<PublicChannel[]>(`/api/v1/channels${params.size ? `?${params}` : ""}`, { cache: "no-store" });
}
export async function getOwnershipGraph(search = "") {
  return apiFetch<OwnershipGraph>(`/api/v1/ownership-graph${search ? `?${search}` : ""}`, { cache: "no-store" });
}

export async function getChannel(identifier: string) {
  const normalized = decodeURIComponent(identifier);
  try { return await apiFetch<PublicChannel>(`/api/v1/channels/${encodeURIComponent(normalized)}`, { cache: "no-store" }); }
  catch (cause) { if (cause instanceof ApiError && cause.status === 404) return null; throw cause; }
}

export async function getPendingSubmissions(cookie: string) {
  return apiFetch<PendingSubmission[]>("/api/v1/admin/submissions", { headers: { cookie } });
}
export async function getModeratorSubmissions(cookie: string, queue?: "reports" | "disputes") {
  return apiFetch<PendingSubmission[]>("/api/v1/moderator/submissions" + (queue ? "?queue=" + queue : ""), { headers: { cookie } });
}
export async function moderatorFetch<T>(path: string, init: RequestInit = {}) {
  return apiFetch<T>("/api/v1/moderator/" + path.replace(/^\//, ""), { cache: "no-store", ...init });
}
export async function adminFetch<T>(path: string, init: RequestInit = {}) {
  return apiFetch<T>("/api/v1/admin/" + path.replace(/^\//, ""), { cache: "no-store", ...init });
}

export async function getFirm(id: string) {
  try { return await apiFetch<PublicFirm>(`/api/v1/firms/${encodeURIComponent(decodeURIComponent(id))}`, { cache: "no-store" }); }
  catch (cause) { if (cause instanceof ApiError && cause.status === 404) return null; throw cause; }
}
