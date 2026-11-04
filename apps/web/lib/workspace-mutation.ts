import { workspaceMutation } from "@/app/workspace-actions";
import { ApiError } from "./api";

export async function mutateWorkspace<T = unknown>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const result = await workspaceMutation(path, method, body);
  if (!result.ok) throw new ApiError(result.error.status, result.error.message, result.error.code);
  return result.data as T;
}

export function mutateModerator<T = unknown>(path: string, method: Parameters<typeof mutateWorkspace>[1], body?: unknown) {
  return mutateWorkspace<T>("/api/v1/moderator/" + path, method, body);
}
export function mutateAdmin<T = unknown>(path: string, method: Parameters<typeof mutateWorkspace>[1], body?: unknown) {
  return mutateWorkspace<T>("/api/v1/admin/" + path, method, body);
}
