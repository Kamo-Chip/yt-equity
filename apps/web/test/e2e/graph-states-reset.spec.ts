import { resetFixture, activeGraph } from "../helpers/app";
import { test, expect, type Page, type Locator } from "@playwright/test";

const api = `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT ?? 4101}`;
const graphPath = "/api/v1/ownership-graph";
const firstFirm = '[data-id="firm:00000000-0000-4000-8000-000000000002"]';
const resetButton = (page: Page) => page.getByRole("button", { name: "Reset view", exact: true });
async function point(node: Locator) {
  return node.evaluate(el => {
    const m = new DOMMatrixReadOnly((el as HTMLElement).style.transform);
    return { x: m.m41, y: m.m42 };
  });
}
async function camera(page: Page) {
  return activeGraph(page).locator(".react-flow__viewport").evaluate(el => {
    const m = new DOMMatrixReadOnly((el as HTMLElement).style.transform);
    return { x: m.m41, y: m.m42, zoom: m.a };
  });
}
async function ready(page: Page) {
  await expect(activeGraph(page).locator(".graph-orb.firm")).toHaveCount(2);
  // Initial framing is published after React Flow's measurement frames.
  await expect.poll(async () => (await camera(page)).zoom).toBeGreaterThan(0.1);
  await page.waitForTimeout(150);
}

test.beforeEach(async ({ request }) => {
  await resetFixture(request);
});

test(`empty and no-match states provide useful recovery`, async ({ page, request }) => {
  await page.goto("/?q=does-not-exist&type=acquisition&status=confirmed");
  await expect(page.getByRole("heading", { name: "No matching relationships" })).toBeVisible();
  await expect(resetButton(page)).toBeVisible();

  const clear = page.getByRole("button", { name: "Clear filters", exact: true });
  await clear.focus();
  await clear.press("Enter");
  await expect(page.getByRole("searchbox", { name: "Search channels or firms", exact: true })).toHaveValue("");
  await ready(page);
  await page.getByRole("searchbox", { name: "Search channels or firms", exact: true }).fill("no-such-channel");
  await expect(page.getByRole("heading", { name: "No matching relationships" })).toBeVisible();
  await resetButton(page).click();
  await expect(resetButton(page)).toHaveCount(0);
  await ready(page);
  await request.post(api + "/__empty-graph");
  await page.reload();
  await expect(page.getByRole("heading", { name: "No ownership records yet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear filters" })).toHaveCount(0);

});

test(`reset restores filters, expansion, selection, nodes and framing`, async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const initialPoint = await point(activeGraph(page).locator(firstFirm));
  const initialCamera = await camera(page);
  await page.goto("/?q=Shared&type=acquisition&status=confirmed");
  await expect(activeGraph(page).locator(".graph-orb.channel")).toHaveCount(1);
  await resetButton(page).click();
  await expect(resetButton(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("searchbox", { name: "Search channels or firms", exact: true })).toHaveValue("");
  await expect(activeGraph(page).locator(".graph-orb.channel")).toHaveCount(0);
  expect(await point(activeGraph(page).locator(firstFirm))).toEqual(initialPoint);
  const restored = await camera(page);
  expect(restored.x).toBeCloseTo(initialCamera.x, 0);
  expect(restored.y).toBeCloseTo(initialCamera.y, 0);
  expect(restored.zoom).toBeCloseTo(initialCamera.zoom, 2);
  await activeGraph(page).locator(firstFirm).click();
  await expect(activeGraph(page).locator(".graph-orb.channel")).toHaveCount(1);
  await resetButton(page).click();
  await expect(activeGraph(page).locator(".graph-orb.channel")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Selection details" })).toHaveCount(0);
  await expect(resetButton(page)).toHaveCount(0);
});

test("failure retries show pending feedback and preserve a graph on refresh failure", async ({ page, request }) => {
  const fail = () => request.post(api + "/__fail-next", { data: { path: graphPath, method: "GET" } });
  await fail();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Couldn’t load ownership records" })).toBeVisible();
  await request.post(api + "/__delay", { data: { path: graphPath, ms: 700 } });
  await fail();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "Reconnecting…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
  await page.getByRole("button", { name: "Try again" }).click();
  await ready(page);
  await fail();
  // Exercise the app's existing refresh-on-return path.
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect(page.getByRole("button", { name: "Retry refresh" })).toBeVisible();
  await expect(activeGraph(page).locator(".graph-orb.firm")).toHaveCount(2);
  await page.getByRole("button", { name: "Retry refresh" }).click();
  await expect(page.getByRole("button", { name: "Retry refresh" })).toHaveCount(0);
});
