import { resetFixture, activeGraph } from "../helpers/app";
import { test, expect } from "@playwright/test";
const fixtureApi = `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT ?? 4101}`;

test(`visible channels show connections to collapsed firms`, async ({ page, request }) => {
  await resetFixture(request);
  await request.post(fixtureApi + "/__many", { data: { firms: 1, otherChannels: 1 } });
  await page.goto("/");
  const firm = activeGraph(page).locator(".react-flow__node").filter({ hasText: "Test firm" });
  const second = activeGraph(page).locator(".react-flow__node").filter({ hasText: "Second firm" });
  const shared = activeGraph(page).locator(".react-flow__node").filter({ hasText: "Shared channel" });
  const edges = activeGraph(page).locator(".react-flow__edge-path");
  await expect(shared).toHaveCount(0);
  await firm.click();
  await expect(shared).toHaveCount(1);
  await expect(edges).toHaveCount(3);
  await expect(second).toHaveAttribute("aria-label", /collapsed/);
  await expect(activeGraph(page).locator(".react-flow__node").filter({ hasText: "Other channel" })).toHaveCount(0);
  await page.getByRole("button", { name: "Close details", exact: true }).click();
  await shared.click();
  await expect(page.getByText("Acquisition announcement", { exact: true })).toHaveCount(3);
  await page.getByRole("button", { name: "Close details", exact: true }).click();
  // Each edge selects its own relationship and its evidence.
  for (let i = 0; i < 3; i++) {
    await activeGraph(page).locator(".react-flow__edge").nth(i).dispatchEvent("click");
    await expect(page.getByText("Acquisition announcement", { exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: "Close details", exact: true }).click();
  }
  await page.getByRole("button", { name: "Fit View", exact: true }).click();
  await expect(second).toBeInViewport({ ratio: 0.9 });
  await firm.click();
  await expect(shared).toHaveCount(0);
  await expect(edges).toHaveCount(0);
  await page.getByRole("button", { name: "Close details", exact: true }).click();
  await page.goto("/?q=Test%20firm");
  await expect(shared).toHaveCount(1);
  await expect(edges).toHaveCount(3);
  await expect(second).toHaveAttribute("aria-label", /collapsed/);
  await page.goto("/?q=Shared&type=funding");
  await expect(shared).toHaveCount(1);
  await expect(edges).toHaveCount(1);
  await page.goto("/");
  await expect(shared).toHaveCount(0);
  await expect(edges).toHaveCount(0);
  await resetFixture(request);
});
