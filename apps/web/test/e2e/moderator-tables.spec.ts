import { expect, test } from "@playwright/test";
const base = `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT ?? 3100}`;
const api = `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT ?? 4101}`;
test.beforeEach(async ({ page, request }) => {
  await request.post(api + "/__reset");
  await page
    .context()
    .addCookies([{ name: "fixture-role", value: "moderator", url: base }]);
});

test("directory sort headers update server results, URL, and browser history", async ({
  page,
}) => {
  await page.goto("/moderator?panel=directory");
  const table = page.getByRole("table", { name: "Relationships directory" });
  await page
    .getByRole("button", { name: "Sort by Details ascending", exact: true })
    .click();
  await expect(page).toHaveURL(/sort=details&direction=asc/);
  await expect(table.locator("tbody tr").first()).toContainText(
    "Acquired by Test firm",
  );
  await expect(
    page.getByRole("columnheader", { name: "Details", exact: true }),
  ).toHaveAttribute("aria-sort", "ascending");
  await page
    .getByRole("button", { name: "Sort by Details descending", exact: true })
    .click();
  await expect(table.locator("tbody tr").first()).toContainText(
    "Funded by Second firm",
  );
  await expect(
    page.getByRole("columnheader", { name: "Details", exact: true }),
  ).toHaveAttribute("aria-sort", "descending");
  await page.goBack();
  await expect(table.locator("tbody tr").first()).toContainText(
    "Acquired by Test firm",
  );
  await page.getByRole("tab", { name: "Firms", exact: true }).click();
  await expect(page).not.toHaveURL(/sort=/);
  await page
    .getByRole("button", { name: "Sort by Name descending", exact: true })
    .click();
  await expect(
    page
      .getByRole("table", { name: "Firms directory" })
      .locator("tbody tr")
      .first(),
  ).toContainText("Test firm");
});

test("page-size changes reset pagination and directory filters can be cleared", async ({
  page,
  request,
}) => {
  await request.post(api + "/__many", { data: { reports: 30 } });
  await page.goto("/moderator");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.getByText(/Page 2 of 2/)).toBeVisible();
  await page.getByRole("combobox", { name: "Rows per page" }).click();
  await page.getByRole("option", { name: "50 per page", exact: true }).click();
  await expect(page.getByText(/33 records · Page 1 of 1/)).toBeVisible();
  await expect(page).toHaveURL(/pageSize=50/);
  await page.goto("/moderator?panel=directory&publication=draft");
  await expect(
    page.getByRole("cell", { name: "No matching records.", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "Acquired by Test firm", exact: true }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/publication=/);
});

test("activity sorting and search work with the server-rendered shadcn table", async ({
  page,
  request,
}) => {
  await request.post(api + "/__activity", {
    data: {
      items: [
        {
          id: "event-a",
          action: "approved",
          entityType: "submission",
          createdAt: "2026-11-01T10:00:00Z",
        },
        {
          id: "event-b",
          action: "published",
          entityType: "relationship",
          createdAt: "2026-11-02T10:00:00Z",
        },
      ],
    },
  });
  await page.goto("/moderator?panel=activity");
  const table = page.getByRole("table", { name: "Workspace activity" });
  await expect(table.locator("tbody tr").first()).toContainText("Published");
  await page
    .getByRole("button", { name: "Sort by Time ascending", exact: true })
    .click();
  await expect(table.locator("tbody tr").first()).toContainText("Approved");
  await page
    .getByRole("textbox", { name: "Search activity", exact: true })
    .fill("relationship");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table.locator("tbody tr").first()).toContainText("Published");
  await page
    .getByRole("textbox", { name: "Search activity", exact: true })
    .fill("Report");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table.locator("tbody tr").first()).toContainText("Approved");
});

test("moderator cards and data tables fit mobile in both themes", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/moderator?panel=directory");
  await expect(
    page.getByRole("table", { name: "Relationships directory" }),
  ).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.classList.toggle("dark", value === "dark");
    }, theme);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`directory-${theme}.png`),
      fullPage: true,
    });
  }
});

test("compact moderator layout and toggles work across viewport sizes and themes", async ({
  page,
  request,
}, testInfo) => {
  await request.post(api + "/__activity", {
    data: {
      items: [
        {
          id: "event-1",
          action: "approved",
          entityType: "submission",
          createdAt: "2026-09-15T20:04:16Z",
        },
        {
          id: "event-2",
          action: "accepted",
          entityType: "moderator_invitation",
          createdAt: "2026-09-15T19:10:21Z",
        },
      ],
    },
  });
  for (const width of [1920, 1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      for (const panel of ["directory", "inbox", "activity"]) {
        await page.goto("/moderator?panel=" + panel);
        if (panel !== "inbox")
          await expect(page.getByRole("table")).toBeVisible();
        if (panel === "inbox")
          await expect(
            page.getByRole("button", { name: "Approve report", exact: true }),
          ).toBeVisible();
        await expect(page.locator("html")).toHaveClass(
          theme === "dark" ? /dark/ : /light/,
        );
        const geometry = await page
          .locator(".moderator-page:visible")
          .boundingBox();
        expect(geometry!.width).toBeLessThanOrEqual(1280);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (panel !== "activity") {
          await expect(page.locator(".moderator-tab-list:visible")).toHaveCSS(
            "height",
            "36px",
          );
          for (const tab of await page.getByRole("tab").all())
            await expect(tab).toHaveCSS("height", "30px");
        }
        await page.screenshot({
          path: testInfo.outputPath(`${panel}-${width}-${theme}.png`),
          fullPage: true,
        });
      }
    }
  }
  await expect(
    page.getByRole("cell", { name: "Moderator invitation", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "15 Sep 2026, 21:10", exact: true }),
  ).toBeVisible();
});

test("segmented controls support keyboard selection and workspace theme toggle persists", async ({
  page,
}) => {
  await page.goto("/moderator?panel=directory");
  const relationships = page.getByRole("tab", {
    name: "Relationships",
    exact: true,
  });
  await relationships.focus();
  await page.keyboard.press("ArrowRight");
  const channels = page.getByRole("tab", { name: "Channels", exact: true });
  await expect(channels).toBeFocused();
  await expect(channels).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("table", { name: "Channels directory" }),
  ).toBeVisible();
  const toggle = page.getByRole("button", {
    name: "Switch to dark mode",
    exact: true,
  });
  await expect(toggle).toHaveCSS("width", "36px");
  await expect(toggle).toHaveCSS("height", "36px");
  await toggle.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("compact tables show matching loading and empty states", async ({
  page,
  request,
}, testInfo) => {
  await request.post(api + "/__delay", {
    data: { path: "/api/v1/moderator/directory", ms: 2000 },
  });
  await page.goto("/moderator?panel=directory", { waitUntil: "commit" });
  await expect(
    page.getByRole("status", { name: "Loading directory" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("directory-loading.png"),
    fullPage: true,
  });
  await expect(
    page.getByRole("table", { name: "Relationships directory" }),
  ).toBeVisible();
  await page.goto("/moderator?panel=directory&q=NoSuchRecord");
  await expect(
    page.getByRole("cell", { name: "No matching records.", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("directory-empty.png"),
    fullPage: true,
  });
});
