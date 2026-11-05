import { test, expect } from "@playwright/test";
import { position, settled, gesture, checkDirection } from "../helpers/graph";
import { resetFixture } from "../helpers/app";

test.beforeEach(async ({ request }) => { await resetFixture(request); });

test(`firm final upward flick overrides an earlier horizontal drag`, async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const node = page
    .locator(".react-flow__node")
    .filter({ hasText: "Test firm" });
  await settled(page, node);
  const release = await gesture(page, node, [
    { dx: -20, dy: 0, ms: 30 },
    { dx: -20, dy: 0, ms: 30 },
    { dx: 0, dy: -15, ms: 20 },
    { dx: 0, dy: -15, ms: 20 },
    { dx: 0, dy: -15, ms: 20 },
  ]);
  await page.waitForTimeout(80);
  const after = await position(node);
  checkDirection(
    { x: after.x - release.x, y: after.y - release.y },
    { x: 0, y: -1 },
  );
});
test("touch flick uses the final finger direction and reduced motion cancels inertia", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "no-preference",
    baseURL: test.info().project.use.baseURL,
  });
  try {
    const page = await context.newPage();
    await page.goto("/");
    const node = page
      .locator(".react-flow__node")
      .filter({ hasText: "Test firm" });
    await settled(page, node);
    await page.getByRole("button", { name: "Fit View", exact: true }).tap();
    await page.waitForTimeout(250);
    const touch = await context.newCDPSession(page),
      box = (await node.boundingBox())!,
      x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    const timestamp = Date.now() / 1000;
    await touch.send("Input.dispatchTouchEvent", {
      timestamp,
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let i = 1; i <= 5; i++) {
      await page.waitForTimeout(16);
      await touch.send("Input.dispatchTouchEvent", {
        timestamp: timestamp + i * 0.016,
        type: "touchMove",
        touchPoints: [{ x, y: y + 10 * i }],
      });
    }
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    const release = await position(node);
    await touch.send("Input.dispatchTouchEvent", {
      timestamp: timestamp + 0.09,
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(80);
    const after = await position(node);
    checkDirection(
      { x: after.x - release.x, y: after.y - release.y },
      { x: 0, y: 1 },
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(40);
    const reduced = await position(node);
    await page.waitForTimeout(150);
    const resting = await position(node);
    expect(
      Math.hypot(resting.x - reduced.x, resting.y - reduced.y),
    ).toBeLessThan(0.2);
  } finally {
    await context.close();
  }
});
