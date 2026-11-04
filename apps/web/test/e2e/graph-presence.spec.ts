import { test, expect, type Page, type Locator } from "@playwright/test";
const fixtureApi = `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT ?? 4101}`;
const firmFor = (page: Page) =>
  page.locator(".react-flow__node").filter({ hasText: "Test firm" });
const channelFor = (page: Page) =>
  page.locator(".react-flow__node").filter({ hasText: "Shared channel" });
async function freeze(page: Page) {
  await page.clock.pauseAt(new Date(Date.now() + 50));
}
async function toggle(page: Page, firm = firmFor(page)) {
  await firm.click({ force: true });
  await page.clock.runFor(16);
}
async function dismissDetails(page: Page) {
  const close = page.getByRole("button", {
    name: "Close details",
    exact: true,
  });
  // The sheet has its own compositor animation; virtual graph time does not
  // advance it. Wait for its button and overlay instead of bypassing the modal.
  await expect(close).toBeInViewport({ ratio: 1 });
  await close.click({ force: true });
  await page.clock.runFor(350);
  await expect(page.locator('[data-slot="sheet-overlay"]')).toHaveCount(0);
  // Resizing preserves the camera, so a firm can end up clipped on mobile.
  // Fit explicitly before the next forced click, cancelling any pending fit
  // from opening the sheet rather than accidentally clicking the canvas.
  await page.getByRole("button", { name: "Fit View", exact: true }).click({ force: true });
  await page.clock.runFor(16);
}
async function world(node: Locator) {
  return node.evaluate((el) => {
    const m = new DOMMatrixReadOnly((el as HTMLElement).style.transform);
    return {
      x: m.m41 + (el as HTMLElement).offsetWidth / 2,
      y: m.m42 + (el as HTMLElement).offsetHeight / 2,
    };
  });
}
async function distance(a: Locator, b: Locator) {
  const p = await world(a),
    q = await world(b);
  return Math.hypot(p.x - q.x, p.y - q.y);
}
async function opacity(node: Locator) {
  return node.evaluate((el) => Number(getComputedStyle(el).opacity));
}

test.beforeEach(async ({ page, request }) => {
  // Install before application code captures native timers/animation frames.
  await page.clock.install();
  await request.post(fixtureApi + "/__reset");
  await page.emulateMedia({ reducedMotion: "no-preference" });
});

test("connections render before asynchronous node measurements arrive", async ({ page }) => {
  await page.addInitScript(() => {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });
  await page.goto("/?q=Shared");
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  await expect(page.locator(".react-flow__edge-path")).toHaveCount(2);
  for (const edge of await page.locator(".react-flow__edge-path").all()) {
    await expect(edge).toHaveAttribute("d", /^M .+ L .+/);
    await expect(edge).not.toHaveAttribute("d", /NaN|undefined/);
  }
});

test("channels unfold then gather with matching node and edge fades", async ({
  page,
}) => {
  await page.goto("/");
  await expect(firmFor(page)).toBeVisible();
  await freeze(page);
  await toggle(page);
  const channel = channelFor(page),
    orb = channel.locator(".graph-orb"),
    edge = page.locator(".react-flow__edge-path");
  await expect(orb).toHaveAttribute("data-presence", "entering");
  const near = await distance(channel, firmFor(page));
  expect(near).toBeLessThan(60);
  expect(await opacity(channel)).toBeLessThan(0.1);
  await page.clock.runFor(120);
  expect(await distance(channel, firmFor(page))).toBeGreaterThan(near + 30);
  expect(await opacity(channel)).toBeGreaterThan(0.1);
  expect(await opacity(channel)).toBeLessThan(0.95);
  expect(
    Math.abs((await opacity(channel)) - (await opacity(edge))),
  ).toBeLessThan(0.05);
  await page.clock.runFor(250);
  await expect(orb).not.toHaveAttribute("data-presence", "entering");
  const expanded = await distance(channel, firmFor(page));
  await toggle(page);
  await expect(orb).toHaveAttribute("data-presence", "exiting");
  await expect(channel).toHaveCSS("pointer-events", "none");
  await expect(channel).toHaveAttribute("aria-hidden", "true");
  await expect(channel).not.toHaveClass(/draggable/);
  await page.clock.runFor(120);
  expect(await distance(channel, firmFor(page))).toBeLessThan(expanded - 30);
  expect(await opacity(channel)).toBeGreaterThan(0);
  expect(await opacity(channel)).toBeLessThan(0.9);
  expect(
    Math.abs((await opacity(channel)) - (await opacity(edge))),
  ).toBeLessThan(0.05);
  await page.clock.runFor(250);
  await expect(channel).toHaveCount(0);
  await expect(edge).toHaveCount(0);
});

test("rapid toggles reverse without snapping or leaving duplicate elements", async ({
  page,
}) => {
  await page.goto("/");
  await expect(firmFor(page)).toBeVisible();
  await freeze(page);
  await toggle(page);
  await page.clock.runFor(100);
  const channel = channelFor(page),
    before = await world(channel),
    beforeOpacity = await opacity(channel);
  await toggle(page);
  const closing = await world(channel);
  expect(Math.hypot(closing.x - before.x, closing.y - before.y)).toBeLessThan(
    12,
  );
  expect(Math.abs((await opacity(channel)) - beforeOpacity)).toBeLessThan(0.1);
  await toggle(page);
  const reopened = await world(channel);
  expect(
    Math.hypot(reopened.x - closing.x, reopened.y - closing.y),
  ).toBeLessThan(12);
  await page.clock.runFor(400);
  await expect(channel).toHaveCount(1);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect(channel.locator(".graph-orb")).not.toHaveAttribute(
    "data-presence",
    "entering",
  );
  await toggle(page);
  await page.clock.runFor(70);
  await toggle(page);
  await page.clock.runFor(50);
  await toggle(page);
  await page.clock.runFor(400);
  await expect(channel).toHaveCount(0);
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);
});

test("closing one shared parent fades only its edge", async ({ page }) => {
  await page.goto("/?q=Shared");
  const channel = channelFor(page);
  await expect(channel).toBeVisible();
  await freeze(page);
  await toggle(page);
  await page.clock.runFor(120);
  await expect(channel.locator(".graph-orb")).not.toHaveAttribute(
    "data-presence",
    /entering|exiting/,
  );
  expect(await opacity(channel)).toBe(1);
  expect(await distance(channel, firmFor(page))).toBeGreaterThan(80);
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await page.clock.runFor(250);
  await expect(channel).toHaveCount(1);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
});

test("reset and filtering cancel pending exits without resurrecting nodes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(firmFor(page)).toBeVisible();
  await freeze(page);
  await toggle(page);
  await page.clock.runFor(350);
  await toggle(page);
  await page.clock.runFor(80);
  await page
    .getByRole("button", { name: "Reset view", exact: true })
    .click({ force: true });
  await page.clock.runFor(16);
  await expect(channelFor(page)).toHaveCount(0);
  await toggle(page);
  await page.clock.runFor(100);
  await page
    .getByRole("searchbox", { name: "Search channels or firms" })
    .fill("No matching name");
  await page.clock.runFor(32);
  await expect(channelFor(page)).toHaveCount(0);
  await expect(page.locator("[data-presence]")).toHaveCount(0);
  await page.clock.runFor(500);
  await expect(channelFor(page)).toHaveCount(0);
});

test("layout and reduced-motion changes complete transitions immediately", async ({
  page,
}) => {
  await page.goto("/");
  await expect(firmFor(page)).toBeVisible();
  await freeze(page);
  await toggle(page);
  await page.clock.runFor(80);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.runFor(32);
  await expect(channelFor(page)).toHaveCount(1);
  await expect(page.locator("[data-presence]")).toHaveCount(0);
  await dismissDetails(page);
  await toggle(page);
  await expect(channelFor(page).locator(".graph-orb")).toHaveAttribute(
    "data-presence",
    "exiting",
  );
  await page.clock.runFor(80);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.runFor(16);
  await expect(channelFor(page)).toHaveCount(0);
  await expect(page.locator("[data-presence]")).toHaveCount(0);
  await dismissDetails(page);
  await toggle(page);
  await expect(channelFor(page)).toHaveCount(1);
  await expect(page.locator("[data-presence]")).toHaveCount(0);
  await dismissDetails(page);
  await toggle(page);
  await expect(channelFor(page)).toHaveCount(0);
});

test("mobile touch taps unfold and gather channels", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "no-preference",
  });
  try {
    const page = await context.newPage();
    await page.clock.install();
    await page.goto("/");
    const firm = firmFor(page);
    await expect(firm).toBeVisible();
    await page.getByRole("button", { name: "Fit View", exact: true }).tap();
    await freeze(page);
    await firm.tap({ force: true });
    await page.clock.runFor(100);
    await expect(channelFor(page).locator(".graph-orb")).toHaveAttribute(
      "data-presence",
      "entering",
    );
    await page.clock.runFor(300);
    await dismissDetails(page);
    await firm.tap({ force: true });
    await page.clock.runFor(100);
    await expect(channelFor(page).locator(".graph-orb")).toHaveAttribute(
      "data-presence",
      "exiting",
    );
    await page.clock.runFor(300);
    await expect(channelFor(page)).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("a reopened channel returns to its saved arrangement", async ({
  page,
}) => {
  await page.goto("/");
  await expect(firmFor(page)).toBeVisible();
  await freeze(page);
  await toggle(page);
  await page.clock.runFor(800);
  await dismissDetails(page);
  const channel = channelFor(page),
    box = (await channel.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 55,
    box.y + box.height / 2 + 35,
    { steps: 8 },
  );
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.clock.runFor(500);
  const placed = await world(channel),
    parent = await world(firmFor(page));
  await toggle(page);
  await page.clock.runFor(400);
  await expect(channel).toHaveCount(0);
  await toggle(page);
  await page.clock.runFor(400);
  const reopened = await world(channel),
    movedParent = await world(firmFor(page));
  expect(
    Math.hypot(
      reopened.x - movedParent.x - placed.x + parent.x,
      reopened.y - movedParent.y - placed.y + parent.y,
    ),
  ).toBeLessThan(12);
});

test("gathering follows a dragged firm without pushing the held firm", async ({
  page,
}) => {
  await page.goto("/");
  await expect(firmFor(page)).toBeVisible();
  await freeze(page);
  await toggle(page);
  await page.clock.runFor(800);
  await dismissDetails(page);
  await toggle(page);
  const firm = firmFor(page),
    channel = channelFor(page),
    initialDistance = await distance(channel, firm),
    box = (await firm.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 35,
    box.y + box.height / 2 + 20,
    { steps: 6 },
  );
  await page.clock.runFor(140);
  expect(await distance(channel, firm)).toBeLessThan(initialDistance * 0.7);
  const held = await world(firm);
  await page.clock.runFor(200);
  await expect(channel).toHaveCount(0);
  const final = await world(firm);
  expect(Math.hypot(final.x - held.x, final.y - held.y)).toBeLessThan(0.2);
  await page.mouse.up();
});

test("navigating away during a transition cancels it cleanly", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(firmFor(page)).toBeVisible();
  await freeze(page);
  await toggle(page);
  await page.clock.runFor(80);
  await page
    .getByRole("link", { name: "Report an issue", exact: true })
    .click({ force: true });
  await expect(page).toHaveURL(/\/report$/);
  await page.clock.runFor(400);
  await expect(page.locator("[data-presence]")).toHaveCount(0);
  expect(errors).toEqual([]);
});
