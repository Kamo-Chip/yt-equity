import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { after, mock, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import * as schema from "@yt-equity/db/schema";

// Real handlers and SQL against disposable Postgres; never connects to DATABASE_URL.
process.env.NODE_ENV = "test";
const pg = new PGlite();
const migrations = new URL("../../../packages/db/drizzle/", import.meta.url);
for (const file of (await readdir(migrations)).filter(file => file.endsWith(".sql")).sort()) {
  await pg.exec(await readFile(new URL(file, migrations), "utf8"));
}
const db = drizzle(pg, { schema });
mock.module("@yt-equity/db", { namedExports: { ...schema, db, and, asc, desc, eq, ilike, or } });
mock.module("@yt-equity/db/client", { namedExports: { db, pool: { end: () => pg.close() } } });
mock.module(new URL("../src/auth.ts", import.meta.url).href, { namedExports: { auth: {
  api: { getSession: async ({ headers }) => headers["x-test-moderator"] ? { user: { id: "test-moderator", role: "moderator" } } : null }
} } });
const { app } = await import("../src/server.ts");
const { creatorChannel, seedCreatorChannel } = await import("../../../packages/db/src/creator-channel.ts");
after(() => app.close());
const [firm, hiddenFirm] = await db.insert(schema.firms).values([{ name: "Public Firm" }, { name: "Hidden Firm" }]).returning();
const [mixed, hiddenOnly, empty] = await db.insert(schema.channels).values([
  { channelId: "UCmixed", handle: "@mixed", name: "Mixed" },
  { channelId: "UChidden", handle: "@hidden", name: "Hidden" },
  { channelId: "UCempty", handle: "@empty", name: "Empty" }
]).returning();
const records = await db.insert(schema.claims).values([
  { channelId: mixed.id, firmId: firm.id, type: "acquisition", status: "confirmed", published: true, confidence: 100 },
  ...[mixed, hiddenOnly].flatMap(channel => [
    { channelId: channel.id, firmId: hiddenFirm.id, type: "acquisition", status: "provisional", published: true, confidence: 50 },
    { channelId: channel.id, firmId: hiddenFirm.id, type: "funding", status: "disputed", published: true, confidence: 50 },
    { channelId: channel.id, firmId: hiddenFirm.id, type: "funding", status: "rejected", published: true, confidence: 0 },
    { channelId: channel.id, firmId: hiddenFirm.id, type: "funding", status: "confirmed", published: false, confidence: 100 }
  ])
]).returning();
const visible = records[0];
await db.insert(schema.evidence).values(records.map(record => ({ claimId: record.id, url: `https://evidence.example/${record.id}`, tier: "official" })));
async function request(url, options = {}) {
  const response = await app.inject({ url, ...options });
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}
function assertClaims(claims, ids) {
  assert.deepEqual(claims.map(claim => claim.id).sort(), [...ids].sort());
  assert.ok(claims.every(claim => claim.status === "confirmed"));
  for (const claim of claims) if (claim.sources) assert.deepEqual(claim.sources.map(source => source.url), [`https://evidence.example/${claim.id}`]);
}
test("profiles and directory expose only confirmed published claims and sources", async () => {
  assertClaims((await request("/api/v1/channels/@mixed")).claims, [visible.id]);
  const directory = await request("/api/v1/channels");
  assert.equal(directory.length, 3);
  for (const channel of directory) assertClaims(channel.claims, channel.channelId === mixed.channelId ? [visible.id] : []);
  for (const identifier of [hiddenOnly.channelId, empty.channelId]) {
    const channel = await request(`/api/v1/channels/${identifier}`);
    assertClaims(channel.claims, []);
    assert.equal(channel.reviewedAt, undefined);
  }
  assert.deepEqual(await request("/api/v1/channels?firm=Hidden"), []);
});
test("batch lookup retains empty profiles without hidden claims", async () => {
  const { results } = await request("/api/v1/channels/lookup", { method: "POST", payload: { identifiers: ["@mixed", "@hidden", "@empty", "@missing"] } });
  assertClaims(results[0].channel.claims, [visible.id]);
  assertClaims(results[1].channel.claims, []);
  assertClaims(results[2].channel.claims, []);
  assert.equal(results[3].channel, null);
});
test("graph connections, counts, nodes and sources exclude hidden relationships", async () => {
  const graph = await request("/api/v1/ownership-graph");
  assertClaims(graph.edges, [visible.id]);
  assert.deepEqual(graph.nodes.map(node => node.id).sort(), [`firm:${firm.id}`, `channel:${mixed.id}`].sort());
  assert.equal(graph.nodes.find(node => node.kind === "firm").channelCount, 1);
});
test("firm profiles preserve firms with no public records", async () => {
  assertClaims((await request(`/api/v1/firms/${firm.id}`)).claims, [visible.id]);
  const hidden = await request(`/api/v1/firms/${hiddenFirm.id}`);
  assert.equal(hidden.name, "Hidden Firm");
  assertClaims(hidden.claims, []);
});
test("legacy nonconfirmed filters return empty results", async () => {
  for (const status of ["provisional", "disputed"]) {
    assert.deepEqual(await request(`/api/v1/channels?status=${status}`), []);
    assert.deepEqual(await request(`/api/v1/ownership-graph?status=${status}`), { nodes: [], edges: [] });
  }
  assert.equal((await request("/api/v1/channels?status=confirmed")).length, 1);
});
test("moderators retain all statuses and publication states", async () => {
  const rows = await request("/api/v1/moderator/claims", { headers: { "x-test-moderator": "yes" } });
  assert.deepEqual(rows.map(row => row.claim.id).sort(), records.map(record => record.id).sort());
  assert.equal((await app.inject({ url: "/api/v1/moderator/claims" })).statusCode, 401);
});
test("dispute submission preserves the claim; moderator status change hides it", async () => {
  const response = await app.inject({ method: "POST", url: "/api/v1/submissions", payload: {
    kind: "dispute", channelId: mixed.channelId, claimId: visible.id,
    explanation: "Evidence challenges this ownership record.", sources: ["https://example.com/dispute"]
  } });
  assert.equal(response.statusCode, 201, response.body);
  assertClaims((await request(`/api/v1/channels/${mixed.channelId}`)).claims, [visible.id]);
  await request(`/api/v1/moderator/claims/${visible.id}`, { method: "PATCH", headers: { "x-test-moderator": "yes" }, payload: { status: "disputed" } });
  assertClaims((await request(`/api/v1/channels/${mixed.channelId}`)).claims, []);
  assert.deepEqual(await request("/api/v1/ownership-graph"), { nodes: [], edges: [] });
});


test("creator seed is idempotent and exposes an easter egg without financial relationships", async () => {
  const before = {
    channels: (await db.select().from(schema.channels)).length,
    claims: (await db.select().from(schema.claims)).length,
    firms: (await db.select().from(schema.firms)).length,
    evidence: (await db.select().from(schema.evidence)).length,
  };
  const first = await seedCreatorChannel(db);
  // An existing row is updated in place without overwriting unrelated metadata.
  await db.update(schema.channels).set({ easterEgg: null, profilePictureUrl: "https://example.com/avatar.png" }).where(eq(schema.channels.id, first.id));
  const second = await seedCreatorChannel(db);
  assert.equal(second.id, first.id);
  assert.equal(second.easterEgg, "creator");
  assert.equal(second.profilePictureUrl, "https://example.com/avatar.png");
  assert.equal((await db.select().from(schema.channels)).length, before.channels + 1);
  for (const table of ["claims", "firms", "evidence"]) {
    assert.equal((await db.select().from(schema[table])).length, before[table]);
  }
  const expected = { emoji: "👨🏾‍💻", message: "I built this thing." };
  const identifiers = [creatorChannel.channelId, "@kamoio", "@KaMoIo"];
  for (const identifier of identifiers) {
    const profile = await request(`/api/v1/channels/${identifier}`);
    assert.equal(profile.channelId, creatorChannel.channelId);
    assert.deepEqual(profile.easterEgg, expected);
    assertClaims(profile.claims, []);
  }
  const { results } = await request("/api/v1/channels/lookup", { method: "POST", payload: { identifiers: [...identifiers, "@empty"] } });
  for (const { channel } of results.slice(0, -1)) {
    assert.equal(channel.channelId, creatorChannel.channelId);
    assert.deepEqual(channel.easterEgg, expected);
    assertClaims(channel.claims, []);
  }
  assert.equal(results.at(-1).channel.easterEgg, undefined);
  assert.equal((await request("/api/v1/channels/@empty")).easterEgg, undefined);
  assert.ok(!(await request("/api/v1/ownership-graph")).nodes.some(node => node.channelId === creatorChannel.channelId));
  // A real published relationship can still put the channel in the graph.
  const [claim] = await db.insert(schema.claims).values({ channelId: first.id, firmId: firm.id, type: "funding", status: "confirmed", published: true }).returning();
  const graph = await request("/api/v1/ownership-graph?q=Kamo");
  assert.ok(graph.nodes.some(node => node.channelId === creatorChannel.channelId));
  assert.deepEqual(graph.edges.map(edge => edge.id), [claim.id]);
  await db.delete(schema.claims).where(eq(schema.claims.id, claim.id));
});
