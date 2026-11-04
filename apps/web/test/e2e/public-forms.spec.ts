import { test, expect } from "@playwright/test";
const api = `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT ?? 4101}`;
test.beforeEach(async ({ request }) => {
  await request.post(`${api}/__reset`);
});

for (const mode of ["report", "correction", "dispute"] as const) {
  test(`${mode} submits essentials and preserves context`, async ({
    page,
    request,
  }) => {
    const claimId = "00000000-0000-4000-8000-000000000003";
    await page.goto(`/channels/UCtest?contribution=${mode}&claimId=${claimId}`);
    await expect(page).toHaveURL(
      new RegExp(
        `/report/channel\\?channelId=UCtest&contribution=${mode}&claimId=${claimId}`,
      ),
    );
    const form = page.locator("#contribute");
    await expect(form).toBeVisible();
    await expect(form.getByLabel("Email (optional)")).toBeHidden();
    await form
      .getByLabel(
        mode === "dispute" ? "What needs correcting?" : "What should we know?",
      )
      .fill("The channel ownership has changed recently.");
    await form
      .getByLabel("Source link", { exact: true })
      .fill("https://example.com/source?a=1,b=2");
    await form
      .getByRole("button", {
        name:
          mode === "dispute"
            ? "Send dispute"
            : mode === "report"
              ? "Send report"
              : "Suggest update",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Report sent" }),
    ).toBeVisible();
    const calls = await (await request.get(`${api}/__requests`)).json();
    const payload = calls.findLast(
      (c: any) => c.path === "/api/v1/submissions",
    ).data;
    expect(payload).toMatchObject({
      channelId: "UCtest",
      claimId,
      kind: mode === "dispute" ? "dispute" : "correction",
      sources: ["https://example.com/source?a=1,b=2"],
    });
    expect(payload).not.toHaveProperty("contactEmail");
    await page.getByRole("button", { name: "Submit another report" }).click();
    await expect(form.getByLabel("What should we know?")).toHaveValue("");
    await expect(form.getByLabel("Channel handle or ID")).toHaveValue("");
  });
}

test("source controls, optional details, pending state, and retry preserve the draft", async ({
  page,
  request,
}) => {
  await page.goto("/channels/UCtest?contribution=report");
  const form = page.locator("#contribute");
  await form
    .getByLabel("What should we know?")
    .fill("A company acquired this channel.");
  await form
    .getByLabel("Source link", { exact: true })
    .fill("https://example.com/one");
  for (let i = 0; i < 4; i++)
    await form.getByRole("button", { name: "Add another link" }).click();
  await expect(
    form.getByRole("button", { name: "Add another link" }),
  ).toHaveCount(0);
  await form.getByRole("button", { name: "Remove source link 5" }).click();
  await form.getByRole("button", { name: "Remove source link 4" }).click();
  await form.getByRole("button", { name: "Remove source link 3" }).click();
  await form
    .getByLabel("Source link 2", { exact: true })
    .fill("https://example.com/two");
  await form.getByText("Optional details", { exact: true }).click();
  await form.getByLabel("Relationship (optional)").selectOption("acquisition");
  await form.getByLabel("Email (optional)").fill("reader@example.com");
  await request.post(`${api}/__fail-next`, {
    data: { path: "/api/v1/submissions", method: "POST", status: 503 },
  });
  await request.post(`${api}/__delay`, {
    data: { path: "/api/v1/submissions", ms: 600 },
  });
  await form.getByRole("button", { name: "Send report", exact: true }).click();
  await expect(form.getByRole("button", { name: "Sending…" })).toBeDisabled();
  await expect(form.getByRole("alert")).toContainText("couldn't submit");
  await expect(form.getByLabel("What should we know?")).toHaveValue(
    "A company acquired this channel.",
  );
  await expect(form.getByLabel("Source link 2", { exact: true })).toHaveValue(
    "https://example.com/two",
  );
  await expect(form.getByLabel("Email (optional)")).toHaveValue(
    "reader@example.com",
  );
  await expect(form.getByLabel("Relationship (optional)")).toHaveValue(
    "acquisition",
  );
  await form.getByRole("button", { name: "Send report", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Report sent" }),
  ).toBeVisible();
  const calls = await (await request.get(`${api}/__requests`)).json();
  expect(
    calls.findLast((c: any) => c.path === "/api/v1/submissions").data,
  ).toMatchObject({
    type: "acquisition",
    contactEmail: "reader@example.com",
    sources: ["https://example.com/one", "https://example.com/two"],
  });
});

test("unknown channel report and native validation", async ({
  page,
  request,
}) => {
  await page.goto("/channels/UCunknown?contribution=report");
  const form = page.locator("#contribute");
  await form.getByRole("button", { name: "Send report", exact: true }).click();
  await expect(form.getByLabel("What should we know?")).toBeFocused();
  await form
    .getByLabel("What should we know?")
    .fill("This channel has new ownership.");
  await form.getByLabel("Source link", { exact: true }).fill("not a url");
  await form.getByRole("button", { name: "Send report", exact: true }).click();
  await expect(form.getByLabel("Source link", { exact: true })).toBeFocused();
  await form
    .getByLabel("Source link", { exact: true })
    .fill("https://example.com/evidence");
  await form.getByRole("button", { name: "Send report", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Report sent" }),
  ).toBeVisible();
  const calls = await (await request.get(`${api}/__requests`)).json();
  expect(
    calls.findLast((c: any) => c.path === "/api/v1/submissions").data.kind,
  ).toBe("new_channel");
});

test("general report retries with the same text and optional email", async ({
  page,
  request,
}) => {
  await page.goto("/report");
  await page
    .getByLabel("What happened?")
    .fill("A source link no longer works.");
  await page.getByText("Optional details", { exact: true }).click();
  await page.getByLabel("Email (optional)").fill("reader@example.com");
  await request.post(`${api}/__fail-next`, {
    data: { path: "/api/v1/reports", method: "POST" },
  });
  await page.getByRole("button", { name: "Send report", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Couldn’t send",
  );
  await expect(page.getByLabel("What happened?")).toHaveValue(
    "A source link no longer works.",
  );
  await expect(page.getByLabel("Email (optional)")).toHaveValue(
    "reader@example.com",
  );
  await page.getByRole("button", { name: "Send report", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Report sent" }),
  ).toBeVisible();
});

test("sign-in keeps email and displays inline feedback", async ({
  page,
  request,
}) => {
  await page.goto("/moderator/sign-in");
  await page.getByLabel("Email", { exact: true }).fill("moderator@example.com");
  await request.post(`${api}/__fail-next`, {
    data: { path: "/api/auth/sign-in/magic-link", method: "POST", status: 403 },
  });
  await page.getByRole("button", { name: "Email sign-in link" }).click();
  await expect(page.locator("#sign-in-message")).toContainText(
    "does not have workspace access",
  );
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "moderator@example.com",
  );
  await page.getByRole("button", { name: "Email sign-in link" }).click();
  await expect(page.locator("#sign-in-message")).toHaveText(
    "Check your email for a sign-in link.",
  );
});

test("validation reveals collapsed optional fields and associates inline errors", async ({
  page,
}) => {
  await page.goto("/channels/UCtest?contribution=dispute");
  const form = page.locator("#contribute");
  await form
    .getByLabel("What needs correcting?")
    .fill("This record needs correcting.");
  await form
    .getByLabel("Source link", { exact: true })
    .fill("https://example.com/evidence");
  await form.getByText("Optional details", { exact: true }).click();
  await expect(form.getByLabel("Relationship (optional)")).toHaveCount(0);
  await form.getByLabel("Email (optional)").fill("invalid");
  await form.getByText("Optional details", { exact: true }).click();
  await form.getByRole("button", { name: "Send dispute" }).click();
  await expect(form.getByLabel("Email (optional)")).toBeVisible();
  await expect(form.getByLabel("Email (optional)")).toBeFocused();
  await form.getByLabel("Email (optional)").fill("");
  // Whitespace passes native required validation, but the shared schema trims it.
  await form.getByLabel("What needs correcting?").fill("          ");
  await form.getByRole("button", { name: "Send dispute" }).click();
  const explanation = form.getByLabel("What needs correcting?");
  await expect(explanation).toHaveAttribute("aria-invalid", "true");
  await expect(explanation).toBeFocused();
  await expect(
    form.getByText("Use 10–4,000 characters.", { exact: true }),
  ).toBeVisible();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`mobile and short viewport layout in ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/channels/UCtest?contribution=report");
    const form = page.locator("#contribute");
    await form
      .getByRole("button", { name: "Send report", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      form.getByRole("button", { name: "Send report", exact: true }),
    ).toBeInViewport();
    expect(
      await form
        .getByLabel("Source link", { exact: true })
        .evaluate((el) => getComputedStyle(el).fontSize),
    ).toBe("16px");
    await form.getByText("Optional details", { exact: true }).click();
    for (let i = 0; i < 4; i++)
      await form.getByRole("button", { name: "Add another link" }).click();
    await page.setViewportSize({ width: 390, height: 480 });
    await form.getByLabel("Email (optional)").scrollIntoViewIfNeeded();
    await expect(form.getByLabel("Email (optional)")).toBeInViewport();
    await form
      .getByRole("button", { name: "Send report", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      form.getByRole("button", { name: "Send report", exact: true }),
    ).toBeInViewport();
    const bounds = await form.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(
      await form.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBeTruthy();
  });
}

async function fillEvidence(page: import("@playwright/test").Page) {
  await page
    .getByLabel("What should we know?")
    .fill("This channel has new ownership.");
  await page
    .getByLabel("Source link", { exact: true })
    .fill("https://example.com/evidence");
}

test("direct entry validates the identifier and resolves known handles", async ({
  page,
  request,
}) => {
  await page.goto("/report/channel");
  await expect(page.getByLabel("Channel handle or ID")).toHaveValue("");
  await page.getByRole("button", { name: "Send report", exact: true }).click();
  await expect(page.getByLabel("Channel handle or ID")).toBeFocused();
  await fillEvidence(page);
  await page
    .getByLabel("Channel handle or ID")
    .fill("https://youtube.com/@test");
  await page.getByRole("button", { name: "Send report", exact: true }).click();
  await expect(page.getByLabel("Channel handle or ID")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("Channel handle or ID")).toBeFocused();
  await page.getByLabel("Channel handle or ID").fill("@test");
  await page.getByRole("button", { name: "Send report", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Report sent" }),
  ).toBeVisible();
  const calls = await (await request.get(`${api}/__requests`)).json();
  expect(
    calls.findLast((c: any) => c.path === "/api/v1/submissions").data,
  ).toMatchObject({ channelId: "UCtest", kind: "correction" });
});

for (const mode of ["correction", "dispute"] as const) {
  test(`unknown channel ${mode} requires switching to a report`, async ({
    page,
    request,
  }) => {
    await page.goto(`/report/channel?channelId=UCunknown&contribution=${mode}`);
    await page
      .getByLabel(
        mode === "dispute" ? "What needs correcting?" : "What should we know?",
      )
      .fill("This channel has new ownership.");
    await page
      .getByLabel("Source link", { exact: true })
      .fill("https://example.com/evidence");
    await page
      .getByRole("button", {
        name: mode === "dispute" ? "Send dispute" : "Suggest update",
        exact: true,
      })
      .click();
    await expect(page.locator("#contribute > p[role=alert]")).toContainText(
      "isn’t in the directory",
    );
    const calls = await (await request.get(`${api}/__requests`)).json();
    expect(calls.some((c: any) => c.path === "/api/v1/submissions")).toBe(
      false,
    );
    await page.getByLabel("Contribution type").selectOption("report");
    await page
      .getByRole("button", { name: "Send report", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Report sent" }),
    ).toBeVisible();
  });
}

for (const change of ["channel", "contribution"] as const) {
  test(`changing ${change} clears claim context`, async ({ page, request }) => {
    await page.goto(
      "/report/channel?channelId=UCtest&contribution=report&claimId=00000000-0000-4000-8000-000000000003",
    );
    if (change === "channel")
      await page.getByLabel("Channel handle or ID").fill("@test");
    else await page.getByLabel("Contribution type").selectOption("correction");
    await fillEvidence(page);
    await page
      .getByRole("button", {
        name: change === "channel" ? "Send report" : "Suggest update",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Report sent" }),
    ).toBeVisible();
    const calls = await (await request.get(`${api}/__requests`)).json();
    expect(
      calls.findLast((c: any) => c.path === "/api/v1/submissions").data,
    ).not.toHaveProperty("claimId");
  });
}

for (const status of [409, 429]) {
  test(`submission ${status} keeps the draft and allows retry`, async ({
    page,
    request,
  }) => {
    await page.goto("/report/channel?channelId=UCtest");
    await fillEvidence(page);
    await request.post(`${api}/__fail-next`, {
      data: { path: "/api/v1/submissions", method: "POST", status },
    });
    await page
      .getByRole("button", { name: "Send report", exact: true })
      .click();
    await expect(page.locator("#contribute > p[role=alert]")).toContainText(
      status === 409 ? "already under review" : "Too many submissions",
    );
    await expect(page.getByLabel("Channel handle or ID")).toHaveValue("UCtest");
    await expect(page.getByLabel("What should we know?")).toHaveValue(
      "This channel has new ownership.",
    );
    await page
      .getByRole("button", { name: "Send report", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Report sent" }),
    ).toBeVisible();
  });
}

test("profile and issue pages expose the dedicated report page", async ({
  page,
}) => {
  await page.goto("/channels/UCtest");
  await page
    .getByRole("link", { name: "Report this channel", exact: true })
    .click();
  await expect(page).toHaveURL(
    "/report/channel?channelId=UCtest&contribution=report",
  );
  await expect(page.getByLabel("Channel handle or ID")).toHaveValue("UCtest");
  await page
    .getByRole("main")
    .getByRole("link", { name: "Report an issue" })
    .click();
  await expect(page).toHaveURL("/report");
  await page
    .getByRole("main")
    .getByRole("link", { name: "Report a channel" })
    .click();
  await expect(page).toHaveURL("/report/channel");
});
