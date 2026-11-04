import { test, expect, chromium, type Page } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";


async function storeScreenshot(page: Page, filename: string, heading: string, description: string) {
  if (process.env.CAPTURE_EXTENSION_STORE_ASSETS !== "1") return;
  const directory = resolve("../extension/store-assets");
  await mkdir(directory, { recursive: true });
  const style = await page.addStyleTag({ content: `
    body { width:1280px; height:800px; overflow:hidden; background:linear-gradient(140deg,#fff 0%,#f6f6f8 65%,#fff2f2 100%); color:#171717; }
    .popup-container { position:absolute; right:96px; top:32px; width:330px; max-height:736px; overflow:auto; background:white; border:1px solid #e5e5e5; border-radius:16px; box-shadow:0 24px 80px #17171718; }
    #store-presentation { position:absolute; left:96px; top:168px; width:590px; font-family:Arial,sans-serif; }
    #store-presentation .eyebrow { display:inline-block; font-size:13px; font-weight:700; letter-spacing:2px; color:#b40009; margin:0 0 26px; }
    #store-presentation h2 { margin:0 0 28px; font-size:62px; line-height:1.06; letter-spacing:-2.5px; font-weight:700; }
    #store-presentation p { max-width:490px; font-size:20px; line-height:1.55; color:#606060; }
    #store-presentation .domain { margin-top:44px; font-size:16px; color:#171717; }
  ` });
  await page.evaluate(({ heading, description }) => {
    const aside = document.createElement("aside");
    aside.id = "store-presentation";
    const eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "YT EQUITY · BROWSER EXTENSION";
    const title = document.createElement("h2");
    title.textContent = heading;
    const copy = document.createElement("p");
    copy.textContent = description;
    const domain = document.createElement("p");
    domain.className = "domain";
    domain.textContent = "ytequity.com";
    aside.append(eyebrow, title, copy, domain);
    document.body.append(aside);
  }, { heading, description });
  await page.screenshot({ path: join(directory, filename) });
  await page.locator("#store-presentation").evaluate(node => node.remove());
  await style.evaluate(node => node.parentNode?.removeChild(node));
}

// Exercises the actual packaged content script -> Chrome worker -> HTTP API boundary.
// YouTube markup and channel results are fixtures; this does not certify live YouTube selectors.
test("packaged extension requires consent, annotates and filters, then stops when paused", async ({}, testInfo) => {
  const temp = await mkdtemp(join(tmpdir(), "yt-equity-browser-"));
  const requests: { identifiers: string[] }[] = [];
  const api = createServer((request, response) => {
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      const payload = JSON.parse(body);
      requests.push(payload);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ results: payload.identifiers.map((identifier: string) => ({
        identifier,
        channel: { channelId: "UCalpha", name: "Alpha", claims: [{ type: "acquisition", status: "confirmed", firm: { name: "Example Firm" } }] }
      })) }));
    });
  });
  await new Promise<void>(resolve => api.listen(0, "127.0.0.1", resolve));
  let context;
  try {
    const address = api.address();
    if (!address || typeof address === "string") throw Error("API fixture failed to bind");
    const buildModule = resolve("../extension/scripts/build.mjs");
    const { buildExtension } = await import(buildModule);
    const { target } = await buildExtension({ browser: "chrome", apiUrl: `http://127.0.0.1:${address.port}`, webUrl: "http://127.0.0.1:3100", outDir: join(temp, "extension") });
    context = await chromium.launchPersistentContext(join(temp, "profile"), {
      channel: "chromium", headless: true, viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${target}`, `--load-extension=${target}`]
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const id = new URL(worker.url()).host;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    const enable = popup.getByRole("button", { name: "Enable ownership lookups", exact: true });
    await expect(enable).toBeEnabled();
    const youtube = await context.newPage();
    await context.route("https://www.youtube.com/**", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><body><ytd-rich-item-renderer><div><a href="/watch?v=one">Video</a><div id="channel-name"><a href="/@alpha">Alpha</a></div><div id="metadata-line"></div></div></ytd-rich-item-renderer></body></html>` }));
    await youtube.goto("https://www.youtube.com/");
    await youtube.waitForTimeout(300);
    expect(requests).toHaveLength(0);
    await popup.screenshot({ path: testInfo.outputPath("consent-before.png") });
    await storeScreenshot(popup, "ownership-lookups.png", "See the ownership behind the channel.", "Public ownership and funding records, right on YouTube. You choose when to enable lookups.");
    await enable.click();
    await expect(youtube.locator(".pe-ownership-badge")).toContainText("Acquired by Example Firm");
    expect(requests[0]).toEqual({ identifiers: ["@alpha"] });
    await popup.getByRole("switch", { name: "Acquired channels", exact: true }).check();
    await expect(youtube.locator(".pe-card-filtered")).toHaveCount(1);
    await storeScreenshot(popup, "feed-filters.png", "Choose what appears in your feed.", "Hide channels with confirmed acquisitions or funding. Choose where filters apply and reveal any hidden video.");
    await youtube.getByRole("button", { name: "Reveal video from Alpha" }).click();
    await expect(youtube.locator(".pe-card-filtered")).toHaveCount(0);
    await popup.getByRole("button", { name: "Pause ownership lookups", exact: true }).click();
    await expect(youtube.locator(".pe-ownership-badge")).toHaveCount(0);
    const count = requests.length;
    await youtube.evaluate(() => {
      document.querySelector("a[href='/@alpha']")!.setAttribute("href", "/@beta");
      window.dispatchEvent(new Event("yt-navigate-finish"));
    });
    await youtube.waitForTimeout(300);
    expect(requests).toHaveLength(count);
    await popup.screenshot({ path: testInfo.outputPath("consent-paused.png") });
  } finally {
    await context?.close();
    await new Promise<void>(resolve => api.close(() => resolve()));
    await rm(temp, { recursive: true, force: true });
  }
});

test("privacy policy is public and linked in the website navigation", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Extension privacy policy", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What the extension sends" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Service processing and retention" })).toBeVisible();
  await expect(page.getByRole("link", { name: "YT Equity contact form" })).toHaveAttribute("href", "/report");
  await expect(page.getByRole("link", { name: "Extension privacy", exact: true })).toHaveAttribute("href", "/privacy");
});
