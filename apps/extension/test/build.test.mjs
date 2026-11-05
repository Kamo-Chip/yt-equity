import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildExtension, configuredOrigin } from "../scripts/build.mjs";
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

for (const value of [undefined, "", "not a URL", "http://ytequity.com", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://api.local", "https://api.example", "https://u:p@api.ytequity.com", "https://api.ytequity.com/path", "https://api.ytequity.com?token=x", "https://api.ytequity.com#fragment"]) {
  test(`release rejects unsafe or missing origin: ${value}`, () => {
    assert.throws(() => configuredOrigin(value, "API_PUBLIC_URL", true));
  });
}
for (const browser of ["chrome", "firefox"]) {
  test(`${browser} release packages only the configured HTTPS origin and runtime files`, async () => {
    const outDir = await mkdtemp(join(tmpdir(), "yt-equity-build-"));
    try {
      const build = await buildExtension({ browser, release: true, apiUrl: "https://api.ytequity.com/", webUrl: "https://ytequity.com/", outDir });
      const manifest = JSON.parse(await readFile(join(outDir, "manifest.json"), "utf8"));
      assert.equal(build.version, version);
      assert.equal(manifest.version, version);
      assert.deepEqual(manifest.host_permissions, ["https://api.ytequity.com/*"]);
      assert.equal(manifest.homepage_url, "https://ytequity.com/");
      const config = await readFile(join(outDir, "config.js"), "utf8");
      const popup = await readFile(join(outDir, "popup.html"), "utf8");
      assert.doesNotMatch(config + popup, /localhost|__WEB_URL__/);
      assert.match(popup, /https:\/\/ytequity.com\/privacy/);
      assert.deepEqual(manifest.content_scripts[0], { matches: ["https://www.youtube.com/*"], js: ["channel-context.js"], world: "MAIN" });
      if (browser === "firefox") {
        assert.deepEqual(manifest.background.scripts, ["config.js", "shared.js", "background.js"]);
        assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, ["browsingActivity", "websiteContent"]);
      } else assert.equal(manifest.background.service_worker, "background.js");
    } finally { await rm(outDir, { recursive: true, force: true }); }
  });
}
test("unsupported browser targets fail instead of silently building Chrome", async () => {
  await assert.rejects(buildExtension({ browser: "safari" }), /Unsupported browser/);
});
