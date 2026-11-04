import "server-only";
import { cache } from "react";
import type { WorkspaceSession } from "@yt-equity/contracts";
import { headers } from "next/headers";
import { apiFetch } from "./api";
export async function serverApi<T>(path: string) {
  const cookie = (await headers()).get("cookie") ?? "";
  return apiFetch<T>(path, { headers: { cookie } });
}

export const getWorkspaceSession = cache(() =>
  serverApi<WorkspaceSession>("/api/v1/workspace/session"),
);
