"use client";
import type { AtlasNode } from "@/lib/atlas-layout";
import { getViewportForBounds, type Edge, type ReactFlowInstance, type Viewport } from "@xyflow/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

function headerClearance(canvas: HTMLElement | null) {
  if (!canvas) return 0;
  const header = canvas.closest(".app-shell")?.querySelector(".app-header");
  return header ? Math.max(0, header.getBoundingClientRect().bottom + 12 - canvas.getBoundingClientRect().top) : 0;
}

function initialViewport(nodes: AtlasNode[], rect: { width: number; height: number }, mobile: boolean, topInset: number) {
  // All atlas nodes are root nodes with a centered origin. Read the supplied
  // destination geometry, rather than React Flow's live (moving) node lookup.
  const boxes = nodes.map((node) => {
    const width = node.measured?.width ?? node.width ?? 0;
    const height = node.measured?.height ?? node.height ?? 0;
    return { x: node.position.x - width / 2, y: node.position.y - height / 2, width, height };
  });
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  const bounds = { x, y,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
  };
  const viewport = getViewportForBounds({
    x: bounds.x - 36, y: bounds.y - 24,
    width: bounds.width + 72, height: bounds.height + 80,
  }, rect.width, Math.max(1, rect.height - topInset - (mobile ? 144 : 0)), 0.1, 1, 0.12);
  viewport.y += topInset + (mobile ? 56 : 0);
  return viewport;
}

export function useAtlasViewport({ nodeCount, mobile, q, type, onFocus }: { nodeCount: number; mobile: boolean; q: string; type: string; onFocus: () => void }) {
  const [initialReady, setInitialReady] = useState(false);
  const [viewport, rememberViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const flow = useRef<ReactFlowInstance<AtlasNode, Edge> | null>(null),
    fitted = useRef(false),
    focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const resetFrame = useRef<number | null>(null);
  const cancelViewportReset = useCallback(() => {
    if (resetFrame.current != null) cancelAnimationFrame(resetFrame.current);
    resetFrame.current = null;
  }, []);
  const resetViewport = useCallback((nodes: AtlasNode[], duration: number) => {
    cancelViewportReset();
    const instance = flow.current, rect = canvas.current?.getBoundingClientRect();
    if (!instance || !nodes.length || !rect?.width || !rect.height) return;
    fitted.current = true;
    const target = initialViewport(nodes, rect, mobile, headerClearance(canvas.current));
    const from = instance.getViewport(), started = performance.now();
    // Interrupt any outstanding React Flow focus animation before taking ownership.
    void instance.setViewport(from, { duration: 0 });
    const tick = () => {
      const t = window.matchMedia("(prefers-reduced-motion: reduce)").matches || !duration ? 1 : Math.min(1, (performance.now() - started) / duration);
      const ease = 1 - (1 - t) ** 3;
      void instance.setViewport({
        x: from.x + (target.x - from.x) * ease,
        y: from.y + (target.y - from.y) * ease,
        zoom: from.zoom + (target.zoom - from.zoom) * ease,
      });
      resetFrame.current = t < 1 ? requestAnimationFrame(tick) : null;
    };
    tick();
  }, [mobile, cancelViewportReset]);
  useEffect(() => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
  }, [q, type]);
  useEffect(
    () => () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
      cancelViewportReset();
    },
    [cancelViewportReset],
  );
  useEffect(() => {
    const focus = () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
      cancelViewportReset();
      flow.current?.fitView({
        padding: 0.22,
        maxZoom: 1,
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 250,
      });
      onFocus();
    };
    window.addEventListener("atlas-search-submit", focus);
    return () => window.removeEventListener("atlas-search-submit", focus);
  }, [onFocus, cancelViewportReset]);
  const active = useRef(false);
  const fitting = useRef(false);
  const fitRevision = useRef(0);
  const lastMobile = useRef(mobile);
  const lastSize = useRef<{ width: number; height: number } | null>(null);
  const fit = useCallback((instance = flow.current, current = instance?.getNodes()) => {
    if (!active.current || !instance?.viewportInitialized || !current?.length || fitted.current || fitting.current) return;
    // Hydration starts with the server's desktop layout. Never expose it on a
    // mobile screen while the responsive hook is still publishing its value.
    if (window.matchMedia("(max-width: 767px)").matches !== mobile) return;
    const initialized = current.length === nodeCount && current.every(node => {
      const internal = instance.getInternalNode(node.id);
      return node.data.mobileLayout === mobile && internal?.internals.handleBounds !== undefined &&
        (internal.measured?.width ?? internal.width ?? 0) > 0 &&
        (internal.measured?.height ?? internal.height ?? 0) > 0;
    });
    const rect = canvas.current?.getBoundingClientRect();
    if (!initialized || !rect?.width || !rect.height) return;
    fitting.current = true;
    const request = ++fitRevision.current;
    void instance.setViewport(initialViewport(current, rect, mobile, headerClearance(canvas.current))).then(positioned => {
      if (!active.current || request !== fitRevision.current) return;
      fitting.current = false;
      if (positioned) {
        fitted.current = true;
        setInitialReady(true);
      }
    });
  }, [mobile, nodeCount]);
  const onGeometryChange = useCallback((instance: ReactFlowInstance<AtlasNode, Edge>, current: AtlasNode[]) => {
    flow.current = instance;
    fit(instance, current);
  }, [fit]);
  useLayoutEffect(() => {
    active.current = true;
    if (lastMobile.current !== mobile) {
      fitted.current = false;
      lastMobile.current = mobile;
    }
    fit();
    const resize = () => {
      const rect = canvas.current?.getBoundingClientRect();
      if (!rect?.width || !rect.height) return;
      // Activity reattaches this observer on return. An unchanged size must
      // preserve the user's camera instead of framing the graph again.
      const previous = lastSize.current;
      lastSize.current = { width: rect.width, height: rect.height };
      if (previous && (previous.width !== rect.width || previous.height !== rect.height)) {
        cancelViewportReset();
        fitted.current = false;
      }
      fit();
    };
    const observer = new ResizeObserver(resize);
    if (canvas.current) observer.observe(canvas.current);
    resize();
    return () => {
      active.current = false;
      fitting.current = false;
      fitRevision.current += 1;
      observer.disconnect();
    };
  }, [mobile, fit, cancelViewportReset]);
  return { viewport, rememberViewport, initialReady, flow, fitted, focusTimer, canvas, onGeometryChange, resetViewport, cancelViewportReset };
}
