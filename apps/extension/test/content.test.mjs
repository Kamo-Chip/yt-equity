import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

import { readContentSource } from "../scripts/build.mjs";
const shared = await readFile(new URL("../shared.js", import.meta.url), "utf8");
const contentScript = shared + await readContentSource();

test("suggested lockups without channel anchors use a matching canonical context and reject stale metadata", async () => {
  const channelId = "UCHnyfMqiRRG1u-2MsSQLbXA";
  const calls = [];
  const env = environment({
    url: "https://www.youtube.com/watch?v=parent",
    html: `<div id="related"><yt-lockup-view-model data-pe-channel-context='${JSON.stringify({ videoId: "video123", channelId })}'><a href="/watch?v=video123">Video</a><div class="ytLockupMetadataViewModelMetadata">Veritasium</div></yt-lockup-view-model></div>`,
    settings: { hideConfirmedAcquisitions: true },
    lookup: identifier => { calls.push(identifier); return { kind: "found", value: { channelId, name: "Veritasium", claims: [{ type: "acquisition", status: "confirmed", firm: { name: "Owner" } }] } }; }
  });
  try {
    await waitFor(() => calls.includes(channelId) && env.window.document.querySelectorAll(".pe-card-filtered").length === 1);
    assert.ok(calls.includes(channelId));
    assert.equal(env.window.document.querySelectorAll(".pe-card-filtered").length, 1);
    env.window.document.querySelector('a[href*="watch"]').setAttribute("href", "/watch?v=changed123");
    await waitFor(() => env.window.document.querySelectorAll(".pe-card-filtered, .pe-ownership-badge").length === 0);
    assert.equal(env.window.document.querySelectorAll(".pe-card-filtered, .pe-ownership-badge").length, 0);
  } finally { env.dom.window.close(); }
});

async function waitFor(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(predicate(), "Expected extension presentation before the deadline");
}

function waitForWork() {
  return new Promise((resolve) => setTimeout(resolve, 180));
}

for (const asynchronous of [false, true]) {
  test(`invalidated extension context retires stale UI (${asynchronous ? "rejected promise" : "synchronous throw"})`, async () => {
    const env = environment({
      url: "https://www.youtube.com/",
      html: '<ytd-rich-item-renderer><a href="/watch?v=one">Video</a><div id="metadata-line"><a href="/@alpha">Alpha</a></div></ytd-rich-item-renderer>',
      settings: { hideConfirmedAcquisitions: true },
      lookup: () => ({ kind: "found", value: { name: "Alpha", claims: [{ type: "acquisition", status: "confirmed", firm: { name: "Owner" } }] } })
    });
    try {
      await waitForWork();
      const { document } = env.window;
      assert.equal(document.querySelectorAll(".pe-card-filtered").length, 1);
      let calls = 0;
      env.window.chrome.runtime.sendMessage = () => {
        calls += 1;
        const error = new Error("Extension context invalidated.");
        if (asynchronous) return Promise.reject(error);
        throw error;
      };
      document.body.insertAdjacentHTML("beforeend", '<ytd-rich-item-renderer><a href="/watch?v=two">Video</a><a href="/@beta">Beta</a></ytd-rich-item-renderer>');
      await waitForWork();
      assert.equal(document.querySelectorAll(".pe-card-filtered, .pe-filter-placeholder, .pe-ownership-badge").length, 0);
      env.changeSettings({ hideConfirmedFunding: true });
      env.window.dispatchEvent(new env.window.Event("yt-navigate-finish"));
      document.body.append(document.createElement("div"));
      await waitForWork();
      assert.equal(calls, 1, "retired scripts must stop contacting the extension");
    } finally { env.dom.window.close(); }
  });
}

async function withChannelId(result) {
  result = await result;
  return result?.kind === "found" ? { ...result, value: { channelId: "UCalpha", ...result.value } } : result;
}

function environment({ url, html, lookup, settings = {}, saveSettings = async () => {}, openSupport = async () => ({ ok: true }) }) {
  const dom = new JSDOM(html, { url, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  let storageListener = null;
  let messageListener = null;
  window.HTMLElement.prototype.getClientRects = function () {
    return this.style.display === "none" ? [] : [{ width: 10, height: 10 }];
  };
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ top: 100, bottom: 136, left: 100, right: 140, width: 40, height: 36 });
  window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
    this.querySelector("[autofocus]")?.focus();
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new window.Event("close"));
  };
  window.setInterval = () => 0;
  window.chrome = {
    runtime: {
      onMessage: { addListener: (listener) => { messageListener = listener; } },
      getURL: (path) => `chrome-extension://test/${path}`,
      sendMessage: async (message) => {
        if (message.type === "yt-equity:open-support") return openSupport(message);
        if (message.type === "yt-equity:lookup-many") {
          return Promise.all(message.identifiers.map(async (identifier) => ({ identifier, result: await withChannelId(lookup(identifier)) })));
        }
        return withChannelId(lookup(message.identifier));
      }
    },
    storage: {
      local: {
        get: async () => ({ ownershipLookupsEnabled: true, ...settings }),
        set: async (values) => {
          await saveSettings(values);
          storageListener(Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }])), "local");
        }
      },
      onChanged: { addListener: (listener) => { storageListener = listener; } }
    }
  };
  window.YT_EQUITY_CONFIG = { apiUrl: "https://api.example", webUrl: "https://web.example" };
  window.eval(contentScript);
  return { dom, window, message(message, respond) { return messageListener(message, {}, respond); }, changeSetting(value) { this.changeSettings({ hideConfirmedAcquisitions: value }); }, changeSettings(values) { storageListener(Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }])), "local"); } };
}

test("popup supports keyboard dismissal, focus cycling, toggle, and outside clicks", async () => {
  const env = environment({
    url: "https://www.youtube.com/watch?v=one",
    html: `<body><button id="outside">YouTube control</button><ytd-watch-metadata><div id="owner"><a href="/@alpha">Alpha</a></div></ytd-watch-metadata></body>`,
    lookup: () => ({ kind: "independent" })
  });
  try {
    await waitForWork();
    const { document, KeyboardEvent } = env.window;
    const trigger = document.querySelector("#pe-check-button");
    trigger.click();
    const close = document.querySelector("#pe-popup-close");
    const last = document.querySelector(".pe-support-button");
    assert.equal(document.activeElement, close);
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    close.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    assert.equal(document.activeElement, last);
    last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    assert.equal(document.activeElement, close);
    close.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    assert.equal(document.querySelector("#pe-popup"), null);
    assert.equal(document.activeElement, trigger);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(trigger.hasAttribute("aria-controls"), false);
    trigger.click();
    document.querySelector("#pe-popup-close").click();
    assert.equal(document.activeElement, trigger);
    trigger.click();
    trigger.click();
    assert.equal(document.querySelector("#pe-popup"), null);
    trigger.click();
    const outside = document.querySelector("#outside");
    outside.focus();
    outside.click();
    assert.equal(document.querySelector("#pe-popup"), null);
    assert.equal(document.activeElement, outside);
  } finally { env.window.close(); }
});

test("removes a control mounted in stale hidden watch DOM after navigating home", async () => {
  const env = environment({
    url: "https://www.youtube.com/watch?v=one",
    html: `<body><ytd-watch-metadata><div id="owner"><a href="/@alpha">Alpha</a></div></ytd-watch-metadata></body>`,
    lookup: () => ({ kind: "independent" })
  });
  await waitForWork();
  assert.equal(env.window.document.querySelectorAll("#pe-check-button-wrapper").length, 1);

  env.window.document.querySelector("#owner").style.display = "none";
  env.window.history.pushState({}, "", "/");
  env.window.dispatchEvent(new env.window.Event("yt-navigate-finish"));
  await waitForWork();

  assert.equal(env.window.document.querySelectorAll("#pe-check-button-wrapper").length, 0);
  env.dom.window.close();
});

test("adds a badge, hides confirmed acquisitions, and reveals one card", async () => {
  const channel = {
    channelId: "UCalpha",
    handle: "@alpha",
    name: "Alpha",
    claims: [{ id: "claim-1", type: "acquisition", status: "confirmed", firm: { id: "firm-1", name: "Example Capital" } }]
  };
  const env = environment({
    url: "https://www.youtube.com/",
    html: `<body><ytd-rich-item-renderer><div id="content"><a href="/watch?v=one">Video</a><div id="channel-name"><a href="/@alpha">Alpha</a></div><div id="metadata-line"></div></div></ytd-rich-item-renderer></body>`,
    lookup: () => ({ kind: "found", value: channel })
  });
  await waitForWork();

  const card = env.window.document.querySelector("ytd-rich-item-renderer");
  assert.equal(card.querySelector(".pe-ownership-badge")?.textContent, "🤑Acquired");
  const annotation = card.querySelector(".pe-ownership-badge");
  assert.equal(annotation.querySelector(".pe-ownership-emoji").getAttribute("aria-hidden"), "true");
  assert.equal(annotation.querySelector(".pe-ownership-label").textContent, "Acquired");
  assert.equal(annotation.title, "View acquisition details");
  assert.equal(annotation.getAttribute("aria-label"), annotation.title);
  assert.equal(annotation.tagName, "BUTTON");
  assert.equal(annotation.getAttribute("aria-haspopup"), "dialog");
  assert.equal(annotation.getAttribute("aria-expanded"), "false");
  let cardClicks = 0;
  card.addEventListener("click", () => cardClicks++);
  annotation.click();
  assert.equal(cardClicks, 0);
  assert.equal(annotation.getAttribute("aria-expanded"), "true");
  assert.equal(env.window.document.querySelector("#pe-popup .pe-finding").textContent, "Acquired by Example Capital");
  assert.equal(env.window.document.querySelector("#pe-popup .pe-record-button").href, "https://web.example/channels/%40alpha");
  await waitForWork();
  assert.ok(env.window.document.querySelector("#pe-popup"), "card popup survives homepage reconciliation");
  annotation.click();
  assert.equal(env.window.document.querySelector("#pe-popup"), null);
  assert.equal(annotation.getAttribute("aria-expanded"), "false");
  assert.equal(Boolean(card.querySelector(".pe-filter-placeholder")), false);

  env.changeSetting(true);
  assert.equal(Boolean(card.querySelector(".pe-filter-placeholder")), true);
  assert.match(card.querySelector(".pe-filter-placeholder")?.textContent ?? "", /Confirmed acquisition by Example Capital/);

  card.querySelector(".pe-filter-placeholder button").click();
  assert.equal(Boolean(card.querySelector(".pe-filter-placeholder")), false);
  assert.equal(card.querySelector(".pe-ownership-badge")?.textContent, "🤑Acquired");
  env.dom.window.close();
});

test("video badges show their own channel details, restore focus, and clean up removed anchors", async () => {
  const env = environment({
    url: "https://www.youtube.com/",
    html: '<body><button id="outside">Outside</button><ytd-rich-item-renderer><a href="/watch?v=one">One</a><div id="metadata-line"><a href="/@alpha">Alpha</a></div></ytd-rich-item-renderer><ytd-rich-item-renderer><a href="/watch?v=two">Two</a><div id="metadata-line"><a href="/@beta">Beta</a></div></ytd-rich-item-renderer></body>',
    lookup: identifier => ({ kind: "found", value: { name: identifier, claims: [{ type: identifier === "@alpha" ? "acquisition" : "funding", status: "confirmed", firm: { name: identifier === "@alpha" ? "Alpha Capital" : "Beta Capital" } }] } })
  });
  try {
    await waitForWork();
    const { document, KeyboardEvent } = env.window;
    const badges = [...document.querySelectorAll(".pe-ownership-badge")];
    badges[0].click();
    assert.equal(document.querySelector("#pe-popup .pe-finding").textContent, "Acquired by Alpha Capital");
    badges[1].click();
    assert.equal(document.querySelectorAll("#pe-popup").length, 1);
    assert.equal(badges[0].getAttribute("aria-expanded"), "false");
    assert.equal(document.querySelector("#pe-popup .pe-finding").textContent, "Funded by Beta Capital");
    assert.equal(document.querySelector("#pe-popup .pe-record-button").href, "https://web.example/channels/%40beta");
    assert.equal(document.querySelector(".pe-support-continue"), null);
    document.querySelector("#pe-popup-close").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    assert.equal(document.querySelector("#pe-popup"), null);
    assert.equal(document.activeElement, badges[1]);
    badges[1].click();
    document.querySelector("#outside").click();
    assert.equal(document.querySelector("#pe-popup"), null);
    badges[1].click();
    badges[1].closest("ytd-rich-item-renderer").remove();
    await waitForWork();
    assert.equal(document.querySelector("#pe-popup"), null);
  } finally { env.window.close(); }
});

test("adds a badge to YouTube's current lockup metadata markup", async () => {
  const env = environment({
    url: "https://www.youtube.com/",
    html: `<body><ytd-rich-item-renderer><div id="content"><yt-lockup-view-model><a href="/watch?v=modern">Video</a><yt-lockup-metadata-view-model><div class="ytLockupMetadataViewModelMetadata"><yt-content-metadata-view-model class="ytContentMetadataViewModelHost"><a href="/@dudeperfect">Dude Perfect</a></yt-content-metadata-view-model></div></yt-lockup-metadata-view-model></yt-lockup-view-model></div></ytd-rich-item-renderer></body>`,
    lookup: () => ({
      kind: "found",
      value: {
        channelId: "UCRijo3ddMTht_IHyNSNXpNQ",
        handle: "@dudeperfect",
        name: "Dude Perfect",
        claims: [{ id: "claim-spotter", type: "funding", status: "confirmed", firm: { id: "spotter", name: "Spotter" } }]
      }
    })
  });
  await waitForWork();

  const metadata = env.window.document.querySelector(".ytLockupMetadataViewModelMetadata");
  assert.equal(metadata.querySelector(".pe-ownership-badge")?.textContent, "🤑Funded");
  env.dom.window.close();
});

test("inherits the channel identifier for cards on a channel video grid", async () => {
  const env = environment({
    url: "https://www.youtube.com/@alpha/videos",
    html: `<body><yt-page-header-renderer><h1 class="dynamic-text-view-model-wiz__h1">Alpha</h1></yt-page-header-renderer><ytd-rich-item-renderer><a href="/watch?v=grid">Video</a><div class="ytLockupMetadataViewModelMetadata"></div></ytd-rich-item-renderer></body>`,
    lookup: () => ({
      kind: "found",
      value: {
        channelId: "UCalpha",
        handle: "@alpha",
        name: "Alpha",
        claims: [{ id: "claim-grid", type: "acquisition", status: "confirmed", firm: { id: "firm-grid", name: "Example Capital" } }]
      }
    })
  });
  await waitForWork();

  assert.equal(env.window.document.querySelector("ytd-rich-item-renderer .pe-ownership-badge")?.textContent, "🤑Acquired");
  env.dom.window.close();
});

test("does not badge or hide unknown and unavailable channels", async () => {
  for (const result of [{ kind: "independent" }, { kind: "unavailable" }]) {
    const env = environment({
      url: "https://www.youtube.com/",
      html: `<body><ytd-video-renderer><a href="/watch?v=two">Video</a><div id="channel-name"><a href="/@unknown">Unknown</a></div></ytd-video-renderer></body>`,
      lookup: () => result
    });
    await waitForWork();
    env.changeSetting(true);
    const card = env.window.document.querySelector("ytd-video-renderer");
    assert.equal(card.querySelector(".pe-ownership-badge, .pe-filter-placeholder"), null);
    assert.equal(Boolean(card.querySelector(".pe-filter-placeholder")), false);
    env.dom.window.close();
  }
});

for (const scenario of [
  { name: "funding", claims: [{ id: "funding", type: "funding", status: "confirmed", firm: { name: "Spotter" } }], text: "Funded by Spotter", selected: "funding" },
  { name: "undisclosed funding", claims: [{ id: "undisclosed-funding", type: "funding", status: "confirmed" }], text: "Funded by an undisclosed firm", selected: "undisclosed-funding" },
  { name: "undisclosed acquisition", claims: [{ id: "undisclosed", type: "acquisition", status: "confirmed" }], text: "Acquired by an undisclosed firm", selected: "undisclosed" },
  { name: "mixed claims", claims: [
    { id: "hidden", type: "acquisition", status: "disputed", firm: { name: "Hidden" } },
    { id: "funding", type: "funding", status: "confirmed", firm: { name: "Funder" } },
    { id: "first", type: "acquisition", status: "confirmed", firm: { name: "First" } },
    { id: "second", type: "acquisition", status: "confirmed", firm: { name: "Second" } }
  ], text: "Acquired by First", selected: "first" },
  ...["provisional"].map(status => ({ name: status, claims: [{ id: "hidden", type: "acquisition", status, firm: { name: "Hidden" } }], text: "No published ownership record" }))
]) {
  test(`confirmed-only popup, indicator and cards for ${scenario.name}`, async () => {
    const env = environment({
      url: "https://www.youtube.com/@alpha/videos",
      html: `<body><yt-page-header-renderer><h1 class="dynamic-text-view-model-wiz__h1">Alpha</h1></yt-page-header-renderer><ytd-rich-item-renderer><a href="/watch?v=grid">Video</a><div class="ytLockupMetadataViewModelMetadata"></div></ytd-rich-item-renderer></body>`,
      lookup: () => ({ kind: "found", value: { name: "Alpha", claims: scenario.claims } })
    });
    try {
      await waitForWork();
      const { document } = env.window;
      document.querySelector("#pe-check-button").click();
      const popup = document.querySelector("#pe-popup");
      assert.equal(popup.querySelector(".pe-finding").textContent, scenario.text);
      assert.equal(Boolean(document.querySelector("#pe-ping")), Boolean(scenario.selected));
      assert.equal(popup.querySelector(".pe-record-button").textContent, scenario.selected ? "View full record" : "View channel on YT Equity");
      assert.equal(popup.querySelector('.pe-popup-footer, a[href*="contribution="]'), null);
      if (scenario.name.startsWith("undisclosed")) assert.equal(popup.querySelector("li a"), null);
      env.changeSetting(true);
      const card = document.querySelector("ytd-rich-item-renderer");
      assert.equal(Boolean(card.querySelector(".pe-ownership-badge")), Boolean(scenario.selected));
      if (scenario.selected) {
        const selected = scenario.claims.find(claim => claim.id === scenario.selected);
        assert.equal(card.querySelector(".pe-ownership-label").textContent, selected.type === "acquisition" ? "Acquired" : "Funded");
        assert.equal(card.querySelector(".pe-ownership-emoji").textContent, "🤑");
      }
      assert.equal(Boolean(card.querySelector(".pe-filter-placeholder")), false);
    } finally { env.window.close(); }
  });
}


test("creator emoji and message reset when navigating to an ordinary channel", async () => {
  const env = environment({
    url: "https://www.youtube.com/@kamoio/videos",
    html: `<body><yt-page-header-renderer><h1 class="dynamic-text-view-model-wiz__h1">Kamo IO</h1></yt-page-header-renderer><ytd-rich-item-renderer><a href="/watch?v=creator">Video</a><div class="ytLockupMetadataViewModelMetadata"></div></ytd-rich-item-renderer></body>`,
    lookup: identifier => identifier === "@kamoio" ? {
      kind: "found", value: { channelId: "UC4GyUVKO5_kF0eC7jP9Rjww", name: "Kamo IO", claims: [], easterEgg: { emoji: "👨🏾‍💻", message: "I built this thing." } }
    } : { kind: "found", value: { channelId: "UCalpha", name: "Alpha", claims: [] } }
  });
  try {
    await waitForWork();
    const { document } = env.window;
    const button = document.querySelector("#pe-check-button");
    assert.equal(button.textContent, "👨🏾‍💻");
    assert.equal(button.getAttribute("aria-label"), "👨🏾‍💻 I built this thing.");
    assert.equal(document.querySelector("#pe-ping"), null);
    button.click();
    assert.match(document.querySelector("#pe-popup").textContent, /👨🏾‍💻 I built this thing\./);
    assert.match(document.querySelector("#pe-popup").textContent, /No published ownership record/);
    assert.equal(document.querySelector('a[href*="contribution=dispute"]'), null);
    env.changeSetting(true);
    assert.equal(document.querySelector(".pe-ownership-badge, .pe-filter-placeholder"), null);
    env.window.history.pushState({}, "", "/@alpha/videos");
    env.window.dispatchEvent(new env.window.Event("yt-navigate-finish"));
    await waitForWork();
    // Popup DOM mutations can reschedule the observer's 120ms reconciliation.
    for (let attempt = 0; attempt < 40 && document.querySelector("#pe-check-button")?.textContent !== "🧐"; attempt++) {
      await waitForWork();
    }
    assert.equal(document.querySelector("#pe-popup"), null);
    const ordinaryButton = document.querySelector("#pe-check-button");
    assert.equal(ordinaryButton.textContent, "🧐");
    assert.equal(ordinaryButton.getAttribute("aria-label"), "View YT Equity ownership information");
    ordinaryButton.click();
    assert.doesNotMatch(document.querySelector("#pe-popup").textContent, /I built this thing/);
  } finally { env.window.close(); }
});

const filterCard = `<ytd-rich-item-renderer><div><a href="/watch?v=one">Video</a><div id="channel-name"><a href="/@alpha">Alpha</a></div><div id="metadata-line"></div></div></ytd-rich-item-renderer>`;
const acquisition = { type: "acquisition", status: "confirmed", firm: { name: "Owner" } };
const funding = { type: "funding", status: "confirmed", firm: { name: "Funder" } };
function filterEnvironment({ path = "/", claims = [acquisition], settings = {}, related = false } = {}) {
  return environment({ url: `https://www.youtube.com${path}`, html: `<body>${related ? `<div id="related">${filterCard}</div>${filterCard}` : filterCard}</body>`, settings,
    lookup: () => ({ kind: "found", value: { name: "Alpha", claims } }) });
}
for (const [path, key] of [["/", "filterHome"], ["/results?search_query=test", "filterSearch"], ["/feed/subscriptions", "filterSubscriptions"], ["/watch?v=one", "filterSuggested"]]) {
  test(`location switch gates filtering on ${path}`, async () => {
    const env = filterEnvironment({ path, related: key === "filterSuggested", settings: { hideConfirmedAcquisitions: true } });
    try {
      await waitForWork();
      const cards = [...env.window.document.querySelectorAll("ytd-rich-item-renderer")];
      assert.equal(Boolean(cards[0].querySelector(".pe-filter-placeholder")), key !== "filterSubscriptions");
      env.changeSettings({ [key]: true });
      assert.equal(Boolean(cards[0].querySelector(".pe-filter-placeholder")), true);
      if (key === "filterSuggested") assert.equal(Boolean(cards[1].querySelector(".pe-filter-placeholder")), false);
      env.changeSettings({ [key]: false });
      assert.equal(Boolean(cards[0].querySelector(".pe-filter-placeholder")), false);
      assert.ok(cards[0].querySelector(".pe-ownership-badge"));
    } finally { env.window.close(); }
  });
}
for (const path of ["/@alpha/videos", "/shorts/one"]) {
  test(`does not filter unsupported location ${path}`, async () => {
    const env = filterEnvironment({ path, settings: { hideConfirmedAcquisitions: true, hideConfirmedFunding: true } });
    try { await waitForWork(); assert.equal(env.window.document.querySelector(".pe-card-filtered"), null); }
    finally { env.window.close(); }
  });
}
for (const [name, claims, settings, reason] of [
  ["defaults", [acquisition, funding], {}, null],
  ["funding only", [funding], { hideConfirmedFunding: true }, "Confirmed funding by Funder"],
  ["funding excluded", [funding], { hideConfirmedAcquisitions: true }, null],
  ["mixed both", [funding, acquisition], { hideConfirmedAcquisitions: true, hideConfirmedFunding: true }, "Confirmed acquisition by Owner"],
  ["undisclosed funding", [{ type: "funding", status: "confirmed" }], { hideConfirmedFunding: true }, "Confirmed funding"],
  ["unconfirmed", [{ ...acquisition, status: "disputed" }, { ...funding, status: "provisional" }], { hideConfirmedAcquisitions: true, hideConfirmedFunding: true }, null]
]) {
  test(`filters matching confirmed type: ${name}`, async () => {
    const env = filterEnvironment({ claims, settings });
    try {
      await waitForWork();
      const placeholder = env.window.document.querySelector(".pe-filter-placeholder");
      assert.equal(Boolean(placeholder), Boolean(reason));
      if (reason) assert.equal(placeholder.querySelector(".pe-filter-copy span").textContent, reason);
    } finally { env.window.close(); }
  });
}
test("reapplies on navigation with reused cards, resets reveals, and filters inserted cards", async () => {
  const env = filterEnvironment({ settings: { hideConfirmedAcquisitions: true } });
  try {
    await waitForWork();
    const { document } = env.window;
    const card = document.querySelector("ytd-rich-item-renderer");
    card.querySelector(".pe-filter-placeholder button").click();
    env.changeSettings({ filterHome: false });
    env.changeSettings({ filterHome: true });
    assert.equal(Boolean(card.querySelector(".pe-filter-placeholder")), false);
    async function navigate(path) {
      env.window.history.pushState({}, "", path);
      env.window.dispatchEvent(new env.window.Event("yt-navigate-finish"));
      await waitForWork();
    }
    await navigate("/results?search_query=alpha");
    assert.equal(Boolean(card.querySelector(".pe-filter-placeholder")), true);
    await navigate("/feed/subscriptions");
    assert.equal(Boolean(card.querySelector(".pe-filter-placeholder")), false);
    await navigate("/");
    assert.equal(Boolean(card.querySelector(".pe-filter-placeholder")), true);
    document.body.insertAdjacentHTML("beforeend", filterCard.replace("v=one", "v=two"));
    await new Promise(resolve => setTimeout(resolve, 180));
    assert.equal(document.querySelectorAll(".pe-card-filtered").length, 2);
    env.changeSettings({ hideConfirmedAcquisitions: false });
    assert.equal(document.querySelectorAll(".pe-card-filtered").length, 0);
  } finally { env.window.close(); }
});


test("loading popup resolves in place to unavailable without actions", async () => {
  let resolveLookup;
  const env = environment({
    url: "https://www.youtube.com/watch?v=one",
    html: `<body><ytd-watch-metadata><div id="owner"><a href="/@alpha">Alpha</a></div></ytd-watch-metadata></body>`,
    lookup: () => new Promise(resolve => { resolveLookup = resolve; })
  });
  try {
    await waitForWork();
    const { document } = env.window;
    document.querySelector("#pe-check-button").click();
    const popup = document.querySelector("#pe-popup");
    assert.ok(popup.querySelector(".pe-loading-spinner"));
    assert.equal(popup.querySelector(".pe-record-button, .pe-support-button, .pe-popup-footer"), null);
    resolveLookup({ kind: "unavailable" });
    await waitForWork();
    assert.equal(document.querySelector("#pe-popup"), popup);
    assert.equal(popup.querySelector(".pe-finding").textContent, "Unable to reach YT Equity right now");
    assert.equal(popup.querySelector(".pe-record-button, .pe-popup-footer, .pe-loading-spinner"), null);
  } finally { env.window.close(); }
});

test("support uses the extension flow, prevents duplicate opens, and allows retry", async () => {
  const messages = [];
  let finish;
  const env = environment({
    url: "https://www.youtube.com/@alpha/videos",
    html: '<body><yt-page-header-renderer><h1 class="dynamic-text-view-model-wiz__h1">Alpha</h1></yt-page-header-renderer></body>',
    lookup: () => ({ kind: "independent" }),
    openSupport: message => { messages.push(message.type); return new Promise(resolve => { finish = resolve; }); }
  });
  try {
    await waitForWork();
    const { document } = env.window;
    document.querySelector("#pe-check-button").click();
    const support = document.querySelector(".pe-support-button");
    const click = new env.window.MouseEvent("click", { bubbles: true, cancelable: true });
    support.dispatchEvent(click);
    support.click();
    assert.equal(click.defaultPrevented, true);
    assert.deepEqual(messages, []);
    const dialog = document.querySelector("#pe-support-dialog");
    assert.equal(dialog.open, true);
    assert.equal(document.querySelectorAll("#pe-support-dialog").length, 1);
    const proceed = dialog.querySelector(".pe-support-continue");
    assert.equal(proceed.textContent, "Continue");
    assert.equal(dialog.querySelector("h2").textContent, "Keep lights on");
    assert.equal(dialog.querySelector("#pe-support-description").textContent, "Your support helps me keep YT Equity going. Thank you!");
    proceed.click(); proceed.click();
    assert.deepEqual(messages, ["yt-equity:open-support"]);
    assert.equal(proceed.disabled, true);
    finish({ ok: false });
    await waitForWork();
    assert.equal(proceed.disabled, false);
    assert.equal(document.querySelector(".pe-support-error").textContent, "Couldn’t open support tab. Try again.");
    proceed.click();
    assert.equal(messages.length, 2);
    assert.equal(document.querySelector(".pe-support-error").textContent, "");
    finish({ ok: true });
    await waitForWork();
    assert.equal(document.querySelector("#pe-support-dialog"), null);
    assert.ok(document.querySelector("#pe-popup"));
    assert.equal(document.activeElement, support);
  } finally { env.window.close(); }
});

test("support cancellation restores focus, opens no tab, and parent dismissal removes the modal", async () => {
  let opened = 0;
  const env = environment({
    url: "https://www.youtube.com/@alpha/videos",
    html: '<body><yt-page-header-renderer><h1 class="dynamic-text-view-model-wiz__h1">Alpha</h1></yt-page-header-renderer></body>',
    lookup: () => ({ kind: "independent" }),
    openSupport: async () => { opened++; return { ok: true }; }
  });
  try {
    await waitForWork();
    const { document } = env.window;
    const trigger = document.querySelector("#pe-check-button");
    trigger.click();
    const support = document.querySelector(".pe-support-button");
    support.click();
    document.querySelector("#pe-support-dialog button").click();
    assert.equal(document.querySelector("#pe-support-dialog"), null);
    assert.ok(document.querySelector("#pe-popup"));
    assert.equal(document.activeElement, support);
    assert.equal(opened, 0);
    support.click();
    assert.equal(document.querySelector("#pe-support-dialog").open, true);
    trigger.click();
    assert.equal(document.querySelector("#pe-support-dialog"), null);
    assert.equal(document.querySelector("#pe-popup"), null);
    assert.equal(opened, 0);
  } finally { env.window.close(); }
});

const freshnessCard = '<body><ytd-rich-item-renderer><div><a href="/watch?v=one">Video</a><a href="/@alpha">Alpha</a><div id="metadata-line"></div></div></ytd-rich-item-renderer></body>';
const acquiredChannel = { channelId: "UCalpha", name: "Alpha", claims: [{ type: "acquisition", status: "confirmed", firm: { name: "Firm" } }] };

test("expired browse records refresh and remove stale filtering after a claim is withdrawn", async () => {
  let lookups = 0;
  let result = { kind: "found", value: acquiredChannel };
  const env = environment({ url: "https://www.youtube.com/", html: freshnessCard, lookup: () => { lookups++; return result; }, settings: { hideConfirmedAcquisitions: true } });
  try {
    await waitForWork();
    assert.ok(env.window.document.querySelector(".pe-card-filtered"));
    assert.equal(lookups, 1);
    result = { kind: "independent" };
    const now = env.window.Date.now();
    env.window.Date.now = () => now + 5 * 60_000 + 1;
    env.window.dispatchEvent(new env.window.Event("yt-navigate-finish"));
    await waitForWork();
    assert.equal(lookups, 2);
    assert.equal(env.window.document.querySelector(".pe-card-filtered, .pe-ownership-badge"), null);
  } finally { env.window.close(); }
});

test("browse results respect the background deadline rather than starting a second five-minute TTL", async () => {
  let lookups = 0;
  const deadline = Date.now() + 60_000;
  const env = environment({ url: "https://www.youtube.com/", html: freshnessCard, lookup: () => { lookups++; return { kind: "found", value: acquiredChannel, expiresAt: lookups === 1 ? deadline : deadline + 5 * 60_000 }; } });
  try {
    await waitForWork();
    assert.equal(lookups, 1);
    env.window.Date.now = () => deadline + 1;
    env.window.dispatchEvent(new env.window.Event("yt-navigate-finish"));
    await waitForWork();
    assert.equal(lookups, 2);
  } finally { env.window.close(); }
});

test("a saved pause is honored and pausing removes existing presentation", async () => {
  let lookups = 0;
  const env = environment({ url: "https://www.youtube.com/", html: freshnessCard, lookup: () => { lookups++; return { kind: "found", value: acquiredChannel }; }, settings: { ownershipLookupsEnabled: false, hideConfirmedAcquisitions: true } });
  try {
    await waitForWork();
    assert.equal(lookups, 0);
    env.changeSettings({ ownershipLookupsEnabled: true });
    await waitForWork();
    assert.equal(lookups, 1);
    assert.ok(env.window.document.querySelector(".pe-card-filtered"));
    env.changeSettings({ ownershipLookupsEnabled: false });
    await waitForWork();
    assert.equal(env.window.document.querySelector(".pe-card-filtered, .pe-ownership-badge"), null);
    assert.equal(lookups, 1);
  } finally { env.window.close(); }
});

test("a fresh profile shows the emoji and ownership records without setup", async () => {
  let lookups = 0;
  const env = environment({
    url: "https://www.youtube.com/watch?v=one",
    html: '<body><ytd-watch-metadata><div id="owner"><a href="/@alpha">Alpha</a></div></ytd-watch-metadata></body>',
    settings: { ownershipLookupsEnabled: undefined },
    lookup: () => { lookups++; return { kind: "found", value: acquiredChannel }; }
  });
  try {
    await waitForWork();
    assert.equal(lookups, 1);
    assert.ok(env.window.document.querySelector("#pe-check-button"));
    assert.ok(env.window.document.querySelector("#pe-ping"));
  } finally { env.window.close(); }
});

test("pausing lookups ignores a pending watch lookup and keeps a discoverable paused control", async () => {
  let finish;
  const env = environment({ url: "https://www.youtube.com/watch?v=one", html: '<body><ytd-watch-metadata><div id="owner"><a href="/@alpha">Alpha</a></div></ytd-watch-metadata></body>', lookup: () => new Promise(resolve => { finish = resolve; }) });
  try {
    await waitForWork();
    assert.ok(env.window.document.querySelector("#pe-check-button"));
    env.changeSettings({ ownershipLookupsEnabled: false });
    finish({ kind: "found", value: acquiredChannel });
    await waitForWork();
    assert.equal(env.window.document.querySelector("#pe-popup, #pe-ping"), null);
    const button = env.window.document.querySelector("#pe-check-button");
    assert.equal(button.textContent, "🧐");
    button.click();
    assert.match(env.window.document.querySelector("#pe-popup").textContent, /Ownership lookups are paused/);
  } finally { env.window.close(); }
});

test("paused emoji explains lookups and enables ownership without requiring a page reload", async () => {
  let lookups = 0;
  const saved = [];
  const env = environment({
    url: "https://www.youtube.com/watch?v=one",
    html: '<body><ytd-watch-metadata><div id="owner"><a href="/@alpha">Alpha</a></div></ytd-watch-metadata></body>',
    settings: { ownershipLookupsEnabled: false },
    saveSettings: async value => saved.push(value),
    lookup: () => { lookups++; return { kind: "found", value: acquiredChannel }; }
  });
  try {
    await waitForWork();
    const { document } = env.window;
    document.querySelector("#pe-check-button").click();
    assert.equal(lookups, 0);
    assert.match(document.querySelector("#pe-popup").textContent, /channel IDs/);
    document.querySelector(".pe-record-button").click();
    await waitForWork();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].ownershipLookupsEnabled, true);
    assert.equal(lookups, 1);
    assert.ok(document.querySelector("#pe-ping"));
    document.querySelector("#pe-check-button").click();
    assert.match(document.querySelector("#pe-popup").textContent, /Acquired by/);
  } finally { env.window.close(); }
});

test("failed enable keeps the paused popup usable and allows retry", async () => {
  let fail = true;
  let lookups = 0;
  const env = environment({
    url: "https://www.youtube.com/@alpha/videos",
    html: '<body><yt-page-header-renderer><h1 class="dynamic-text-view-model-wiz__h1">Alpha</h1></yt-page-header-renderer></body>',
    settings: { ownershipLookupsEnabled: false },
    saveSettings: async () => { if (fail) throw Error("unavailable"); },
    lookup: () => { lookups++; return { kind: "independent" }; }
  });
  try {
    await waitForWork();
    const { document } = env.window;
    document.querySelector("#pe-check-button").click();
    const enable = document.querySelector(".pe-record-button");
    enable.click();
    await waitForWork();
    assert.equal(lookups, 0);
    assert.equal(enable.disabled, false);
    assert.match(document.querySelector('[role="status"]').textContent, /Couldn’t enable/);
    fail = false;
    enable.click();
    await waitForWork();
    assert.equal(lookups, 1);
    assert.ok(document.querySelector("#pe-check-button"));
  } finally { env.window.close(); }
});


test("paused channel control enables lookups only after an explicit successful consent write", async () => {
  let lookups = 0;
  let fail = true;
  const env = environment({
    url: "https://www.youtube.com/watch?v=one",
    html: '<body><ytd-watch-metadata><div id="owner"><a href="/@alpha">Alpha</a></div></ytd-watch-metadata></body>',
    settings: { ownershipLookupsEnabled: false },
    lookup: () => { lookups++; return { kind: "found", value: acquiredChannel }; },
    saveSettings: async () => { if (fail) throw Error("Unavailable"); }
  });
  try {
    await waitForWork();
    assert.equal(lookups, 0);
    env.window.document.querySelector("#pe-check-button").click();
    const dialog = env.window.document.querySelector("#pe-popup");
    assert.match(dialog.textContent, /Sends channel IDs to YT Equity/);
    const enable = dialog.querySelector("button.pe-record-button");
    enable.click();
    await waitForWork();
    assert.equal(lookups, 0);
    assert.equal(enable.disabled, false);
    assert.match(dialog.querySelector('[role="status"]').textContent, /Couldn’t enable lookups/);
    fail = false;
    enable.click();
    await waitForWork();
    assert.equal(lookups, 1);
    assert.ok(env.window.document.querySelector("#pe-ping"));
  } finally { env.window.close(); }
});

test("encoded Unicode card handles are normalized before crossing the lookup boundary", async () => {
  const calls = [];
  const env = environment({
    url: "https://www.youtube.com/",
    html: '<ytd-rich-item-renderer><a href="/watch?v=unicode123">Video</a><div id="metadata-line"><a href="/@caf%C3%A9">Café</a></div></ytd-rich-item-renderer>',
    lookup: identifier => { calls.push(identifier); return { kind: "found", value: { channelId: "UCunicode", name: "Café", claims: [{ type: "funding", status: "confirmed" }] } }; },
  });
  try {
    await waitForWork();
    assert.deepEqual(calls, ["@café"]);
    env.window.document.querySelector(".pe-ownership-badge").click();
    assert.equal(env.window.document.querySelector(".pe-record-button").getAttribute("href"), "https://web.example/channels/%40caf%C3%A9");
  } finally { env.dom.window.close(); }
});
