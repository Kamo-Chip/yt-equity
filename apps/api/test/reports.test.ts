import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.BETTER_AUTH_SECRET = "report-tests-only-not-a-production-secret";
const { db } = await import("@yt-equity/db/client");
const schema = await import("@yt-equity/db/schema");
const { reportSchema, submissionSchema } = await import("@yt-equity/contracts");
const { auth } = await import("../src/auth.js");
const { app } = await import("../src/server.js");
const pg = new PGlite();
const journal = JSON.parse(await readFile(new URL("../../../packages/db/drizzle/meta/_journal.json", import.meta.url), "utf8"));
for (const entry of journal.entries) {
  await pg.exec(await readFile(new URL(`../../../packages/db/drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
}
const testDb = drizzle(pg, { schema });
const insert = mock.method(db, "insert", testDb.insert.bind(testDb));
mock.method(db, "select", testDb.select.bind(testDb));
let activeSession: unknown = null;
mock.method(auth.api, "getSession", async () => activeSession);
after(async () => { mock.restoreAll(); await app.close(); await pg.close(); });
let ip = 0;
function report(payload: unknown, remoteAddress = `10.0.0.${++ip}`) {
  return app.inject({ method: "POST", url: "/api/v1/reports", payload, remoteAddress });
}

test("reports persist privately in the moderator queue with no channel", async () => {
  const response = await report({ explanation: "  The extension toggle is not saving.  ", contactEmail: " test@example.com " });
  assert.equal(response.statusCode, 201);
  const created = response.json();
  assert.equal(created.status, "pending");
  const stored = (await testDb.select().from(schema.submissions)).find((item) => item.id === created.id)!;
  assert.equal(stored.kind, "feedback");
  assert.equal(stored.channelId, null);
  assert.equal(stored.contactEmail, "test@example.com");
  assert.equal((stored.payload as { explanation: string }).explanation, "The extension toggle is not saving.");
  assert.equal((await app.inject({ url: "/api/v1/moderator/submissions?queue=reports" })).statusCode, 401);
  activeSession = { user: { id: "moderator-test", role: "moderator" } };
  const queue = await app.inject({ url: "/api/v1/moderator/submissions?queue=reports" });
  assert.equal(queue.statusCode, 200);
  assert.ok(queue.json().some((item: { id: string }) => item.id === created.id));
  const disputes = await app.inject({ url: "/api/v1/moderator/submissions?queue=disputes" });
  assert.ok(!disputes.json().some((item: { id: string }) => item.id === created.id));
  activeSession = null;
});

test("email is optional and multiple general reports are accepted", async () => {
  for (let i = 0; i < 2; i++) {
    const response = await report({ explanation: "The website link opens a blank page." });
    assert.equal(response.statusCode, 201);
  }
});

test("report validation rejects missing, blank, short, oversized messages and invalid email", async () => {
  for (const payload of [{}, { explanation: "          " }, { explanation: "short" }, { explanation: "a".repeat(4001) }, { explanation: "Valid message here", contactEmail: "invalid" }]) {
    const response = await report(payload);
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "INVALID_REPORT");
  }
  assert.equal(reportSchema.safeParse({ explanation: "a".repeat(4000) }).success, true);
});

test("existing channel submissions still require channel and evidence", async () => {
  const payload = { explanation: "An ownership record needs updating.", sources: ["https://example.com/evidence"] };
  assert.equal(submissionSchema.safeParse(payload).success, false);
  const invalid = await app.inject({ method: "POST", url: "/api/v1/submissions", payload, remoteAddress: "10.2.1.1" });
  assert.equal(invalid.statusCode, 400);
  const valid = await app.inject({ method: "POST", url: "/api/v1/submissions", payload: { ...payload, kind: "new_channel", channelId: "@test-channel" }, remoteAddress: "10.2.1.2" });
  assert.equal(valid.statusCode, 201);
  assert.equal(submissionSchema.safeParse({ ...payload, channelId: null }).success, false);
});

test("reports share the existing submission rate limit", async () => {
  const remoteAddress = "10.9.0.1";
  for (let i = 0; i < 20; i++) {
    const response = await report({}, remoteAddress);
    assert.equal(response.statusCode, 400);
  }
  const response = await report({ explanation: "A valid issue report." }, remoteAddress);
  assert.equal(response.statusCode, 429);
  assert.equal(response.json().error.code, "RATE_LIMITED");
  const channelResponse = await app.inject({ method: "POST", url: "/api/v1/submissions", payload: {}, remoteAddress });
  assert.equal(channelResponse.statusCode, 429);
});

test("database failures return a safe service error", async () => {
  insert.mock.mockImplementationOnce(() => { throw Error("private database details"); });
  const response = await report({ explanation: "The extension is not working." });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, "REPORT_UNAVAILABLE");
  assert.ok(!response.body.includes("private database details"));
});

test("channel contributions resolve canonical identifiers and reject unknown corrections", async () => {
  await testDb.insert(schema.channels).values({ channelId: "UCcanonical", handle: "@Canonical", name: "Canonical channel" });
  const payload = { kind: "new_channel", channelId: "@CANONICAL", explanation: "This channel has new funding.", sources: ["https://example.com/evidence"] };
  const response = await app.inject({ method: "POST", url: "/api/v1/submissions", payload, remoteAddress: "10.4.1.1" });
  assert.equal(response.statusCode, 201);
  const stored = (await testDb.select().from(schema.submissions)).find((item) => item.id === response.json().id)!;
  assert.equal(stored.channelId, "UCcanonical");
  assert.equal(stored.kind, "correction");
  assert.equal((stored.payload as { channelId: string }).channelId, "UCcanonical");
  const duplicate = await app.inject({ method: "POST", url: "/api/v1/submissions", payload: { ...payload, channelId: "UCcanonical" }, remoteAddress: "10.4.1.2" });
  assert.equal(duplicate.statusCode, 409);
  for (const kind of ["correction", "dispute"]) {
    const invalid = await app.inject({ method: "POST", url: "/api/v1/submissions", payload: { ...payload, kind, channelId: "UCmissing" }, remoteAddress: "10.4.1.3" });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().error.code, "UNKNOWN_CHANNEL");
  }
});
