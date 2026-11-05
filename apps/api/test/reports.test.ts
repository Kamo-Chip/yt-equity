import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { testApp } from "./helpers/app.mjs";
let activeSession: unknown = null;
const { app, db: testDb, schema } = await testApp({ getSession: async () => activeSession });
const insert = mock.method(testDb, "insert", testDb.insert.bind(testDb));
after(() => app.close());
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
  assert.equal("contactEmail" in stored.payload, false);
  assert.equal((stored.payload as { explanation: string }).explanation, "The extension toggle is not saving.");
  assert.equal((await app.inject({ url: "/api/v1/moderator/inbox?kind=feedback" })).statusCode, 401);
  activeSession = { user: { id: "moderator-test", role: "moderator" } };
  const queue = await app.inject({ url: "/api/v1/moderator/inbox?kind=feedback" });
  assert.equal(queue.statusCode, 200);
  assert.ok(queue.json().items.some((item: { id: string }) => item.id === created.id));
  const disputes = await app.inject({ url: "/api/v1/moderator/inbox?kind=disputes" });
  assert.ok(!disputes.json().items.some((item: { id: string }) => item.id === created.id));
  activeSession = null;
});

test("email is optional and multiple general reports are accepted", async () => {
  for (let i = 0; i < 2; i++) {
    const response = await report({ explanation: "The website link opens a blank page." });
    assert.equal(response.statusCode, 201);
  }
});

test("invalid reports return a validation error without persistence", async () => {
  const before = await testDb.select().from(schema.submissions);
  const response = await report({ explanation: "short" });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "INVALID_REPORT");
  assert.deepEqual(await testDb.select().from(schema.submissions), before);
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
  for (const key of ["kind", "channelId", "contactEmail"]) assert.equal(key in stored.payload, false);
  const duplicate = await app.inject({ method: "POST", url: "/api/v1/submissions", payload: { ...payload, channelId: "UCcanonical" }, remoteAddress: "10.4.1.2" });
  assert.equal(duplicate.statusCode, 409);
  for (const kind of ["correction", "dispute"]) {
    const invalid = await app.inject({ method: "POST", url: "/api/v1/submissions", payload: { ...payload, kind, channelId: "UCmissing" }, remoteAddress: "10.4.1.3" });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().error.code, "UNKNOWN_CHANNEL");
  }
});
