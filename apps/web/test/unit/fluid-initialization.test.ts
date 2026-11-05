import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Edge, Node } from "@xyflow/react";
import { initializeFluidGraph } from "../../lib/fluid-initialization";
import { useFluidGraph } from "../../hooks/use-fluid-graph";
import { graphMoving } from "../../lib/fluid-physics";

const seeds: Node[] = [
  { id: "a", position: { x: 0, y: 0 }, data: { kind: "firm" } },
  { id: "b", position: { x: 220, y: 0 }, data: { kind: "firm" } },
  { id: "c", position: { x: 100, y: 190 }, data: { kind: "channel" } },
];
const edges: Edge[] = [{ id: "ac", source: "a", target: "c" }, { id: "bc", source: "b", target: "c" }];

test("initial geometry is deterministic, settled, and leaves the snapshot unchanged", () => {
  const before = structuredClone({ seeds, edges });
  const a = initializeFluidGraph(seeds, edges);
  const b = initializeFluidGraph(seeds, edges);
  assert.deepEqual(a.nodes, b.nodes);
  assert.deepEqual({ seeds, edges }, before);
  assert.equal(a.simulation.alpha(), 0);
  assert.equal(graphMoving(a.particles), false);
  assert.deepEqual(a.positions.get("c")!.parents, ["a", "b"]);
  for (const node of a.nodes) {
    assert.ok(Number.isFinite(node.position.x) && Number.isFinite(node.position.y));
    assert.notEqual(node.position, seeds.find(seed => seed.id === node.id)!.position);
  }
});

test("the first hook render already contains the settled nodes and edges without effects", () => {
  const expected = initializeFluidGraph(seeds, edges);
  let actual: ReturnType<typeof useFluidGraph> | undefined;
  function Probe() {
    actual = useFluidGraph(seeds, edges);
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  assert.deepEqual(actual!.nodes, expected.nodes);
  assert.deepEqual(actual!.edges, edges);
});

test("empty snapshots initialize without moving particles or active simulation work", () => {
  const initial = initializeFluidGraph([], []);
  assert.deepEqual(initial.nodes, []);
  assert.equal(initial.positions.size, 0);
  assert.equal(initial.simulation.alpha(), 0);
});
