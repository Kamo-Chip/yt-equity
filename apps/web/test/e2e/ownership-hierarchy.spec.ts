import { test, expect } from "@playwright/test";
const api = `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT ?? 4101}`;
const claimId = "00000000-0000-4000-8000-000000000004";
const firmId = "00000000-0000-4000-8000-000000000002";

test.beforeEach(async ({ request }) => {
  await request.post(`${api}/__reset`);
  const record = await (await request.get(`${api}/api/v1/moderator/relationships/${claimId}`, {
    headers: { cookie: "fixture-role=moderator" },
  })).json();
  // Use the web proxy to invalidate public profile caches between scenarios.
  await request.patch(`/api/v1/moderator/relationships/${claimId}`, {
    headers: { cookie: "fixture-role=moderator" }, data: record,
  });
});

test(`public records disclose evidence with keyboard`, async ({ page, request }) => {
  const record = await (await request.get(`${api}/api/v1/moderator/relationships/${claimId}`, { headers: { cookie: "fixture-role=moderator" } })).json();
  await request.patch(`/api/v1/moderator/relationships/${claimId}`, { headers: { cookie: "fixture-role=moderator" }, data: {
    ...record, announcedAt: "2021-07-19T12:00:00Z",
    sources: [...record.sources, { url: "https://example.com/second", title: "Further evidence", tier: "reputable" }],
  } });
  for (const path of ["/channels/UCtest", `/firms/${firmId}`]) {
    await page.goto(path);
    const card = path.startsWith("/firms")
      ? page.getByRole("main").locator('[data-slot="card"]').filter({ hasText: "Acquired Shared channel" })
      : page.getByRole("article").filter({ hasText: "Acquired by Test firm" });
    await expect(card.getByRole("link", { name: "Acquisition announcement" })).toBeVisible();
    await expect(card.getByText(/Announced/)).toBeVisible();
    await expect(card.getByText("95% confidence")).toBeHidden();
    await expect(card.getByText("Source quality: official")).toBeHidden();
    await expect(card.getByRole("link", { name: "Further evidence" })).toBeHidden();
    const summary = card.locator("summary").first();
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(card.getByText("95% confidence")).toBeVisible();
    await expect(card.getByText("Source quality: official")).toBeVisible();
    await expect(card.getByRole("link", { name: "Further evidence" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto("/channels/UCtest");
  for (const [label, mode] of [["Report channel", "report"], ["Suggest an update", "correction"], ["Dispute record", "dispute"]]) {
    await expect(page.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", `/report/channel?channelId=UCtest&contribution=${mode}`);
  }
});

test("missing dates, undisclosed firms, and absent sources stay readable", async ({ page, request }) => {
  const record = await (await request.get(`${api}/api/v1/moderator/relationships/${claimId}`, { headers: { cookie: "fixture-role=moderator" } })).json();
  await request.patch(`/api/v1/moderator/relationships/${claimId}`, { headers: { cookie: "fixture-role=moderator" }, data: { ...record, firm: null, sources: [] } });
  await page.goto("/channels/UCtest");
  const article = page.getByRole("article").filter({ hasText: "Acquired by an undisclosed firm" });
  await expect(article).toBeVisible();
  await expect(article.getByText("No source links recorded.")).toBeVisible();
  await expect(article.getByText(/Announced/)).toHaveCount(0);
  await article.locator("summary").click();
  await expect(article.getByText("95% confidence")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Funded by Second firm" })).toBeVisible();
});

test("graph drawer uses relationship headings and collapsed metadata", async ({ page }) => {
  await page.goto("/");
  await page.locator(".react-flow__node").filter({ hasText: "Test firm" }).click();
  const drawer = page.getByRole("complementary", { name: "Selection details" });
  await expect(drawer.getByRole("heading", { name: "Acquired Shared channel" })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Acquisition announcement" })).toBeVisible();
  await expect(drawer.getByText("95% confidence")).toBeHidden();
  await drawer.locator("summary").click();
  await expect(drawer.getByText("95% confidence")).toBeVisible();
  await drawer.getByRole("button", { name: "Close details" }).click();
  await page.locator(".react-flow__node").filter({ hasText: "Shared channel" }).click();
  await expect(drawer.getByRole("heading", { name: "Acquired by Test firm" })).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "Funded by Second firm" })).toBeVisible();
});

test("empty profiles keep a useful empty state", async ({ page, request }) => {
  for (const id of [claimId, "00000000-0000-4000-8000-000000000005"]) {
  const record = await (await request.get(`${api}/api/v1/moderator/relationships/${id}`, {
      headers: { cookie: "fixture-role=moderator" },
    })).json();
    await request.patch(`/api/v1/moderator/relationships/${id}`, {
      headers: { cookie: "fixture-role=moderator" }, data: { ...record, published: false },
    });
  }
  await page.goto("/channels/UCtest");
  await expect(page.getByText("No published ownership record.")).toBeVisible();
  await expect(page.locator("summary")).toHaveCount(0);
  await page.goto(`/firms/${firmId}`);
  await expect(page.getByText("No published channel records.")).toBeVisible();
});
