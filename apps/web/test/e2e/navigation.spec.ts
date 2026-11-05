import { test, expect } from "@playwright/test";
import { base, fixtureApi, resetFixture, signIn, graphReady } from "../helpers/app";

test.beforeEach(async ({ request }) => { await resetFixture(request, true); });

test("anonymous visitors see public navigation and cannot open the workspace", async ({ page }) => {
  await page.goto("/");
  await graphReady(page);
  await expect(page.getByRole("link", { name: "Explore", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /moderator|workspace|admin/i })).toHaveCount(0);
  await page.goto("/moderator");
  await expect(page).toHaveURL(/\/moderator\/sign-in$/);
});

test("explorer navigation and browser Back restore graph filters from the URL", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("searchbox", { name: "Search channels or firms" })
    .fill("Test firm");
  await expect(page.locator(".graph-orb.firm")).toHaveCount(2);
  await expect(page.locator(".graph-orb.channel")).toHaveCount(1);
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("searchbox", { name: "Search channels or firms" }),
  ).toHaveValue("");
  await expect(page.locator(".graph-orb.firm")).toHaveCount(2);
  await expect(page.locator(".graph-orb.channel")).toHaveCount(0);
  await page.goBack();
  await expect(
    page.getByRole("searchbox", { name: "Search channels or firms" }),
  ).toHaveValue("Test firm");
  await expect(page.locator(".graph-orb.firm")).toHaveCount(2);
  await expect(page.locator(".graph-orb.channel")).toHaveCount(1);
});

test("sign out removes private access and a moderator cannot open admin management", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Administrator access required" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Moderators", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review inbox", exact: true }),
  ).toBeVisible();
  const signOutNavigation = page.waitForNavigation({ waitUntil: "load" });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signOutNavigation;
  await expect(page).toHaveURL(/\/moderator\/sign-in$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/moderator\/sign-in$/);
  await expect(
    page.getByRole("link", { name: "Directory", exact: true }),
  ).toHaveCount(0);
  await page.goto("/moderator");
  await expect(page).toHaveURL(/\/moderator\/sign-in$/);
});

test("profile contribution links and canonical graph URLs remain usable", async ({
  page,
}) => {
  await page.goto("/channels?q=Shared&type=funding");
  await expect(page).toHaveURL("/?q=Shared&type=funding");
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await page.goto("/channels/UCtest?contribution=dispute");
  await expect(
    page.getByLabel("What needs correcting?"),
  ).toBeVisible();
  await page.goto("/firms/00000000-0000-4000-8000-000000000002");
  await expect(
    page.getByRole("heading", { name: "Test firm", exact: true }),
  ).toBeVisible();
});

test("Server Actions preserve Fastify authorization when replayed without a session", async ({
  page,
  request,
}) => {
  await signIn(page);
  await page.goto("/moderator");
  const actionRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" && !!request.headers()["next-action"],
  );
  await page
    .getByRole("button", { name: "Approve report", exact: true })
    .click();
  const action = await actionRequest;
  await expect(
    page.getByRole("dialog", { name: "Edit relationship", exact: true }),
  ).toBeVisible();
  const response = await request.post(action.url(), {
    headers: {
      "next-action": action.headers()["next-action"],
      "content-type": action.headers()["content-type"],
      origin: base,
    },
    data: action.postData()!,
  });
  expect(await response.text()).toContain("UNAUTHORIZED");
  const calls = await (
    await request.get(fixtureApi + "/__requests")
  ).json();
  const decisions = calls.filter((call: any) =>
    call.path.endsWith("/decision"),
  );
  expect(decisions).toHaveLength(2);
  expect(decisions.map((call: any) => call.hasCookie)).toEqual([true, false]);
});

test("public navigation supports keyboard links and closes the mobile menu after navigation", async ({ page }) => {
  await page.goto("/");
  const explore = page.getByRole("link", { name: "Explore", exact: true });
  const report = page.getByRole("link", { name: "Report an issue", exact: true });
  await expect(explore).toHaveAttribute("data-active", "true");
  await report.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/report$/);
  await expect(report).toHaveAttribute("data-active", "true");
  await explore.focus();
  await page.keyboard.press("Enter");
  await graphReady(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const toggle = page.getByRole("button", { name: "Toggle Sidebar", exact: true });
  await toggle.click();
  const menu = page.getByRole("dialog", { name: "Sidebar", exact: true });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await toggle.click();
  await menu.getByRole("link", { name: "Report an issue", exact: true }).click();
  await expect(page).toHaveURL(/\/report$/);
  await expect(menu).toBeHidden();
});
