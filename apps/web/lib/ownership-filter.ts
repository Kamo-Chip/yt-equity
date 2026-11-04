import type { OwnershipGraph, OwnershipGraphQuery } from "@yt-equity/contracts";
export function filterOwnershipGraph(
  graph: OwnershipGraph,
  filters: OwnershipGraphQuery,
): OwnershipGraph {
  const q = filters.q?.trim().toLowerCase();
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges = graph.edges.filter((e) => {
    if (
      (filters.type && e.type !== filters.type) ||
      (filters.status && e.status !== filters.status) ||
      (filters.evidenceTier && !e.evidenceTiers.includes(filters.evidenceTier))
    )
      return false;
    if (!q) return true;
    return [byId.get(e.source), byId.get(e.target)].some(
      (n) =>
        n &&
        [n.name, ...(n.kind === "channel" ? [n.handle, n.channelId] : [])].some(
          (value) => value?.toLowerCase().includes(q),
        ),
    );
  });
  const visible = new Set(edges.flatMap((e) => [e.source, e.target]));
  const counts = new Map<string, Set<string>>();
  for (const e of edges) {
    const ids = counts.get(e.source) ?? new Set<string>();
    ids.add(e.target);
    counts.set(e.source, ids);
  }
  return {
    edges,
    nodes: graph.nodes
      .filter((n) => visible.has(n.id))
      .map((n) =>
        n.kind === "firm"
          ? { ...n, channelCount: counts.get(n.id)?.size ?? 0 }
          : n,
      ),
  };
}
