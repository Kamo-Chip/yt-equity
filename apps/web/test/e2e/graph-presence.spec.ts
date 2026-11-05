import { test, expect } from "@playwright/test";
import { activeGraph, freezeClock, graphReady, resetFixture } from "../helpers/app";

const firmFor = (page: import("@playwright/test").Page) =>
  activeGraph(page).locator(".react-flow__node").filter({ hasText: "Test firm" });
const channelFor = (page: import("@playwright/test").Page) =>
  activeGraph(page).locator(".react-flow__node").filter({ hasText: "Shared channel" });

test.beforeEach(async ({ request }) => { await resetFixture(request); });

test("rapid toggles recover without duplicate channels or connections", async ({ page }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await graphReady(page);
  await freezeClock(page);
  const firm = firmFor(page);
  for (let i = 0; i < 3; i++) {
    await firm.click();
    await page.clock.runFor(50);
  }
  await page.clock.runFor(400);
  await expect(channelFor(page)).toHaveCount(1);
  await expect(activeGraph(page).locator(".react-flow__edge")).toHaveCount(2);
  await firm.click();
  await page.clock.runFor(400);
  await expect(channelFor(page)).toHaveCount(0);
  await expect(activeGraph(page).locator(".react-flow__edge")).toHaveCount(0);
});

test("mobile touch opens ownership details and collapses the channel again", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    reducedMotion: "reduce",
  });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await graphReady(page);
    await firmFor(page).tap();
    await expect(channelFor(page)).toHaveCount(1);
    const details = page.getByRole("dialog");
    await expect(details.getByRole("link", { name: "Acquisition announcement" })).toBeVisible();
    await details.getByRole("button", { name: "Close details", exact: true }).tap();
    await firmFor(page).tap();
    await expect(channelFor(page)).toHaveCount(0);
  } finally { await context.close(); }
});
