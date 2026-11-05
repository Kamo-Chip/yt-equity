export interface Env { MEDIA: R2Bucket; MEDIA_UPLOAD_SECRET?: string }
const uploadPath = /^\/uploads\/(?:channels|firms)\/[0-9a-f]{64}\.webp$/;
const allowedPath = /^\/(?:channels\/UC[\w-]{22}|firms\/[0-9a-f-]{36})\/[0-9a-f]{64}\.(?:jpg|png|webp|svg|ico)$/;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"]);
const cacheControl = "public, max-age=31536000, immutable";

export async function serveMedia(request: Request, env: Env, ctx: ExecutionContext, cache?: Cache): Promise<Response> {
  if (request.method === "PUT" && uploadPath.test(new URL(request.url).pathname))
    return storeUpload(request, env);
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  const url = new URL(request.url);
  if ((!allowedPath.test(url.pathname) && !uploadPath.test(url.pathname)) || url.search)
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

async function storeUpload(request: Request, env: Env): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  if (!env.MEDIA_UPLOAD_SECRET || request.headers.get("authorization") !== `Bearer ${env.MEDIA_UPLOAD_SECRET}`)
    return new Response("Unauthorized", { status: 401, headers });
  const url = new URL(request.url);
  if (url.search || request.headers.get("content-type") !== "image/webp")
    return new Response("Invalid upload", { status: 400, headers });
  const max = 5 * 1024 * 1024;
  if (Number(request.headers.get("content-length")) > max)
    return new Response("Image too large", { status: 413, headers });
  const reader = request.body?.getReader();
  if (!reader) return new Response("Image required", { status: 400, headers });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return new Response("Image too large", { status: 413, headers });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  if (String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP")
    return new Response("Invalid image", { status: 400, headers });
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
  if (!url.pathname.endsWith(`/${hash}.webp`))
    return new Response("Invalid checksum", { status: 400, headers });
  await env.MEDIA.put(url.pathname.slice(1), bytes, { httpMetadata: { contentType: "image/webp", cacheControl } });
  return new Response(null, { status: 201, headers });
}
