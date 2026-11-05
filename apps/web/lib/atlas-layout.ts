import dagre from "@dagrejs/dagre";
import { Position, type Node } from "@xyflow/react";
import type { OwnershipGraph } from "@yt-equity/contracts";
import type { Appearance } from "./graph-presence";
type Entity = OwnershipGraph["nodes"][number];
type NodeData = { entity: Entity; kind: "firm" | "channel"; expanded: boolean; mobileLayout: boolean; appearance?: Appearance };
export type AtlasNode = Node<NodeData>;

// Fill a triangular lattice from the center out. Every neighboring slot has
// the same distance, including diagonals, so the outline grows without holes.
export function roundedFirmPositions(ids: string[], mobile: boolean) {
  const positions = new Map<string, { x: number; y: number }>();
  if (!ids.length) return positions;
  const spacing = mobile ? 180 : 260;
  const points = [{ x: 0, y: 0 }];
  if (ids.length === 2) {
    points[0].x = -0.5;
    points.push({ x: 0.5, y: 0 });
  } else {
    const radius = Math.ceil(Math.sqrt(ids.length));
    const pairs: { x: number; y: number; distance: number; angle: number }[] = [];
    for (let r = 0; r <= radius; r++) {
      for (let q = -radius; q <= radius; q++) {
        if (r === 0 && q <= 0) continue;
        const x = q + r / 2;
        const y = r * Math.sqrt(3) / 2;
        pairs.push({ x, y, distance: q * q + q * r + r * r, angle: Math.atan2(y, x) });
      }
    }
    pairs.sort((a, b) => a.distance - b.distance || a.angle - b.angle);
    for (const point of pairs) {
      if (points.length >= ids.length) break;
      points.push({ x: point.x, y: point.y });
      if (points.length < ids.length) points.push({ x: -point.x, y: -point.y });
    }
  }
  const minX = Math.min(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  // Keep the established ID order reading left to right, then top to bottom.
  points.sort((a, b) => a.x - b.x || a.y - b.y);
  points.forEach((point, i) => positions.set(ids[i], {
    x: (mobile ? 160 : 220) + (point.x - minX) * spacing,
    y: 220 + (point.y - minY) * spacing,
  }));
  return positions;
}

export function buildAtlasLayout(graph: OwnershipGraph, actualExpanded: Set<string>, mobile: boolean, fullGraph: OwnershipGraph) {
  const channelIds = new Set(graph.edges
    .filter((edge) => actualExpanded.has(edge.source))
    .map((edge) => edge.target));
  // A visible channel always retains every eligible firm connection.
  const visibleEdges = graph.edges.filter((edge) => channelIds.has(edge.target));
  const visible = graph.nodes
    .filter((n) => n.kind === "firm" || channelIds.has(n.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const layout = new dagre.graphlib.Graph({ multigraph: true });
  layout.setGraph({
    rankdir: "LR",
    nodesep: 55,
    ranksep: 155,
    marginx: 40,
    marginy: 40,
  });
  layout.setDefaultEdgeLabel(() => ({}));
  visible.forEach((n) =>
    layout.setNode(n.id, {
      width: n.kind === "firm" ? 84 : 52,
      height: n.kind === "firm" ? 84 : 52,
    }),
  );
  visibleEdges.forEach((e) => layout.setEdge(e.source, e.target, {}, e.id));
  dagre.layout(layout);
  const roots = fullGraph.nodes
    .filter((n) => n.kind === "firm")
    .sort((a, b) => a.id.localeCompare(b.id));
  const rootPositions = roundedFirmPositions(roots.map((n) => n.id), mobile);
  return {
    nodes: visible.map((n) => {
      const size = n.kind === "firm" ? 84 : 52;
      const parents = visibleEdges.filter((e) => e.target === n.id);
      const parent = parents[0];
      let p = rootPositions.get(n.id) ?? layout.node(n.id);
      if (parent) {
        // Dagre supplies a stable order; spring forces unfold each firm's local cluster.
        const siblings = [
          ...new Map(
            visibleEdges
              .filter((e) => e.source === parent.source)
              .map((e) => [e.target, e]),
          ).values(),
        ].sort((a, b) => layout.node(a.target).y - layout.node(b.target).y);
        const index = siblings.findIndex((e) => e.target === n.id),
          angle =
            (2 * Math.PI * index) / Math.max(siblings.length, 1) -
            Math.PI / 2;
        const centers = [...new Set(parents.map((e) => e.source))].map(
          (id) => rootPositions.get(id)!,
        );
        const center = {
          x: centers.reduce((sum, c) => sum + c.x, 0) / centers.length,
          y: centers.reduce((sum, c) => sum + c.y, 0) / centers.length,
        };
        const radius = 170 + Math.sqrt(siblings.length) * 17;
        p = {
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius,
        };
      }
      return {
        id: n.id,
        type: "entity",
        position: { x: p.x, y: p.y },
        // Orbs have fixed CSS dimensions. Supplying their geometry lets
        // connections render before the asynchronous DOM measurement pass.
        width: size,
        height: size,
        handles: [
          { type: "target" as const, position: Position.Left, x: 0, y: size / 2 },
          { type: "source" as const, position: Position.Right, x: size, y: size / 2 },
        ],
        connectable: false,
        selected: false,
        ariaLabel:
          n.kind === "firm"
            ? `${n.name}, ${n.channelCount} channels, ${actualExpanded.has(n.id) ? "expanded" : "collapsed"}. Click to toggle.`
            : n.name,
        data: {
          entity: n,
          kind: n.kind,
          expanded: actualExpanded.has(n.id),
          mobileLayout: mobile,
        },
      };
    }),
    edges: visibleEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "floating",
      style: {
        stroke:
          e.type === "acquisition"
            ? "var(--graph-acquisition)"
            : "var(--graph-funding)",
        strokeWidth: 1.5,
        strokeDasharray: e.status === "confirmed" ? undefined : "5 4",
      },
      labelStyle: { fontSize: 11, fill: "#555" },
      labelBgStyle: { fill: "#fff" },
      ariaLabel: `${e.type}, ${e.status}`,
    })),
  };
}
