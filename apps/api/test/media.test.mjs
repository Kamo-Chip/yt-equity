import assert from "node:assert/strict";
import { after, test } from "node:test";
import sharp from "sharp";
import { testApp } from "./helpers/app.mjs";
const { app, db, schema } = await testApp();
after(() => app.close());
process.env.MEDIA_PUBLIC_ORIGIN = "https://media.example.workers.dev";
process.env.MEDIA_UPLOAD_SECRET = "test-media-secret-at-least-32-characters";
const image = await sharp({ create: { width: 1200, height: 600, channels: 4, background: "#ff000080" } }).png().toBuffer();
const payload = { kind: "channels", contentType: "image/png", base64: image.toString("base64") };
const headers = { "x-test-role": "moderator", origin: "http://localhost:3000" };
const upload = (body = payload, auth = headers) => app.inject({ method: "POST", url: "/api/v1/moderator/media", headers: auth, payload: body });

test("uploads require an admin or moderator session and a workspace origin", async () => {
  assert.equal((await upload(payload, { origin: headers.origin })).statusCode, 401);
  assert.equal((await upload(payload, { ...headers, "x-test-role": "viewer" })).statusCode, 403);
  assert.equal((await upload(payload, { ...headers, origin: "https://evil.example" })).statusCode, 403);
  assert.equal((await upload(payload, { "x-test-role": "moderator" })).statusCode, 403);
});
test("channels and firms upload normalized images without publishing directory changes", async (t) => {
  const initialAudit = (await db.select().from(schema.auditEvents)).length;
  let count = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    count++;
    assert.match(String(url), /^https:\/\/media.example.workers.dev\/uploads\/(channels|firms)\/[a-f0-9]{64}\.webp$/);
    assert.equal(init.method, "PUT");
    assert.equal(init.headers.authorization, `Bearer ${process.env.MEDIA_UPLOAD_SECRET}`);
    const metadata = await sharp(init.body).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 1024);
    assert.equal(metadata.height, 512);
    assert.equal(metadata.hasAlpha, true);
    return new Response(null, { status: 201 });
  });
  for (const kind of ["channels", "firms"]) {
    const response = await upload({ ...payload, kind }, { ...headers, "x-test-role": kind === "channels" ? "moderator" : "admin" });
    assert.equal(response.statusCode, 200, response.body);
    assert.match(response.json().url, new RegExp(`/uploads/${kind}/`));
  }
  assert.equal(count, 2);
  assert.equal((await db.select().from(schema.channels)).length, 0);
  assert.equal((await db.select().from(schema.firms)).length, 0);
  assert.equal((await db.select().from(schema.auditEvents)).length, initialAudit);
});
test("invalid content, mismatched types, invalid encodings and large bodies cannot reach storage", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("must not call"); });
  for (const body of [
    { ...payload, base64: Buffer.from("not an image").toString("base64") },
    { ...payload, contentType: "image/jpeg" },
    { ...payload, contentType: "image/svg+xml" },
    { ...payload, base64: "!invalid" },
    { ...payload, kind: "other" },
  ]) assert.equal((await upload(body)).statusCode, 400);
  assert.equal((await upload({ ...payload, base64: "a".repeat(7 * 1024 * 1024) })).statusCode, 413);
  assert.equal(fetch.mock.callCount(), 0);
});
test("storage outages return a recoverable error without credentials", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 401 }));
  const response = await upload();
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, "MEDIA_UNAVAILABLE");
  assert.ok(!response.body.includes(process.env.MEDIA_UPLOAD_SECRET));
});

test("inline channel and firm images survive relationship creation and auditing", async () => {
  const channelUrl = "https://media.example.workers.dev/uploads/channels/" + "a".repeat(64) + ".webp";
  const firmUrl = "https://media.example.workers.dev/uploads/firms/" + "b".repeat(64) + ".webp";
  const response = await app.inject({ method: "POST", url: "/api/v1/moderator/relationships", headers, payload: {
    channel: { channelId: "UCabcdefghijklmno1234567", name: "Inline image channel", profilePictureUrl: channelUrl },
    firm: { name: "Inline image firm", profilePictureUrl: firmUrl },
    type: "funding", status: "provisional", published: false, confidence: 0,
    sources: [{ url: "https://example.com/evidence", tier: "official" }],
  } });
  assert.equal(response.statusCode, 201, response.body);
  assert.equal(response.json().channel.profilePictureUrl, channelUrl);
  assert.equal(response.json().firm.profilePictureUrl, firmUrl);
  assert.equal((await db.select().from(schema.channels))[0].profilePictureUrl, channelUrl);
  assert.equal((await db.select().from(schema.firms))[0].profilePictureUrl, firmUrl);
  assert.ok((await db.select().from(schema.auditEvents)).length > 0);
  const graph = await app.inject({ url: "/api/v1/ownership-graph" });
  assert.deepEqual(graph.json(), { nodes: [], edges: [] });
});
