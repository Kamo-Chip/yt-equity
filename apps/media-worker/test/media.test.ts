import test from "node:test";
import assert from "node:assert/strict";
import { serveMedia } from "../src/index.ts";
const url = "https://media.example/channels/UC" + "x".repeat(22) + "/" + "a".repeat(64) + ".jpg";
const bytes = new Uint8Array([255, 216, 255, 1]);
function fixture(type = "image/jpeg", missing = false) {
  let reads = 0;
  const pending: Promise<unknown>[] = [];
  const stored = new Map<string, Response>();
  return {
    env: { MEDIA: { get: async () => { reads++; return missing ? null : { body: new Response(bytes).body, size: bytes.length, httpEtag: '"test-etag"', httpMetadata: { contentType: type } }; } } } as any,
    ctx: { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as any,
    cache: { match: async (request: Request) => stored.get(request.url)?.clone(), put: async (request: Request, response: Response) => { stored.set(request.url, response); } } as any,
    pending, reads: () => reads,
  };
}
test("GET serves original bytes, content type, ETag, and immutable caching; repeat reads use cache", async () => {
  const f = fixture();
  const first = await serveMedia(new Request(url), f.env, f.ctx, f.cache);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("content-type"), "image/jpeg");
  assert.match(first.headers.get("cache-control")!, /immutable/);
  assert.equal(first.headers.get("cross-origin-resource-policy"), "cross-origin");
  assert.deepEqual(new Uint8Array(await first.arrayBuffer()), bytes);
  await Promise.all(f.pending);
  const cached = await serveMedia(new Request(url), f.env, f.ctx, f.cache);
  assert.equal(cached.status, 200);
  assert.equal(f.reads(), 1);
});
test("HEAD and conditional requests have no body and correct status", async () => {
  const f = fixture();
  const head = await serveMedia(new Request(url, { method: "HEAD" }), f.env, f.ctx, f.cache);
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), "4");
  assert.equal(await head.text(), "");
  await Promise.all(f.pending);
  const unchanged = await serveMedia(new Request(url, { headers: { "If-None-Match": 'W/"test-etag"' } }), f.env, f.ctx, f.cache);
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), "");
});
test("missing objects, invalid paths, query strings and listing cannot be fetched", async () => {
  const f = fixture("image/jpeg", true);
  assert.equal((await serveMedia(new Request(url), f.env, f.ctx, f.cache)).status, 404);
  for (const path of ["/", "/channels", "/private.txt", "/firms/anything/icon.svg", new URL(url).pathname + "?key=private"])
    assert.equal((await serveMedia(new Request("https://media.example" + path), f.env, f.ctx, f.cache)).status, 404);
  assert.equal(f.reads(), 1);
});
test("public writes are rejected before storage is accessed", async () => {
  const f = fixture();
  for (const method of ["PUT", "POST", "DELETE", "PATCH"]) {
    const response = await serveMedia(new Request(url, { method }), f.env, f.ctx, f.cache);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD");
  }
  assert.equal(f.reads(), 0);
});
test("non-image objects cannot be served or cached", async () => {
  const f = fixture("text/html");
  assert.equal((await serveMedia(new Request(url), f.env, f.ctx, f.cache)).status, 415);
  assert.equal(f.pending.length, 0);
});

test("upload storage requires the shared secret and verifies the content hash", async () => {
  const data = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), b => b.toString(16).padStart(2, "0")).join("");
  const path = `https://media.example/uploads/firms/${hash}.webp`;
  let writes = 0;
  const f = fixture();
  f.env.MEDIA_UPLOAD_SECRET = "private-test-secret";
  f.env.MEDIA.put = async (key: string, body: Uint8Array) => {
    writes++;
    assert.equal(key, `uploads/firms/${hash}.webp`);
    assert.deepEqual(body, data);
  };
  const send = (url = path, token = "private-test-secret", body = data) => serveMedia(new Request(url, {
    method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "image/webp" }, body,
  }), f.env, f.ctx);
  assert.equal((await send(path, "wrong")).status, 401);
  assert.equal((await send(path + "?query=1")).status, 400);
  assert.equal((await send(path.replace(hash, "0".repeat(64)))).status, 400);
  assert.equal((await send(path, "private-test-secret", new Uint8Array([1, 2, 3]))).status, 400);
  assert.equal((await send()).status, 201);
  assert.equal(writes, 1);
  assert.equal((await serveMedia(new Request(path), f.env, f.ctx)).status, 200);
});
