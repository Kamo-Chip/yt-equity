import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceMotion,
  recordMotion,
  releaseVelocity,
  steerGlide,
  MAX_STEERING,
  type MotionSample,
  type MotionState,
} from "../../lib/graph-motion";

test("finishing a throw preserves momentum instead of stopping before spring settling", () => {
  const p: MotionState = {
    phase: "gliding",
    quietSteps: 0,
    vx: -0.08,
    vy: 0.04,
  };
  advanceMotion(p);
  assert.equal(p.phase, "settling");
  assert.equal(p.vx, -0.08);
  assert.equal(p.vy, 0.04);
});
const velocity = (
  points: [number, number, number][],
  time = points.at(-1)?.[2] ?? 0,
) =>
  releaseVelocity(
    points.map(([x, y, time]) => ({ x, y, time })),
    time,
  );
test("a final turn wins over the previous direction", () => {
  const v = velocity([
    [0, 0, 0],
    [30, 0, 30],
    [60, 0, 60],
    [60, -30, 90],
    [60, -60, 120],
  ]);
  assert.equal(v.x, 0);
  assert.ok(v.y < 0);
});
test("holding before release cancels momentum; a short delay fades it", () => {
  const samples: [number, number, number][] = [
    [0, 0, 0],
    [20, 0, 20],
  ];
  assert.deepEqual(velocity(samples, 120), { x: 0, y: 0 });
  assert.ok(velocity(samples, 70).x < velocity(samples, 20).x);
});
test("release position contributes a final movement once; duplicate timestamps are ignored", () => {
  const samples: MotionSample[] = [];
  for (const [x, y, time] of [
    [0, 0, 0],
    [10, 0, 10],
    [10, -20, 30],
    [99, 99, 30],
  ])
    recordMotion(samples, { x, y, time });
  const v = releaseVelocity(samples, 30);
  assert.ok(v.y < -10 && Math.abs(v.y) > v.x * 2);
  assert.deepEqual(
    v,
    velocity([
      [0, 0, 0],
      [10, 0, 10],
      [10, -20, 30],
    ]),
  );
});
test("sparse events retain real elapsed time and empty streams do not invent motion", () => {
  assert.ok(
    Math.abs(
      velocity([
        [0, 0, 0],
        [10, 0, 200],
      ]).x -
        ((10 / 200) * 1000) / 60,
    ) < 1e-9,
  );
  assert.deepEqual(releaseVelocity([], 0), { x: 0, y: 0 });
  assert.deepEqual(velocity([[0, 0, 0]]), { x: 0, y: 0 });
});
test("repeated layout steering stays within the release cone in every direction", () => {
  for (let heading = -Math.PI; heading < Math.PI; heading += Math.PI / 4) {
    let v = { x: 10 * Math.cos(heading), y: 10 * Math.sin(heading) };
    for (let i = 0; i < 30; i++) {
      const next = steerGlide(
        v,
        {
          x: v.x + 3 * Math.cos(heading + 1),
          y: v.y + 3 * Math.sin(heading + 1),
        },
        heading,
      );
      const angle = Math.atan2(
        Math.sin(Math.atan2(next.y, next.x) - heading),
        Math.cos(Math.atan2(next.y, next.x) - heading),
      );
      assert.ok(Math.abs(angle) <= MAX_STEERING + 1e-9);
      assert.ok(Math.hypot(next.x, next.y) <= Math.hypot(v.x, v.y) + 1e-9);
      v = next;
    }
  }
});
test("layout cannot reverse momentum; collision heading can establish a new direction", () => {
  assert.deepEqual(steerGlide({ x: 4, y: 0 }, { x: -3, y: 1 }, 0), {
    x: 4,
    y: 0,
  });
  const v = steerGlide({ x: 0, y: 4 }, { x: -1, y: 4 }, Math.PI / 2);
  assert.ok(v.y > 0 && v.x < 0);
});
test("rest requires ten consecutive quiet steps and remains wakeable", () => {
  const p: MotionState = { phase: "settling", quietSteps: 0, vx: 0.02, vy: 0 };
  for (let i = 0; i < 9; i++) advanceMotion(p);
  assert.equal(p.phase, "settling");
  p.vx = 0.05;
  advanceMotion(p);
  assert.equal(p.quietSteps, 0);
  p.vx = 0.02;
  for (let i = 0; i < 10; i++) advanceMotion(p);
  assert.equal(p.phase, "sleeping");
  assert.equal(p.vx, 0);
});
