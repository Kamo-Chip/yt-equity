import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { ApiError } from "./api";
import { serverApi } from "./server-api";
const read = cache(async (endpoint: string) => {
  try {
    return await serverApi<unknown>("/api/v1/admin/moderators/" + endpoint);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401)
      redirect("/moderator/sign-in");
    throw error;
  }
});
export function adminRead<T>(endpoint: string) {
  return read(endpoint) as Promise<T>;
}
