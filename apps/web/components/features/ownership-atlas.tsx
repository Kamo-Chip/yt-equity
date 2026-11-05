"use client";
import { Button } from "@/components/ui/button";
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
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAtlasViewport } from "@/hooks/use-atlas-viewport";
import { useFluidGraph } from "@/hooks/use-fluid-graph";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildAtlasLayout, type AtlasNode } from "@/lib/atlas-layout";
import { GRAPH_TRANSITION_MS } from "@/lib/graph-presence";
import { filterOwnershipGraph, searchExpandedFirms } from "@/lib/ownership-filter";
import {
  Background,
  Controls,
  ReactFlow,
  useNodes,
  useReactFlow,
  useStoreApi,
  type Viewport,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { OwnershipGraph } from "@yt-equity/contracts";
import { GraphLoading } from "./loading-states";
import { GraphState } from "./graph-state";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useRef,
  useTransition,
} from "react";
import { edgeTypes, nodeTypes } from "./atlas-nodes";
import { OwnershipDetails } from "./ownership-details";
const EMPTY_GRAPH: OwnershipGraph = { nodes: [], edges: [] };
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
  const [retrying, startRetry] = useTransition();
  const retry = () => startRetry(() => router.refresh());
  const [resetRequest, setResetRequest] = useState(0);
  const handledReset = useRef(0);
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
    searchExpandedFirms(graph, deferredQuery).forEach((id) => result.add(id));
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
  useEffect(() => setMounted(true), []);
  const mobile = useIsMobile();
  useEffect(() => {
    if (
      selected &&
      !(selected.kind === "node" ? graph.nodes : graph.edges).some(
        (item) => item.id === selected.id,
      )
    )
      setSelected(null);
  }, [graph, selected]);
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
  const { nodes: seeds, edges } = useMemo(
    () => buildAtlasLayout(graph, actualExpanded, mobile, fullGraph),
    [graph, actualExpanded, mobile, fullGraph],
  );
  // A roster refresh changes every firm's default anchor. Filters and channel
  // expansion leave this key alone, preserving the user's local arrangement.
  const firmRoster = useMemo(
    () => JSON.stringify(fullGraph.nodes
      .filter((node) => node.kind === "firm")
      .map((node) => node.id)
      .sort()),
    [fullGraph],
  );

  const { nodes, edges: animatedEdges, onNodesChange, prepareDrag, startDrag, drag, stopDrag, reset, prepareReset, cancelReset } =
    useFluidGraph<AtlasNode>(
      seeds,
      edges,
      `${mobile ? "mobile" : "desktop"}:${firmRoster}`,
      interactionRevision,
      `${deferredQuery}::${type}::${status}`,
    );
  const onFocus = useCallback(() => setNeedsReset(true), []);
  const { viewport, rememberViewport, initialReady, flow, fitted, focusTimer, canvas, onGeometryChange, resetViewport, cancelViewportReset } = useAtlasViewport({ nodeCount: nodes.length, mobile, q, type, onFocus });
  const initializing = !initialReady && !error && graph.nodes.length > 0;
  useEffect(() => { cancelViewportReset(); }, [q, type, status, mobile, firmRoster, cancelViewportReset]);
  const resetAll = () => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
    cancelViewportReset();
    prepareReset();
    setSelected(null);
    setExpanded(new Set());
    setSearchClosed({ q: "", ids: new Set() });
    window.dispatchEvent(new Event("atlas-search-clear"));
    window.history.replaceState(null, "", "/");
    setNeedsReset(true);
    setResetRequest((value) => value + 1);
  };
  useEffect(() => {
    // Wait for URL state and the deferred search to publish the default topology.
    if (!resetRequest || handledReset.current === resetRequest || q || deferredQuery || type !== "all" || status !== "all") return;
    handledReset.current = resetRequest;
    const result = reset();
    resetViewport(result.nodes, result.duration);
    void result.finished.then((finished) => {
      if (finished && handledReset.current === resetRequest) setNeedsReset(false);
    });
  }, [resetRequest, q, deferredQuery, type, status, reset, resetViewport]);
  const interruptReset = () => {
    handledReset.current = resetRequest;
    cancelReset();
    cancelViewportReset();
  };
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
  return (
    <main
      aria-label="Ownership explorer"
      aria-busy={initializing}
      data-graph-ready={initialReady}
      data-graph-initializing={initializing}
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
                onClick={retry}
                disabled={retrying}
              >
                {retrying && <LoaderCircle className="motion-safe:animate-spin" />}
                {retrying ? "Retrying…" : "Retry refresh"}
              </Button>
            )}
            {(needsReset || q || type !== "all" || status !== "all" || actualExpanded.size > 0 || selected) && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto pointer-events-auto bg-background shadow-sm"
                onClick={resetAll}
              >
                <RotateCcw />
                Reset view
              </Button>
            )}
          </div>
          <div
            ref={canvas}
            className="graph-canvas"
            aria-hidden={initializing || undefined}
            inert={initializing || error || !graph.nodes.length ? true : undefined}
            onWheelCapture={interruptReset}
            onKeyDownCapture={interruptReset}
            onPointerDownCapture={(event) => {
              interruptReset();
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
              defaultViewport={viewport}
              onViewportChange={rememberViewport}
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
                  interruptReset();
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
              <AtlasGeometry viewport={viewport} onChange={onGeometryChange} />
              <Background gap={24} size={1.4} color="var(--graph-grid)" />
              <Controls
                orientation={mobile ? "horizontal" : "vertical"}
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
          <div className="graph-legend absolute bottom-4 right-4 flex gap-4 rounded-[20px] border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-[var(--surface-shadow)] pointer-events-none">
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
          <GraphLoading className="graph-loading-overlay absolute inset-0 z-20" />
          {(error || !graph.nodes.length) && (
            <div className="absolute inset-0 z-[5] grid place-items-center overflow-auto bg-background px-4 pb-8 pt-24">
              <GraphState kind={error ? "error" : fullGraph.nodes.length ? "no-matches" : "empty"}>
                {(error || !!fullGraph.nodes.length) && <Button
                  variant="outline"
                  disabled={retrying}
                  onClick={() => {
                    if (error) retry();
                    else {
                      window.dispatchEvent(new Event("atlas-search-clear"));
                      window.history.replaceState(null, "", "/");
                    }
                  }}
                >
                  {retrying && <LoaderCircle className="motion-safe:animate-spin" />}
                  {error ? retrying ? "Reconnecting…" : "Try again" : "Clear filters"}
                </Button>}
              </GraphState>
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
// Subscribe inside React Flow's provider so readiness follows actual store
// geometry and viewport initialization, without waiting a fixed number of frames.
function AtlasGeometry({ viewport, onChange }: {
  viewport: Viewport;
  onChange: (instance: ReturnType<typeof useReactFlow<AtlasNode, Edge>>, nodes: AtlasNode[]) => void;
}) {
  const instance = useReactFlow<AtlasNode, Edge>();
  const nodes = useNodes<AtlasNode>();
  const store = useStoreApi<AtlasNode, Edge>();
  const savedViewport = useRef(viewport);
  useLayoutEffect(() => { savedViewport.current = viewport; }, [viewport]);
  useLayoutEffect(() => {
    // React Flow resets its external store when Activity cleans up effects.
    // Restore the retained camera before its viewport subscription paints.
    const saved = savedViewport.current;
    store.setState({ transform: [saved.x, saved.y, saved.zoom] });
  }, [store]);
  useLayoutEffect(() => onChange(instance, nodes), [instance, nodes, onChange]);
  return null;
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
  const optionLabel = (option: string) => option === "all"
    ? label === "Record status" ? "All statuses" : "All relationships"
    : option[0].toUpperCase() + option.slice(1);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className="w-auto min-w-32 bg-background shadow-sm"
      >
        <SelectValue>{optionLabel(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem value={o} key={o}>
            {optionLabel(o)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
