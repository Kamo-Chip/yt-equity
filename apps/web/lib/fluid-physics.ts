import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Force,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";
import {
  advanceMotion,
  steerGlide,
  GLIDE_RETENTION,
  LAYOUT_RETENTION,
  type MotionState,
  type MotionPhase,
} from "./graph-motion";
export type Particle = SimulationNodeDatum &
  MotionState & {
    id: string;
    kind: "firm" | "channel";
    seedX: number;
    seedY: number;
    homeX: number;
    homeY: number;
    glideHeading: number;
    previousX: number;
    previousY: number;
    wakeOriginX: number;
    wakeOriginY: number;
    arranged: boolean;
    offsetX: number;
    offsetY: number;
    baseOffsetX: number;
    baseOffsetY: number;
    parents: string[];
    radius: number;
  };
type ParticleLink = { source: string | Particle; target: string | Particle };

export function rememberHome(p: Particle, positions: Map<string, Particle>) {
  const origin = center(p, positions);
  p.homeX = p.x ?? p.seedX;
  p.homeY = p.y ?? p.seedY;
  p.offsetX = p.homeX - origin.x;
  p.offsetY = p.homeY - origin.y;
}

export function center(
  p: Particle,
  positions: Map<string, Particle>,
  seeds = false,
) {
  const parents = p.parents
    .map((id) => positions.get(id))
    .filter((n): n is Particle => !!n);
  return parents.length
    ? {
        x:
          parents.reduce(
            (sum, n) => sum + (seeds ? n.seedX : (n.x ?? n.seedX)),
            0,
          ) / parents.length,
        y:
          parents.reduce(
            (sum, n) => sum + (seeds ? n.seedY : (n.y ?? n.seedY)),
            0,
          ) / parents.length,
      }
    : { x: 0, y: 0 };
}
// Unlike forceX/Y's cached targets, these homes follow the connected firms on
// every tick. Shared channels follow their parents' centroid exactly once.
function relativeHomes(
  positions: Map<string, Particle>,
): Force<Particle, undefined> {
  let nodes: Particle[] = [];
  const force: Force<Particle, undefined> = (alpha) => {
    for (const p of nodes) {
      if (p.fx != null || p.fy != null) continue;
      if (p.phase !== "layout") continue;
      const origin = center(p, positions);
      const x = p.kind === "firm" ? p.homeX : origin.x + p.offsetX;
      const y = p.kind === "firm" ? p.homeY : origin.y + p.offsetY;
      p.vx = (p.vx ?? 0) + (x - (p.x ?? x)) * 0.055 * alpha;
      p.vy = (p.vy ?? 0) + (y - (p.y ?? y)) * 0.055 * alpha;
    }
  };
  force.initialize = (particles) => {
    nodes = particles;
  };
  return force;
}
// Refresh cached link targets as a thrown node establishes its new home. This
// keeps link tension from reversing a throw or undoing the user's arrangement.
function fluidLinks(
  links: ParticleLink[],
  positions: Map<string, Particle>,
): Force<Particle, undefined> {
  const link = forceLink<Particle, ParticleLink>(links).id((p) => p.id);
  const force: Force<Particle, undefined> = (alpha) => {
    link
      .distance((edge) => {
        const a = edge.source as Particle,
          b = edge.target as Particle;
        if (!a.arranged && !b.arranged) return 170;
        const home = (p: Particle) => {
          const origin = center(p, positions);
          return p.kind === "firm"
            ? { x: p.homeX, y: p.homeY }
            : { x: origin.x + p.offsetX, y: origin.y + p.offsetY };
        };
        const ah = home(a),
          bh = home(b);
        return Math.max(
          a.radius + b.radius,
          Math.hypot(ah.x - bh.x, ah.y - bh.y),
        );
      })
      .strength((edge) =>
        [edge.source, edge.target].some((p) =>
          ["gliding", "settling"].includes((p as Particle).phase),
        )
          ? 0.015
          : 0.18,
      );
    link(alpha);
  };
  force.initialize = (nodes, random) => link.initialize(nodes, random);
  return force;
}

export function synchronizePosition(p: Particle) {
  p.previousX = p.x ?? p.seedX;
  p.previousY = p.y ?? p.seedY;
}
export function interpolatedPosition(p: Particle, mix: number) {
  if (p.fx != null || p.phase === "sleeping")
    return { x: p.x ?? p.seedX, y: p.y ?? p.seedY };
  return {
    x: p.previousX + ((p.x ?? p.seedX) - p.previousX) * mix,
    y: p.previousY + ((p.y ?? p.seedY) - p.previousY) * mix,
  };
}
export function wakeParticle(
  p: Particle,
  positions: Map<string, Particle>,
  phase: MotionPhase = "layout",
) {
  p.phase = phase;
  p.quietSteps = 0;
  const origin = center(p, positions);
  p.wakeOriginX = origin.x;
  p.wakeOriginY = origin.y;
}
export function graphMoving(nodes: Particle[]) {
  return nodes.some((p) => p.fx != null || p.phase !== "sleeping");
}
function motionForces(
  links: ParticleLink[],
  positions: Map<string, Particle>,
): Force<Particle, undefined> {
  let nodes: Particle[] = [];
  const layouts = [
    fluidLinks(links, positions),
    forceManyBody<Particle>().strength(-220),
    relativeHomes(positions),
  ];
  const collision = forceCollide<Particle>()
    .radius((p) => p.radius)
    .strength(0.85)
    .iterations(2);
  const force: Force<Particle, undefined> = (alpha) => {
    for (const p of nodes) {
      if (
        (p.phase === "sleeping" || p.phase === "settling") &&
        p.parents.length
      ) {
        const origin = center(p, positions);
        if (
          Math.hypot(origin.x - p.wakeOriginX, origin.y - p.wakeOriginY) > 0.5
        )
          wakeParticle(p, positions);
      }
    }
    const before = nodes.map((p) => ({ x: p.vx ?? 0, y: p.vy ?? 0 }));
    for (const layout of layouts) layout(alpha);
    nodes.forEach((p, i) => {
      if (p.phase === "sleeping") p.vx = p.vy = 0;
      else if (p.phase === "gliding" || p.phase === "settling") {
        const v = steerGlide(
          before[i],
          { x: p.vx ?? 0, y: p.vy ?? 0 },
          p.glideHeading,
        );
        p.vx = v.x;
        p.vy = v.y;
      }
    });
    const preCollision = nodes.map((p) => ({ x: p.vx ?? 0, y: p.vy ?? 0 }));
    collision(alpha);
    nodes.forEach((p, i) => {
      const impulse = Math.hypot(
        (p.vx ?? 0) - preCollision[i].x,
        (p.vy ?? 0) - preCollision[i].y,
      );
      if (impulse > 0.0001 && p.fx == null) {
        if (p.phase === "sleeping") {
          wakeParticle(
            p,
            positions,
            Math.hypot(p.vx ?? 0, p.vy ?? 0) > 0.12 ? "gliding" : "settling",
          );
          p.arranged = true;
        }
        p.glideHeading = Math.atan2(p.vy ?? 0, p.vx ?? 0);
      }
      const retention =
        p.phase === "gliding" ? GLIDE_RETENTION : LAYOUT_RETENTION;
      p.vx = (p.vx ?? 0) * retention;
      p.vy = (p.vy ?? 0) * retention;
    });
  };
  force.initialize = (particles, random) => {
    nodes = particles;
    for (const layout of layouts) layout.initialize?.(particles, random);
    collision.initialize(particles, random);
  };
  return force;
}
export function createGraphSimulation(
  nodes: Particle[],
  links: ParticleLink[],
  positions: Map<string, Particle>,
) {
  // No autonomous d3 timer: the shared frame scheduler owns fixed-step ticks.
  return forceSimulation(nodes)
    .stop()
    .force("motion", motionForces(links, positions))
    .velocityDecay(0)
    .alphaDecay(0.035);
}
export function stepGraph(
  instance: Simulation<Particle, undefined>,
  nodes: Particle[],
  positions: Map<string, Particle>,
) {
  for (const p of nodes) synchronizePosition(p);
  instance.tick();
  for (const p of nodes) {
    if (p.fx != null) {
      synchronizePosition(p);
      continue;
    }
    const previousPhase = p.phase;
    if (p.phase === "gliding" || p.phase === "settling")
      rememberHome(p, positions);
    advanceMotion(p);
    if (previousPhase === "gliding" && p.phase === "settling") {
      const origin = center(p, positions);
      p.wakeOriginX = origin.x;
      p.wakeOriginY = origin.y;
    }
    if (p.phase === "sleeping") {
      if (previousPhase !== "sleeping") {
        rememberHome(p, positions);
        const origin = center(p, positions);
        p.wakeOriginX = origin.x;
        p.wakeOriginY = origin.y;
      }
      synchronizePosition(p);
    }
  }
}
export function settleGraph(
  instance: Simulation<Particle, undefined>,
  nodes: Particle[],
  positions: Map<string, Particle>,
  steps = 120,
) {
  for (let i = 0; i < steps; i++) stepGraph(instance, nodes, positions);
  for (const p of nodes) {
    wakeParticle(p, positions, "sleeping");
    p.quietSteps = 10;
    p.vx = p.vy = 0;
    synchronizePosition(p);
  }
  instance.alpha(0);
}
