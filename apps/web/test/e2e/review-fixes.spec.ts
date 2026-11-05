import { resetFixture } from "../helpers/app";
import { test, expect } from "@playwright/test";
const api = `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT ?? 4101}`;
const base = `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT ?? 3100}`;
test.beforeEach(async ({ request }) => { await resetFixture(request); });
test.afterEach(async ({ request }) => { await resetFixture(request); });

test("undisclosed owners stay visible without exposing nonexistent firm profiles", async ({ page, request }) => {
  await request.post(api + "/__many", { data: { undisclosed: 2 } });
  await page.goto("/");
  const unnamed = page.locator(".react-flow__node").filter({ hasText: "Undisclosed firm" });
  await expect(unnamed).toHaveCount(2);
  await unnamed.first().click();
  const details = page.getByRole("complementary", { name: "Selection details" });
  await expect(details.getByRole("heading", { name: "Undisclosed firm", exact: true })).toBeVisible();
  await expect(details.getByRole("link", { name: /View profile/ })).toHaveCount(0);
  await expect(page.locator('a[href*="/firms/undisclosed"]')).toHaveCount(0);
  await expect(page.locator(".react-flow__node").filter({ hasText: "Shared channel" })).toHaveCount(1);
});

test("Server Actions and same-origin proxy share a signed visitor identity and replace forged forwarding headers", async ({ page, browser, request }) => {
  const explanation = "The report action needs a stable visitor identity.";
  await page.request.post(base + "/api/v1/reports", {
    headers: { "x-yt-equity-client": "forged", "x-forwarded-for": "forged" }, data: { explanation },
  });
  await page.goto("/report");
  await page.getByLabel("What happened?").fill(explanation);
  await page.getByRole("button", { name: "Send report", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Report sent" })).toBeVisible();
  const other = await browser.newContext();
  try { await other.request.post(base + "/api/v1/reports", { data: { explanation } }); }
  finally { await other.close(); }
  const calls = (await (await request.get(api + "/__requests")).json()).filter((call: { path: string }) => call.path === "/api/v1/reports");
  expect(calls).toHaveLength(3);
  expect(calls.every((call: { signedClient: boolean }) => call.signedClient)).toBe(true);
  expect(calls[0].clientKey).toBe(calls[1].clientKey);
  expect(calls[0].clientKey).not.toBe(calls[2].clientKey);
});
