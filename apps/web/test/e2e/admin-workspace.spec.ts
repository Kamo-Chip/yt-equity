import { test, expect } from "@playwright/test";
const base = `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT ?? 3100}`;
const api = `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT ?? 4101}`;
const users = Array.from({ length: 30 }, (_, index) => ({
  id: "moderator-" + index,
  email: String(index).padStart(2, "0") + "@moderators.test",
  role: "moderator",
  createdAt: new Date(Date.UTC(2026, 10, index + 1)).toISOString(),
}));
const invitations = ["pending", "accepted", "expired", "revoked"].map(
  (status, index) => ({
    id: "invitation-" + index,
    email: status + "@invitations.test",
    expiresAt:
      status === "pending" ? "2099-01-01T00:00:00Z" : "2020-01-01T00:00:00Z",
    acceptedAt: status === "accepted" ? "2020-01-01T00:00:00Z" : null,
    revokedAt: status === "revoked" ? "2020-01-01T00:00:00Z" : null,
    lastSentAt: "2026-11-0" + (index + 1) + "T10:00:00Z",
    createdAt: "2026-11-01T10:00:00Z",
  }),
);
test.beforeEach(async ({ page, request }) => {
  await request.post(api + "/__reset");
  await page
    .context()
    .addCookies([{ name: "fixture-role", value: "admin", url: base }]);
});

test("admin sections stream independently with no combined or browser bootstrap reads", async ({
  page,
  request,
}) => {
  await request.post(api + "/__admin-data", { data: { invitations } });
  const browserReads: string[] = [];
  page.on("request", (req) => {
    if (
      req.method() === "GET" &&
      new URL(req.url()).pathname.startsWith("/api/v1/admin/")
    )
      browserReads.push(req.url());
  });
  await request.post(api + "/__delay", {
    data: { path: "/api/v1/admin/moderators/invitations", ms: 2500 },
  });
  await page.goto("/admin", { waitUntil: "commit" });
  await expect(
    page.getByRole("button", { name: "Send invitation", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Active moderators", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Loading invitations", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Invitation history", exact: true }),
  ).toBeVisible();
  const calls = await (await request.get(api + "/__requests")).json();
  expect(
    calls.filter(
      (call: { path: string }) => call.path === "/api/v1/admin/moderators",
    ),
  ).toHaveLength(0);
  expect(
    calls.filter(
      (call: { path: string }) =>
        call.path === "/api/v1/admin/moderators/users",
    ),
  ).toHaveLength(1);
  expect(
    calls.filter(
      (call: { path: string }) =>
        call.path === "/api/v1/admin/moderators/invitations",
    ),
  ).toHaveLength(1);
  expect(
    calls
      .filter((call: { path: string; hasCookie: boolean }) =>
        call.path.startsWith("/api/v1/admin/"),
      )
      .every((call: { hasCookie: boolean }) => call.hasCookie),
  ).toBe(true);
  await request.post(api + "/__delay", {
    data: { path: "/api/v1/admin/moderators/invitations", ms: 0 },
  });
  await request.post(api + "/__delay", {
    data: { path: "/api/v1/admin/moderators/users", ms: 2500 },
  });
  await page.goto("/admin", { waitUntil: "commit" });
  await expect(
    page.getByRole("table", { name: "Invitation history", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", {
      name: "Loading active moderators",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Active moderators", exact: true }),
  ).toBeVisible();
  expect(browserReads).toEqual([]);
});

test("sorting, pagination, filters, and history keep independent URL state", async ({
  page,
  request,
}) => {
  await request.post(api + "/__admin-data", { data: { users, invitations } });
  await page.goto("/admin");
  const active = page.getByRole("region", {
    name: "Active moderators",
    exact: true,
  });
  const history = page.getByRole("region", {
    name: "Invitation history",
    exact: true,
  });
  await active
    .getByRole("button", { name: "Sort by Email ascending", exact: true })
    .click();
  await expect(active.locator("tbody tr").first()).toContainText(
    "00@moderators.test",
  );
  await active.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(active.getByText(/Page 2 of 2/)).toBeVisible();
  await history
    .getByRole("combobox", { name: "Invitation status", exact: true })
    .click();
  await page.getByRole("option", { name: "Pending", exact: true }).click();
  await expect(history.locator("tbody tr")).toHaveCount(1);
  await expect(history.locator("tbody tr").first()).toContainText(
    "pending@invitations.test",
  );
  await expect(page).toHaveURL(/usersPage=2/);
  await expect(page).toHaveURL(/invitationsStatus=pending/);
  await page.goBack();
  await expect(history.locator("tbody tr")).toHaveCount(4);
  await expect(active.getByText(/Page 2 of 2/)).toBeVisible();
  await active.getByRole("combobox", { name: "Rows per page" }).click();
  await page.getByRole("option", { name: "50 per page", exact: true }).click();
  await expect(active.getByText(/30 records · Page 1 of 1/)).toBeVisible();
  await active
    .getByRole("textbox", { name: "Search active moderators" })
    .fill("29@");
  await expect(active.locator("tbody tr")).toHaveCount(1);
  await expect(active.locator("tbody tr").first()).toContainText(
    "29@moderators.test",
  );
  await history
    .getByRole("button", { name: "Sort by Email ascending", exact: true })
    .click();
  await expect(history.locator("tbody tr").first()).toContainText(
    "accepted@invitations.test",
  );
});

test("sending, resending, and revoking refresh server rows while failed invites retain input", async ({
  page,
  request,
}) => {
  await page.goto("/admin");
  await request.post(api + "/__fail-next", {
    data: {
      path: "/api/v1/admin/moderators/invitations",
      method: "POST",
      status: 503,
      message: "Email unavailable. Retry this invitation.",
    },
  });
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("new@example.com");
  await page
    .getByRole("button", { name: "Send invitation", exact: true })
    .click();
  await expect(page.locator("#invite-error")).toHaveText(
    "Email unavailable. Retry this invitation.",
  );
  await expect(
    page.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveValue("new@example.com");
  await page
    .getByRole("button", { name: "Send invitation", exact: true })
    .click();
  const history = page.getByRole("region", {
    name: "Invitation history",
    exact: true,
  });
  await expect(
    history.getByRole("cell", { name: "new@example.com", exact: true }),
  ).toBeVisible();
  await history.getByRole("button", { name: "Resend", exact: true }).click();
  await expect(
    history.getByRole("button", { name: "Resend", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Revoke access", exact: true })
    .click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("moderator@example.com");
  await confirmation
    .getByRole("button", { name: "Revoke access", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "No active moderators.", exact: true }),
  ).toBeVisible();
});

test("section failures stay local and retry without losing the invite form", async ({
  page,
  request,
}) => {
  await request.post(api + "/__fail-next", {
    data: {
      path: "/api/v1/admin/moderators/invitations",
      method: "GET",
      status: 503,
    },
  });
  await page.goto("/admin");
  await expect(
    page.getByRole("table", { name: "Active moderators", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send invitation", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Invitation history", exact: true }),
  ).toBeVisible();
});

test("admin reads remain isolated from moderator and anonymous sessions", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(
    page.getByRole("table", { name: "Active moderators", exact: true }),
  ).toBeVisible();
  await page
    .context()
    .addCookies([{ name: "fixture-role", value: "moderator", url: base }]);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Administrator access required" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveCount(0);
  await page.context().clearCookies();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/moderator\/sign-in$/);
});

test("admin tables fit all target sizes and themes with shadcn controls", async ({
  page,
  request,
}, testInfo) => {
  await request.post(api + "/__admin-data", { data: { invitations } });
  for (const width of [1920, 1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/admin");
      await expect(
        page.getByRole("table", { name: "Invitation history", exact: true }),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (await page.locator(".admin-page:visible").boundingBox())!.width,
      ).toBeLessThanOrEqual(1280);
      await expect(page.locator(".admin-page:visible select")).toHaveCount(0);
      await expect(
        page.getByRole("textbox", { name: "Email", exact: true }),
      ).toHaveAttribute("data-slot", "input");
      await page.screenshot({
        path: testInfo.outputPath(`admin-${width}-${theme}.png`),
        fullPage: true,
      });
    }
  }
});
