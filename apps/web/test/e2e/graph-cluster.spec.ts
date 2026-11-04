import { test, expect, type Locator, type Page } from "@playwright/test";
const fixtureApi = `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT ?? 4101}`;
async function center(node: Locator) {
  const box = (await node.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function flush(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function settle(page: Page, node: Locator) {
  await expect
    .poll(
      async () => {
        const a = await center(node);
        await page.waitForTimeout(120);
        const b = await center(node);
        return Math.hypot(a.x - b.x, a.y - b.y);
      },
      { timeout: 10000 },
    )
    .toBeLessThan(0.2);
}
test.beforeEach(async ({ request }) => {
  await request.post(fixtureApi + "/__reset");
  await request.post(fixtureApi + "/__many", { data: { channels: 20 } });
});
test.afterEach(async ({ request }) => {
  await request.post(fixtureApi + "/__reset");
});

for (const kind of ["firm", "channel"] as const) {
  test(`dense cluster ${kind} stays under the pointer through reversals and a hold`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const firm = page
      .locator(".react-flow__node")
      .filter({ hasText: "Test firm" });
    await firm.click();
    await expect(page.locator(".graph-orb.channel")).toHaveCount(21);
    await page
      .getByRole("button", { name: "Close details", exact: true })
      .click();
    const node =
      kind === "firm"
        ? firm
        : page
            .locator(".react-flow__node")
            .filter({ hasText: "Dense channel 0" });
    await settle(page, node);
    const start = await center(node);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 6, start.y);
    await flush(page);
    const grabbed = await center(node);
    // Preserve the small grab offset established at React Flow's drag threshold.
    const offset = { x: grabbed.x - start.x - 6, y: grabbed.y - start.y };
    for (const [dx, dy] of [
      [18, 12],
      [34, 24],
      [50, 36],
      [34, 24],
      [18, 12],
      [6, 0],
      [-10, -12],
      [6, 0],
    ]) {
      await page.mouse.move(start.x + dx, start.y + dy);
      await flush(page);
      const actual = await center(node);
      expect(
        Math.hypot(
          actual.x - start.x - dx - offset.x,
          actual.y - start.y - dy - offset.y,
        ),
      ).toBeLessThan(1.5);
    }
    const held = await center(node);
    const spread = await node.evaluate(
      (el) =>
        new Promise<number>((resolve) => {
          const samples: { x: number; y: number }[] = [];
          const sample = () => {
            const b = el.getBoundingClientRect();
            samples.push({ x: b.x, y: b.y });
            if (samples.length < 25) requestAnimationFrame(sample);
            else
              resolve(
                Math.max(
                  ...samples.map((p) =>
                    Math.hypot(p.x - samples[0].x, p.y - samples[0].y),
                  ),
                ),
              );
          };
          requestAnimationFrame(sample);
        }),
    );
    expect(spread).toBeLessThan(0.2);
    const final = await center(node);
    expect(Math.hypot(final.x - held.x, final.y - held.y)).toBeLessThan(0.2);
    await page.mouse.up();
    await settle(page, node);
    await page.getByRole("button", { name: "Reset view", exact: true }).click();
    await expect(page.locator(".graph-orb.channel")).toHaveCount(21);
    await settle(page, firm);
    await firm.click();
    await expect(page.locator(".graph-orb.channel")).toHaveCount(0);
    await firm.click();
    await expect(page.locator(".graph-orb.channel")).toHaveCount(21);
  });
}
