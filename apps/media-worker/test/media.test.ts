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
