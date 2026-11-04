import { test, expect } from "@playwright/test";
import {
  samplePresence,
  presenceProgress,
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
test("opening and gathering have matching 300 ms endpoints", () => {
  const target = { x: 200, y: 0 },
    anchor = { x: 0, y: 0 };
  expect(samplePresence(enter, 0, target, anchor)).toEqual({
    position: { x: 10, y: 0 },
    opacity: 0,
    scale: 0.65,
  });
  expect(samplePresence(enter, 300, target, anchor)).toEqual({
    position: target,
    opacity: 1,
    scale: 1,
  });
  const exit: NodePresence = {
    ...enter,
    direction: "exit",
    from: target,
    opacity: 1,
    scale: 1,
  };
  expect(samplePresence(exit, 300, target, anchor)).toEqual({
    position: anchor,
    opacity: 0,
    scale: 0.65,
  });
});
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
  expect(samplePresence(exit, 120, target, anchor)).toEqual(midway);
  const closing = samplePresence(exit, 180, target, anchor);
  expect(
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
    ),
  ).toEqual(closing);
});
test("a gathering transition follows the firm's movement", () => {
  const exit: NodePresence = {
    ...enter,
    direction: "exit",
    from: { x: 200, y: 0 },
    opacity: 1,
    scale: 1,
  };
  const still = samplePresence(exit, 150, { x: 200, y: 0 }, { x: 0, y: 0 });
  const moving = samplePresence(exit, 150, { x: 200, y: 0 }, { x: 40, y: -20 });
  expect(moving.position).toEqual({
    x: still.position.x + 40,
    y: still.position.y - 20,
  });
});
test("presentation sampling leaves physical targets and saved positions untouched", () => {
  const target = Object.freeze({ x: 200, y: 100 }),
    from = Object.freeze({ x: 20, y: 10 });
  const transition = Object.freeze({ ...enter, from });
  samplePresence(transition, 150, target, { x: 30, y: 30 });
  expect(target).toEqual({ x: 200, y: 100 });
  expect(from).toEqual({ x: 20, y: 10 });
});
test("progress clamps at both ends without overshoot", () => {
  expect(presenceProgress(100, 0)).toBe(0);
  expect(presenceProgress(100, 1000)).toBe(1);
  expect(presenceProgress(0, 150)).toBe(0.5);
});
