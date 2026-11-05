"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNodesState, type Edge, type Node } from "@xyflow/react";
import {
  GRAPH_TRANSITION_MS,
  presenceProgress,
  samplePresence,
  type NodePresence,
  type EdgePresence,
} from "@/lib/graph-presence";
import {
  advanceClock,
  resetClock,
  recordMotion,
  releaseVelocity,
  type MotionSample,
  type StepClock,
} from "@/lib/graph-motion";
import {
  center,
  rememberHome,
  createGraphSimulation,
  stepGraph,
  settleGraph,
  wakeParticle,
  graphMoving,
  synchronizePosition,
  interpolatedPosition,
  type Particle,
} from "@/lib/fluid-physics";
import type { Simulation } from "d3-force";
import { createParticle, fluidLinks, fluidTopology, initializeFluidGraph } from "@/lib/fluid-initialization";

const RESET_DURATION_MS = 600;

export function useFluidGraph<N extends Node>(
  seeds: N[],
  edges: Edge[],
  layoutKey = "desktop",
  interactionRevision = 0,
  transitionKey = "",
) {
  const [initial] = useState(() => initializeFluidGraph(seeds, edges));
  const [nodes, setNodes, onNodesChange] = useNodesState<N>(initial.nodes);
  const [displayEdges, setDisplayEdges] = useState<Edge[]>(initial.edges);
  const retainedNodes = useRef(new Map(initial.nodes.map(node => [node.id, node])));
  const retainedEdges = useRef(new Map(initial.edges.map(edge => [edge.id, edge])));
  const nodePresence = useRef(new Map<string, NodePresence>());
  const edgePresence = useRef(new Map<string, EdgePresence>());
  const visuals = useRef(
    new Map<
      string,
      { position: { x: number; y: number }; opacity: number; scale: number }
    >(),
  );
  const edgeOpacity = useRef(new Map<string, number>());
  const frame = useRef<number | null>(null);
  const resetStart = useRef(new Map<string, { x: number; y: number }>());
  const resetTween = useRef<{
    started: number;
    from: Map<string, { x: number; y: number }>;
    to: Map<string, { x: number; y: number }>;
    complete: (finished: boolean) => void;
  } | null>(null);
  const physicsClock = useRef<StepClock>({ last: null, accumulator: 0 });
  const blend = useRef(0);
  const physicsEdges = useRef(edges);
  const positions = useRef(initial.positions);
  const simulation = useRef<Simulation<Particle, undefined> | null>(initial.simulation);
  const renderedTemplates = useRef(new WeakMap<N, N>());
  const templates = useRef(seeds),
    reduced = useRef(false);
  const active = useRef<Particle[]>(initial.particles);
  const dragSamples = useRef(new Map<string, MotionSample[]>());
  const cancelReset = useCallback(() => {
    const tween = resetTween.current;
    if (!tween) return;
    resetTween.current = null;
    for (const p of active.current) {
      p.vx = p.vy = 0;
      rememberHome(p, positions.current);
      wakeParticle(p, positions.current, "sleeping");
      synchronizePosition(p);
    }
    tween.complete(false);
  }, []);
  const prepareReset = useCallback(() => {
    cancelReset();
    resetStart.current = new Map([...visuals.current].map(([id, visual]) => [id, { ...visual.position }]));
  }, [cancelReset]);
  const previous = useRef({
    layout: layoutKey,
    topology: initial.topology,
    interaction: interactionRevision,
    transitionKey,
  });
  const topology = fluidTopology(seeds, edges);
  const clearPresence = useCallback(() => {
    nodePresence.current.clear();
    edgePresence.current.clear();
    retainedNodes.current = new Map(templates.current.map((n) => [n.id, n]));
    retainedEdges.current = new Map(physicsEdges.current.map((e) => [e.id, e]));
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null;
    resetClock(physicsClock.current);
  }, []);
  const anchorFor = useCallback((parents: string[]) => {
    const particles = parents
      .map((id) => positions.current.get(id))
      .filter((p): p is Particle => !!p);
    return {
      x:
        particles.reduce(
          (sum, p) =>
            sum +
            (reduced.current
              ? (p.x ?? p.seedX)
              : interpolatedPosition(p, blend.current).x),
          0,
        ) / (particles.length || 1),
      y:
        particles.reduce(
          (sum, p) =>
            sum +
            (reduced.current
              ? (p.y ?? p.seedY)
              : interpolatedPosition(p, blend.current).y),
          0,
        ) / (particles.length || 1),
    };
  }, []);
  const render = useCallback(
    function renderFrame() {
      const now = performance.now();
      const tween = resetTween.current;
      if (tween) {
        const progress = reduced.current ? 1 : Math.min(1, (now - tween.started) / RESET_DURATION_MS);
        const eased = 1 - (1 - progress) ** 3;
        for (const p of active.current) {
          const to = tween.to.get(p.id);
          if (!to) continue;
          const from = tween.from.get(p.id) ?? to;
          p.x = from.x + (to.x - from.x) * eased;
          p.y = from.y + (to.y - from.y) * eased;
          synchronizePosition(p);
        }
        if (progress === 1) {
          resetTween.current = null;
          tween.complete(true);
        }
      }
      if (!tween && simulation.current && !reduced.current && !document.hidden) {
        blend.current = advanceClock(physicsClock.current, now, () => {
          if (graphMoving(active.current))
            stepGraph(simulation.current!, active.current, positions.current);
        });
      }
      for (const [id, transition] of nodePresence.current) {
        if (now - transition.started >= GRAPH_TRANSITION_MS) {
          nodePresence.current.delete(id);
          if (transition.direction === "exit") {
            retainedNodes.current.delete(id);
            visuals.current.delete(id);
          }
        }
      }
      for (const [id, transition] of edgePresence.current) {
        if (now - transition.started >= GRAPH_TRANSITION_MS) {
          edgePresence.current.delete(id);
          if (transition.direction === "exit") retainedEdges.current.delete(id);
        }
      }
      const presentations = [...retainedNodes.current.values()].map((seed) => {
        const p = positions.current.get(seed.id);
        const target =
          p && !reduced.current
            ? interpolatedPosition(p, blend.current)
            : {
                x: p?.x ?? seed.position.x,
                y: p?.y ?? seed.position.y,
              };
        const transition = nodePresence.current.get(seed.id);
        const visual = transition
          ? samplePresence(
              transition,
              now,
              target,
              anchorFor(transition.parents),
            )
          : { position: target, opacity: 1, scale: 1 };
        visuals.current.set(seed.id, visual);
        return { seed, p, transition, visual };
      });
      setNodes((current) => {
        const prior = new Map(current.map((n) => [n.id, n]));
        const next = presentations.map(({ seed, p, transition, visual }) => {
          const node = prior.get(seed.id);
          const position =
            !transition && p?.fx != null && node
              ? node.position
              : visual.position;
          if (
            !transition &&
            !node?.data.appearance &&
            node &&
            renderedTemplates.current.get(node) === seed &&
            node.position.x === position.x &&
            node.position.y === position.y
          )
            return node;
          const exiting = transition?.direction === "exit";
          const nextNode: N = {
            ...seed,
            measured: node?.measured,
            dragging: exiting ? false : node?.dragging,
            position,
            ...(transition
              ? {
                  draggable: exiting ? false : seed.draggable,
                  selectable: exiting ? false : seed.selectable,
                  focusable: exiting ? false : seed.focusable,
                  domAttributes: {
                    ...seed.domAttributes,
                    ...(exiting ? { "aria-hidden": true } : {}),
                  },
                  style: {
                    ...seed.style,
                    opacity: visual.opacity * Number(seed.style?.opacity ?? 1),
                    ...(exiting ? { pointerEvents: "none" as const } : {}),
                  },
                  data: {
                    ...seed.data,
                    appearance: {
                      phase: exiting ? "exiting" : "entering",
                      scale: visual.scale,
                    },
                  },
                }
              : {}),
          };
          renderedTemplates.current.set(nextNode, seed);
          return nextNode;
        });
        return next.length === current.length &&
          next.every((node, i) => node === current[i])
          ? current
          : next;
      });
      const nextEdges = [...retainedEdges.current.values()].map((edge) => {
        const transition = edgePresence.current.get(edge.id);
        const t = transition ? presenceProgress(transition.started, now) : 1;
        const opacity = transition
          ? transition.opacity +
            ((transition.direction === "enter" ? 1 : 0) - transition.opacity) *
              t
          : 1;
        edgeOpacity.current.set(edge.id, opacity);
        return transition
          ? {
              ...edge,
              selectable:
                transition.direction === "exit" ? false : edge.selectable,
              focusable:
                transition.direction === "exit" ? false : edge.focusable,
              data: {
                ...edge.data,
                appearance:
                  transition.direction === "exit" ? "exiting" : "entering",
              },
              style: {
                ...edge.style,
                opacity: opacity * Number(edge.style?.opacity ?? 1),
                ...(transition.direction === "exit"
                  ? { pointerEvents: "none" as const }
                  : {}),
              },
            }
          : edge;
      });
      setDisplayEdges((current) =>
        nextEdges.length === current.length &&
        nextEdges.every((e, i) => e === current[i])
          ? current
          : nextEdges,
      );
      if (
        (resetTween.current || nodePresence.current.size ||
          edgePresence.current.size ||
          (!reduced.current &&
            simulation.current &&
            graphMoving(active.current))) &&
        !document.hidden &&
        frame.current == null
      ) {
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          renderFrame();
        });
      }
    },
    [setNodes, anchorFor],
  );
  const requestRender = useCallback(() => {
    if (!document.hidden && frame.current == null) {
      resetClock(physicsClock.current);
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        render();
      });
    }
  }, [render]);
  useEffect(() => {
    templates.current = seeds;
    // Keep metadata fresh without briefly displaying new nodes before their
    // topology effect has registered their entrance positions.
    for (const seed of seeds)
      if (retainedNodes.current.has(seed.id))
        retainedNodes.current.set(seed.id, seed);
    for (const edge of edges)
      if (retainedEdges.current.has(edge.id))
        retainedEdges.current.set(edge.id, edge);
    if (
      previous.current.topology === topology &&
      previous.current.layout === layoutKey &&
      previous.current.interaction === interactionRevision &&
      previous.current.transitionKey === transitionKey
    ) {
      physicsEdges.current = edges;
      render();
    }
  }, [
    seeds,
    edges,
    topology,
    layoutKey,
    interactionRevision,
    transitionKey,
    render,
  ]);
  useEffect(() => () => { cancelReset(); clearPresence(); simulation.current?.stop(); }, [cancelReset, clearPresence]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.current = media.matches;
    const motion = () => {
      reduced.current = media.matches;
      if (media.matches) {
        clearPresence();
        dragSamples.current.clear();
        for (const p of active.current) {
          wakeParticle(p, positions.current);
          p.vx = p.vy = 0;
          rememberHome(p, positions.current);
        }
        simulation.current?.stop();
        if (simulation.current) {
          simulation.current.alphaTarget(0);
          settleGraph(simulation.current, active.current, positions.current);
        }
        render();
      }
    };
    const visibility = () => {
      if (document.hidden) {
        simulation.current?.stop();
        if (frame.current != null) cancelAnimationFrame(frame.current);
        frame.current = null;
        resetClock(physicsClock.current);
        for (const p of active.current) synchronizePosition(p);
      } else {
        resetClock(physicsClock.current);
        render();
      }
    };
    media.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      media.removeEventListener("change", motion);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [render, clearPresence]);
  useEffect(() => {
    if (previous.current.topology === topology && previous.current.layout === layoutKey &&
        previous.current.interaction === interactionRevision && previous.current.transitionKey === transitionKey) {
      // Initial mount and Activity resume reuse the already settled simulation.
      render();
      return;
    }
    cancelReset();
    const oldAlpha = simulation.current?.alpha() ?? 0;
    simulation.current?.stop();
    const currentSeeds = templates.current;
    const layoutChanged = previous.current.layout !== layoutKey;
    const explicit = previous.current.interaction !== interactionRevision;
    const filtersChanged = previous.current.transitionKey !== transitionKey;
    const animate =
      explicit && !layoutChanged && !filtersChanged && !reduced.current;
    const oldEdges = physicsEdges.current;
    physicsEdges.current = edges;
    const sameTopology = previous.current.topology === topology;
    const visibleBefore = new Set(active.current.map((p) => p.id));
    const newlyVisible = currentSeeds.some((n) => !visibleBefore.has(n.id));
    previous.current = {
      layout: layoutKey,
      topology,
      interaction: interactionRevision,
      transitionKey,
    };
    const visible = new Set(currentSeeds.map((n) => n.id));
    for (const p of positions.current.values()) {
      if (layoutChanged || !visible.has(p.id)) {
        dragSamples.current.delete(p.id);
        if (
          p.phase === "gliding" ||
          p.phase === "settling" ||
          p.fx != null ||
          p.fy != null
        )
          rememberHome(p, positions.current);
        p.phase = "sleeping";
        p.quietSteps = 10;
        p.fx = p.fy = null;
        p.vx = p.vy = 0;
      }
    }
    const added = new Set<string>();
    // Register firms before computing any channel's relative resting position.
    for (const seed of currentSeeds) {
      let p = positions.current.get(seed.id);
      if (!p) {
        p = createParticle(seed);
        positions.current.set(seed.id, p);
        added.add(seed.id);
      }
      const oldOrigin = center(p, positions.current);
      const oldParents = p.parents.join("|");
      p.parents = [
        ...new Set(
          edges.filter((e) => e.target === seed.id).map((e) => e.source),
        ),
      ];
      if (
        !added.has(p.id) &&
        !layoutChanged &&
        visibleBefore.has(p.id) &&
        p.kind === "channel" &&
        oldParents !== p.parents.join("|")
      ) {
        const origin = center(p, positions.current);
        p.offsetX += oldOrigin.x - origin.x;
        p.offsetY += oldOrigin.y - origin.y;
      }
      if (layoutChanged) {
        p.seedX = seed.position.x;
        p.seedY = seed.position.y;
        p.homeX = p.seedX;
        p.homeY = p.seedY;
      }
    }
    active.current = currentSeeds.map((seed) => {
      const p = positions.current.get(seed.id)!;
      const origin = center(p, positions.current),
        base = center(p, positions.current, true);
      if (added.has(p.id) || layoutChanged) {
        p.baseOffsetX = p.seedX - base.x;
        p.baseOffsetY = p.seedY - base.y;
        wakeParticle(p, positions.current);
        p.arranged = false;
        p.homeX = p.seedX;
        p.homeY = p.seedY;
        p.offsetX = p.baseOffsetX;
        p.offsetY = p.baseOffsetY;
        if (p.fx == null && p.fy == null) {
          p.x = p.kind === "channel" ? origin.x + p.offsetX : p.seedX;
          p.y = p.kind === "channel" ? origin.y + p.offsetY : p.seedY;
          p.vx = p.vy = 0;
        }
      } else if (!visibleBefore.has(p.id) && p.kind === "channel") {
        // Hidden channels retain their arrangement relative to their firms.
        // Reactivation restores that physical target; only presentation unfolds.
        p.x = origin.x + p.offsetX;
        p.y = origin.y + p.offsetY;
        p.vx = p.vy = 0;
      }
      return p;
    });
    const affected = new Set(
      currentSeeds.filter((n) => !visibleBefore.has(n.id)).map((n) => n.id),
    );
    const oldLinks = new Map(oldEdges.map((e) => [e.id, e]));
    const newLinks = new Map(edges.map((e) => [e.id, e]));
    for (const edge of [...oldEdges, ...edges]) {
      const old = oldLinks.get(edge.id),
        next = newLinks.get(edge.id);
      if (
        !old ||
        !next ||
        old.source !== next.source ||
        old.target !== next.target
      ) {
        affected.add(edge.source);
        affected.add(edge.target);
      }
    }
    for (const p of active.current) {
      if (layoutChanged || affected.has(p.id))
        wakeParticle(p, positions.current);
      synchronizePosition(p);
    }
    resetClock(physicsClock.current);
    const now = performance.now();
    if (!animate) clearPresence();
    else {
      for (const [id, seed] of retainedNodes.current) {
        if (
          (!visible.has(id) && !nodePresence.current.has(id)) ||
          (!visible.has(id) &&
            nodePresence.current.get(id)?.direction === "enter")
        ) {
          const parents = oldEdges
            .filter((e) => e.target === id)
            .map((e) => e.source);
          const visual = visuals.current.get(id);
          if (seed.data.kind === "channel" && visual && parents.length) {
            nodePresence.current.set(id, {
              direction: "exit",
              started: now,
              from: visual.position,
              anchor: anchorFor(parents),
              parents,
              opacity: visual.opacity,
              scale: visual.scale,
            });
          } else retainedNodes.current.delete(id);
        }
      }
      for (const seed of currentSeeds) {
        if (!visibleBefore.has(seed.id) && seed.data.kind === "channel") {
          const p = positions.current.get(seed.id)!;
          const parents = p.parents;
          const anchor = anchorFor(parents);
          const visual =
            nodePresence.current.get(seed.id)?.direction === "exit"
              ? visuals.current.get(seed.id)
              : undefined;
          nodePresence.current.set(seed.id, {
            direction: "enter",
            started: now,
            parents,
            anchor,
            from: visual?.position ?? {
              x: anchor.x + ((p.x ?? p.seedX) - anchor.x) * 0.1,
              y: anchor.y + ((p.y ?? p.seedY) - anchor.y) * 0.1,
            },
            opacity: visual?.opacity ?? 0,
            scale: visual?.scale ?? 0.65,
          });
        }
      }
      const edgeIds = new Set(edges.map((e) => e.id));
      for (const id of retainedEdges.current.keys()) {
        if (
          !edgeIds.has(id) &&
          edgePresence.current.get(id)?.direction !== "exit"
        )
          edgePresence.current.set(id, {
            direction: "exit",
            started: now,
            opacity: edgeOpacity.current.get(id) ?? 1,
          });
      }
      for (const edge of edges) {
        const reversing =
          edgePresence.current.get(edge.id)?.direction === "exit";
        if (!retainedEdges.current.has(edge.id) || reversing)
          edgePresence.current.set(edge.id, {
            direction: "enter",
            started: now,
            opacity: reversing ? (edgeOpacity.current.get(edge.id) ?? 0) : 0,
          });
      }
    }
    for (const seed of currentSeeds) retainedNodes.current.set(seed.id, seed);
    for (const edge of edges) retainedEdges.current.set(edge.id, edge);
    const links = fluidLinks(edges);
    const instance = createGraphSimulation(
      active.current,
      links,
      positions.current,
    );
    simulation.current = instance;
    if (
      !newlyVisible &&
      !layoutChanged &&
      !explicit &&
      !(sameTopology && oldAlpha > 0.001)
    ) {
      instance.stop().alpha(0);
    } else if (reduced.current || layoutChanged || !visibleBefore.size) {
      // Initial and responsive framing need the resting geometry. Subsequent
      // user interactions retain their normal spring response.
      settleGraph(instance, active.current, positions.current);
    } else {
      instance.alpha(
        sameTopology && !explicit && !layoutChanged ? oldAlpha : 0.65,
      );
    }
    render();
    return () => {
      instance.stop();
    };
    // Topology and explicit interactions drive forces; new server props only update templates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    topology,
    layoutKey,
    interactionRevision,
    transitionKey,
    render,
    requestRender,
    clearPresence,
    anchorFor,
    cancelReset,
  ]);
  const drag = useCallback(
    (node: N, sample: MotionSample) => {
      const p = positions.current.get(node.id),
        instance = simulation.current;
      if (
        !p ||
        !instance ||
        nodePresence.current.get(node.id)?.direction === "exit"
      )
        return;
      nodePresence.current.delete(node.id);
      const samples = dragSamples.current.get(node.id) ?? [];
      recordMotion(samples, sample);
      dragSamples.current.set(node.id, samples);
      wakeParticle(p, positions.current);
      p.vx = p.vy = 0;
      p.fx = p.x = node.position.x;
      p.fy = p.y = node.position.y;
      synchronizePosition(p);
      instance.alpha(Math.max(instance.alpha(), 0.45)).alphaTarget(0.18);
      if (reduced.current) {
        settleGraph(instance, active.current, positions.current, 12);
        render();
      } else requestRender();
    },
    [render, requestRender],
  );
  const prepareDrag = useCallback((id: string, sample: MotionSample) => {
    dragSamples.current.set(id, [sample]);
  }, []);
  const startDrag = useCallback(
    (node: N, sample: MotionSample) => {
      drag(node, sample);
    },
    [drag],
  );
  const stopDrag = useCallback(
    (node: N, sample: MotionSample) => {
      const p = positions.current.get(node.id),
        instance = simulation.current;
      if (!p || !instance) return;
      p.x = node.position.x;
      p.y = node.position.y;
      p.fx = p.fy = null;
      p.vx = p.vy = 0;
      const samples = dragSamples.current.get(node.id) ?? [];
      recordMotion(samples, sample);
      const velocity = reduced.current
        ? { x: 0, y: 0 }
        : releaseVelocity(samples, sample.time);
      p.vx = velocity.x;
      p.vy = velocity.y;
      p.glideHeading = Math.atan2(p.vy, p.vx);
      wakeParticle(
        p,
        positions.current,
        reduced.current
          ? "layout"
          : Math.hypot(p.vx, p.vy) > 0.12
            ? "gliding"
            : "settling",
      );
      synchronizePosition(p);
      dragSamples.current.delete(node.id);
      p.arranged = true;
      rememberHome(p, positions.current);
      instance.alphaTarget(0).alpha(Math.max(instance.alpha(), 0.35));
      if (reduced.current) {
        settleGraph(instance, active.current, positions.current);
        render();
      } else requestRender();
    },
    [render, requestRender],
  );
  const reset = useCallback(() => {
    cancelReset();
    clearPresence();
    dragSamples.current.clear();
    const from = resetStart.current.size ? resetStart.current : new Map([...visuals.current].map(([id, v]) => [id, { ...v.position }]));
    resetStart.current = new Map();
    const seedMap = new Map(templates.current.map((seed) => [seed.id, seed]));
    for (const p of positions.current.values()) {
      const seed = seedMap.get(p.id);
      if (seed) { p.seedX = seed.position.x; p.seedY = seed.position.y; }
      p.fx = p.fy = null;
      p.vx = p.vy = 0;
      wakeParticle(p, positions.current);
      p.arranged = false;
      p.homeX = p.x = p.seedX;
      p.homeY = p.y = p.seedY;
      p.offsetX = p.baseOffsetX;
      p.offsetY = p.baseOffsetY;
      synchronizePosition(p);
    }
    const instance = simulation.current;
    if (instance) {
      instance.alphaTarget(0).alpha(1);
      settleGraph(instance, active.current, positions.current);
    }
    const to = new Map(active.current.map((p) => [p.id, { x: p.x ?? p.seedX, y: p.y ?? p.seedY }]));
    const targets = templates.current.map((seed) => ({ ...seed, position: to.get(seed.id) ?? seed.position }));
    const duration = reduced.current ? 0 : RESET_DURATION_MS;
    const finished = new Promise<boolean>((complete) => {
      if (!duration) { complete(true); return; }
      resetTween.current = { started: performance.now(), from, to, complete };
    });
    render();
    return { nodes: targets, duration, finished };
  }, [render, clearPresence, cancelReset]);
  return {
    nodes,
    edges: displayEdges,
    onNodesChange,
    prepareDrag,
    startDrag,
    drag,
    stopDrag,
    reset,
    prepareReset,
    cancelReset,
  };
}
