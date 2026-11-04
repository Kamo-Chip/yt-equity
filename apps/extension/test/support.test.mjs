import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const script = await readFile(new URL("../support.js", import.meta.url), "utf8");
const video = "https://www.youtube.com/watch?v=WNGNhItoRh8";
function environment({ url = `${video}#yt-equity-thanks`, html = "" } = {}) {
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  const { window } = dom;
  let time = 0;
  let pending;
  const pausedVideos = [];
  window.HTMLMediaElement.prototype.pause = function () { pausedVideos.push(this); };
  Object.defineProperty(window.HTMLMediaElement.prototype, "paused", { get: () => false });
  window.Date.now = () => time;
  window.setInterval = callback => { pending = callback; return 1; };
  window.clearInterval = () => { pending = null; };
  window.Element.prototype.getClientRects = function () { return this.style.display === "none" ? [] : [{}]; };
  window.eval(script);
  return {
    window, document: window.document, pausedVideos,
    tick(ms = 300) { time += ms; pending?.(); },
    get active() { return Boolean(pending); },
    close() { window.close(); }
  };
}
const actions = content => `<ytd-watch-metadata><div id="actions">${content}</div></ytd-watch-metadata>`;

for (const url of [video, `${video}#other`, "https://www.youtube.com/watch?v=another#yt-equity-thanks"]) {
  test(`does nothing for an ordinary or unrelated visit: ${url}`, () => {
    const env = environment({ url, html: actions('<button aria-label="Thanks">Thanks</button>') });
    assert.equal(env.active, false);
    assert.equal(env.window.location.href, url);
    env.close();
  });
}

test("waits for the Thanks control, clicks once, and never clicks Buy and send", () => {
  const env = environment();
  let clicks = 0;
  let purchases = 0;
  assert.equal(env.window.location.hash, "");
  env.document.body.innerHTML = actions('<button aria-label="Thanks">Thanks</button>') + '<button id="buy">Buy and send</button>';
  env.document.querySelector('[aria-label="Thanks"]').onclick = () => { clicks++; };
  env.document.getElementById("buy").onclick = () => { purchases++; };
  env.tick(); env.tick();
  env.window.dispatchEvent(new env.window.Event("yt-navigate-finish"));
  assert.equal(clicks, 1);
  assert.equal(purchases, 0);
  assert.equal(env.active, false);
  env.close();
});

test("opens the video overflow once and selects its enabled Thanks item", () => {
  const env = environment();
  let menuClicks = 0;
  let thanksClicks = 0;
  env.document.body.innerHTML = actions('<button aria-label="More actions">More</button>');
  env.document.querySelector("button").onclick = () => {
    menuClicks++;
    const menu = env.document.createElement("ytd-menu-popup-renderer");
    menu.innerHTML = '<ytd-menu-service-item-renderer><span class="title">Thanks</span><span>Show that you care with a highlighted comment</span></ytd-menu-service-item-renderer>';
    menu.firstElementChild.onclick = () => { thanksClicks++; };
    env.document.body.append(menu);
  };
  env.tick(); env.tick(); env.tick();
  assert.equal(menuClicks, 1);
  assert.equal(thanksClicks, 1);
  assert.equal(env.active, false);
  env.close();
});

test("ignores hidden/disabled Thanks controls and offers dismissible fallback on timeout", () => {
  const env = environment({ html: actions('<button hidden aria-label="Thanks">Thanks</button><button disabled aria-label="Thanks">Thanks</button>') });
  env.tick(15_000);
  assert.equal(env.active, false);
  const notice = env.document.querySelector('[role="status"]');
  assert.match(notice.textContent, /More actions/);
  notice.querySelector("button").click();
  assert.equal(env.document.querySelector('[role="status"]'), null);
  env.close();
});

test("stops pending work when YouTube navigates away", () => {
  const env = environment();
  env.window.dispatchEvent(new env.window.Event("yt-navigate-start"));
  env.tick(20_000);
  assert.equal(env.active, false);
  assert.equal(env.document.querySelector('[role="status"]'), null);
  env.close();
});

test("handles support markers added during YouTube navigation", () => {
  const env = environment({ url: video });
  env.window.history.replaceState(null, "", `${video}#yt-equity-thanks`);
  env.window.dispatchEvent(new env.window.Event("hashchange"));
  assert.equal(env.active, true);
  assert.equal(env.window.location.hash, "");
  env.close();
});

test("pauses existing video before opening Thanks and intercepts delayed playback", () => {
  const env = environment({ html: '<div id="movie_player"><video></video></div>' + actions('<button aria-label="Thanks">Thanks</button>') });
  const video = env.document.querySelector("video");
  assert.ok(env.pausedVideos.includes(video));
  assert.equal(env.active, false);
  const count = env.pausedVideos.length;
  video.dispatchEvent(new env.window.Event("play"));
  assert.equal(env.pausedVideos.length, count + 1, "pause remains after the Thanks chooser opens");
  const replacement = env.document.createElement("video");
  video.replaceWith(replacement);
  replacement.dispatchEvent(new env.window.Event("playing"));
  assert.equal(env.pausedVideos.at(-1), replacement);
  env.window.dispatchEvent(new env.window.Event("yt-navigate-start"));
  const stopped = env.pausedVideos.length;
  replacement.dispatchEvent(new env.window.Event("play"));
  assert.equal(env.pausedVideos.length, stopped, "navigation releases playback handlers");
  env.close();
});

test("ordinary video visits keep playback untouched", () => {
  const env = environment({ url: video, html: '<div id="movie_player"><video></video></div>' });
  env.document.querySelector("video").dispatchEvent(new env.window.Event("play"));
  assert.equal(env.pausedVideos.length, 0);
  env.close();
});
