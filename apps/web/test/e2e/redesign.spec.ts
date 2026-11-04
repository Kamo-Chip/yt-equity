import { test, expect, type Page } from "@playwright/test";
const base = `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT ?? 3100}`;
const fixtureApi = `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT ?? 4101}`;
async function signIn(page: Page, role: "moderator" | "admin" = "moderator") {
  await page
    .context()
    .addCookies([{ name: "fixture-role", value: role, url: base }]);
}
test.beforeEach(async ({ request }) => {
  expect(
    (await request.post(fixtureApi + "/__reset")).ok(),
  ).toBeTruthy();
  // A real directory write against the fixture expires Next's tagged caches.
  // Reset again so diagnostics and data start clean for each independent test.
  expect(
    (
      await request.patch(
        base +
          "/api/v1/moderator/channels/00000000-0000-4000-8000-000000000001",
        {
          headers: { cookie: "fixture-role=moderator" },
          data: { name: "Shared channel" },
        },
      )
    ).ok(),
  ).toBeTruthy();
  await request.post(fixtureApi + "/__reset");
});
test("public navigation hides private links and sign-in has a single brand without graph chrome", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.locator(".graph-orb.firm")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Toggle Sidebar", exact: true }),
  ).toBeHidden();
  await expect(page.locator(".react-flow__attribution")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Explore", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /moderator|workspace|admin/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "YT Equity", exact: true }),
  ).toHaveCount(1);
  const calls = await (
    await request.get(fixtureApi + "/__requests")
  ).json();
  expect(
    calls.some(
      (c: any) =>
        c.path.includes("/workspace/") || c.path.includes("/moderator/"),
    ),
  ).toBeFalsy();
  await page.goto("/moderator");
  await expect(page).toHaveURL(/\/moderator\/sign-in$/);
  await expect(
    page.getByRole("link", { name: "YT Equity", exact: true }),
  ).toHaveCount(1);
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Toggle Sidebar", exact: true }),
  ).toHaveCount(0);
});
test("local search and filters make no requests and preserve node positions", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.locator(".graph-orb.firm")).toHaveCount(2);
  await expect(
    page.getByRole("combobox", { name: "Record status", exact: true }),
  ).toHaveCount(0);
  const firm = page
    .locator(".react-flow__node")
    .filter({ hasText: "Test firm" });
  await firm.click();
  await expect(page.locator(".graph-orb.channel")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Close details", exact: true })
    .click();
  const before = await firm.boundingBox();
  await page
    .getByRole("combobox", { name: "Relationship type", exact: true })
    .click();
  await page.getByRole("option", { name: "Acquisition", exact: true }).click();
  await expect(page.locator(".graph-orb.firm")).toHaveCount(1);
  const after = await firm.boundingBox();
  expect(Math.abs(before!.x - after!.x)).toBeLessThan(1);
  expect(Math.abs(before!.y - after!.y)).toBeLessThan(1);
  await page
    .getByRole("searchbox", { name: "Search channels or firms" })
    .fill("UCtest");
  await page
    .getByRole("searchbox", { name: "Search channels or firms" })
    .press("Enter");
  await expect(page.locator(".graph-orb.channel")).toHaveCount(1);
  await page
    .getByRole("searchbox", { name: "Search channels or firms" })
    .fill("No matching name");
  await expect(
    page.getByRole("heading", { name: "No matching relationships" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(page.locator(".graph-orb.firm")).toHaveCount(2);
  const calls = await (
    await request.get(fixtureApi + "/__requests")
  ).json();
  expect(
    calls.filter((c: any) => c.path === "/api/v1/ownership-graph"),
  ).toHaveLength(1);
});
test("explorer navigation and browser Back restore graph filters from the URL", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("searchbox", { name: "Search channels or firms" })
    .fill("Test firm");
  await expect(page.locator(".graph-orb.firm")).toHaveCount(1);
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("searchbox", { name: "Search channels or firms" }),
  ).toHaveValue("");
  await expect(page.locator(".graph-orb.firm")).toHaveCount(2);
  await page.goBack();
  await expect(
    page.getByRole("searchbox", { name: "Search channels or firms" }),
  ).toHaveValue("Test firm");
  await expect(page.locator(".graph-orb.firm")).toHaveCount(1);
});
test("shared nodes survive collapse and the elevated drawer exposes evidence", async ({
  page,
}) => {
  await page.goto("/");
  const first = page
      .locator(".react-flow__node")
      .filter({ hasText: "Test firm" }),
    second = page
      .locator(".react-flow__node")
      .filter({ hasText: "Second firm" });
  await first.click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect(
    page
      .getByRole("complementary", { name: "Selection details" })
      .getByRole("link", { name: /Acquisition announcement/ }),
  ).toBeVisible();
  await second.click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await first.click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect(page.locator(".graph-orb.channel")).toHaveCount(1);
});
test("firm and channel dragging retain spring response and contextual reset", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?q=Shared");
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Reset view", exact: true }),
  ).toHaveCount(0);
  const firm = page
      .locator(".react-flow__node")
      .filter({ hasText: "Test firm" }),
    channel = page
      .locator(".react-flow__node")
      .filter({ hasText: "Shared channel" });
  await expect
    .poll(async () => {
      const a = await channel.boundingBox();
      await page.waitForTimeout(100);
      const b = await channel.boundingBox();
      return Math.abs(a!.x - b!.x) + Math.abs(a!.y - b!.y);
    })
    .toBeLessThan(1);
  const before = (await channel.boundingBox())!,
    f = (await firm.boundingBox())!;
  await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2);
  await page.mouse.down();
  await page.mouse.move(f.x + f.width / 2 - 120, f.y + f.height / 2 - 60, {
    steps: 20,
  });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const a = (await channel.boundingBox())!;
      return Math.hypot(a.x - before.x, a.y - before.y);
    })
    .toBeGreaterThan(5);
  const c = (await channel.boundingBox())!;
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width / 2 + 60, c.y + c.height / 2 + 60, {
    steps: 20,
  });
  await page.mouse.up();
  const after = (await channel.boundingBox())!;
  expect(Math.hypot(c.x - after.x, c.y - after.y)).toBeGreaterThan(40);
  await expect(
    page.getByRole("button", { name: "Reset view", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reset view", exact: true }),
  ).toHaveCount(0);
});
test("mobile graph and details fit both themes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator(".graph-orb.firm")).toHaveCount(2);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBeTruthy();
  await page
    .locator(".react-flow__node")
    .filter({ hasText: "Test firm" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Acquisition announcement/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "Switch to light mode", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});
test("inbox hydrates only its own data and report context, with one navigation system", async ({
  page,
  request,
}) => {
  await signIn(page);
  await page.goto("/moderator");
  await expect(
    page.getByRole("heading", { name: "Review inbox", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve report", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Directory", exact: true }),
  ).toHaveCount(0);
  const calls = await (
    await request.get(fixtureApi + "/__requests")
  ).json();
  expect(
    calls.filter((c: any) => c.path === "/api/v1/moderator/inbox"),
  ).toHaveLength(1);
  expect(calls.filter((c: any) => c.path.endsWith("/context"))).toHaveLength(1);
  expect(
    calls.some(
      (c: any) =>
        c.path.includes("/directory") ||
        c.path.includes("/audit-events") ||
        c.path.endsWith("/relationships") ||
        c.path.endsWith("/channels") ||
        c.path.endsWith("/firms"),
    ),
  ).toBeFalsy();
});
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
    await request.get(fixtureApi + "/api/v1/moderator/relationships", {
      headers: { cookie: "fixture-role=moderator" },
    })
  ).json();
  expect(records[0].sources).toHaveLength(1);
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
test("private role controls administrator navigation and invitation UI", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/admin");
  await expect(
    page.getByRole("link", { name: "Moderators", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("new@example.com");
  await page
    .getByRole("button", { name: "Send invitation", exact: true })
    .click();
  await expect(
    page.getByText("new@example.com", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Revoke access", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
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
test("system theme initializes and direct theme choices persist while Suspense streams a graph skeleton", async ({
  page,
  request,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await request.post(fixtureApi + "/__delay", { data: { ms: 1800 } });
  const navigation = page.goto("/");
  await expect(
    page.getByRole("status", { name: "Loading ownership graph", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await navigation;
  await expect(page.locator(".graph-orb.firm")).toHaveCount(2);
  await expect(page.locator("html")).toHaveClass(/dark/);
  const toggle = page.getByRole("button", { name: "Switch to light mode", exact: true });
  await toggle.hover();
  await expect(page.getByRole("tooltip", { name: "Switch to light mode", exact: true })).toBeVisible();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Switch to dark mode", exact: true })).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("button", { name: "Switch to dark mode", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("direct theme toggle follows system light until an explicit choice", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Switch to dark mode", exact: true })).toBeEnabled();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.getByRole("button", { name: "Switch to light mode", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Switch to light mode", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.locator("html")).not.toHaveAttribute("data-theme-transition");
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
test(`theme ripple grows from the toggle and ignores repeated activation at ${viewport.width}px`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await page.setViewportSize(viewport);
  await page.goto("/");
  for (const target of ["dark", "light"]) {
    const button = page.getByRole("button", { name: `Switch to ${target} mode`, exact: true });
    await expect(button).toBeEnabled();
    const rect = (await button.boundingBox())!;
    await button.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    const revealHandle = await page.waitForFunction(() => {
      const animation = document.getAnimations().find(animation =>
        animation.effect instanceof KeyframeEffect && animation.effect.pseudoElement === "::view-transition-new(root)");
      if (!animation) return false;
      const effect = animation.effect as KeyframeEffect;
      return {
        frames: effect.getKeyframes(),
        timing: effect.getTiming(),
        iconAnimations: document.getAnimations()
          .filter(animation => animation.effect instanceof KeyframeEffect &&
            animation.effect.pseudoElement?.includes("theme-toggle-icon"))
          .map(animation => ({
            name: (animation as CSSAnimation).animationName,
            duration: animation.effect!.getTiming().duration,
          })),
      };
    });
    const reveal = await revealHandle.jsonValue();
    if (!reveal) throw new Error("Theme reveal did not start");
    expect(reveal.timing.duration).toBe(800);
    expect(reveal.iconAnimations).toEqual(expect.arrayContaining([
      { name: "theme-icon-in", duration: 450 },
      { name: "theme-icon-out", duration: 450 },
    ]));
    expect(reveal.timing.easing).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
    const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    const feather = Math.min(56, Math.max(24, Math.min(viewport.width, viewport.height) * 0.06));
    expect(reveal.frames[0]["--theme-reveal-radius"]).toBe("0px");
    expect(reveal.frames[0]["--theme-reveal-x"]).toBe(`${x}px`);
    expect(reveal.frames[0]["--theme-reveal-y"]).toBe(`${y}px`);
    expect(reveal.frames[0]["--theme-reveal-feather"]).toBe(`${feather}px`);
    expect(parseFloat(String(reveal.frames[1]["--theme-reveal-radius"])) - feather)
      .toBeCloseTo(Math.hypot(Math.max(x, viewport.width - x), Math.max(y, viewport.height - y)));
    await expect(page.locator("html")).not.toHaveAttribute("data-theme-transition");
    await expect(page.getByRole("button", { name: `Switch to ${target === "dark" ? "light" : "dark"} mode`, exact: true })).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe(target);
  }
});
}

for (const failure of ["unsupported", "property", "mask", "throws", "skipped"] as const) {
  test(`theme toggle remains usable when view transitions are ${failure}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
    await page.addInitScript((failure) => {
      if (failure === "property") {
        Object.defineProperty(CSS, "registerProperty", { value: undefined });
        return;
      }
      if (failure === "mask") {
        const supports = CSS.supports.bind(CSS);
        CSS.supports = ((...args: string[]) => args[0] === "mask-image" ? false : supports(args[0], args[1])) as typeof CSS.supports;
        return;
      }
      Object.defineProperty(document, "startViewTransition", {
        configurable: true,
        value: failure === "unsupported" ? undefined : () => {
          if (failure === "throws") throw new Error("Transition unavailable");
          return { ready: Promise.reject(new Error("Transition skipped")), finished: Promise.resolve(), skipTransition() {} };
        },
      });
    }, failure);
    await page.goto("/");
    for (const target of ["dark", "light"]) {
      await page.getByRole("button", { name: `Switch to ${target} mode`, exact: true }).click();
      await expect(page.getByRole("button", { name: `Switch to ${target === "dark" ? "light" : "dark"} mode`, exact: true })).toHaveAttribute("aria-busy", "false");
      await expect(page.locator("html")).not.toHaveAttribute("data-theme-transition");
      expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe(target);
    }
  });
}
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

test("graph reads use anonymous canonical snapshots while profile caches expire after directory edits", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.PLAYWRIGHT_PRODUCTION !== "1",
    "Server-rendered snapshot reads are verified against the production server.",
  );
  const calls = async () =>
    (await request.get(fixtureApi + "/__requests")).json();
  expect((await request.get(base + "/")).ok()).toBeTruthy();
  expect(
    (
      await request.get(base + "/", {
        headers: { cookie: "fixture-role=moderator" },
      })
    ).ok(),
  ).toBeTruthy();
  let graphReads = (await calls()).filter(
    (c: any) => c.path === "/api/v1/ownership-graph",
  );
  expect(graphReads).toHaveLength(2);
  expect(graphReads.every((c: any) => !c.hasCookie && c.search === "")).toBe(true);
  await page.goto("/channels/UCtest");
  await expect(
    page.getByRole("heading", { name: "Acquired by Test firm" }),
  ).toBeVisible();
  await page.goto("/firms/00000000-0000-4000-8000-000000000002");
  await expect(
    page.getByRole("link", { name: "Shared channel", exact: true }),
  ).toBeVisible();
  await signIn(page);
  await page.goto("/moderator");
  await page
    .getByRole("button", { name: "Approve report", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Edit relationship", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await request.get(base + "/");
  expect(
    (await calls()).filter((c: any) => c.path === "/api/v1/ownership-graph"),
  ).toHaveLength(3);
  await signIn(page);
  await page.goto(
    "/moderator?panel=directory&edit=00000000-0000-4000-8000-000000000004",
  );
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Archive relationship", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/");
  await expect(page.locator(".graph-orb.firm")).toHaveCount(1);
  await page.goto("/channels/UCtest");
  await expect(
    page.getByRole("heading", { name: "Acquired by Test firm" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Funded by Second firm" }),
  ).toBeVisible();
  await page.goto("/firms/00000000-0000-4000-8000-000000000002");
  await expect(page.getByText("No published channel records.")).toBeVisible();
  graphReads = (await calls()).filter(
    (c: any) => c.path === "/api/v1/ownership-graph",
  );
  expect(graphReads.length).toBeGreaterThanOrEqual(4);
});

test("graph refreshes on return without polling or resetting its state", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".graph-orb.firm")).toHaveCount(2);
  await page
    .locator(".react-flow__node")
    .filter({ hasText: "Test firm" })
    .click();
  await expect(
    page.getByRole("button", { name: "Close details", exact: true }),
  ).toBeVisible();
  const node = page
    .locator(".react-flow__node")
    .filter({ hasText: "Test firm" });
  const position = await node.getAttribute("style");
  const refreshes: string[] = [];
  page.on("request", (request) => {
    // Partial prefetching may resume a shell request when the tab becomes
    // visible; count the actual refresh separately from those prefetches.
    if (
      request.headers().rsc === "1" &&
      !request.headers()["next-router-prefetch"] &&
      new URL(request.url()).pathname === "/"
    )
      refreshes.push(request.url());
  });
  await page.clock.install();
  await page.clock.fastForward(120_000);
  expect(refreshes).toHaveLength(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(120_000);
  expect(refreshes).toHaveLength(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => refreshes.length).toBe(1);
  await expect(node).toHaveAttribute("style", position!);
  await expect(
    page.getByRole("button", { name: "Close details", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
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

async function worldPosition(node: import("@playwright/test").Locator) {
  return node.evaluate((el) => {
    const m = new DOMMatrixReadOnly((el as HTMLElement).style.transform);
    return { x: m.m41, y: m.m42 };
  });
}
async function dragBy(
  page: Page,
  node: import("@playwright/test").Locator,
  dx: number,
  dy: number,
) {
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + dx,
    box.y + box.height / 2 + dy,
    { steps: 20 },
  );
  await page.mouse.up();
}
async function settle(page: Page, node: import("@playwright/test").Locator) {
  await expect
    .poll(
      async () => {
        const a = await worldPosition(node);
        await page.waitForTimeout(120);
        const b = await worldPosition(node);
        return Math.hypot(a.x - b.x, a.y - b.y);
      },
      { timeout: 10000 },
    )
    .toBeLessThan(0.3);
}

test("full-width header stays aligned above compact navigation in both themes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".graph-orb.firm")).toHaveCount(2);
  const header = page.locator(".app-header"),
    brand = page.getByRole("link", { name: "YT Equity", exact: true });
  const first = (await header.boundingBox())!,
    brandBefore = (await brand.boundingBox())!;
  expect(first.x).toBe(0);
  expect(first.width).toBe(1440);
  expect(first.height).toBe(64);
  const rail = page.locator('[data-slot="sidebar-container"]');
  const sidebar = page.locator('[data-slot="sidebar"][data-state]');
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await expect(
    page.getByRole("button", { name: "Toggle Sidebar", exact: true }),
  ).toBeHidden();
  const explore = page.getByRole("link", { name: "Explore", exact: true });
  const report = page.getByRole("link", { name: "Report an issue", exact: true });
  await expect(explore).toHaveAttribute("data-active", "true");
  await explore.hover();
  await expect(page.getByRole("tooltip", { name: "Explore", exact: true })).toBeVisible();
  await report.focus();
  await expect(page.getByRole("tooltip", { name: "Report an issue", exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/report$/);
  await expect(report).toHaveAttribute("data-active", "true");
  await explore.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(base + "/");
  await expect(page.locator(".graph-orb.firm")).toHaveCount(2);
  const railBefore = (await rail.boundingBox())!;
  expect(railBefore.y).toBe(first.y + first.height + 12);
  expect(railBefore.height).toBeLessThan(180);
  const railSurface = (await rail.locator('[data-slot="sidebar-inner"]').boundingBox())!;
  const firstItem = (await explore.boundingBox())!;
  const lastItem = (await report.boundingBox())!;
  const leftInset = firstItem.x - railSurface.x;
  expect(firstItem.y - railSurface.y).toBe(leftInset);
  expect(railSurface.x + railSurface.width - firstItem.x - firstItem.width).toBe(leftInset);
  expect(railSurface.y + railSurface.height - lastItem.y - lastItem.height).toBe(leftInset);
  const canvas = (await page.locator(".graph-canvas").boundingBox())!;
  const controls = (await page.locator(".react-flow__controls").boundingBox())!;
  expect(canvas.x).toBe(0);
  expect(canvas.width).toBe(1440);
  expect(controls.x).toBeLessThan(24);
  const filter = (await page
    .getByRole("combobox", { name: "Relationship type", exact: true })
    .boundingBox())!;
  expect(filter.x).toBeGreaterThan(railBefore.x + railBefore.width);
  const firm = page
    .locator(".react-flow__node")
    .filter({ hasText: "Test firm" });
  // Fit explicitly and wait for its camera update before measuring stability.
  await page.getByRole("button", { name: "Fit View", exact: true }).click();
  await expect.poll(() => page.locator(".react-flow__viewport").getAttribute("style"))
    .not.toBe("transform: translate(0px, 0px) scale(1);");
  const point = await worldPosition(firm);
  const viewport = await page
    .locator(".react-flow__viewport")
    .getAttribute("style");
  for (const theme of ["Dark", "Light"]) {
    await page.getByRole("button", { name: `Switch to ${theme.toLowerCase()} mode`, exact: true }).click();
    await page.keyboard.press("Control+b");
    await page.keyboard.press("Meta+b");
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
    expect((await rail.boundingBox())!.width).toBe(railBefore.width);
    const current = (await brand.boundingBox())!;
    expect(current.x).toBe(brandBefore.x);
    expect((await header.boundingBox())!.width).toBe(1440);
    expect(await worldPosition(firm)).toEqual(point);
    expect(
      await page.locator(".react-flow__viewport").getAttribute("style"),
    ).toBe(viewport);
    expect((await rail.boundingBox())!.height).toBeLessThan(180);
    expect((await page.locator(".graph-canvas").boundingBox())!.x).toBe(0);
    expect(
      (await page.locator(".react-flow__controls").boundingBox())!.x,
    ).toBeLessThan(24);
    const railBox = (await rail.boundingBox())!,
      filterBox = (await page
        .getByRole("combobox", { name: "Relationship type", exact: true })
        .boundingBox())!;
    expect(filterBox.x).toBeGreaterThan(railBox.x + railBox.width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await header.boundingBox())!.width).toBe(390);
  await page
    .getByRole("button", { name: "Toggle Sidebar", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Sidebar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Explore", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Toggle Sidebar", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
  await page.getByRole("link", { name: "Report an issue", exact: true }).click();
  await expect(page).toHaveURL(/\/report$/);
  await expect(page.getByRole("dialog", { name: "Sidebar", exact: true })).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await expect(page.getByRole("button", { name: "Toggle Sidebar", exact: true })).toBeHidden();
});

test("workspace navigation stays open with aligned content for moderators and admins", async ({ page }) => {
  for (const role of ["moderator", "admin"] as const) {
    await signIn(page, role);
    await page.goto("/moderator");
    const sidebar = page.locator('[data-slot="sidebar"][data-state]');
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
    await expect(page.getByRole("button", { name: "Toggle Sidebar", exact: true })).toBeHidden();
    await page.keyboard.press("Control+b");
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
    await expect(page.locator(".moderator-page:visible")).toHaveCSS("padding-left", "24px");
    await expect(page.locator(".moderator-page:visible")).toHaveCSS("max-width", "1280px");
  }
});

for (const motion of ["no-preference", "reduce"] as const) {
  test(`a released shared channel keeps reacting to subsequent firm drags (${motion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: motion });
    await page.goto("/?q=Shared");
    await expect(page.locator(".react-flow__edge")).toHaveCount(2);
    const firm = page
      .locator(".react-flow__node")
      .filter({ hasText: "Test firm" });
    const channel = page
      .locator(".react-flow__node")
      .filter({ hasText: "Shared channel" });
    await settle(page, channel);
    const first = await worldPosition(channel);
    await dragBy(page, firm, 90, 45);
    await expect
      .poll(async () => {
        const p = await worldPosition(channel);
        return Math.hypot(p.x - first.x, p.y - first.y);
      })
      .toBeGreaterThan(5);
    await settle(page, channel);
    await dragBy(page, channel, 55, 45);
    await settle(page, channel);
    const dropped = await worldPosition(channel),
      anchor = await worldPosition(firm);
    await page.waitForTimeout(150);
    const resting = await worldPosition(firm);
    expect(Math.hypot(resting.x - anchor.x, resting.y - anchor.y)).toBeLessThan(1);
    await dragBy(page, firm, 90, -40);
    await expect
      .poll(async () => {
        const p = await worldPosition(channel);
        return Math.hypot(p.x - dropped.x, p.y - dropped.y);
      })
      .toBeGreaterThan(5);
    await expect(page.locator(".graph-orb.channel")).toHaveCount(1);
    await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  });
}

test("re-expanding remembered channels reheats springs around the moved firm", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const firm = page
    .locator(".react-flow__node")
    .filter({ hasText: "Test firm" });
  const channel = page
    .locator(".react-flow__node")
    .filter({ hasText: "Shared channel" });
  await firm.click();
  await expect(channel).toBeVisible();
  await settle(page, channel);
  await firm.click();
  await expect(channel).toHaveCount(0);
  await dragBy(page, firm, 110, 70);
  await firm.click();
  await expect(channel).toBeVisible();
  const first = await worldPosition(channel);
  await expect
    .poll(async () => {
      const p = await worldPosition(channel);
      return Math.hypot(p.x - first.x, p.y - first.y);
    })
    .toBeGreaterThan(2);
});

test("canvas controls support zoom, fit, locking, and layout reset without enabling connections", async ({
  page,
}) => {
  await page.goto("/");
  const firm = page
    .locator(".react-flow__node")
    .filter({ hasText: "Test firm" });
  await expect(firm).toBeVisible();
  const initial = await worldPosition(firm);
  const view = page.locator(".react-flow__viewport");
  const scale = () =>
    view.evaluate(
      (el) => new DOMMatrixReadOnly((el as HTMLElement).style.transform).a,
    );
  const before = await scale();
  await page.getByRole("button", { name: "Zoom In", exact: true }).click();
  await expect.poll(scale).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Zoom Out", exact: true }).click();
  await page.getByRole("button", { name: "Fit View", exact: true }).click();
  await page
    .getByRole("button", { name: "Toggle Interactivity", exact: true })
    .click();
  const locked = await worldPosition(firm);
  await dragBy(page, firm, 55, 30);
  expect(await worldPosition(firm)).toEqual(locked);
  await expect(page.locator(".react-flow__node.draggable")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Toggle Interactivity", exact: true })
    .click();
  await expect(page.locator(".react-flow__handle.connectable")).toHaveCount(0);
  await dragBy(page, firm, 80, 35);
  const placed = await worldPosition(firm);
  expect(
    Math.hypot(placed.x - initial.x, placed.y - initial.y),
  ).toBeGreaterThan(20);
  await page.getByRole("button", { name: "Fit View", exact: true }).click();
  expect(await worldPosition(firm)).toEqual(placed);
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await expect
    .poll(async () => {
      const p = await worldPosition(firm);
      return Math.hypot(p.x - initial.x, p.y - initial.y);
    })
    .toBeLessThan(3);
  await expect(
    page.getByRole("button", { name: "Reset view", exact: true }),
  ).toHaveCount(0);
});


// Timed steps model a real pointer velocity; Playwright's untimed steps can all
// arrive in one frame and do not reliably describe a throw.
async function throwNode(
  page: Page,
  node: import("@playwright/test").Locator,
  dx: number,
  dy: number,
  pause = 0,
) {
  const box = (await node.boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(x + (dx * i) / 6, y + (dy * i) / 6);
    await page.waitForTimeout(16);
  }
  if (pause) await page.waitForTimeout(pause);
  const released = await worldPosition(node);
  await page.mouse.up();
  return released;
}

for (const kind of ["firm", "channel"] as const) {
  test(`${kind} throws glide, slow down, and settle near their landing position`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(kind === "channel" ? "/?q=Shared" : "/");
    const node = page
      .locator(".react-flow__node")
      .filter({ hasText: kind === "firm" ? "Test firm" : "Shared channel" });
    await settle(page, node);
    // Throw away from the layout so springs cannot masquerade as momentum.
    const release = await throwNode(page, node, -100, -70);
    await page.waitForTimeout(80);
    const gliding = await worldPosition(node);
    expect(
      (gliding.x - release.x) * -100 + (gliding.y - release.y) * -70,
    ).toBeGreaterThan(200);
    expect(
      Math.hypot(gliding.x - release.x, gliding.y - release.y),
    ).toBeLessThan(130);
    await settle(page, node);
    const landed = await worldPosition(node);
    await page.waitForTimeout(200);
    const resting = await worldPosition(node);
    expect(Math.hypot(resting.x - landed.x, resting.y - landed.y)).toBeLessThan(
      1,
    );
    expect(Math.hypot(landed.x - release.x, landed.y - release.y)).toBeLessThan(
      160,
    );
    await page.getByRole("button", { name: "Reset view", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Reset view", exact: true }),
    ).toHaveCount(0);
  });
}

test("pausing a firm before release suppresses the throw and re-grabbing stops its glide", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const firm = page
    .locator(".react-flow__node")
    .filter({ hasText: "Test firm" });
  await settle(page, firm);
  const release = await throwNode(page, firm, -80, -30, 160);
  await page.waitForTimeout(150);
  const rested = await worldPosition(firm);
  expect(Math.hypot(rested.x - release.x, rested.y - release.y)).toBeLessThan(
    12,
  );
  await throwNode(page, firm, 80, 30);
  const box = (await firm.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2, {
    steps: 2,
  });
  const grabbed = await worldPosition(firm);
  await page.waitForTimeout(150);
  const held = await worldPosition(firm);
  expect(Math.hypot(held.x - grabbed.x, held.y - grabbed.y)).toBeLessThan(1);
  await page.mouse.up();
});

for (const target of ["firm", "channel"] as const) {
  test(`a collision nudges a previously released ${target} without leaving an overlap`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const firm = page
      .locator(".react-flow__node")
      .filter({ hasText: "Test firm" });
    const other = page
      .locator(".react-flow__node")
      .filter({
        hasText: target === "firm" ? "Second firm" : "Shared channel",
      });
    if (target === "channel") {
      await firm.click();
      await expect(other).toBeVisible();
      await page
        .getByRole("button", { name: "Close details", exact: true })
        .click();
    }
    await settle(page, firm);
    await throwNode(page, other, 0, 15, 160);
    await settle(page, other);
    const before = await worldPosition(other);
    const a = (await firm.boundingBox())!,
      b = (await other.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 - 30, b.y + b.height / 2, {
      steps: 20,
    });
    await expect
      .poll(async () => {
        const p = await worldPosition(other);
        return Math.hypot(p.x - before.x, p.y - before.y);
      })
      .toBeGreaterThan(5);
    await page.mouse.up();
    await settle(page, other);
    await settle(page, firm);
    const first = await worldPosition(firm),
      second = await worldPosition(other);
    expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThan(
      target === "firm" ? 90 : 75,
    );
  });
}
