export interface Env { MEDIA: R2Bucket }
const allowedPath = /^\/(?:channels\/UC[\w-]{22}|firms\/[0-9a-f-]{36})\/[0-9a-f]{64}\.(?:jpg|png|webp|svg|ico)$/;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"]);
const cacheControl = "public, max-age=31536000, immutable";

export async function serveMedia(request: Request, env: Env, ctx: ExecutionContext, cache?: Cache): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  const url = new URL(request.url);
  if (!allowedPath.test(url.pathname) || url.search)
    return new Response("Not found", { status: 404 });
  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cached = await cache?.match(cacheKey);
  if (cached) return responseFor(request, cached);
  const object = await env.MEDIA.get(url.pathname.slice(1));
  if (!object) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const type = object.httpMetadata?.contentType;
  if (!type || !imageTypes.has(type))
    return new Response("Unsupported media", { status: 415, headers: { "Cache-Control": "no-store" } });
  const headers = new Headers({
    "Content-Type": type, "Content-Length": String(object.size), "Cache-Control": cacheControl,
    ETag: object.httpEtag, "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
  });
  const response = new Response(object.body, { headers });
  if (cache) ctx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}));
  return responseFor(request, response);
}
function responseFor(request: Request, response: Response) {
  const etag = response.headers.get("ETag");
  if (etag && request.headers.get("If-None-Match")?.split(",").some((value) => value.trim().replace(/^W\//, "") === etag || value.trim() === "*"))
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } });
  return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
}
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return serveMedia(request, env, ctx, caches.default);
  },
};
