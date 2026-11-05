import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
const context = {};
runInNewContext(await readFile(new URL("../shared.js", import.meta.url), "utf8"), context);
const shared = context.YT_EQUITY_SHARED;

test("shared identifiers decode Unicode handles, normalize combining characters and preserve canonical ID casing", () => {
  assert.equal(shared.normalizeIdentifier("@caf%C3%A9"), "@café");
  assert.equal(shared.normalizeIdentifier("@cafe\u0301"), "@café");
  assert.equal(shared.normalizeIdentifier("UCAbC123"), "UCAbC123");
  for (const input of [null, "", "bad/identifier", "@bad%zz", "@" + "a".repeat(120)])
    assert.equal(shared.normalizeIdentifier(input), null);
});
test("malformed lookup results fail closed and exclude unconfirmed claims", () => {
  assert.equal(shared.normalizeResult({ kind: "found", value: { name: "Missing ID", claims: [] } }).kind, "unavailable");
  const result = shared.normalizeResult({ kind: "found", value: { channelId: "UCalpha", name: "Alpha", claims: [
    { type: "funding", status: "confirmed" }, { type: "funding", status: "disputed" }, { type: "unknown", status: "confirmed" }, null,
  ] } });
  assert.equal(result.value.claims.length, 1);
  assert.equal(result.value.claims[0].type, "funding");
});
