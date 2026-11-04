"use client";
import "@xyflow/react/dist/style.css";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type NodeProps,
  type Node,
  type Edge,
  type ReactFlowInstance,
  BaseEdge,
  useInternalNode,
  type EdgeProps,
} from "@xyflow/react";
import type { OwnershipGraph } from "@yt-equity/contracts";
import { ArrowUpRight, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useRouter } from "next/navigation";
import { filterOwnershipGraph } from "@/lib/ownership-filter";
import { OwnershipDetails } from "./ownership-details";
import { useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";
import { GRAPH_TRANSITION_MS, type Appearance } from "@/lib/graph-presence";
import { useFluidGraph } from "@/hooks/use-fluid-graph";
import { firmLogo } from "./firm-logos";
type Entity = OwnershipGraph["nodes"][number];
type NodeData = { entity: Entity; kind: "firm" | "channel"; expanded: boolean; appearance?: Appearance };
type AtlasNode = Node<NodeData>;
function EntityNode({ data, selected }: NodeProps<AtlasNode>) {
  const [failed, setFailed] = useState(false);
  const n = data.entity;
  const image = n.kind === "firm" ? firmLogo(n.name) : n.profilePictureUrl;
  return (
    <div
      className={`graph-orb ${n.kind} ${selected ? "selected" : ""} ${data.expanded ? "expanded" : ""}`}
      data-presence={data.appearance?.phase}
      style={data.appearance ? { transform: `scale(${data.appearance.scale})` } : undefined}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="orb-image">
        {image && !failed ? (
          <img
            src={image}
            alt=""
            draggable={false}
            onError={() => setFailed(true)}
          />
        ) : (
          <span>{n.name[0]}</span>
        )}
      </div>
      {n.kind === "firm" && <span className="orb-count">{n.channelCount}</span>}
      <strong className="orb-label">{n.name}</strong>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}
function FloatingEdge({ source, target, style, selected }: EdgeProps) {
  const a = useInternalNode(source),
    b = useInternalNode(target);
  if (!a || !b) return null;
  const aw = a.measured.width ?? 84,
    ah = a.measured.height ?? 84,
    bw = b.measured.width ?? 52,
    bh = b.measured.height ?? 52;
  const ax = a.internals.positionAbsolute.x + aw / 2,
    ay = a.internals.positionAbsolute.y + ah / 2,
    bx = b.internals.positionAbsolute.x + bw / 2,
    by = b.internals.positionAbsolute.y + bh / 2;
  const distance = Math.hypot(bx - ax, by - ay) || 1,
    dx = (bx - ax) / distance,
    dy = (by - ay) / distance;
  return (
    <BaseEdge
      path={`M ${ax + (dx * aw) / 2} ${ay + (dy * ah) / 2} L ${bx - (dx * bw) / 2} ${by - (dy * bh) / 2}`}
      style={{ ...style, strokeWidth: selected ? 3 : 1.7 }}
      interactionWidth={20}
    />
  );
}
const EMPTY_GRAPH: OwnershipGraph = { nodes: [], edges: [] };
const edgeTypes = { floating: FloatingEdge };
const nodeTypes = { entity: EntityNode };
export function OwnershipAtlas({
  initialGraph,
  initialError = false,
}: {
  initialGraph?: OwnershipGraph;
  initialError?: boolean;
}) {
  const urlParams = useSearchParams();
  const q = (urlParams.get("q") ?? "").slice(0, 120);
  const typeValue = urlParams.get("type"),
    statusValue = urlParams.get("status");
  const type =
    typeValue && ["funding", "acquisition"].includes(typeValue)
      ? typeValue
      : "all";
  const status =
    statusValue &&
    ["confirmed", "provisional", "disputed"].includes(statusValue)
      ? statusValue
      : "all";
  const setFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(window.location.search);
    value && value !== "all" ? params.set(key, value) : params.delete(key);
    window.history.replaceState(
      null,
      "",
      "/" + (params.size ? "?" + params.toString() : ""),
    );
  }, []);
  const setType = (value: string) => setFilter("type", value);
  const deferredQuery = useDeferredValue(q);
  const router = useRouter();
  const [lastGraph, setLastGraph] = useState(initialGraph);
  useEffect(() => {
    if (initialGraph) setLastGraph(initialGraph);
  }, [initialGraph]);
  const fullGraph = initialGraph ?? lastGraph ?? EMPTY_GRAPH;
  const graph = useMemo(
    () =>
      filterOwnershipGraph(fullGraph, {
        q: deferredQuery,
        type: type === "all" ? undefined : (type as "funding" | "acquisition"),
        status:
          status === "all"
            ? undefined
            : (status as "confirmed" | "provisional" | "disputed"),
      }),
    [fullGraph, deferredQuery, type, status],
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchClosed, setSearchClosed] = useState<{
    q: string;
    ids: Set<string>;
  }>({ q: "", ids: new Set() });
  const actualExpanded = useMemo(() => {
    const result = new Set(expanded);
    if (deferredQuery.trim()) graph.edges.forEach((e) => result.add(e.source));
    if (searchClosed.q === deferredQuery)
      searchClosed.ids.forEach((id) => result.delete(id));
    return result;
  }, [expanded, graph.edges, deferredQuery, searchClosed]);
  const [interactionRevision, setInteractionRevision] = useState(0);
  const [interactive, setInteractive] = useState(true);
  const [selected, setSelected] = useState<{
      kind: "node" | "edge";
      id: string;
    } | null>(null),
    [needsReset, setNeedsReset] = useState(false);
  const error = initialError && !initialGraph && !lastGraph;
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [flowReady, setFlowReady] = useState(false);
  useEffect(() => setMounted(true), []);
  const flow = useRef<ReactFlowInstance<AtlasNode, Edge> | null>(null),
    fitted = useRef(false),
    focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobile = useIsMobile();
  useEffect(() => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
  }, [q, type]);
  useEffect(
    () => () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (
      selected &&
      !(selected.kind === "node" ? graph.nodes : graph.edges).some(
        (item) => item.id === selected.id,
      )
    )
      setSelected(null);
  }, [graph, selected]);
  useEffect(() => {
    const focus = () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
      flow.current?.fitView({
        padding: 0.22,
        maxZoom: 1,
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 250,
      });
      setNeedsReset(true);
    };
    window.addEventListener("atlas-search-submit", focus);
    return () => window.removeEventListener("atlas-search-submit", focus);
  }, []);
  const toggle = useCallback(
    (id: string) => {
      setInteractionRevision((value) => value + 1);
      const closing = actualExpanded.has(id);
      setExpanded((old) => {
        const next = new Set(old);
        closing ? next.delete(id) : next.add(id);
        return next;
      });
      if (deferredQuery.trim())
        setSearchClosed((old) => {
          const ids = new Set(old.q === deferredQuery ? old.ids : []);
          closing ? ids.add(id) : ids.delete(id);
          return { q: deferredQuery, ids };
        });
    },
    [actualExpanded, deferredQuery],
  );
  const { nodes: seeds, edges } = useMemo(() => {
    const visibleEdges = graph.edges.filter((e) =>
      actualExpanded.has(e.source),
    );
    const channelIds = new Set(visibleEdges.map((e) => e.target));
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
    const rootPositions = new Map(
      roots.map((n, i) => [
        n.id,
        {
          x:
            (mobile ? 160 : 220) +
            (i % (mobile ? 2 : 3)) * (mobile ? 260 : 420),
          y: 220 + Math.floor(i / 3) * 420,
        },
      ]),
    );
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
  }, [graph, actualExpanded, mobile, fullGraph]);
  const { nodes, edges: animatedEdges, onNodesChange, prepareDrag, startDrag, drag, stopDrag, reset } =
    useFluidGraph<AtlasNode>(
      seeds,
      edges,
      mobile ? "mobile" : "desktop",
      interactionRevision,
      `${deferredQuery}::${type}::${status}`,
    );
  const displayNodes = useMemo(
    () => nodes.map((node) => {
      const isSelected = selected?.kind === "node" && selected.id === node.id;
      return node.selected === isSelected
        ? node : { ...node, selected: isSelected };
    }),
    [nodes, selected],
  );
  const displayEdges = useMemo(
    () => animatedEdges.map((edge) => ({
      ...edge,
      selected: selected?.kind === "edge" && selected.id === edge.id,
    })),
    [animatedEdges, selected],
  );
  const pointerSample = (event: MouseEvent | TouchEvent | React.PointerEvent) => {
    const point = "changedTouches" in event ? event.changedTouches[0] : event;
    const position = flow.current!.screenToFlowPosition(
      { x: point.clientX, y: point.clientY },
      { snapToGrid: false },
    );
    return { ...position, time: event.timeStamp };
  };
  useEffect(() => {
    if (nodes.length && flowReady && !fitted.current && flow.current) {
      const t = setTimeout(() => {
        if (fitted.current) return;
        fitted.current = true;
        flow.current?.fitView({ padding: 0.18, maxZoom: 1 });
      }, 50);
      focusTimer.current = t;
      return () => clearTimeout(t);
    }
  }, [nodes.length, flowReady]);
  return (
    <main
      aria-label="Ownership explorer"
      className="graph-page flex min-h-0 min-w-0 flex-col"
    >
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          <div className="canvas-toolbar absolute right-4 top-4 z-10 flex flex-wrap items-start gap-2 pointer-events-none">
            <div className="flex flex-wrap gap-2 pointer-events-auto">
              <Filter
                label="Relationship type"
                value={type}
                onChange={setType}
                options={["all", "funding", "acquisition"]}
              />
            </div>
            {initialError && !!lastGraph && (
              <Button
                variant="outline"
                size="sm"
                className="pointer-events-auto"
                onClick={() => router.refresh()}
              >
                Retry refresh
              </Button>
            )}
            {needsReset && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto pointer-events-auto bg-background shadow-sm"
                onClick={() => {
                  if (focusTimer.current) clearTimeout(focusTimer.current);
                  reset();
                  focusTimer.current = setTimeout(
                    () => flow.current?.fitView({ padding: 0.18, maxZoom: 1 }),
                    50,
                  );
                  setNeedsReset(false);
                }}
              >
                <RotateCcw />
                Reset view
              </Button>
            )}
          </div>
          <div
            className="graph-canvas"
            onPointerDownCapture={(event) => {
              const target = event.target as Element;
              const id = target.closest<HTMLElement>(".react-flow__node")
                ?.dataset.id;
              if (id && event.isPrimary && flow.current)
                prepareDrag(id, pointerSample(event));
              fitted.current = true;
              if (focusTimer.current) clearTimeout(focusTimer.current);
            }}
          >
            <ReactFlow<AtlasNode, Edge>
              proOptions={{ hideAttribution: true }}
              nodes={displayNodes}
              edges={displayEdges}
              nodeOrigin={[0.5, 0.5]}
              onNodesChange={onNodesChange}
              onNodeDragStart={(event, n) => {
                if (focusTimer.current) clearTimeout(focusTimer.current);
                startDrag(n, pointerSample(event));
              }}
              onNodeDrag={(event, n) => drag(n, pointerSample(event))}
              onNodeDragStop={(event, n) => {
                stopDrag(n, pointerSample(event));
                setNeedsReset(true);
              }}
              nodeDragThreshold={4}
              edgeTypes={edgeTypes}
              nodeTypes={nodeTypes}
              onInit={(instance) => {
                flow.current = instance;
                setFlowReady(true);
              }}
              onNodeClick={(_, n) => {
                if (!interactive || n.data.appearance?.phase === "exiting") return;
                setSelected({ kind: "node", id: n.id });
                if (n.data.entity.kind === "firm") {
                  const opening = !actualExpanded.has(n.id);
                  toggle(n.id);
                  if (focusTimer.current) clearTimeout(focusTimer.current);
                  if (opening) {
                    setNeedsReset(true);
                    const ids = [
                      n.id,
                      ...graph.edges
                        .filter((e) => e.source === n.id)
                        .map((e) => e.target),
                    ];
                    focusTimer.current = setTimeout(
                      () =>
                        flow.current?.fitView({
                          nodes: ids.map((id) => ({ id })),
                          padding: 0.28,
                          maxZoom: 1.1,
                          duration: window.matchMedia(
                            "(prefers-reduced-motion: reduce)",
                          ).matches
                            ? 0
                            : 350,
                        }),
                      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 32 : GRAPH_TRANSITION_MS + 32,
                    );
                  }
                }
              }}
              onEdgeClick={(_, e) => { if (e.data?.appearance !== "exiting") setSelected({ kind: "edge", id: e.id }); }}
              colorMode={mounted && resolvedTheme === "dark" ? "dark" : "light"}
              onMoveEnd={(event) => {
                if (event) {
                  if (focusTimer.current) clearTimeout(focusTimer.current);
                  setNeedsReset(true);
                }
              }}
              nodesDraggable={interactive}
              elementsSelectable={interactive}
              panOnDrag
              nodesConnectable={false}
              minZoom={0.1}
              maxZoom={1.8}
            >
              <Background gap={24} size={1.4} color="var(--graph-grid)" />
              <Controls
                showInteractive
                showFitView
                fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
                onInteractiveChange={setInteractive}
                onFitView={() => {
                  fitted.current = true;
                  if (focusTimer.current) clearTimeout(focusTimer.current);
                }}
                onZoomIn={() => {
                  fitted.current = true;
                  if (focusTimer.current) clearTimeout(focusTimer.current);
                  setNeedsReset(true);
                }}
                onZoomOut={() => {
                  fitted.current = true;
                  if (focusTimer.current) clearTimeout(focusTimer.current);
                  setNeedsReset(true);
                }}
              />
            </ReactFlow>
          </div>
          <div className="absolute bottom-4 right-4 flex gap-4 rounded-[20px] border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-[var(--surface-shadow)] pointer-events-none">
            <span className="flex items-center gap-2">
              <i
                className="w-5 border-t-2"
                style={{ borderColor: "var(--graph-funding)" }}
              />
              Funding
            </span>
            <span className="flex items-center gap-2">
              <i
                className="w-5 border-t-2"
                style={{ borderColor: "var(--graph-acquisition)" }}
              />
              Acquisition
            </span>
          </div>
          {(error || !graph.nodes.length) && (
            <div className="absolute inset-0 grid place-content-center gap-3 bg-background text-center">
              <h2 className="font-semibold">
                {error
                  ? "Couldn’t load ownership records"
                  : "No matching relationships"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {error
                  ? "Try loading the graph again."
                  : "Try a different search or clear the filters."}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  if (error) router.refresh();
                  else {
                    window.dispatchEvent(new Event("atlas-search-clear"));
                    window.history.replaceState(null, "", "/");
                  }
                }}
              >
                {error ? "Try again" : "Clear filters"}
              </Button>
            </div>
          )}
        </div>
        {selected && !mobile && (
          <aside className="graph-detail" aria-label="Selection details">
            <OwnershipDetails
              graph={graph}
              selection={selected}
              onClose={() => {
                if (focusTimer.current) clearTimeout(focusTimer.current);
                setSelected(null);
              }}
            />
          </aside>
        )}
      </div>
      <Sheet
        open={!!selected && mobile}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent
          className="w-full gap-0 sm:max-w-sm"
          showCloseButton={false}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Ownership details</SheetTitle>
            <SheetDescription>
              Relationships and supporting evidence.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            {selected && (
              <OwnershipDetails
                graph={graph}
                selection={selected}
                onClose={() => {
                  if (focusTimer.current) clearTimeout(focusTimer.current);
                  setSelected(null);
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className="w-auto min-w-32 bg-background shadow-sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem value={o} key={o}>
            {o === "all"
              ? label === "Record status"
                ? "All statuses"
                : "All relationships"
              : o[0].toUpperCase() + o.slice(1)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
