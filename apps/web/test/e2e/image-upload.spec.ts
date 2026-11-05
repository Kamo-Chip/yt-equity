import { test, expect } from "@playwright/test";
import { signIn, resetFixture, fixtureApi } from "../helpers/app";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
test.beforeEach(async ({ page, request }) => {
  await resetFixture(request);
  await signIn(page);
  await page.route("https://media.example/**", route => route.fulfill({ contentType: "image/png", body: png }));
});
for (const [kind, title, name] of [["channels", "channel", "Shared channel"], ["firms", "firm", "Test firm"]]) {
  test(`${title} editor uploads, previews and saves without pasting a URL`, async ({ page, request }) => {
    await page.goto(`/moderator?panel=directory&resource=${kind}`);
    await page.getByRole("row").filter({ hasText: name }).getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: `Edit ${title}`, exact: true });
    await expect(dialog.getByRole("button", { name: "Upload image", exact: true })).toBeVisible();
    await dialog.getByLabel(`Choose ${title} image`).setInputFiles({ name: "image.png", mimeType: "image/png", buffer: png });
    await expect(dialog.getByLabel("Profile image URL (optional)")).toHaveValue(`https://media.example/uploads/${kind}/test.webp`);
    await expect(dialog.getByRole("img", { name: `${title === "channel" ? "Channel" : "Firm"} image preview` })).toBeVisible();
    await dialog.getByRole("button", { name: `Save ${title}`, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const records = await (await request.get(`${fixtureApi}/api/v1/moderator/directory?resource=${kind}`, { headers: { cookie: "fixture-role=moderator" } })).json();
    expect(records.items.find((r: { name: string }) => r.name === name).profilePictureUrl).toContain(`/uploads/${kind}/`);
  });
}
test("new channel and firm images persist when creating a relationship", async ({ page, request }) => {
  await page.goto("/moderator?panel=directory&edit=new");
  await page.getByLabel("YouTube channel ID or handle", { exact: true }).fill("UCabcdefghijklmno1234567");
  await page.getByLabel("Channel name", { exact: true }).fill("Uploaded channel");
  await page.getByLabel("Choose channel image").setInputFiles({ name: "channel.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("img", { name: "Channel image preview" })).toBeVisible();
  await page.getByRole("combobox", { name: "Firm", exact: true }).click();
  await page.getByRole("option", { name: "＋ Create a firm" }).click();
  await page.getByLabel("Firm name", { exact: true }).fill("Uploaded firm");
  await page.getByLabel("Choose firm image").setInputFiles({ name: "firm.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("img", { name: "Firm image preview" })).toBeVisible();
  await page.getByLabel("Source URL", { exact: true }).fill("https://example.com/evidence");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Create relationship", exact: true })).toHaveCount(0);
  const headers = { cookie: "fixture-role=moderator" };
  for (const kind of ["channels", "firms"]) {
    const records = await (await request.get(`${fixtureApi}/api/v1/moderator/directory?resource=${kind}`, { headers })).json();
    expect(records.items.find((r: { name: string }) => r.name.startsWith("Uploaded ")).profilePictureUrl).toContain(`/uploads/${kind}/`);
  }
});
test("invalid files leave the editor usable and uploaded edits can be discarded", async ({ page }) => {
  await page.goto("/moderator?panel=directory&resource=firms&entity=firms&entityId=new");
  await page.getByLabel("Choose firm image").setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("bad") });
  await expect(page.getByRole("alert")).toContainText("Choose a JPG, PNG or WebP image");
  await page.getByLabel("Choose firm image").setInputFiles({ name: "good.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("img", { name: "Firm image preview" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Discard unsaved changes?");
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
