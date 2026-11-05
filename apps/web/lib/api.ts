import { readApiResponse } from "./http";
export { ApiError } from "./http";

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  return readApiResponse<T>(await fetch(path, { ...init, credentials: "include", cache: "no-store", headers }));
}

export function moderatorFetch<T>(path: string, init: RequestInit = {}) {
  return apiFetch<T>("/api/v1/moderator/" + path.replace(/^\//, ""), init);
}
