import { test, expect } from "@playwright/test";
import { activeGraph, graphReady, resetFixture } from "../helpers/app";
import { dragBy, position, settled } from "../helpers/graph";

test.beforeEach(async ({ request }) => { await resetFixture(request); });

test("returning from another page preserves graph selection, expansion and placement", async ({ page }) => {
  await page.goto("/");
  await graphReady(page);
  const main = activeGraph(page);
  const firm = main.locator(".react-flow__node").filter({ hasText: "Test firm" });
  await firm.click();
  await expect(main.locator(".graph-orb.channel")).toHaveCount(1);
  await settled(page, firm);
  await dragBy(page, firm, 60, 35);
  await settled(page, firm);
  const placed = await position(firm);
  await page.getByRole("link", { name: "Report an issue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Report an issue", exact: true })).toBeVisible();
  await page.goBack();
  await graphReady(page);
  await expect(main.locator(".graph-orb.channel")).toHaveCount(1);
  await expect(page.getByRole("complementary", { name: "Selection details" })).toBeVisible();
  expect(await position(firm)).toEqual(placed);
});
