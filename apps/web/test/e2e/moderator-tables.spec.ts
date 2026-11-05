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

test("directory resources support keyboard selection", async ({
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
});
