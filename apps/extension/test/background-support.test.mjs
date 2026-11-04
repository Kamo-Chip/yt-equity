import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const script = await readFile(new URL("../background.js", import.meta.url), "utf8");

for (const firefox of [false, true]) {
  test(`content support opens the same normal active tab as the popup (${firefox ? "Firefox" : "Chrome"})`, async () => {
    let listener;
    let fail = false;
    const opened = [];
    const api = {
      runtime: { onMessage: { addListener(value) { listener = value; } }, onInstalled: { addListener() {} } },
      storage: { onChanged: { addListener() {} } },
      tabs: { async create(options) { if (fail) throw Error("unavailable"); opened.push(JSON.parse(JSON.stringify(options))); } }
    };
    runInNewContext(script, { ...(firefox ? {} : { importScripts() {} }), [firefox ? "browser" : "chrome"]: api });
    const send = () => new Promise(resolve => {
      assert.equal(listener({ type: "yt-equity:open-support", url: "https://untrusted.example" }, {}, resolve), true);
    });
    assert.equal((await send()).ok, true);
    assert.deepEqual(opened, [{ url: "https://www.youtube.com/watch?v=WNGNhItoRh8#yt-equity-thanks", active: true }]);
    fail = true;
    assert.equal((await send()).ok, false);
  });
}
