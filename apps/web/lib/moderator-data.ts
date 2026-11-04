import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { SubmissionContext } from "@yt-equity/contracts";
import { ApiError } from "./api";
import { serverApi } from "./server-api";

function rethrowAuthorization(error: unknown) {
  if (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403)
  )
    redirect("/moderator/sign-in");
}
export async function moderatorRead<T>(endpoint: string): Promise<T> {
  try {
    return await serverApi<T>("/api/v1/moderator/" + endpoint);
  } catch (error) {
    rethrowAuthorization(error);
    throw error;
  }
}
// React cache deduplicates within this render only; private data is never persisted.
const readSection = cache((endpoint: string) =>
  moderatorRead<unknown>(endpoint),
);
export function getModeratorSection<T>(endpoint: string) {
  return readSection(endpoint) as Promise<T>;
}
export const getModeratorContext = cache((id: string) =>
  moderatorRead<SubmissionContext>(
    "submissions/" + encodeURIComponent(id) + "/context",
  ),
);
export async function localRead<T>(read: () => Promise<T>): Promise<T | null> {
  // Catch API failures only. Framework redirects must reach the router.
  try {
    return await read();
  } catch (error) {
    if (
      error instanceof ApiError ||
      (error instanceof TypeError && error.message === "fetch failed")
    )
      return null;
    throw error;
  }
}
