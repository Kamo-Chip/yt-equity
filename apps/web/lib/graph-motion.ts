export type MotionSample = { x: number; y: number; time: number };
export type Velocity = { x: number; y: number };
export const PHYSICS_STEP_MS = 1000 / 60;
const FRAME_MS = PHYSICS_STEP_MS;
export type MotionPhase = "layout" | "gliding" | "settling" | "sleeping";
export type MotionState = {
  phase: MotionPhase;
  quietSteps: number;
  vx?: number;
  vy?: number;
};
export const GLIDE_RETENTION = 0.94;
export const LAYOUT_RETENTION = 0.82;
const WINDOW_MS = 50;
const PAUSE_MS = 100;
const MAX_SPEED = 18;
export const MAX_STEERING = (20 * Math.PI) / 180;

// Rest is a physical state, not a pin. Contacts and changed connections can
// wake a particle, but an unrelated simulation reheat cannot restart its drift.
export function advanceMotion(p: MotionState) {
  if (p.phase === "sleeping") return;
  const speed = Math.hypot(p.vx ?? 0, p.vy ?? 0);
  if (p.phase === "gliding" && speed < 0.12) p.phase = "settling";
  p.quietSteps = speed < 0.03 ? p.quietSteps + 1 : 0;
  if (p.quietSteps >= 10) {
    p.phase = "sleeping";
    p.vx = p.vy = 0;
  }
}

export type StepClock = { last: number | null; accumulator: number };
export function resetClock(clock: StepClock) {
  clock.last = null;
  clock.accumulator = 0;
}
export function advanceClock(clock: StepClock, now: number, step: () => void) {
  const elapsed = clock.last == null ? 0 : Math.max(0, now - clock.last);
  clock.last = now;
  // Bound catch-up after a long main-thread stall; background tabs reset the
  // clock entirely. Physics always integrates in the same 60 Hz units.
  clock.accumulator = Math.min(
    clock.accumulator + elapsed,
    PHYSICS_STEP_MS * 6,
  );
  while (clock.accumulator + 1e-7 >= PHYSICS_STEP_MS) {
    step();
    clock.accumulator = Math.max(0, clock.accumulator - PHYSICS_STEP_MS);
  }
  return clock.accumulator / PHYSICS_STEP_MS;
}

// Keep a predecessor for sparse pointer streams, but never record a stationary
// release as movement: that would dilute a real flick or revive a paused one.
export function recordMotion(samples: MotionSample[], sample: MotionSample) {
  const last = samples.at(-1);
  if (
    last &&
    (sample.time <= last.time || (sample.x === last.x && sample.y === last.y))
  )
    return;
  samples.push(sample);
  while (samples.length > 2 && samples[1].time < sample.time - PAUSE_MS)
    samples.shift();
}

export function releaseVelocity(
  samples: MotionSample[],
  releaseTime: number,
): Velocity {
  const last = samples.at(-1);
  if (!last || releaseTime - last.time >= PAUSE_MS) return { x: 0, y: 0 };
  let x = 0,
    y = 0,
    weight = 0;
  const start = last.time - WINDOW_MS;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i];
    const from = Math.max(start, a.time),
      to = b.time;
    if (to <= from || b.time <= a.time) continue;
    // Integrate a linear recency weight over the overlapping interval. Slow,
    // sparse events contribute their true speed, not an artificial fast flick.
    const w = ((to - start) ** 2 - (from - start) ** 2) / (2 * WINDOW_MS);
    x += ((b.x - a.x) / (b.time - a.time)) * w;
    y += ((b.y - a.y) / (b.time - a.time)) * w;
    weight += w;
  }
  if (!weight) return { x: 0, y: 0 };
  x = (x / weight) * FRAME_MS;
  y = (y / weight) * FRAME_MS;
  const freshness = Math.max(
    0,
    1 - Math.max(0, releaseTime - last.time - 40) / (PAUSE_MS - 40),
  );
  const scale = Math.min(1, MAX_SPEED / (Math.hypot(x, y) || 1)) * freshness;
  return { x: x * scale, y: y * scale };
}

// Layout may gently bend a glide, but cannot brake, add speed, or turn it back. Actual
// collision impulses are applied separately, after this constraint.
export function steerGlide(
  before: Velocity,
  proposed: Velocity,
  heading: number,
): Velocity {
  const speed = Math.hypot(before.x, before.y);
  const forward =
    proposed.x * Math.cos(heading) + proposed.y * Math.sin(heading);
  if (forward <= 0) return before;
  const delta = Math.atan2(
    Math.sin(Math.atan2(proposed.y, proposed.x) - heading),
    Math.cos(Math.atan2(proposed.y, proposed.x) - heading),
  );
  const angle =
    heading + Math.max(-MAX_STEERING, Math.min(MAX_STEERING, delta));
  return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
}
