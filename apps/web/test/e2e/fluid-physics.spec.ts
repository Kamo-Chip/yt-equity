import { test, expect } from "@playwright/test";
import {
  createGraphSimulation,
  stepGraph,
  interpolatedPosition,
  wakeParticle,
  type Particle,
} from "../../lib/fluid-physics";
import {
  advanceClock,
  resetClock,
  PHYSICS_STEP_MS,
  type StepClock,
} from "../../lib/graph-motion";
function particle(
  id: string,
  x = 0,
  options: Partial<Particle> = {},
): Particle {
  return {
    id,
    kind: "firm",
    x,
    y: 0,
    vx: 0,
    vy: 0,
    seedX: x,
    seedY: 0,
    homeX: x,
    homeY: 0,
    phase: "sleeping",
    quietSteps: 10,
    glideHeading: 0,
    previousX: x,
    previousY: 0,
    wakeOriginX: 0,
    wakeOriginY: 0,
    arranged: true,
    offsetX: x,
    offsetY: 0,
    baseOffsetX: x,
    baseOffsetY: 0,
    parents: [],
    radius: 50,
    ...options,
  };
}
function simulation(
  nodes: Particle[],
  links: { source: string; target: string }[] = [],
) {
  const positions = new Map(nodes.map((p) => [p.id, p]));
  const instance = createGraphSimulation(nodes, links, positions).alpha(0.35);
  return {
    positions,
    instance,
    step: () => stepGraph(instance, nodes, positions),
  };
}

test("higher release momentum coasts farther and longer with monotonic slowdown", () => {
  const results = [1, 5, 12].map((speed) => {
    const p = particle("firm", 0, {
      phase: "gliding",
      quietSteps: 0,
      vx: speed,
    });
    const sim = simulation([p]);
    let steps = 0,
      previousSpeed = speed;
    while (p.phase !== "sleeping" && steps < 300) {
      sim.step();
      const currentSpeed = Math.hypot(p.vx!, p.vy!);
      expect(currentSpeed).toBeLessThanOrEqual(previousSpeed + 1e-9);
      expect(p.vx!).toBeGreaterThanOrEqual(0);
      previousSpeed = currentSpeed;
      steps++;
    }
    expect(p.phase).toBe("sleeping");
    return { steps, distance: p.x! };
  });
  expect(results[0].distance).toBeGreaterThan(14);
  expect(results[1].distance).toBeGreaterThan(results[0].distance * 4);
  expect(results[2].distance).toBeGreaterThan(results[1].distance * 2);
  expect(results[1].steps).toBeGreaterThan(results[0].steps);
  expect(results[2].steps).toBeGreaterThan(results[1].steps);
});

test("layout tension cannot brake a moving node's glide", () => {
  const firm = particle("firm", 0, {
    phase: "gliding",
    quietSteps: 0,
    vx: -5,
    glideHeading: Math.PI,
  });
  const channel = particle("channel", 1000, {
    kind: "channel",
    parents: [firm.id],
  });
  const sim = simulation(
    [firm, channel],
    [{ source: firm.id, target: channel.id }],
  );
  for (let i = 0; i < 30; i++) {
    const speed = Math.hypot(firm.vx!, firm.vy!);
    sim.step();
    expect(Math.hypot(firm.vx!, firm.vy!)).toBeCloseTo(speed * 0.94, 8);
  }
});

test("resting nodes ignore global reheating and do not drift for two seconds", () => {
  const a = particle("a"),
    b = particle("b", 220);
  const sim = simulation([a, b]);
  sim.instance.alpha(1);
  for (let i = 0; i < 120; i++) sim.step();
  expect([a.x, a.y, b.x, b.y]).toEqual([0, 0, 220, 0]);
  expect([a.phase, b.phase]).toEqual(["sleeping", "sleeping"]);
  expect(a.fx).toBeUndefined();
  expect(b.fx).toBeUndefined();
});

test("a sleeping shared channel wakes after cumulative parent displacement", () => {
  const a = particle("a"),
    b = particle("b", 400);
  const channel = particle("channel", 200, {
    kind: "channel",
    parents: [a.id, b.id],
    offsetX: 0,
    wakeOriginX: 200,
  });
  const sim = simulation(
    [a, b, channel],
    [
      { source: a.id, target: channel.id },
      { source: b.id, target: channel.id },
    ],
  );
  a.x = 0.6;
  sim.step();
  expect(channel.phase).toBe("sleeping");
  a.x = 1.2;
  sim.step();
  expect(channel.phase).not.toBe("sleeping");
  expect(channel.x!).toBeGreaterThan(200);
});

test("a collision wakes a resting firm and transfers momentum", () => {
  const moving = particle("moving", 0, {
      phase: "gliding",
      quietSteps: 0,
      vx: 6,
    }),
    resting = particle("resting", 103);
  const sim = simulation([moving, resting]);
  sim.step();
  expect(resting.phase).not.toBe("sleeping");
  expect(resting.vx!).toBeGreaterThan(0);
  expect(resting.x!).toBeGreaterThan(103);
  expect(resting.fx).toBeUndefined();
});

test("layout motion keeps its original damping and explicit interaction wakes rest", () => {
  const p = particle("firm", 0, { phase: "layout", quietSteps: 0, vx: 5 });
  const sim = simulation([p]);
  sim.step();
  expect(p.vx).toBeCloseTo(5 * 0.82, 8);
  p.phase = "sleeping";
  p.vx = 0;
  wakeParticle(p, sim.positions);
  expect(p.phase).toBe("layout");
  expect(p.quietSteps).toBe(0);
});

test("60 Hz and 120 Hz rendering produce the same physical trajectory", () => {
  function run(hz: number) {
    const p = particle("firm", 0, { phase: "gliding", quietSteps: 0, vx: 12 });
    const sim = simulation([p]);
    const clock: StepClock = { last: null, accumulator: 0 };
    const samples = [];
    for (let i = 0; i <= hz * 2; i++) {
      const mix = advanceClock(clock, (i * 1000) / hz, sim.step);
      if (i % (hz / 10) === 0) samples.push(interpolatedPosition(p, mix).x);
    }
    return samples;
  }
  const a = run(60),
    b = run(120);
  expect(a).toHaveLength(b.length);
  a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 6));
});

test("resuming a hidden tab does not integrate its time in the background", () => {
  const clock: StepClock = { last: null, accumulator: 0 };
  let steps = 0;
  advanceClock(clock, 0, () => steps++);
  advanceClock(clock, PHYSICS_STEP_MS, () => steps++);
  expect(steps).toBe(1);
  resetClock(clock);
  advanceClock(clock, 30000, () => steps++);
  expect(steps).toBe(1);
  advanceClock(clock, 30000 + PHYSICS_STEP_MS, () => steps++);
  expect(steps).toBe(2);
});
