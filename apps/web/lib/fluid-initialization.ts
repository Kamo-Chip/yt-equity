import type { Edge, Node } from "@xyflow/react";
import { center, createGraphSimulation, settleGraph, type Particle } from "./fluid-physics";

export function fluidTopology(nodes: Node[], edges: Edge[]) {
  return nodes.map(node => node.id).sort().join("|") + "::" +
    edges.map(edge => `${edge.id}:${edge.source}:${edge.target}`).sort().join("|");
}

export function createParticle(seed: Node): Particle {
  return {
    id: seed.id, kind: seed.data.kind as Particle["kind"],
    seedX: seed.position.x, seedY: seed.position.y,
    homeX: seed.position.x, homeY: seed.position.y,
    x: seed.position.x, y: seed.position.y,
    previousX: seed.position.x, previousY: seed.position.y,
    phase: "layout", quietSteps: 0, glideHeading: 0,
    wakeOriginX: 0, wakeOriginY: 0, arranged: false,
    offsetX: 0, offsetY: 0, baseOffsetX: 0, baseOffsetY: 0,
    parents: [], radius: seed.data.kind === "firm" ? 50 : 34,
  };
}

export function fluidLinks(edges: Edge[]) {
  return [...new Map(edges.map(edge => [
    `${edge.source}:${edge.target}`, { source: edge.source, target: edge.target },
  ])).values()];
}

// Local, deterministic state: safe during SSR and a lazy React initializer.
// The stopped simulation is retained so attaching browser effects does no more
// layout work. Neither the input nodes nor the input edges are mutated.
export function initializeFluidGraph<N extends Node>(seeds: N[], edges: Edge[]) {
  const particles = seeds.map(createParticle);
  const positions = new Map(particles.map(particle => [particle.id, particle]));
  for (const particle of particles) {
    particle.parents = [...new Set(edges.filter(edge => edge.target === particle.id).map(edge => edge.source))];
    const origin = center(particle, positions, true);
    particle.offsetX = particle.baseOffsetX = particle.seedX - origin.x;
    particle.offsetY = particle.baseOffsetY = particle.seedY - origin.y;
  }
  const simulation = createGraphSimulation(particles, fluidLinks(edges), positions);
  settleGraph(simulation, particles, positions);
  const nodes = seeds.map(seed => {
    const particle = positions.get(seed.id)!;
    return { ...seed, position: { x: particle.x!, y: particle.y! } };
  });
  return { nodes, edges, particles, positions, simulation, topology: fluidTopology(seeds, edges) };
}
