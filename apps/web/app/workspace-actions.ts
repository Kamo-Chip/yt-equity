"use server";

import { headers } from "next/headers";
import { revalidatePath, updateTag } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api";
import { changesPublicDirectory, PUBLIC_DIRECTORY_TAG } from "@/lib/cache-policy";

export async function workspaceMutation(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
) {
  // This action is transport only. Fastify validates input and authorizes every
  // request, including direct invocations of the action by an untrusted caller.
  if (!/^\/api\/v1\/(moderator|admin)\/[a-zA-Z0-9/-]+$/.test(path) ||
      !["POST", "PATCH", "DELETE"].includes(method))
    return { ok: false as const, error: { status: 400, code: "INVALID_ACTION", message: "Invalid workspace action." } };
  try {
    const requestHeaders = await headers();
    const data = await apiFetch<unknown>(path, {
      method,
      headers: {
        cookie: requestHeaders.get("cookie") ?? "",
        origin: requestHeaders.get("origin") ?? process.env.WEB_ORIGIN ?? "http://localhost:3000",
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (changesPublicDirectory(method, path)) updateTag(PUBLIC_DIRECTORY_TAG);
    revalidatePath(path.startsWith("/api/v1/admin/") ? "/admin" : "/moderator");
    return { ok: true as const, data };
  } catch (error) {
    return { ok: false as const, error: {
      status: error instanceof ApiError ? error.status : 503,
      code: error instanceof ApiError ? error.code : "SERVICE_UNAVAILABLE",
      message: error instanceof ApiError ? error.message : "The service is unavailable. Your changes are still here.",
    } };
  }
}
