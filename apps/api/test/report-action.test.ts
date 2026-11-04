import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { submitReport, type ReportState } from "../../web/app/actions.js";
const initial: ReportState = { ok: false, message: "", values: { explanation: "", contactEmail: "" } };
function data(explanation = "The extension opens an empty panel.", email = "") {
  const form = new FormData();
  form.set("explanation", explanation);
  form.set("contactEmail", email);
  return form;
}
afterEach(() => mock.restoreAll());

test("report action forwards validated input to Fastify and clears successful submissions", async () => {
  const fetch = mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(String(url), `${(process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/$/, "")}/api/v1/reports`);
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), { explanation: "The extension opens an empty panel." });
    return new Response(JSON.stringify({ id: "test", status: "pending" }), { status: 201 });
  });
  const state = await submitReport(initial, data());
  assert.equal(state.ok, true);
  assert.equal(state.message, "Report sent. Thank you.");
  assert.equal(state.values.explanation, "");
  assert.equal(fetch.mock.callCount(), 1);
});

test("invalid reports stay in the form without calling the API", async () => {
  const fetch = mock.method(globalThis, "fetch", async () => { throw Error("Must not fetch"); });
  for (const form of [data("short"), data("a".repeat(4001)), data(undefined, "invalid")]) {
    const state = await submitReport(initial, form);
    assert.equal(state.ok, false);
    assert.equal(state.values.explanation, form.get("explanation"));
    assert.equal(state.values.contactEmail, form.get("contactEmail"));
    assert.ok(state.message);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

for (const status of [400, 429, 503]) {
  test(`API ${status} preserves input with inline feedback`, async () => {
    mock.method(globalThis, "fetch", async () => new Response("{}", { status }));
    const state = await submitReport(initial, data(undefined, "person@example.com"));
    assert.equal(state.ok, false);
    assert.equal(state.values.explanation, "The extension opens an empty panel.");
    assert.equal(state.values.contactEmail, "person@example.com");
    assert.equal(state.message, status === 429 ? "Too many reports. Try again later." : "Couldn’t send your report. Try again.");
  });
}

test("network failure keeps the report available for retry", async () => {
  mock.method(globalThis, "fetch", async () => { throw Error("network unavailable"); });
  const state = await submitReport(initial, data());
  assert.equal(state.ok, false);
  assert.equal(state.values.explanation, "The extension opens an empty panel.");
  assert.equal(state.message, "Couldn’t send your report. Try again.");
});
