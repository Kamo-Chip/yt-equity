import { test, expect } from "@playwright/test";
import { graphReady, resetFixture } from "../helpers/app";

test.beforeEach(async ({ request }) => { await resetFixture(request); });

for (const width of [1440, 390]) {
  test(`public titles clear the header after leaving the cached graph at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await graphReady(page);
    for (const name of ["Report a channel", "Report an issue", "Extension privacy"]) {
      if (width < 768) await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
      await page.getByRole("link", { name, exact: true }).click();
      const title = page.getByRole("heading", { level: 1 });
      await expect(title).toBeVisible();
      // The cached graph still exists, but must not pull this route upward.
      await expect(page.locator("main.graph-page")).toHaveCount(1);
      await expect(page.locator(".app-body")).toHaveCSS("margin-top", "0px");
      await expect.poll(async () => {
        const heading = (await title.boundingBox())!;
        const header = (await page.locator(".app-header").boundingBox())!;
        return heading.y - header.y - header.height;
      }).toBeGreaterThanOrEqual(12);
      await page.goBack();
      await graphReady(page);
      await expect.poll(async () => (await page.getByRole("main", { name: "Ownership explorer", exact: true }).boundingBox())!.y).toBe(0);
    }
  });
}
