import { test, expect } from "@playwright/test";
import { base, fixtureApi, resetFixture, signIn } from "../helpers/app";

test.beforeEach(async ({ request }) => { await resetFixture(request, true); });

test("graph reads use anonymous canonical snapshots while profile caches expire after directory edits", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.PLAYWRIGHT_PRODUCTION !== "1",
    "Server-rendered snapshot reads are verified against the production server.",
  );
  const calls = async () =>
    (await request.get(fixtureApi + "/__requests")).json();
  expect((await request.get(base + "/")).ok()).toBeTruthy();
  expect(
    (
      await request.get(base + "/", {
        headers: { cookie: "fixture-role=moderator" },
      })
    ).ok(),
  ).toBeTruthy();
  let graphReads = (await calls()).filter(
    (c: any) => c.path === "/api/v1/ownership-graph",
  );
  expect(graphReads).toHaveLength(2);
  expect(graphReads.every((c: any) => !c.hasCookie && c.search === "")).toBe(true);
  await page.goto("/channels/UCtest");
  await expect(
    page.getByRole("heading", { name: "Acquired by Test firm" }),
  ).toBeVisible();
  await page.goto("/firms/00000000-0000-4000-8000-000000000002");
  await expect(
    page.getByRole("link", { name: "Shared channel", exact: true }),
  ).toBeVisible();
  await signIn(page);
  await page.goto("/moderator");
  await page
    .getByRole("button", { name: "Approve report", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Edit relationship", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await request.get(base + "/");
  expect(
    (await calls()).filter((c: any) => c.path === "/api/v1/ownership-graph"),
  ).toHaveLength(3);
  await signIn(page);
  await page.goto(
    "/moderator?panel=directory&edit=00000000-0000-4000-8000-000000000004",
  );
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Archive relationship", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/");
  await expect(page.locator(".graph-orb.firm")).toHaveCount(1);
  await page.goto("/channels/UCtest");
  await expect(
    page.getByRole("heading", { name: "Acquired by Test firm" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Funded by Second firm" }),
  ).toBeVisible();
  await page.goto("/firms/00000000-0000-4000-8000-000000000002");
  await expect(page.getByText("No published channel records.")).toBeVisible();
  graphReads = (await calls()).filter(
    (c: any) => c.path === "/api/v1/ownership-graph",
  );
  expect(graphReads.length).toBeGreaterThanOrEqual(4);
});

test("graph refreshes on return without polling or resetting its state", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".graph-orb.firm")).toHaveCount(2);
  await page
    .locator(".react-flow__node")
    .filter({ hasText: "Test firm" })
    .click();
  await expect(
    page.getByRole("button", { name: "Close details", exact: true }),
  ).toBeVisible();
  const node = page
    .locator(".react-flow__node")
    .filter({ hasText: "Test firm" });
  const position = await node.getAttribute("style");
  const refreshes: string[] = [];
  page.on("request", (request) => {
    // Partial prefetching may resume a shell request when the tab becomes
    // visible; count the actual refresh separately from those prefetches.
    if (
      request.headers().rsc === "1" &&
      !request.headers()["next-router-prefetch"] &&
      new URL(request.url()).pathname === "/"
    )
      refreshes.push(request.url());
  });
  await page.clock.install();
  await page.clock.fastForward(120_000);
  expect(refreshes).toHaveLength(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(120_000);
  expect(refreshes).toHaveLength(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => refreshes.length).toBe(1);
  await expect(node).toHaveAttribute("style", position!);
  await expect(
    page.getByRole("button", { name: "Close details", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
});
