import { expect, type Page, type Locator } from "@playwright/test";
import { graphReady } from "./app";
type Point = { x: number; y: number };
export async function position(node: Locator): Promise<Point> {
  return node.evaluate((el) => {
    const m = new DOMMatrixReadOnly((el as HTMLElement).style.transform);
    return { x: m.m41, y: m.m42 };
  });
}
export async function settled(page: Page, node: Locator, threshold = 0.2) {
  await graphReady(page);
  await expect
    .poll(
      async () => {
        const a = await position(node);
        await page.waitForTimeout(120);
        const b = await position(node);
        return Math.hypot(a.x - b.x, a.y - b.y);
      },
      { timeout: 10000 },
    )
    .toBeLessThan(threshold);
}
export async function gesture(
  page: Page,
  node: Locator,
  points: { dx: number; dy: number; ms: number }[],
) {
  const box = (await node.boundingBox())!;
  let x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  const input = await page.context().newCDPSession(page);
  // Native browser input with authored timestamps makes the intended gesture
  // independent of CI/DevTools scheduling delays, especially for a 25 ms flick.
  let timestamp = Date.now() / 1000;
  await input.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
    timestamp,
  });
  await input.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    buttons: 1,
    clickCount: 1,
    timestamp,
  });
  for (const p of points) {
    x += p.dx;
    y += p.dy;
    timestamp += p.ms / 1000;
    await page.waitForTimeout(p.ms);
    await input.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "left",
      buttons: 1,
      timestamp,
    });
  }
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  const release = await position(node);
  await input.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    buttons: 0,
    clickCount: 1,
    timestamp: timestamp + 0.01,
  });
  await input.detach();
  return release;
}
export function checkDirection(delta: Point, direction: Point) {
  const distance = Math.hypot(delta.x, delta.y),
    length = Math.hypot(direction.x, direction.y);
  expect(distance).toBeGreaterThan(0.4);
  expect(
    (delta.x * direction.x + delta.y * direction.y) / (distance * length),
  ).toBeGreaterThan(Math.cos((22 * Math.PI) / 180));
}

export const worldPosition = position;

export async function dragBy(
  page: Page,
  node: Locator,
  dx: number,
  dy: number,
) {
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + dx,
    box.y + box.height / 2 + dy,
    { steps: 20 },
  );
  await page.mouse.up();
}

