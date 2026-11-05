import test from "node:test";
import assert from "node:assert/strict";
import {
  samplePresence,
  type NodePresence,
} from "../../lib/graph-presence";
const enter: NodePresence = {
  direction: "enter",
  started: 0,
  from: { x: 10, y: 0 },
  anchor: { x: 0, y: 0 },
  parents: ["firm"],
  opacity: 0,
  scale: 0.65,
};
test("rapid reversal starts at the current visual position, scale and opacity", () => {
  const target = { x: 200, y: 100 },
    anchor = { x: 0, y: 0 };
  const midway = samplePresence(enter, 120, target, anchor);
  const exit: NodePresence = {
    ...enter,
    direction: "exit",
    started: 120,
    from: midway.position,
    opacity: midway.opacity,
    scale: midway.scale,
  };
  assert.deepStrictEqual(samplePresence(exit, 120, target, anchor), midway);
  const closing = samplePresence(exit, 180, target, anchor);
  assert.deepStrictEqual(
    samplePresence(
      {
        ...exit,
        direction: "enter",
        started: 180,
        from: closing.position,
        opacity: closing.opacity,
        scale: closing.scale,
      },
      180,
      target,
      anchor,
    ), closing);
});
test("presentation sampling leaves physical targets and saved positions untouched", () => {
  const target = Object.freeze({ x: 200, y: 100 }),
    from = Object.freeze({ x: 20, y: 10 });
  const transition = Object.freeze({ ...enter, from });
  samplePresence(transition, 150, target, { x: 30, y: 30 });
  assert.deepStrictEqual(target, { x: 200, y: 100 });
  assert.deepStrictEqual(from, { x: 20, y: 10 });
});
