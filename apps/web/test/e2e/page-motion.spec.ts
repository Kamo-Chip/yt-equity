import { test, expect, type Page } from "@playwright/test";
import { activeGraph, fixtureApi, graphReady, resetFixture, signIn } from "../helpers/app";
import { position, settled } from "../helpers/graph";

type MotionWindow = Window & {
  pageFades: { pathname: string; panel: string | null; duration: number; target: string; cancelled: boolean }[];
  holdPageFades?: boolean;
};

test.use({ reducedMotion: "no-preference" });

test.beforeEach(async ({ page, request }) => {
  await resetFixture(request, true);
  // Observe real animation calls, including ones that finish between assertions.
  await page.addInitScript(() => {
    const state = window as unknown as MotionWindow;
    state.pageFades = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      const animation = animate.call(this, frames, options);
      if (typeof options === "object" && options.id === "page-arrive") {
        const entry = {
          pathname: location.pathname,
          panel: new URLSearchParams(location.search).get("panel"),
          duration: Number(options.duration),
          target: this.getAttribute("data-slot") ?? this.className,
          cancelled: false,
        };
        state.pageFades.push(entry);
        animation.addEventListener("cancel", () => { entry.cancelled = true; });
        if (state.holdPageFades) animation.pause();
      }
      return animation;
    };
  });
});

async function count(page: Page) {
  return page.evaluate(() => (window as unknown as MotionWindow).pageFades.length);
}

async function expectFade(page: Page, action: () => Promise<unknown>) {
  // Server-rendered headings can be visible before the controller hydrates.
  await expect.poll(() => count(page)).toBeGreaterThan(0);
  const before = await count(page);
  await action();
  await expect.poll(() => count(page)).toBe(before + 1);
  await expect(page.locator('[data-slot="sidebar-inset"]')).toHaveCSS("opacity", "1");
}

test("public navigation and Back/Forward fade content once without moving the shell", async ({ page }) => {
  await page.goto("/");
  await graphReady(page);
  await expect.poll(() => count(page)).toBeGreaterThan(0);
  const header = await page.locator(".app-header").boundingBox();
  await expectFade(page, () => page.getByRole("link", { name: "Report an issue", exact: true }).click());
  await expect(page.getByRole("heading", { name: "Report an issue", exact: true })).toBeVisible();
  expect(await page.locator(".app-header").boundingBox()).toEqual(header);
  await expectFade(page, () => page.getByRole("link", { name: "Extension privacy", exact: true }).click());
  await expectFade(page, () => page.goBack());
  await expectFade(page, () => page.goForward());
  const fades = await page.evaluate(() => (window as unknown as MotionWindow).pageFades);
  expect(fades.every(fade => fade.duration === 160 && fade.target === "sidebar-inset")).toBe(true);
});

test("profile navigation fades while filters, hash changes and graph refresh do not", async ({ page }) => {
  await page.goto("/firms/00000000-0000-4000-8000-000000000002");
  await expect(page.getByRole("heading", { name: "Test firm", exact: true })).toBeVisible();
  await expectFade(page, () => page.getByRole("link", { name: "Shared channel", exact: true }).first().click());
  await expectFade(page, () => page.getByRole("link", { name: "Test firm", exact: true }).first().click());
  await expectFade(page, () => page.getByRole("link", { name: "Ownership graph", exact: true }).click());
  await graphReady(page);
  const before = await count(page);
  await page.getByRole("searchbox", { name: "Search channels or firms" }).fill("Test firm");
  await expect(page).toHaveURL(/q=Test/);
  await page.evaluate(() => {
    history.replaceState(null, "", location.href + "#graph");
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await page.waitForTimeout(400);
  expect(await count(page)).toBe(before);
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page).toHaveURL("/");
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await page.waitForTimeout(250);
  expect(await count(page)).toBe(before);
});

test("workspace panels fade and rapid navigation cancels the previous fade", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/moderator");
  await expect(page.getByRole("heading", { name: "Review inbox", exact: true })).toBeVisible();
  await expectFade(page, () => page.getByRole("link", { name: "Directory", exact: true }).click());
  const before = await count(page);
  await page.evaluate(() => history.replaceState(null, "", "/moderator?panel=directory&q=test#directory"));
  await page.waitForTimeout(250);
  expect(await count(page)).toBe(before);

  await page.evaluate(() => { (window as unknown as MotionWindow).holdPageFades = true; });
  await page.getByRole("link", { name: "Activity", exact: true }).click();
  await expect.poll(() => count(page)).toBe(before + 1);
  await page.evaluate(() => { (window as unknown as MotionWindow).holdPageFades = false; });
  await expectFade(page, () => page.getByRole("link", { name: "Inbox", exact: true }).click());
  await expect.poll(() => page.evaluate(() => (window as unknown as MotionWindow).pageFades.at(-2)?.cancelled)).toBe(true);
  const after = await count(page);
  await page.evaluate(() => history.replaceState(null, "", "/moderator"));
  await page.waitForTimeout(250);
  expect(await count(page)).toBe(after);
  await expectFade(page, () => page.getByRole("link", { name: "Moderators", exact: true }).click());
});

for (const path of ["/moderator/sign-in", "/admin/sign-in"]) {
  test(`auth content fades on ${path} without animating the card separately`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator(".auth-card")).toBeVisible();
    await expect.poll(() => count(page)).toBeGreaterThan(0);
    await expect(page.locator(".auth-card")).toHaveCSS("animation-name", "none");
    const fades = await page.evaluate(() => (window as unknown as MotionWindow).pageFades);
    expect(fades.every(fade => fade.duration === 160 && fade.target.includes("max-w-[480px]"))).toBe(true);
  });
}

test("reduced motion skips page fades, including when enabled during a fade", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/report");
  await expect(page.getByRole("heading", { name: "Report an issue", exact: true })).toBeVisible();
  expect(await count(page)).toBe(0);
  await page.getByRole("link", { name: "Extension privacy", exact: true }).click();
  await expect(page).toHaveURL("/privacy");
  expect(await count(page)).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => { (window as unknown as MotionWindow).holdPageFades = true; });
  await page.getByRole("link", { name: "Report an issue", exact: true }).click();
  await expect.poll(() => count(page)).toBe(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator('[data-slot="sidebar-inset"]')).toHaveCSS("opacity", "1");
  await expect.poll(() => page.evaluate(() => (window as unknown as MotionWindow).pageFades[0].cancelled)).toBe(true);
});

test("streaming report content does not replay the page entrance", async ({ page, request }) => {
  await signIn(page);
  await request.post(`${fixtureApi}/__delay`, {
    data: { path: "/api/v1/moderator/submissions/00000000-0000-4000-8000-000000000006/context", ms: 2500 },
  });
  await page.goto("/moderator", { waitUntil: "commit" });
  await expect(page.getByRole("status", { name: "Loading report", exact: true })).toBeVisible();
  await expect.poll(() => count(page)).toBeGreaterThan(0);
  await expect(page.locator('[data-slot="sidebar-inset"]')).toHaveCSS("opacity", "1");
  const before = await count(page);
  await expect(page.getByRole("button", { name: "Approve report", exact: true })).toBeVisible();
  expect(await count(page)).toBe(before);
  await expect(page.locator('[data-slot="sidebar-inset"]')).toHaveCSS("opacity", "1");
});

test("mobile navigation preserves graph layout and expansion with motion enabled", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await graphReady(page);
  const firm = activeGraph(page).locator(".react-flow__node").filter({ hasText: "Test firm" });
  await firm.click();
  await expect(activeGraph(page).locator(".graph-orb.channel")).toHaveCount(1);
  // Mobile selection opens a modal sheet; dismiss it to reach navigation.
  await expect(page.getByRole("dialog", { name: "Ownership details", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Ownership details", exact: true })).toBeHidden();
  await settled(page, firm);
  const placed = await position(firm);
  await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Sidebar", exact: true });
  await menu.getByRole("link", { name: "Report an issue", exact: true }).click();
  await expect(menu).toBeHidden();
  await expectFade(page, () => page.goBack());
  await graphReady(page);
  await expect(activeGraph(page).locator(".graph-orb.channel")).toHaveCount(1);
  const restored = await position(firm);
  // Match the physics helper's settled tolerance for subpixel residual motion.
  expect(Math.hypot(restored.x - placed.x, restored.y - placed.y)).toBeLessThan(0.2);
  expect((await activeGraph(page).boundingBox())?.y).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("navigation stays visible without Web Animations support", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, "animate", { value: undefined, configurable: true });
  });
  await page.goto("/report");
  await page.getByRole("link", { name: "Extension privacy", exact: true }).click();
  await expect(page).toHaveURL("/privacy");
  await expect(page.locator('[data-slot="sidebar-inset"]')).toHaveCSS("opacity", "1");
  expect(await count(page)).toBe(0);
});

test("graph navigation never animates the sidebar spacer width", async ({ page }) => {
  await page.goto("/");
  await graphReady(page);
  await page.evaluate(() => {
    const state = window as Window & { spacerTransitions?: string[] };
    state.spacerTransitions = [];
    document.addEventListener("transitionrun", (event) => {
      if ((event.target as Element).matches('[data-slot="sidebar-gap"]')) {
        state.spacerTransitions!.push(event.propertyName);
      }
    });
  });
  await page.getByRole("link", { name: "Report an issue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Report an issue", exact: true })).toBeVisible();
  await page.waitForTimeout(250);
  await page.goBack();
  await graphReady(page);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as Window & { spacerTransitions?: string[] }).spacerTransitions)).toEqual([]);
});
