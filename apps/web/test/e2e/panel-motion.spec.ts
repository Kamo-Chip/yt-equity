import { test, expect, type Page } from "@playwright/test";
import { activeGraph, graphReady, resetFixture, signIn } from "../helpers/app";

type MotionRecord = { slot: string | null; name: string; state: string | null; duration: number; easing: string; x: number; y: number };
type MotionWindow = Window & { panelMotion: MotionRecord[] };

test.use({ reducedMotion: "no-preference" });
test.beforeEach(async ({ page, request }) => {
  await resetFixture(request, true);
  await page.addInitScript(() => {
    (window as unknown as MotionWindow).panelMotion = [];
    document.addEventListener("animationstart", (event) => {
      const target = event.target as Element;
      if (!target.matches('.sheet-motion, [data-slot$="-overlay"], [data-slot="dialog-content"], [data-slot="popover-content"], [data-slot="select-content"], [data-slot="tooltip-content"]')) return;
      for (const animation of target.getAnimations()) {
        if (!(animation instanceof CSSAnimation) || !(animation.effect instanceof KeyframeEffect)) continue;
        const state = target.getAttribute("data-state");
        const frames = animation.effect.getKeyframes();
        const edge = state === "closed" ? frames.at(-1) : frames[0];
        // Only direction matters. Normalize percentages so DOMMatrix can parse
        // the keyframe without seeking or otherwise changing the live animation.
        const matrix = String(edge?.transform ?? "none").replaceAll("%", "px");
        const transform = new DOMMatrixReadOnly(matrix === "none" ? undefined : matrix);
        (window as unknown as MotionWindow).panelMotion.push({
          slot: target.getAttribute("data-slot"), name: animation.animationName, state,
          duration: Number(animation.effect.getTiming().duration), easing: getComputedStyle(target).animationTimingFunction,
          x: transform.m41, y: transform.m42,
        });
      }
    }, true);
  });
});

async function records(page: Page) {
  return page.evaluate(() => (window as unknown as MotionWindow).panelMotion);
}
async function expectSlide(page: Page, state: "open" | "closed", direction: "left" | "right") {
  const name = state === "open" ? "sheet-enter" : "sheet-exit";
  await expect.poll(async () => (await records(page)).some(record => record.name === name)).toBe(true);
  const record = (await records(page)).find(record => record.name === name)!;
  expect(record.duration).toBe(state === "open" ? 220 : 160);
  expect(record.easing).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
  expect(direction === "left" ? record.x < 0 : record.x > 0).toBe(true);
  expect(record.y).toBe(0);
  await expect.poll(async () => (await records(page)).some(record => record.slot === "sheet-overlay" && record.state === state && record.duration === (state === "open" ? 220 : 160))).toBe(true);
}

test("mobile sidebar slides left, restores focus, and survives reopening during exit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/report");
  // Wait for the responsive hook to replace the server-rendered desktop rail.
  await expect(page.locator('[data-slot="sidebar-container"]')).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "Toggle Sidebar", exact: true });
  await trigger.click();
  const sidebar = page.getByRole("dialog", { name: "Sidebar", exact: true });
  await expect(sidebar).toHaveClass(/sheet-motion/);
  await expectSlide(page, "open", "left");
  await page.keyboard.press("Escape");
  await expectSlide(page, "closed", "left");
  await expect(sidebar).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  // Reopen synchronously while Radix is retaining the closing sheet for its exit.
  const reopenedDuringExit = await page.evaluate(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const closing = document.querySelector('.sheet-motion[data-state="closed"]') !== null;
    document.querySelector<HTMLButtonElement>('[data-sidebar="trigger"]')!.click();
    return closing;
  });
  expect(reopenedDuringExit).toBe(true);
  await expect(sidebar).toHaveAttribute("data-state", "open");
  await expect.poll(() => sidebar.evaluate(element => getComputedStyle(element).transform)).toBe("matrix(1, 0, 0, 1, 0, 0)");
  await expect(page.locator('[data-slot="sheet-overlay"]')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("ownership details and moderator editors share right-edge motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await graphReady(page);
  await activeGraph(page).locator(".react-flow__node").filter({ hasText: "Test firm" }).click();
  await expect(page.getByRole("dialog", { name: "Ownership details", exact: true })).toBeVisible();
  await expectSlide(page, "open", "right");
  await page.keyboard.press("Escape");
  await expectSlide(page, "closed", "right");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto("/moderator?panel=directory");
  await page.evaluate(() => { (window as unknown as MotionWindow).panelMotion = []; });
  const add = page.getByRole("button", { name: "Add relationship", exact: true });
  await add.click();
  await expectSlide(page, "open", "right");
  await page.keyboard.press("Escape");
  await expectSlide(page, "closed", "right");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(add).toBeFocused();
});

test("dialogs and select menus use shared timing", async ({ page }) => {
  await page.goto("/report");
  await page.getByRole("button", { name: "Keep lights on", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Keep lights on", exact: true });
  await expect(dialog).toBeVisible();
  await expect.poll(async () => (await records(page)).some(record => record.slot === "dialog-content" && record.duration === 220)).toBe(true);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await records(page)).some(record => record.slot === "dialog-content" && record.state === "closed" && record.duration === 160)).toBe(true);
  await expect(dialog).toHaveCount(0);
  await signIn(page);
  await page.goto("/moderator?panel=directory");
  await page.getByRole("combobox", { name: "Relationship", exact: true }).click();
  await expect.poll(async () => (await records(page)).some(record => record.slot === "select-content" && record.duration === 160)).toBe(true);
  await page.keyboard.press("Escape");
});

test("reduced motion makes sheets immediate and dismissible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/report");
  // Wait for the responsive hook to replace the server-rendered desktop rail.
  await expect(page.locator('[data-slot="sidebar-container"]')).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "Toggle Sidebar", exact: true });
  await trigger.click();
  const sidebar = page.getByRole("dialog", { name: "Sidebar", exact: true });
  await expect(sidebar).toHaveCSS("animation-duration", "1e-05s");
  await expect(sidebar).toHaveCSS("opacity", "1");
  await page.keyboard.press("Escape");
  await expect(sidebar).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
