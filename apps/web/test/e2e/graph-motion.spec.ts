import { test, expect, type Page, type Locator } from "@playwright/test";
type Point = { x: number; y: number };
async function position(node: Locator): Promise<Point> {
  return node.evaluate((el) => {
    const m = new DOMMatrixReadOnly((el as HTMLElement).style.transform);
    return { x: m.m41, y: m.m42 };
  });
}
async function settled(page: Page, node: Locator) {
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
    .toBeLessThan(0.2);
}
async function gesture(
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
function checkDirection(delta: Point, direction: Point) {
  const distance = Math.hypot(delta.x, delta.y),
    length = Math.hypot(direction.x, direction.y);
  expect(distance).toBeGreaterThan(0.4);
  expect(
    (delta.x * direction.x + delta.y * direction.y) / (distance * length),
  ).toBeGreaterThan(Math.cos((22 * Math.PI) / 180));
}
for (const kind of ["firm", "channel"] as const) {
  for (const [direction, dx, dy] of [
    ["horizontal", -1, 0],
    ["vertical", 0, -1],
    ["diagonal", -1, -1],
  ] as const) {
    test(`${kind} ${direction} flick keeps its trajectory at different zooms`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto(kind === "firm" ? "/" : "/?q=Shared");
      const node = page
        .locator(".react-flow__node")
        .filter({ hasText: kind === "firm" ? "Test firm" : "Shared channel" });
      await settled(page, node);
      await page
        .getByRole("button", {
          name: kind === "firm" ? "Zoom In" : "Zoom Out",
          exact: true,
        })
        .click();
      await page.waitForTimeout(250);
      let previous = await gesture(
        page,
        node,
        Array.from({ length: 5 }, () => ({ dx: dx * 12, dy: dy * 12, ms: 16 })),
      );
      for (let i = 0; i < 3; i++) {
        await page.waitForTimeout(40);
        const next = await position(node);
        checkDirection(
          { x: next.x - previous.x, y: next.y - previous.y },
          { x: dx, y: dy },
        );
        previous = next;
      }
      await settled(page, node);
    });
  }
  test(`${kind} final upward flick overrides an earlier horizontal drag`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(kind === "firm" ? "/" : "/?q=Shared");
    const node = page
      .locator(".react-flow__node")
      .filter({ hasText: kind === "firm" ? "Test firm" : "Shared channel" });
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
}
test("a fast short flick glides farther than the same slow drag", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const distances = [];
  for (const ms of [20, 160]) {
    await page.goto("/");
    const node = page
      .locator(".react-flow__node")
      .filter({ hasText: "Test firm" });
    await settled(page, node);
    const release = await gesture(page, node, [
      { dx: -15, dy: 0, ms },
      { dx: -15, dy: 0, ms },
      { dx: -15, dy: 0, ms },
    ]);
    await page.waitForTimeout(100);
    const after = await position(node);
    distances.push(release.x - after.x);
  }
  expect(distances[0]).toBeGreaterThan(distances[1] + 5);
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

for (const kind of ["firm", "channel"] as const) {
  test(`${kind} single-step flick retains the pointer-down sample`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(kind === "firm" ? "/" : "/?q=Shared");
    const node = page
      .locator(".react-flow__node")
      .filter({ hasText: kind === "firm" ? "Test firm" : "Shared channel" });
    await settled(page, node);
    const release = await gesture(page, node, [{ dx: 0, dy: -30, ms: 25 }]);
    await page.waitForTimeout(80);
    const after = await position(node);
    expect(release.y - after.y).toBeGreaterThan(5);
    checkDirection(
      { x: after.x - release.x, y: after.y - release.y },
      { x: 0, y: -1 },
    );
  });
}

for (const kind of ["firm", "channel"] as const) {
  test(`${kind} visibly coasts and stays still for two seconds after settling`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(kind === "firm" ? "/" : "/?q=Shared");
    const node = page
      .locator(".react-flow__node")
      .filter({ hasText: kind === "firm" ? "Test firm" : "Shared channel" });
    await settled(page, node);
    const release = await gesture(
      page,
      node,
      Array.from({ length: 5 }, () => ({ dx: 0, dy: -8, ms: 16 })),
    );
    const trace = await node.evaluate(
      (el) =>
        new Promise<{ t: number; x: number; y: number }[]>((resolve) => {
          const points: { t: number; x: number; y: number }[] = [],
            start = performance.now();
          function sample() {
            const m = new DOMMatrixReadOnly(
                (el as HTMLElement).style.transform,
              ),
              t = performance.now() - start;
            points.push({ t, x: m.m41, y: m.m42 });
            if (t < 1500) requestAnimationFrame(sample);
            else resolve(points);
          }
          requestAnimationFrame(sample);
        }),
    );
    const at = (time: number) =>
      trace.reduce(
        (best, p) =>
          Math.abs(p.t - time) < Math.abs(best.t - time) ? p : best,
        trace[0],
      );
    const early = at(250),
      later = at(600),
      late = at(1000);
    expect(release.y - early.y).toBeGreaterThan(20);
    expect(early.y - later.y).toBeGreaterThan(10);
    expect((later.y - late.y) / (late.t - later.t)).toBeLessThan(
      (release.y - early.y) / early.t,
    );
    await settled(page, node);
    await page.waitForTimeout(200);
    const resting = await position(node);
    await page.waitForTimeout(2000);
    const final = await position(node);
    const scale = await page
      .locator(".react-flow__viewport")
      .evaluate(
        (el) => new DOMMatrixReadOnly((el as HTMLElement).style.transform).a,
      );
    expect(
      Math.hypot(final.x - resting.x, final.y - resting.y) * scale,
    ).toBeLessThan(1);
  });
}
