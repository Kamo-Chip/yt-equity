import assert from "node:assert/strict";
import test from "node:test";

// Read-only integration tests against a running, seeded API.
const apiUrl = process.env.API_TEST_URL ?? "http://localhost:4000";

async function fixture() {
  const response = await fetch(`${apiUrl}/api/v1/ownership-graph`);
  assert.equal(response.status, 200);
  const graph = await response.json();
  const channel = graph.nodes.find((node) => node.kind === "channel" && /[a-z]/i.test(node.handle ?? ""));
  assert.ok(channel, "Seed a channel with a handle and a published claim before running integration tests");
  return { channel, claimIds: graph.edges.filter((edge) => edge.target === channel.id).map((edge) => edge.id).sort() };
}

test("profile lookup matches handle casing and returns the graph's published claims", async () => {
  const { channel, claimIds } = await fixture();
  for (const identifier of new Set([channel.handle.toLowerCase(), channel.handle.toUpperCase(), channel.channelId])) {
    const response = await fetch(`${apiUrl}/api/v1/channels/${encodeURIComponent(identifier)}`);
    assert.equal(response.status, 200, identifier);
    const profile = await response.json();
    assert.equal(profile.channelId, channel.channelId);
    assert.deepEqual(profile.claims.map((claim) => claim.id).sort(), claimIds);
  }
});

test("extension batch lookup preserves request casing and keeps channel IDs case-sensitive", async () => {
  const { channel, claimIds } = await fixture();
  const wrongCaseId = channel.channelId.slice(0, 2) + channel.channelId.slice(2).replace(/[a-zA-Z]/, (letter) => letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase());
  assert.notEqual(wrongCaseId, channel.channelId);
  const identifiers = [...new Set([channel.handle.toLowerCase(), channel.handle.toUpperCase(), channel.channelId, wrongCaseId, "@yt-equity-missing-channel-regression"])];
  const response = await fetch(`${apiUrl}/api/v1/channels/lookup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifiers })
  });
  assert.equal(response.status, 200);
  const { results } = await response.json();
  assert.deepEqual(results.map((item) => item.identifier), identifiers);
  for (const item of results.slice(0, -2)) {
    assert.equal(item.channel?.channelId, channel.channelId, item.identifier);
    assert.deepEqual(item.channel.claims.map((claim) => claim.id).sort(), claimIds);
  }
  assert.equal(results.at(-2).channel, null);
  assert.equal(results.at(-1).channel, null);
});
