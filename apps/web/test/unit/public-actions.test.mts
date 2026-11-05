import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { ReportState } from "../../app/actions.js";
const visitorCookies = new Map<string, string>();
let clientAddress = "198.51.100.1";
mock.module(new URL("../../lib/server-api.ts", import.meta.url).href, { namedExports: {
  apiRequest: (path: string, init: RequestInit) => fetch(`${(process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/$/, "")}${path}`, init),
  serverFetch: async () => null,
} });
mock.module(new URL("../../node_modules/next/headers.js", import.meta.url).href, { namedExports: {
  headers: async () => new Headers({ "x-real-ip": clientAddress, "x-forwarded-for": "attacker-controlled" }),
  cookies: async () => ({
    get: (name: string) => visitorCookies.has(name) ? { value: visitorCookies.get(name) } : undefined,
    set: (name: string, value: string) => visitorCookies.set(name, value),
  }),
} });
const { submitReport } = await import("../../app/actions.js");
const initial: ReportState = { ok: false, message: "", values: { explanation: "", contactEmail: "" } };
function data(explanation = "The extension opens an empty panel.", email = "") {
  const form = new FormData();
  form.set("explanation", explanation);
  form.set("contactEmail", email);
  return form;
}
afterEach(() => { mock.restoreAll(); visitorCookies.clear(); });

test("report action forwards validated input to Fastify and clears successful submissions", async () => {
  const fetch = mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
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

test("public actions keep a signed visitor identity across requests without forwarding arbitrary headers", async () => {
  const tokens: string[] = [];
  mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    tokens.push(headers.get("x-yt-equity-client")!);
    assert.equal(headers.has("x-forwarded-for"), false);
    return new Response("{}", { status: 201 });
  });
  await submitReport(initial, data());
  await submitReport(initial, data());
  assert.match(tokens[0], /^[0-9a-f-]{36}\.\d+\.[0-9a-f]{64}$/);
  assert.equal(tokens[0].split(".")[0], tokens[1].split(".")[0]);
  visitorCookies.clear();
  await submitReport(initial, data());
  assert.notEqual(tokens[0].split(".")[0], tokens[2].split(".")[0]);
});

test("Railway identities use the trusted edge address even when visitor cookies change", async () => {
  const original = process.env.RAILWAY_ENVIRONMENT_ID;
  process.env.RAILWAY_ENVIRONMENT_ID = "test-edge";
  const tokens: string[] = [];
  mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
    tokens.push(new Headers(init?.headers).get("x-yt-equity-client")!);
    return new Response("{}", { status: 201 });
  });
  try {
    await submitReport(initial, data());
    visitorCookies.set("yt-equity-visitor", "11111111-1111-1111-1111-111111111111");
    await submitReport(initial, data());
    assert.match(tokens[0], /^[0-9a-f]{64}\.\d+\.[0-9a-f]{64}$/);
    assert.equal(tokens[0].split(".")[0], tokens[1].split(".")[0]);
    clientAddress = "198.51.100.2";
    await submitReport(initial, data());
    assert.notEqual(tokens[0].split(".")[0], tokens[2].split(".")[0]);
    clientAddress = "invalid";
    assert.equal((await submitReport(initial, data())).ok, false);
    assert.equal(tokens.length, 3);
  } finally {
    clientAddress = "198.51.100.1";
    if (original === undefined) delete process.env.RAILWAY_ENVIRONMENT_ID;
    else process.env.RAILWAY_ENVIRONMENT_ID = original;
  }
});
