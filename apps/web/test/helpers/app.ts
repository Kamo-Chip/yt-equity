import { expect, type APIRequestContext, type Page } from "@playwright/test";
export const base = `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT ?? 3100}`;
export const fixtureApi = `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT ?? 4101}`;
export async function signIn(page: Page, role: "moderator" | "admin" = "moderator") {
  await page.context().addCookies([{ name: "fixture-role", value: role, url: base }]);
}
export async function resetFixture(request: APIRequestContext, expireProfiles = false) {
  expect((await request.post(`${fixtureApi}/__reset`)).ok()).toBe(true);
  if (expireProfiles) {
    expect((await request.patch(`${base}/api/v1/moderator/channels/00000000-0000-4000-8000-000000000001`, {
      headers: { cookie: "fixture-role=moderator" }, data: { name: "Shared channel" },
    })).ok()).toBe(true);
    expect((await request.post(`${fixtureApi}/__reset`)).ok()).toBe(true);
  }
}
export function activeGraph(page: Page) {
  return page.getByRole("main", { name: "Ownership explorer", exact: true });
}
export async function graphReady(page: Page) {
  await expect(activeGraph(page)).toHaveAttribute("data-graph-ready", "true");
}

export async function freezeClock(page: Page) {
  // pauseAt advances virtual time without a real wait. Allow RPC headroom so
  // the requested instant cannot pass while the driver sends the command.
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 1000));
}
