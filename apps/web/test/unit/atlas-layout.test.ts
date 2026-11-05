import test from "node:test";
import assert from "node:assert/strict";
import type { OwnershipGraph } from "@yt-equity/contracts";
import { buildAtlasLayout, roundedFirmPositions } from "../../lib/atlas-layout";

const ids = (count: number) => Array.from({ length: count }, (_, i) => `firm-${String(i).padStart(4, "0")}`);
const graph = (count: number): OwnershipGraph => ({
  nodes: ids(count).map((id) => ({ id, kind: "firm", name: id, channelCount: 0 })),
  edges: [],
});

for (const mobile of [false, true]) {
  test(`15 firms have even neighbor spacing and no large interior gaps (${mobile ? "mobile" : "desktop"})`, () => {
    const points = [...roundedFirmPositions(ids(15), mobile).values()];
    const pitch = mobile ? 180 : 260;
    for (const point of points) {
      const nearest = Math.min(...points.filter((other) => other !== point)
        .map((other) => Math.hypot(point.x - other.x, point.y - other.y)));
      assert.ok(Math.abs(nearest - pitch) < 1e-6);
    }
    // Sample the inner disk: its largest gaps should be the small triangular
    // spaces between neighbors, rather than vacant slots in the old grid.
    const cx = (Math.min(...points.map((p) => p.x)) + Math.max(...points.map((p) => p.x))) / 2;
    const cy = (Math.min(...points.map((p) => p.y)) + Math.max(...points.map((p) => p.y))) / 2;
    for (let x = -1; x <= 1; x += 0.2) {
      for (let y = -1; y <= 1; y += 0.2) {
        const nearest = Math.min(...points.map((p) => Math.hypot(p.x - cx - x * pitch, p.y - cy - y * pitch)));
        assert.ok(nearest <= pitch * 0.6);
      }
    }
  });

  test(`rosters from 0 to 200 have distinct, balanced positions (${mobile ? "mobile" : "desktop"})`, () => {
    for (let count = 0; count <= 200; count++) {
      const positions = roundedFirmPositions(ids(count), mobile);
      assert.equal(positions.size, count);
      const points = [...positions.values()];
      assert.ok(points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)));
      assert.equal(new Set(points.map(({ x, y }) => `${x}:${y}`)).size, count);
      if (count >= 15) {
        const width = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
        const height = Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
        assert.ok(width / height >= 0.75 && width / height <= 1.5);
      }
    }
  });
}

test("filtering and graph order preserve anchors; roster growth recalculates them", () => {
  const full = graph(15);
  const positions = buildAtlasLayout(full, new Set(), false, full).nodes;
  const filtered = { nodes: full.nodes.slice(4, 8), edges: [] };
  const subset = buildAtlasLayout(filtered, new Set(), false, full).nodes;
  for (const node of subset) assert.deepEqual(node.position, positions.find((n) => n.id === node.id)?.position);
  const reordered = buildAtlasLayout({ ...full, nodes: [...full.nodes].reverse() }, new Set(), false, full).nodes;
  assert.deepEqual(reordered, positions);
  const larger = graph(40);
  const grown = buildAtlasLayout(larger, new Set(), false, larger).nodes;
  assert.ok(positions.some((node) => JSON.stringify(node.position) !== JSON.stringify(grown.find((n) => n.id === node.id)?.position)));
});

test("a shared channel in a tiny roster unfolds clear of both firms", () => {
  const full = graph(2);
  full.nodes.push({ id: "channel", kind: "channel", channelId: "UCtest", name: "Shared channel" });
  full.edges = ids(2).map((source, i) => ({
    id: `edge-${i}`, source, target: "channel", type: "funding", status: "confirmed",
    confidence: 95, evidenceTiers: [], sources: [],
  }));
  for (const mobile of [false, true]) {
    const collapsed = buildAtlasLayout(full, new Set(), mobile, full);
    const expanded = buildAtlasLayout(full, new Set([ids(2)[0]]), mobile, full);
    const channel = expanded.nodes.find((node) => node.id === "channel")!;
    assert.equal(expanded.edges.length, 2);
    for (const firm of collapsed.nodes) {
      assert.deepEqual(firm.position, expanded.nodes.find((node) => node.id === firm.id)?.position);
      assert.ok(Math.hypot(channel.position.x + 26 - firm.position.x - 42,
        channel.position.y + 26 - firm.position.y - 42) > 84);
    }
  }
});
