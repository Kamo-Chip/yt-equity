import { test, expect, type Page } from "@playwright/test";
import { activeGraph, graphReady, resetFixture, signIn } from "../helpers/app";

type AuditWindow = Window & { navigationSlides: string[] };

test.use({ reducedMotion: "no-preference" });
test.beforeEach(async ({ page, request }) => {
  await resetFixture(request, true);
  await page.addInitScript(() => {
    const state = window as unknown as AuditWindow;
    state.navigationSlides = [];
    function inspect(animation: Animation) {
      if (!(animation.effect instanceof KeyframeEffect)) return;
      // Sheets may slide; route content and sidebar layout must remain stationary.
      if (animation.effect.target instanceof Element && animation.effect.target.matches(".sheet-motion")) return;
      const frames = animation.effect.getKeyframes();
      const transforms = frames.map(frame => {
        try {
          const matrix = new DOMMatrixReadOnly(frame.transform === "none" ? undefined : frame.transform as string | undefined);
          return [matrix.m41, matrix.m42, matrix.m43].map(value => value.toFixed(3)).join(",");
        } catch { return String(frame.transform); }
      });
      const translates = frames.map(frame => {
        const value = String(frame.translate ?? "none");
        return /^(none|0px(?: 0px){0,2})$/.test(value) ? "0" : value;
      });
      if (new Set(transforms).size > 1 || new Set(translates).size > 1) {
        state.navigationSlides.push(animation instanceof CSSAnimation ? animation.animationName : animation.id);
      }
    }
    document.addEventListener("animationstart", event => {
      (event.target as Element).getAnimations().forEach(inspect);
    }, true);
    document.addEventListener("transitionrun", event => {
      if ((event.target as Element).matches('[data-slot="sidebar-gap"], [data-slot="sidebar-container"]') &&
          /^(width|left|right|transform|translate|margin.*)$/.test(event.propertyName)) {
        state.navigationSlides.push(`sidebar:${event.propertyName}`);
      }
    }, true);
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      const animation = animate.call(this, frames, options);
      inspect(animation);
      return animation;
    };
  });
});

async function noSlides(page: Page) {
  // Includes animationstart on entry and exit, even after a short effect ends.
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as unknown as AuditWindow).navigationSlides)).toEqual([]);
}

async function publicLink(page: Page, name: string, mobile: boolean) {
  if (mobile) await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
  await page.getByRole("link", { name, exact: true }).click();
}

for (const width of [1440, 390]) {
  const mobile = width < 768;
  test(`all public route families and return navigation have no slides at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await graphReady(page);
    await noSlides(page);
    for (const name of ["Report a channel", "Report an issue", "Extension privacy"]) {
      await publicLink(page, name, mobile);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await noSlides(page);
      await page.goBack();
      await graphReady(page);
      await noSlides(page);
      await page.goForward();
      await noSlides(page);
      await publicLink(page, "Explore", mobile);
      await graphReady(page);
    }
    await page.goto("/channels/UCtest");
    await expect(page.getByRole("heading", { name: "Shared channel", exact: true })).toBeVisible();
    await noSlides(page);
    for (const [name, id] of [
      ["Test firm", "00000000-0000-4000-8000-000000000002"],
      ["Second firm", "00000000-0000-4000-8000-000000000003"],
    ]) {
      await page.getByRole("link", { name, exact: true }).first().click();
      await expect(page).toHaveURL(`/firms/${id}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await noSlides(page);
      await page.goBack();
      await expect(page).toHaveURL("/channels/UCtest");
      await noSlides(page);
    }
    await page.goto("/channels?q=Test");
    await graphReady(page);
    await expect(page).toHaveURL(/\/\?q=Test$/);
    await noSlides(page);
    await activeGraph(page).locator(".react-flow__node").filter({ hasText: "Test firm" }).click();
    await expect(page.getByRole(mobile ? "dialog" : "complementary", {
      name: mobile ? "Ownership details" : "Selection details", exact: true,
    })).toBeVisible();
    await noSlides(page);
  });

  test(`auth routes and workspace panels have no slides at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/moderator/sign-in", "/admin/sign-in", "/moderator/accept-invitation"]) {
      await page.goto(route);
      await expect(page.locator(".auth-card")).toBeVisible();
      await noSlides(page);
      if (route.endsWith("accept-invitation")) {
        await page.getByRole("link", { name: "Back to sign in", exact: true }).click();
        await expect(page).toHaveURL("/moderator/sign-in");
        await noSlides(page);
      }
    }
    await signIn(page, "admin");
    await page.goto("/workspace");
    await expect(page).toHaveURL("/admin");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await noSlides(page);
    for (const name of ["Inbox", "Directory", "Activity", "Moderators"]) {
      await publicLink(page, name, mobile);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await noSlides(page);
      await page.goBack();
      await noSlides(page);
      await page.goForward();
      await noSlides(page);
    }
  });
}

test("expanded form sections and success messages fade without sliding", async ({ page }) => {
  await page.goto("/report");
  await page.getByLabel("What happened?").fill("Navigation feedback for the page animation audit.");
  await page.getByText("Optional details", { exact: true }).click();
  await noSlides(page);
  await page.getByRole("button", { name: "Send report", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Report sent" })).toBeVisible();
  await noSlides(page);
});
