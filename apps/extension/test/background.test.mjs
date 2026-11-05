import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const shared = await readFile(new URL("../shared.js", import.meta.url), "utf8");
const source = shared + await readFile(new URL("../background.js", import.meta.url), "utf8");
function environment({ firefox = false, enabled = true, failStorage = false, fetcher, saved = { ownershipLookupsEnabled: enabled } } = {}) {
  let listener, changed, installed;
  let now = 1000;
  let requests = 0;
  let channel = { channelId: "UCalpha", name: "Alpha", claims: [] };
  const opened = [];
  const api = {
    runtime: {
      onMessage: { addListener(fn) { listener = fn; } },
      onInstalled: { addListener(fn) { installed = fn; } },
      getURL: path => `extension://id/${path}`
    },
    storage: {
      local: {
        async get() { if (failStorage) throw Error("Storage unavailable"); return { ...saved }; },
        async set(values) { Object.assign(saved, values); }
      },
      onChanged: { addListener(fn) { changed = fn; } }
    },
    tabs: { async create(options) { opened.push({ ...options }); } }
  };
  const context = {
    [firefox ? "browser" : "chrome"]: api,
    Date: class extends Date { static now() { return now; } },
    AbortSignal,
    async fetch(url, options) {
      requests++;
      assert.equal(url, "https://api.ytequity.com/api/v1/channels/lookup");
      assert.equal(options.credentials, "omit");
      assert.equal(options.referrerPolicy, "no-referrer");
      assert.equal(options.cache, "no-store");
      assert.ok(options.signal instanceof AbortSignal);
      if (fetcher) return fetcher(url, options);
      return { ok: true, async json() { return { results: JSON.parse(options.body).identifiers.map(identifier => ({ identifier, channel })) }; } };
    }
  };
  const config = 'globalThis.YT_EQUITY_CONFIG = {apiUrl:"https://api.ytequity.com"};';
  if (firefox) runInNewContext(config, context); // This deliberately has no importScripts shim.
  else context.importScripts = (...paths) => { assert.deepEqual(paths, ["config.js", "shared.js"]); runInNewContext(config, context); };
  runInNewContext(source, context);
  return {
    opened,
    get requests() { return requests; },
    advance(ms) { now += ms; },
    setChannel(value) { channel = value; },
    consent(value) { saved.ownershipLookupsEnabled = value; changed({ ownershipLookupsEnabled: { newValue: value } }, "local"); },
    install(reason) { return installed({ reason }); },
    send(message = { type: "yt-equity:lookup", identifier: "@alpha" }) {
      return new Promise(resolve => assert.equal(listener(message, {}, resolve), true));
    }
  };
}

for (const firefox of [false, true]) {
  test(`starts and looks up channels in a ${firefox ? "Firefox document" : "Chrome worker"}`, async () => {
    const env = environment({ firefox });
    assert.equal((await env.send()).kind, "found");
    assert.equal(env.requests, 1);
  });
}
for (const options of [{ enabled: false }, { failStorage: true }]) {
  test(`no API traffic when paused or settings cannot be read: ${JSON.stringify(options)}`, async () => {
    const env = environment(options);
    assert.equal((await env.send()).kind, "unavailable");
    assert.equal(env.requests, 0);
  });
}
test("shares the original cache deadline and refreshes after expiry", async () => {
  const env = environment();
  const first = await env.send();
  env.advance(4 * 60_000);
  const cached = await env.send();
  assert.equal(first.expiresAt, cached.expiresAt);
  assert.equal(env.requests, 1);
  env.setChannel(null);
  env.advance(60_001);
  assert.equal((await env.send()).kind, "independent");
  assert.equal(env.requests, 2);
});
test("deduplicates overlapping lookups and does not cache failed requests", async () => {
  let fail = true;
  const env = environment({ fetcher: async () => {
    if (fail) throw Error("Timeout");
    return { ok: true, json: async () => ({ results: [{ identifier: "@alpha", channel: null }] }) };
  } });
  assert.equal((await env.send()).kind, "unavailable");
  fail = false;
  const results = await Promise.all([env.send(), env.send()]);
  assert.ok(results.every(result => result.kind === "independent"));
  assert.equal(env.requests, 2);
});
test("revoking consent suppresses pending results and clears cached records", async () => {
  let finish;
  const env = environment({ fetcher: () => new Promise(resolve => { finish = resolve; }) });
  const pending = env.send();
  await new Promise(resolve => setImmediate(resolve));
  env.consent(false);
  finish({ ok: true, json: async () => ({ results: [{ identifier: "@alpha", channel: { channelId: "UCalpha", name: "Alpha", claims: [] } }] }) });
  assert.equal((await pending).kind, "unavailable");
  assert.equal((await env.send()).kind, "unavailable");
  assert.equal(env.requests, 1);
});
test("new installs default to enabled without writing over preferences", async () => {
  const saved = {};
  const env = environment({ saved });
  assert.equal((await env.send()).kind, "found");
  assert.equal(env.opened.length, 0);
  assert.deepEqual(saved, {});
});

for (const enabled of [true, false]) {
  test(`worker restarts and upgrades preserve the saved ${enabled} choice`, async () => {
    const saved = { ownershipLookupsEnabled: enabled };
    for (let restart = 0; restart < 3; restart++) {
      const env = environment({ saved });
      assert.equal((await env.send()).kind, enabled ? "found" : "unavailable");
      assert.deepEqual(saved, { ownershipLookupsEnabled: enabled });
      assert.equal(env.opened.length, 0);
    }
  });
}

test("one invalid lookup result does not suppress or cache-fail its valid siblings", async () => {
  const env = environment({ fetcher: async (_url, options) => ({ ok: true, json: async () => ({
    results: JSON.parse(options.body).identifiers.map(identifier => identifier === "bad/identifier"
      ? { identifier, channel: null, error: { code: "INVALID_IDENTIFIER" } }
      : { identifier, channel: { channelId: "UCalpha", name: "Alpha", claims: [] } }),
  }) }) });
  const results = await env.send({ type: "yt-equity:lookup-many", identifiers: ["@café", "bad/identifier"] });
  assert.equal(results[0].result.kind, "found");
  assert.equal(results[1].result.kind, "unavailable");
  assert.equal((await env.send({ type: "yt-equity:lookup", identifier: "@café" })).kind, "found");
  assert.equal(env.requests, 1);
});
