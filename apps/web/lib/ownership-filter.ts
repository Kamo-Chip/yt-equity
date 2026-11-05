import type { OwnershipGraph, OwnershipGraphQuery } from "@yt-equity/contracts";
export function matchesOwnershipSearch(node: OwnershipGraph["nodes"][number] | undefined, query: string) {
  const q = query.trim().toLowerCase();
  return !!node && [node.name, ...(node.kind === "channel" ? [node.handle, node.channelId] : [])]
    .some((value) => value?.toLowerCase().includes(q));
}

export function searchExpandedFirms(graph: OwnershipGraph, query: string): Set<string> {
  if (!query.trim()) return new Set();
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  return new Set(graph.edges.filter((edge) =>
    matchesOwnershipSearch(byId.get(edge.source), query) ||
    matchesOwnershipSearch(byId.get(edge.target), query),
  ).map((edge) => edge.source));
}

export function filterOwnershipGraph(
  graph: OwnershipGraph,
  filters: OwnershipGraphQuery,
): OwnershipGraph {
  const q = filters.q?.trim().toLowerCase();
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const eligibleEdges = graph.edges.filter((e) => {
    if (
      (filters.type && e.type !== filters.type) ||
      (filters.status && e.status !== filters.status) ||
      (filters.evidenceTier && !e.evidenceTiers.includes(filters.evidenceTier))
    )
      return false;
    return true;
  });
  // Search selects channels, then restores their other eligible relationships.
  // Do not walk through contextual firms to their unrelated channels.
  const matchedChannels = new Set(eligibleEdges.filter((edge) => !q ||
    matchesOwnershipSearch(byId.get(edge.source), q) ||
    matchesOwnershipSearch(byId.get(edge.target), q),
  ).map((edge) => edge.target));
  const edges = eligibleEdges.filter((edge) => matchedChannels.has(edge.target));
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
