import { publicClientIdentity } from "@/lib/public-mutation";
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { changesPublicDirectory, PUBLIC_DIRECTORY_TAG } from "@/lib/cache-policy";

const upstream = (
  process.env.API_INTERNAL_URL ?? "http://localhost:4000"
).replace(/\/$/, "");

async function forward(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const path = (await context.params).path ?? [];
  if (path[0] !== "auth" && path[0] !== "v1")
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "API route not found" } },
      { status: 404 },
    );
  const url = `${upstream}/api/${path.join("/")}${request.nextUrl.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");
  if (request.method === "POST" && path[0] === "v1" && path.length === 2 && ["reports", "submissions"].includes(path[1]))
    headers.set("x-yt-equity-client", await publicClientIdentity());
  headers.set("origin", process.env.WEB_ORIGIN ?? request.nextUrl.origin);
  const response = await fetch(url, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await request.arrayBuffer(),
    redirect: "manual",
    cache: "no-store",
  });
  if (response.ok && changesPublicDirectory(request.method, "/api/" + path.join("/"))) {
    // A published record can disappear after an edit: do not serve it stale.
    revalidateTag(PUBLIC_DIRECTORY_TAG, { expire: 0 });
  }
  const output = new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
  });
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") output.headers.set(key, value);
  });
  for (const cookie of response.headers.getSetCookie())
    output.headers.append("set-cookie", cookie);
  return output;
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
export const OPTIONS = forward;
