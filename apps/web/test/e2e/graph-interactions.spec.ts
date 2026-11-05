import { worldPosition, dragBy } from "../helpers/graph";
import { test, expect } from "@playwright/test";
import { fixtureApi, resetFixture, graphReady, activeGraph } from "../helpers/app";

test.beforeEach(async ({ request }) => { await resetFixture(request, true); });

test("local search and filters make no requests and preserve node positions", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await graphReady(page);
  await expect(activeGraph(page).locator(".graph-orb.firm")).toHaveCount(2);
  await expect(
    page.getByRole("combobox", { name: "Record status", exact: true }),
  ).toHaveCount(0);
  const firm = activeGraph(page)
    .locator(".react-flow__node")
    .filter({ hasText: "Test firm" });
  await firm.click();
  await expect(activeGraph(page).locator(".graph-orb.channel")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Close details", exact: true })
    .click();
  // Pane changes can still move the camera; filtering must preserve graph coordinates.
  const before = await worldPosition(firm);
  await page
    .getByRole("combobox", { name: "Relationship type", exact: true })
    .click();
  await page.getByRole("option", { name: "Acquisition", exact: true }).click();
  await expect(activeGraph(page).locator(".graph-orb.firm")).toHaveCount(1);
  const after = await worldPosition(firm);
  expect(Math.abs(before.x - after.x)).toBeLessThan(1);
  expect(Math.abs(before.y - after.y)).toBeLessThan(1);
  await page
    .getByRole("searchbox", { name: "Search channels or firms" })
    .fill("UCtest");
  await page
    .getByRole("searchbox", { name: "Search channels or firms" })
    .press("Enter");
  await expect(activeGraph(page).locator(".graph-orb.channel")).toHaveCount(1);
  await page
    .getByRole("searchbox", { name: "Search channels or firms" })
    .fill("No matching name");
  await expect(
    page.getByRole("heading", { name: "No matching relationships" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(activeGraph(page).locator(".graph-orb.firm")).toHaveCount(2);
  const calls = await (
    await request.get(fixtureApi + "/__requests")
  ).json();
  expect(
    calls.filter((c: any) => c.path === "/api/v1/ownership-graph"),
  ).toHaveLength(1);
});

test("firm and channel dragging retain spring response and contextual reset", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?q=Shared");
  await graphReady(page);
  await expect(activeGraph(page).locator(".react-flow__edge")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Reset view", exact: true }),
  ).toBeVisible();
  const firm = activeGraph(page)
      .locator(".react-flow__node")
      .filter({ hasText: "Test firm" }),
    channel = activeGraph(page)
      .locator(".react-flow__node")
      .filter({ hasText: "Shared channel" });
  await expect
    .poll(async () => {
      const a = await channel.boundingBox();
      await page.waitForTimeout(100);
      const b = await channel.boundingBox();
      return Math.abs(a!.x - b!.x) + Math.abs(a!.y - b!.y);
    })
    .toBeLessThan(1);
  const before = (await channel.boundingBox())!,
    f = (await firm.boundingBox())!;
  await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2);
  await page.mouse.down();
  await page.mouse.move(f.x + f.width / 2 - 120, f.y + f.height / 2 - 60, {
    steps: 20,
  });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const a = (await channel.boundingBox())!;
      return Math.hypot(a.x - before.x, a.y - before.y);
    })
    .toBeGreaterThan(5);
  const c = (await channel.boundingBox())!;
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width / 2 + 60, c.y + c.height / 2 + 60, {
    steps: 20,
  });
  await page.mouse.up();
  const after = (await channel.boundingBox())!;
  expect(Math.hypot(c.x - after.x, c.y - after.y)).toBeGreaterThan(40);
  await expect(
    page.getByRole("button", { name: "Reset view", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reset view", exact: true }),
  ).toHaveCount(0);
});

test("canvas controls support zoom, fit, locking, and layout reset ", async ({
  page,
}) => {
  await page.goto("/");
  await graphReady(page);
  const firm = activeGraph(page)
    .locator(".react-flow__node")
    .filter({ hasText: "Test firm" });
  await expect(firm).toBeVisible();
  const initial = await worldPosition(firm);
  const view = activeGraph(page).locator(".react-flow__viewport");
  const scale = () =>
    view.evaluate(
      (el) => new DOMMatrixReadOnly((el as HTMLElement).style.transform).a,
    );
  const before = await scale();
  await page.getByRole("button", { name: "Zoom In", exact: true }).click();
  await expect.poll(scale).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Zoom Out", exact: true }).click();
  await page.getByRole("button", { name: "Fit View", exact: true }).click();
  await page
    .getByRole("button", { name: "Toggle Interactivity", exact: true })
    .click();
  const locked = await worldPosition(firm);
  await dragBy(page, firm, 55, 30);
  expect(await worldPosition(firm)).toEqual(locked);
  await page
    .getByRole("button", { name: "Toggle Interactivity", exact: true })
    .click();
  await dragBy(page, firm, 80, 35);
  const placed = await worldPosition(firm);
  expect(
    Math.hypot(placed.x - initial.x, placed.y - initial.y),
  ).toBeGreaterThan(20);
  await page.getByRole("button", { name: "Fit View", exact: true }).click();
  expect(await worldPosition(firm)).toEqual(placed);
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await expect
    .poll(async () => {
      const p = await worldPosition(firm);
      return Math.hypot(p.x - initial.x, p.y - initial.y);
    })
    .toBeLessThan(3);
  await expect(
    page.getByRole("button", { name: "Reset view", exact: true }),
  ).toHaveCount(0);
});
