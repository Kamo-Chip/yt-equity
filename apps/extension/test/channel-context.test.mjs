import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
const script = await readFile(new URL("../channel-context.js", import.meta.url), "utf8");
const channelId = "UCHnyfMqiRRG1u-2MsSQLbXA";
const settle = () => new Promise(resolve => setTimeout(resolve, 160));
function model(videoId, id = channelId) {
  return { contentId: videoId, contentType: "LOCKUP_CONTENT_TYPE_VIDEO", metadata: { lockupMetadataViewModel: { image: { decoratedAvatarViewModel: { rendererContext: { commandContext: { onTap: { innertubeCommand: { browseEndpoint: { browseId: id } } } } } } } } } };
}
test("reads canonical IDs from signal-backed lockups and clears recycled card metadata", async () => {
  const dom = new JSDOM('<yt-lockup-view-model><a href="/watch?v=video123">Video</a></yt-lockup-view-model>', { url: "https://www.youtube.com/watch?v=parent", runScripts: "outside-only" });
  try {
    const card = dom.window.document.querySelector("yt-lockup-view-model");
    card.rawProps = { data: () => model("video123") };
    dom.window.eval(script); await settle();
    assert.deepEqual(JSON.parse(card.getAttribute("data-pe-channel-context")), { videoId: "video123", channelId });
    card.querySelector("a").setAttribute("href", "/watch?v=another123"); await settle();
    assert.equal(card.hasAttribute("data-pe-channel-context"), false);
    card.rawProps.data = () => model("another123");
    dom.window.dispatchEvent(new dom.window.Event("yt-page-data-updated")); await settle();
    assert.equal(JSON.parse(card.getAttribute("data-pe-channel-context")).videoId, "another123");
  } finally { dom.window.close(); }
});
test("does not infer identities from display names, malformed IDs, or partial models", async () => {
  const dom = new JSDOM('<yt-lockup-view-model><a href="/watch?v=video123">Video</a><span>Veritasium</span></yt-lockup-view-model>', { url: "https://www.youtube.com/watch?v=parent", runScripts: "outside-only" });
  try {
    const card = dom.window.document.querySelector("yt-lockup-view-model");
    card.rawProps = { data: () => model("video123", "not-a-channel-id") };
    dom.window.eval(script); await settle();
    assert.equal(card.hasAttribute("data-pe-channel-context"), false);
    card.rawProps.data = () => { throw Error("not hydrated"); };
    dom.window.dispatchEvent(new dom.window.Event("yt-navigate-finish")); await settle();
    assert.equal(card.hasAttribute("data-pe-channel-context"), false);
  } finally { dom.window.close(); }
});
