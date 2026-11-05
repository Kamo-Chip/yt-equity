import { test, expect } from "@playwright/test";
import { fixtureApi, resetFixture, signIn } from "../helpers/app";

test.beforeEach(async ({ request }) => { await resetFixture(request, true); });

test("workspace navigation reads only the active section on the server", async ({
  page,
  request,
}) => {
  await signIn(page);
  await page.goto("/moderator");
  await page.getByRole("link", { name: "Directory", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Acquired by Test firm", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review inbox" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Directory", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Acquired by Test firm", exact: true }),
  ).toBeVisible();
  const calls = await (
    await request.get(fixtureApi + "/__requests")
  ).json();
  expect(
    calls.filter((call: any) => call.path === "/api/v1/moderator/directory"),
  ).toHaveLength(2);
  expect(
    calls.some((call: any) => call.path.endsWith("/audit-events")),
  ).toBeFalsy();
});

test("approval opens the exact relationship editor without publishing submitted evidence", async ({
  page,
  request,
}) => {
  await signIn(page);
  await page.goto("/moderator");
  await page
    .getByRole("button", { name: "Approve report", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Edit relationship", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Source URL", exact: true }),
  ).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeVisible();
  const records = await (
    await request.get(fixtureApi + "/api/v1/moderator/relationships/00000000-0000-4000-8000-000000000004", {
      headers: { cookie: "fixture-role=moderator" },
    })
  ).json();
  expect(records.sources).toHaveLength(1);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("ambiguous reports require a named relationship choice and feedback never opens an editor", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/moderator");
  await page
    .getByRole("button", { name: /This acquisition may be incomplete/ })
    .click();
  await page
    .getByRole("button", { name: "Approve report", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Choose a relationship", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Acquisition by Test firm/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Funding from Second firm/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: /General feedback/ }).click();
  await page
    .getByRole("button", { name: "Approve report", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("No pending reports.", { exact: true }),
  ).toBeVisible();
});

test("directory filters persist and pagination loads bounded pages", async ({
  page,
  request,
}) => {
  await request.post(fixtureApi + "/__many", { data: { reports: 30 } });
  await signIn(page);
  await page.goto("/moderator");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText(/Page 2 of 2/)).toBeVisible();
  await page.getByRole("link", { name: "Directory", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Relationship", exact: true })
    .click();
  await page.getByRole("option", { name: "Funding", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Funded by Second firm", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Acquired by Test firm", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("cell", { name: "Funded by Second firm", exact: true }),
  ).toBeVisible();
});

test("draft editor validates, guards browser navigation, retains failed saves, then publishes explicitly", async ({
  page,
  request,
}) => {
  await signIn(page);
  await page.goto("/moderator?panel=directory");
  await page
    .getByRole("button", { name: "Add relationship", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Channel", exact: true }).click();
  await page
    .getByPlaceholder("Search channels", { exact: true })
    .fill("Brand new");
  await page.getByRole("option", { name: /Create a channel/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Channel name", exact: true }),
  ).toHaveValue("Brand new");
  await page
    .getByRole("textbox", { name: "YouTube channel ID or handle", exact: true })
    .fill("UCnew");
  await expect(
    page.getByRole("button", { name: "Publish relationship", exact: true }),
  ).toBeDisabled();
  await page.goBack();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(
    page.getByRole("textbox", {
      name: "YouTube channel ID or handle",
      exact: true,
    }),
  ).toHaveValue("UCnew");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Invalid url", { exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Source URL", exact: true })
    .fill("https://example.com/new");
  await request.post(fixtureApi + "/__fail-next", {
    data: {
      path: "/api/v1/moderator/relationships",
      method: "POST",
      status: 503,
      message: "Please retry this save.",
    },
  });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Please retry this save.");
  await expect(
    page.getByRole("textbox", { name: "Source URL", exact: true }),
  ).toHaveValue("https://example.com/new");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "Draft · provisional", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("row")
    .filter({ hasText: "Brand new" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Edit relationship",
    exact: true,
  });
  await expect(editor).toBeVisible();
  await editor
    .getByLabel("Record status", { exact: true })
    .selectOption("confirmed");
  await page
    .getByRole("button", { name: "Publish relationship", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "Published · confirmed", exact: true }),
  ).toHaveCount(3);
});
