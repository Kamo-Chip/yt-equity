import test from "node:test";
import assert from "node:assert/strict";
import type { OwnershipGraph } from "@yt-equity/contracts";
import { filterOwnershipGraph, searchExpandedFirms } from "../../lib/ownership-filter";
import { buildAtlasLayout } from "../../lib/atlas-layout";

const graph: OwnershipGraph = {
  nodes: [
    ...["Alpha", "Beta", "Gamma"].map((name) => ({ id: name, name, kind: "firm" as const, channelCount: 2 })),
    ...["Shared", "Private"].map((name) => ({ id: name, name, kind: "channel" as const, channelId: name })),
  ],
  edges: [
    ...["Alpha", "Beta", "Gamma"].map((source) => ({ id: source, source, target: "Shared", type: "funding" as const, status: "confirmed" as const, confidence: 95, evidenceTiers: ["official" as const], sources: [] })),
    { id: "private", source: "Beta", target: "Private", type: "acquisition", status: "confirmed", confidence: 95, evidenceTiers: ["official"], sources: [] },
  ],
};

for (const mobile of [false, true]) {
  test(`shared channel retains all connections without expanding other firms (${mobile ? "mobile" : "desktop"})`, () => {
    for (const firm of ["Alpha", "Beta", "Gamma"]) {
      const layout = buildAtlasLayout(graph, new Set([firm]), mobile, graph);
      assert.equal(layout.nodes.filter((n) => n.id === "Shared").length, 1);
      assert.deepEqual(layout.edges.filter((e) => e.target === "Shared").map((e) => e.id).sort(), ["Alpha", "Beta", "Gamma"]);
      assert.equal(layout.nodes.find((n) => n.id === "Beta")?.data.expanded, firm === "Beta");
      assert.equal(layout.nodes.some((n) => n.id === "Private"), firm === "Beta");
      assert.ok(layout.nodes.every((n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y)));
    }
    assert.equal(buildAtlasLayout(graph, new Set(), mobile, graph).edges.length, 0);
    assert.equal(buildAtlasLayout(graph, new Set(["Gamma"]), mobile, graph).edges.length, 3);
  });
}

test("firm search restores connections but does not expand contextual firms or unrelated channels", () => {
  const filtered = filterOwnershipGraph(graph, { q: "Alpha" });
  assert.deepEqual(filtered.edges.map((e) => e.id).sort(), ["Alpha", "Beta", "Gamma"]);
  assert.deepEqual([...searchExpandedFirms(filtered, "Alpha")], ["Alpha"]);
  assert.equal(filtered.nodes.some((n) => n.id === "Private"), false);
});

test("channel search, clearing search, and relationship filters preserve their semantics", () => {
  assert.equal(filterOwnershipGraph(graph, { q: "shared" }).edges.length, 3);
  assert.equal(filterOwnershipGraph(graph, {}).edges.length, 4);
  assert.equal(filterOwnershipGraph(graph, { q: "Alpha", type: "acquisition" }).edges.length, 0);
  assert.deepEqual(filterOwnershipGraph(graph, { q: "Beta", type: "funding" }).edges.map((e) => e.id).sort(), ["Alpha", "Beta", "Gamma"]);
  assert.equal(filterOwnershipGraph(graph, { evidenceTier: "community" }).edges.length, 0);
  assert.equal(filterOwnershipGraph(graph, { status: "disputed" }).edges.length, 0);
});
