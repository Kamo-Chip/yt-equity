import { test, expect, type Page } from "@playwright/test";
const base = `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT ?? 3100}`;
const api = `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT ?? 4101}`;
const report = "00000000-0000-4000-8000-000000000006";
const relationship = "00000000-0000-4000-8000-000000000004";
async function signIn(page: Page) {
  await page
    .context()
    .addCookies([{ name: "fixture-role", value: "moderator", url: base }]);
}
test.beforeEach(async ({ request }) => {
  await request.post(api + "/__reset");
});

test("inbox streams before report context on desktop and mobile", async ({
  page,
  request,
}) => {
  await signIn(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await request.post(api + "/__delay", {
      data: {
        path: `/api/v1/moderator/submissions/${report}/context`,
        ms: 2500,
      },
    });
    await page.goto("/moderator", { waitUntil: "commit" });
    await expect(
      page.getByRole("button", {
        name: /Please check this ownership announcement/,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("status", { name: "Loading report", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Approve report", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Approve report", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("relationship editor streams independently and its loading sheet can close", async ({
  page,
  request,
}) => {
  await signIn(page);
  await request.post(api + "/__delay", {
    data: { path: `/api/v1/moderator/relationships/${relationship}`, ms: 3000 },
  });
  await page.goto("/moderator?panel=directory");
  await page
    .getByRole("row")
    .filter({ hasText: "Acquired by Test firm" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Loading editor" }),
  ).toBeVisible();
  await expect(
    page.locator("td").filter({ hasText: "Acquired by Test firm" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).not.toHaveURL(/edit=/);
  await expect(
    page.getByRole("cell", { name: "Acquired by Test firm", exact: true }),
  ).toBeVisible();
});

test("selection resets only report detail and back restores the selection", async ({
  page,
  request,
}) => {
  await signIn(page);
  await page.goto("/moderator");
  await expect(
    page.getByRole("button", { name: "Approve report", exact: true }),
  ).toBeVisible();
  const second = "00000000-0000-4000-8000-000000000007";
  await request.post(api + "/__delay", {
    data: { path: `/api/v1/moderator/submissions/${second}/context`, ms: 2500 },
  });
  await page
    .getByRole("button", { name: /This acquisition may be incomplete/ })
    .click();
  await expect(
    page.getByRole("status", { name: "Loading report", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Loading inbox", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /Please check this ownership announcement/,
    }),
  ).toBeVisible();
  await expect(
    page
      .locator(".workspace-detail")
      .getByText("This acquisition may be incomplete.", { exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page
      .locator(".workspace-detail")
      .getByText("Please check this ownership announcement.", { exact: true }),
  ).toBeVisible();
});

test("report and editor failures stay local and retry successfully", async ({
  page,
  request,
}) => {
  await signIn(page);
  await request.post(api + "/__fail-next", {
    data: {
      path: `/api/v1/moderator/submissions/${report}/context`,
      method: "GET",
    },
  });
  await page.goto("/moderator");
  await expect(
    page.getByText("Couldn’t load this report.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Please check this ownership announcement/,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Approve report", exact: true }),
  ).toBeVisible();
  await request.post(api + "/__fail-next", {
    data: {
      path: `/api/v1/moderator/relationships/${relationship}`,
      method: "GET",
    },
  });
  await page.goto(`/moderator?panel=directory&edit=${relationship}`);
  await expect(
    page.getByRole("dialog", { name: "Couldn’t load this record" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Edit relationship", exact: true }),
  ).toBeVisible();
});

test("private context is deduplicated per request and browser bootstrap reads are absent", async ({
  page,
  request,
}) => {
  await signIn(page);
  const browserReads: string[] = [];
  page.on("request", (req) => {
    if (
      req.method() === "GET" &&
      new URL(req.url()).pathname.startsWith("/api/v1/moderator/")
    )
      browserReads.push(req.url());
  });
  await page.goto(
    `/moderator?submission=${report}&edit=${relationship}&source=${report}`,
  );
  await expect(
    page.getByRole("dialog", { name: "Edit relationship", exact: true }),
  ).toBeVisible();
  const calls = await (await request.get(api + "/__requests")).json();
  expect(
    calls.filter((call: { path: string }) =>
      call.path.endsWith(`/${report}/context`),
    ),
  ).toHaveLength(1);
  expect(browserReads).toEqual([]);
  const anonymous = await page.context().browser()!.newContext();
  const otherPage = await anonymous.newPage();
  await otherPage.goto("/moderator");
  await expect(otherPage).toHaveURL(/\/moderator\/sign-in$/);
  await expect(
    otherPage.getByText("Please check this ownership announcement.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await anonymous.close();
});

test("direct editor links include a skeleton in the streamed HTML", async ({
  page,
  request,
}) => {
  await signIn(page);
  await request.post(api + "/__delay", {
    data: { path: `/api/v1/moderator/relationships/${relationship}`, ms: 3000 },
  });
  await page.goto(`/moderator?panel=directory&edit=${relationship}`, {
    waitUntil: "commit",
  });
  await expect(page.locator('[aria-label="Loading editor"]')).toBeVisible();
  await expect(
    page.locator("td").filter({ hasText: "Acquired by Test firm" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Edit relationship", exact: true }),
  ).toBeVisible();
});

test("filtering, pagination, and activity use their section skeletons", async ({
  page,
  request,
}) => {
  await signIn(page);
  await request.post(api + "/__many", {
    data: { reports: 30, relationships: 30 },
  });
  await page.goto("/moderator");
  await expect(
    page.getByRole("button", { name: "Approve report", exact: true }),
  ).toBeVisible();
  await request.post(api + "/__delay", {
    data: { path: "/api/v1/moderator/inbox", ms: 2000 },
  });
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "Loading inbox", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Page 2 of/)).toBeVisible();
  await request.post(api + "/__delay", {
    data: { path: "/api/v1/moderator/directory", ms: 2000 },
  });
  await page.getByRole("link", { name: "Directory", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "Loading directory" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Acquired by Test firm", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Publication", exact: true })
    .click();
  await page.getByRole("option", { name: "Draft", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "Loading directory" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "No matching records.", exact: true }),
  ).toBeVisible();
  await request.post(api + "/__delay", {
    data: { path: "/api/v1/moderator/audit-events", ms: 2000 },
  });
  await page.getByRole("link", { name: "Activity", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "Loading activity" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Action", exact: true }),
  ).toBeVisible();
});

test("authorization failures in report context redirect instead of becoming local errors", async ({
  page,
  request,
}) => {
  await signIn(page);
  await request.post(api + "/__fail-next", {
    data: {
      path: `/api/v1/moderator/submissions/${report}/context`,
      method: "GET",
      status: 401,
    },
  });
  await page.goto("/moderator");
  await expect(page).toHaveURL(/\/moderator\/sign-in$/);
  await expect(
    page.getByText("Couldn’t load this report.", { exact: true }),
  ).toHaveCount(0);
});

test("entity editors reuse the directory read and preserve save and discard behavior", async ({
  page,
  request,
}) => {
  await signIn(page);
  await page.goto(
    "/moderator?panel=directory&resource=channels&entity=channels&entityId=00000000-0000-4000-8000-000000000001",
  );
  await expect(
    page.getByRole("dialog", { name: "Edit channel", exact: true }),
  ).toBeVisible();
  const calls = await (await request.get(api + "/__requests")).json();
  expect(
    calls.filter(
      (call: { path: string }) => call.path === "/api/v1/moderator/directory",
    ),
  ).toHaveLength(1);
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Updated channel");
  await page.getByRole("button", { name: "Save channel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "Updated channel", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Firms", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "Test firm" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Edit firm", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Unsaved firm");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Discard unsaved changes?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "Test firm", exact: true }),
  ).toBeVisible();
});
