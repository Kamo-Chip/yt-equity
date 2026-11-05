import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import { testApp } from "./helpers/app.mjs";

process.env.API_PROXY_SECRET = "regression-only-shared-proxy-secret";
const { app, pg, db, schema } = await testApp();
after(() => app.close());
const moderator = { "x-test-role": "moderator" };
async function request(method, url, payload, headers = moderator) {
  return app.inject({ method, url, payload, headers });
}

const [firm, unusedFirm] = await db.insert(schema.firms).values([{ name: "Regression firm" }, { name: "Unused regression firm" }]).returning();
const [channel, emptyChannel] = await db.insert(schema.channels).values([
  { channelId: "UCregression", name: "Regression channel" },
  { channelId: "UCemptyregression", name: "Empty regression channel" },
]).returning();
const [alias] = await db.insert(schema.channelAliases).values({ channelId: emptyChannel.id, alias: "@regression-alias" }).returning();
const [claim] = await db.insert(schema.claims).values({ channelId: channel.id, firmId: firm.id, type: "funding", status: "confirmed", published: true }).returning();
const [source] = await db.insert(schema.evidence).values({ claimId: claim.id, url: "https://example.com/source", tier: "official" }).returning();

async function directoryState() {
  return Promise.all(["channels", "firms", "claims", "evidence", "channelAliases", "auditEvents", "moderatorInvitations"].map(async key =>
    [key, await db.select().from(schema[key])]));
}

test("audit failures roll back every directory write and invitation persistence", async () => {
  const before = await directoryState();
  await pg.exec("CREATE FUNCTION reject_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER fail_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit();");
  try {
    const cases = [
      ["POST", "channels", { channelId: "UCrollback", name: "Rollback" }],
      ["PATCH", `channels/${channel.id}`, { name: "Changed" }],
      ["DELETE", `channels/${emptyChannel.id}`],
      ["POST", "firms", { name: "Rolled back firm" }],
      ["PATCH", `firms/${firm.id}`, { name: "Changed" }],
      ["DELETE", `firms/${unusedFirm.id}`],
      ["POST", `relationships/${claim.id}/archive`],
    ];
    for (const [method, path, payload] of cases) {
      const response = await request(method, "/api/v1/moderator/" + path, payload);
      assert.equal(response.statusCode, 500, `${method} ${path}: ${response.body}`);
      assert.deepEqual(await directoryState(), before, `${method} ${path} persisted a partial mutation`);
    }
    const invitation = await request("POST", "/api/v1/admin/moderators/invitations", { email: "invited@example.com" }, { "x-test-role": "admin" });
    assert.equal(invitation.statusCode, 500, invitation.body);
    assert.deepEqual(await directoryState(), before);
  } finally {
    await pg.exec("DROP TRIGGER fail_audit ON audit_events; DROP FUNCTION reject_audit();");
  }
});

function signedVisitor(id, issued = Math.floor(Date.now() / 1000)) {
  const value = `${id}.${issued}`;
  return `${value}.${createHmac("sha256", process.env.API_PROXY_SECRET).update(value).digest("hex")}`;
}
test("signed visitors behind one web socket have independent limits and forged identities do not bypass the IP fallback", async () => {
  const first = signedVisitor(randomUUID());
  const second = signedVisitor("a".repeat(64));
  const send = (token, ip = "10.0.0.50", forwarded = "198.51.100.1") => app.inject({
    method: "POST", url: "/api/v1/reports", payload: {}, remoteAddress: ip,
    headers: { "x-yt-equity-client": token, "x-forwarded-for": forwarded },
  });
  for (let i = 0; i < 20; i++) assert.equal((await send(first)).statusCode, 400);
  assert.equal((await send(first)).statusCode, 429);
  assert.equal((await send(second)).statusCode, 400);
  for (let i = 0; i < 20; i++) assert.equal((await send(`${randomUUID()}.${Math.floor(Date.now() / 1000)}.${"0".repeat(64)}`, "10.0.0.51", `198.51.100.${i + 1}`)).statusCode, 400);
  assert.equal((await send(signedVisitor(randomUUID(), 1), "10.0.0.51")).statusCode, 429);
  assert.equal((await send(second, "10.0.0.51")).statusCode, 400);
});

test("Unicode and encoded handles resolve without poisoning valid siblings in a lookup batch", async () => {
  const created = await request("POST", "/api/v1/moderator/channels", { channelId: "UCunicode", handle: "@café", name: "Unicode regression" });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal((await request("POST", "/api/v1/moderator/channels", { channelId: "UCbadhandle", handle: "bad/handle", name: "Invalid handle" })).statusCode, 400);
  assert.equal((await request("GET", "/api/v1/channels/" + encodeURIComponent("@café"))).statusCode, 200);
  const identifiers = ["UCunicode", "@café", "@caf%C3%A9", "bad/identifier", "@missing"];
  const response = await request("POST", "/api/v1/channels/lookup", { identifiers });
  assert.equal(response.statusCode, 200, response.body);
  const { results } = response.json();
  assert.deepEqual(results.map(item => item.identifier), identifiers);
  for (const item of results.slice(0, 3)) assert.equal(item.channel.channelId, "UCunicode");
  assert.equal(results[3].error.code, "INVALID_IDENTIFIER");
  assert.equal(results[4].channel, null);
  assert.equal((await request("POST", "/api/v1/channels/lookup", { identifiers: [42] })).statusCode, 400);
});

test("published undisclosed relationships retain separate graph nodes and exclude unconfirmed claims", async () => {
  const [target] = await db.insert(schema.channels).values({ channelId: "UCundisclosed", name: "Undisclosed regression" }).returning();
  const published = await db.insert(schema.claims).values([
    { channelId: target.id, type: "funding", status: "confirmed", published: true },
    { channelId: target.id, type: "acquisition", status: "confirmed", published: true },
    { channelId: target.id, type: "funding", status: "disputed", published: true },
  ]).returning();
  const graph = (await request("GET", "/api/v1/ownership-graph?q=Undisclosed%20regression")).json();
  assert.deepEqual(graph.edges.map(edge => edge.id).sort(), published.slice(0, 2).map(row => row.id).sort());
  const unnamed = graph.nodes.filter(node => node.kind === "firm");
  assert.equal(unnamed.length, 2);
  assert.ok(unnamed.every(node => node.undisclosed && node.channelCount === 1));
  assert.notEqual(unnamed[0].id, unnamed[1].id, "unknown firms must not be presented as the same owner");
  assert.equal((await request("GET", "/api/v1/channels/UCundisclosed")).json().claims.length, 2);
});

test("channel deletion removes dependent aliases and audits success while referenced channels stay intact", async () => {
  const result = await request("DELETE", `/api/v1/moderator/channels/${emptyChannel.id}`);
  assert.equal(result.statusCode, 200, result.body);
  assert.deepEqual(await db.select().from(schema.channelAliases).where(eq(schema.channelAliases.channelId, emptyChannel.id)), []);
  assert.deepEqual(await db.select().from(schema.channels).where(eq(schema.channels.id, emptyChannel.id)), []);
  assert.equal((await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.entityId, emptyChannel.id))).length, 1);
  assert.equal((await request("DELETE", `/api/v1/moderator/channels/${channel.id}`)).statusCode, 409);
  assert.equal((await db.select().from(schema.channels).where(eq(schema.channels.id, channel.id))).length, 1);
});

test("malformed and oversized JSON retain safe client-error responses", async () => {
  for (const [payload, status] of [["{broken:", 400], [JSON.stringify({ explanation: "x".repeat(1100000) }), 413]]) {
    const response = await app.inject({ method: "POST", url: "/api/v1/reports", headers: { "content-type": "application/json" }, payload });
    assert.equal(response.statusCode, status, response.body);
    assert.ok(response.json().error.code);
    assert.doesNotMatch(response.body, /INTERNAL_ERROR|1100000|broken/);
  }
});
