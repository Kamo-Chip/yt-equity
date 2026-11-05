import { test, expect, chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

// Exercises the actual packaged content script -> Chrome worker -> HTTP API boundary.
// YouTube markup and channel results are fixtures; this does not certify live YouTube selectors.
test("packaged extension defaults on, annotates and filters, and honors a saved pause", async ({}, testInfo) => {
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
    const webUrl = String(testInfo.project.use.baseURL);
    const { target } = await buildExtension({ browser: "chrome", apiUrl: `http://127.0.0.1:${address.port}`, webUrl, outDir: join(temp, "extension") });
    context = await chromium.launchPersistentContext(join(temp, "profile"), {
      channel: "chromium", headless: true, viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${target}`, `--load-extension=${target}`]
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const id = new URL(worker.url()).host;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(popup.getByRole("switch", { name: "Acquired channels", exact: true })).toBeEnabled();
    await expect(popup.getByRole("button", { name: "Enable ownership lookups", exact: true })).toHaveCount(0);
    // Fresh profiles look up automatically; the popup does not write a new
    // preference or reopen the removed setup flow.
    expect(await worker.evaluate(() => (globalThis as any).chrome.storage.local.get("ownershipLookupsEnabled"))).toEqual({});
    const youtube = await context.newPage();
    await context.route("https://www.youtube.com/**", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><body><ytd-rich-item-renderer><div><a href="/watch?v=one">Video</a><div id="channel-name"><a href="/@alpha">Alpha</a></div><div id="metadata-line"></div></div></ytd-rich-item-renderer></body></html>` }));
    await youtube.goto("https://www.youtube.com/");
    await expect(youtube.locator(".pe-ownership-label")).toHaveText("Acquired");
    await expect(youtube.locator(".pe-ownership-badge")).toBeVisible();
    await expect(youtube.locator(".pe-ownership-badge"))
      .toHaveAttribute("aria-label", /^View acquisition details/);
    expect(requests[0]).toEqual({ identifiers: ["@alpha"] });
    await popup.getByRole("switch", { name: "Acquired channels", exact: true }).check();
    await expect(youtube.locator(".pe-card-filtered")).toHaveCount(1);
    await youtube.getByRole("button", { name: "Reveal video from Alpha" }).click();
    await expect(youtube.locator(".pe-card-filtered")).toHaveCount(0);
    // Honor preferences saved by earlier versions even though the current
    // popup no longer has a pause/setup button.
    await worker.evaluate(() => (globalThis as any).chrome.storage.local.set({ ownershipLookupsEnabled: false }));
    await expect(youtube.locator(".pe-ownership-badge")).toHaveCount(0);
    const count = requests.length;
    await youtube.evaluate(() => {
      document.querySelector("a[href='/@alpha']")!.setAttribute("href", "/@beta");
      window.dispatchEvent(new Event("yt-navigate-finish"));
    });
    await youtube.waitForTimeout(300);
    expect(requests).toHaveLength(count);
    await youtube.reload();
    await youtube.waitForTimeout(300);
    await expect(youtube.locator(".pe-ownership-badge")).toHaveCount(0);
    expect(requests).toHaveLength(count);
    await worker.evaluate(() => (globalThis as any).chrome.storage.local.set({ ownershipLookupsEnabled: true }));
    await expect(youtube.locator(".pe-ownership-label")).toHaveText("Acquired");
    await expect(youtube.locator(".pe-card-filtered")).toHaveCount(1);
    expect(requests.length).toBeGreaterThan(count);
    // Modern recommendations expose the canonical channel only in a MAIN-world
    // rendering signal. Exercise the packaged bridge across the world boundary.
    await context.unroute("https://www.youtube.com/**");
    await context.route("https://www.youtube.com/**", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><body><div id="related"><yt-lockup-view-model><a href="/watch?v=video123">Video</a><div class="ytLockupMetadataViewModelMetadata">Alpha</div></yt-lockup-view-model></div><script>document.querySelector('yt-lockup-view-model').rawProps={data:()=>({contentId:'video123',contentType:'LOCKUP_CONTENT_TYPE_VIDEO',metadata:{lockupMetadataViewModel:{image:{decoratedAvatarViewModel:{rendererContext:{commandContext:{onTap:{innertubeCommand:{browseEndpoint:{browseId:'UCHnyfMqiRRG1u-2MsSQLbXA'}}}}}}}}}})};</script></body></html>` }));
    await youtube.goto("https://www.youtube.com/watch?v=modern123");
    await expect(youtube.locator("[data-pe-channel-context]")).toHaveCount(1);
    await expect(youtube.locator(".pe-ownership-label")).toHaveText("Acquired");
    await expect(youtube.locator(".pe-card-filtered")).toHaveCount(1);
    expect(requests.some(request => request.identifiers.includes("UCHnyfMqiRRG1u-2MsSQLbXA"))).toBe(true);
    await youtube.evaluate(() => document.documentElement.setAttribute("dark", ""));

  } finally {
    await context?.close();
    await new Promise<void>(resolve => api.close(() => resolve()));
    await rm(temp, { recursive: true, force: true });
  }
});
