import type { WorkspaceSession } from "@yt-equity/contracts";
import { headers } from "next/headers";
import { cache } from "react";
import "server-only";
import { readApiResponse } from "./http";

export function apiRequest(path: string, init: RequestInit = {}) {
  const origin = (process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/$/, "");
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  return fetch(origin + path, { ...init, cache: "no-store", headers });
}

export async function serverFetch<T>(path: string, init: RequestInit = {}) {
  return readApiResponse<T>(await apiRequest(path, init));
}

export async function serverApi<T>(path: string) {
  const cookie = (await headers()).get("cookie") ?? "";
  return serverFetch<T>(path, { headers: { cookie } });
}

export const getWorkspaceSession = cache(() =>
  serverApi<WorkspaceSession>("/api/v1/workspace/session"),
);
