export const GRAPH_TRANSITION_MS = 300;
export type Point = { x: number; y: number };
export type Appearance = { phase: "entering" | "exiting"; scale: number };
export type NodePresence = {
  direction: "enter" | "exit";
  started: number;
  from: Point;
  anchor: Point;
  parents: string[];
  opacity: number;
  scale: number;
};
export type EdgePresence = Pick<
  NodePresence,
  "direction" | "started" | "opacity"
>;
export function presenceProgress(started: number, now: number) {
  const t = Math.max(0, Math.min(1, (now - started) / GRAPH_TRANSITION_MS));
  return t * t * (3 - 2 * t);
}
export function samplePresence(
  p: NodePresence,
  now: number,
  target: Point,
  anchor: Point,
) {
  const t = presenceProgress(p.started, now);
  const from = {
    x: p.from.x + anchor.x - p.anchor.x,
    y: p.from.y + anchor.y - p.anchor.y,
  };
  const to = p.direction === "enter" ? target : anchor;
  return {
    position: {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    },
    opacity: p.opacity + ((p.direction === "enter" ? 1 : 0) - p.opacity) * t,
    scale: p.scale + ((p.direction === "enter" ? 1 : 0.65) - p.scale) * t,
  };
}
