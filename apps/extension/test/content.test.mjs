import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const contentScript = await readFile(new URL("../content.js", import.meta.url), "utf8");

function waitForWork() {
  return new Promise((resolve) => setTimeout(resolve, 180));
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
          return message.identifiers.map((identifier) => ({ identifier, result: lookup(identifier) }));
        }
        return lookup(message.identifier);
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

test("popup stays in viewport near edges and dismisses when its anchor scrolls out", async () => {
  const env = environment({
    url: "https://www.youtube.com/watch?v=one",
    html: `<body><ytd-watch-metadata><div id="owner"><a href="/@alpha">Alpha</a></div></ytd-watch-metadata></body>`,
    lookup: () => ({ kind: "independent" })
  });
  try {
    await waitForWork();
    const { document } = env.window;
    const trigger = document.querySelector("#pe-check-button");
    Object.defineProperty(env.window, "innerWidth", { value: 360 });
    Object.defineProperty(env.window, "innerHeight", { value: 240 });
    trigger.getBoundingClientRect = () => ({ top: 200, bottom: 236, left: 330, right: 350 });
    trigger.click();
    const popup = document.querySelector("#pe-popup");
    popup.getBoundingClientRect = () => ({ width: 320, height: 216 });
    env.window.dispatchEvent(new env.window.Event("resize"));
    assert.equal(popup.style.top, "12px");
    assert.equal(popup.style.left, "28px");
    // The anchor is partly visible, but the preferred position would be negative.
    trigger.getBoundingClientRect = () => ({ top: -30, bottom: 6, left: 330, right: 350 });
    env.window.dispatchEvent(new env.window.Event("scroll"));
    assert.equal(popup.style.top, "12px");
    trigger.getBoundingClientRect = () => ({ top: -100, bottom: -64, left: 330, right: 350 });
    env.window.dispatchEvent(new env.window.Event("scroll"));
    assert.equal(document.querySelector("#pe-popup"), null);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
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
  assert.equal(card.querySelector(".pe-ownership-badge")?.textContent, "🧐Acquired by Example Capital");
  const annotation = card.querySelector(".pe-ownership-badge");
  assert.equal(annotation.querySelector(".pe-ownership-emoji").getAttribute("aria-hidden"), "true");
  assert.equal(annotation.querySelector(".pe-ownership-label").textContent, "Acquired by Example Capital");
  assert.equal(annotation.title, "Open Acquired by Example Capital details in YT Equity");
  assert.equal(annotation.getAttribute("aria-label"), annotation.title);
  assert.equal(annotation.href, "https://web.example/channels/%40alpha");
  assert.equal(annotation.target, "_blank");
  assert.equal(annotation.rel, "noreferrer");
  let cardClicks = 0;
  card.addEventListener("click", () => cardClicks++);
  annotation.addEventListener("click", (event) => event.preventDefault());
  annotation.click();
  assert.equal(cardClicks, 0);
  assert.equal(card.classList.contains("pe-card-filtered"), false);

  env.changeSetting(true);
  assert.equal(card.classList.contains("pe-card-filtered"), true);
  assert.match(card.querySelector(".pe-filter-placeholder")?.textContent ?? "", /Confirmed acquisition by Example Capital/);

  card.querySelector(".pe-filter-placeholder button").click();
  assert.equal(card.classList.contains("pe-card-filtered"), false);
  assert.equal(card.querySelector(".pe-ownership-badge")?.textContent, "🧐Acquired by Example Capital");
  env.dom.window.close();
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
  assert.equal(metadata.querySelector(".pe-ownership-badge")?.textContent, "🧐Funded by Spotter");
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

  assert.equal(env.window.document.querySelector("ytd-rich-item-renderer .pe-ownership-badge")?.textContent, "🧐Acquired by Example Capital");
  env.dom.window.close();
});

for (const type of ["acquisition", "funding"]) {
  test(`annotation describes ${type} with an undisclosed firm`, async () => {
    const env = environment({
      url: "https://www.youtube.com/",
      html: `<body><ytd-compact-video-renderer><a href="/watch?v=one">Video</a><div id="channel-name"><a href="/@alpha">Alpha</a></div></ytd-compact-video-renderer></body>`,
      lookup: () => ({ kind: "found", value: {
        name: "Alpha", claims: [{ id: "claim-1", type, status: "confirmed" }]
      } })
    });
    await waitForWork();
    const annotation = env.window.document.querySelector(".pe-ownership-badge");
    const label = `${type === "acquisition" ? "Acquired" : "Funded"} by an undisclosed firm`;
    assert.equal(annotation.querySelector(".pe-ownership-label").textContent, label);
    assert.equal(annotation.title, `Open ${label} details in YT Equity`);
    assert.equal(annotation.getAttribute("aria-label"), annotation.title);
    env.dom.window.close();
  });
}

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
    assert.equal(card.classList.contains("pe-card-filtered"), false);
    env.dom.window.close();
  }
});

for (const scenario of [
  { name: "published record", result: { kind: "found", value: {
    name: "Alpha", claims: [{ id: "claim-1", type: "acquisition", status: "confirmed", firm: { id: "firm-1", name: "Example Capital" } }]
  } }, text: "Acquired by Example Capital", icons: ["close", "link"] },
  { name: "no published record", result: { kind: "independent" }, text: "No published ownership record", icons: ["close", "link"] },
  { name: "empty published claims", result: { kind: "found", value: { name: "Alpha", claims: [] } }, text: "No published ownership record", icons: ["close", "link"] },
  { name: "unavailable", result: { kind: "unavailable" }, text: "Unable to reach YT Equity right now", icons: ["close", "error"] }
]) {
  test(`popup uses inline artwork and working controls for ${scenario.name}`, async () => {
    const env = environment({
      url: "https://www.youtube.com/watch?v=one",
      html: `<body><ytd-watch-metadata><div id="owner"><a href="/@alpha">Alpha</a></div></ytd-watch-metadata></body>`,
      lookup: () => scenario.result
    });
    try {
      await waitForWork();
      const { document } = env.window;
      const button = document.querySelector("#pe-check-button");
      button.click();
      const popup = document.querySelector("#pe-popup");
      assert.ok(popup.textContent.includes(scenario.text));
      assert.doesNotMatch(popup.textContent, /Ownership record:|Confirmed acquisition|Status:/);
      assert.equal(popup.querySelectorAll("li").length, 1);
      assert.equal(popup.querySelector("img, use, image"), null, "popup must not request external icon resources");
      const icons = [...popup.querySelectorAll("svg:not(.pe-support-button svg)")];
      assert.equal(icons.length, scenario.icons.length);
      for (const [index, icon] of icons.entries()) {
        const artwork = await readFile(new URL(`../icons/${scenario.icons[index]}.svg`, import.meta.url), "utf8");
        assert.equal(icon.namespaceURI, "http://www.w3.org/2000/svg");
        assert.equal(icon.getAttribute("viewBox"), "0 -960 960 960");
        assert.equal(icon.getAttribute("fill"), "currentColor");
        assert.equal(icon.getAttribute("aria-hidden"), "true");
        assert.equal(icon.getAttribute("focusable"), "false");
        assert.equal(icon.querySelector("path").getAttribute("d"), artwork.match(/<path d="([^"]+)"/)[1]);
      }
      for (const link of popup.querySelectorAll("a")) {
        assert.equal(link.target, "_blank");
        assert.equal(link.rel, "noreferrer");
      }
      assert.equal(popup.querySelector(".pe-popup-footer, .pe-action-link, .pe-action-tooltip"), null);
      if (scenario.result.kind !== "unavailable") {
        const recordButton = popup.querySelector(":scope > .pe-record-button");
        assert.equal(recordButton.href, "https://web.example/channels/%40alpha");
        assert.equal(recordButton.textContent, scenario.name === "published record" ? "View full record" : "View channel on YT Equity");
        assert.equal(popup.querySelector("ul .pe-popup-footer, ul .pe-record-button"), null);
        const support = popup.querySelector(":scope > .pe-support-button");
        assert.equal(recordButton.nextElementSibling, support);
        assert.equal(support.href, "https://www.youtube.com/watch?v=WNGNhItoRh8#yt-equity-thanks");
        assert.ok(support.textContent.startsWith("Buy me a coffee"));
        assert.equal(support.querySelector("svg").getAttribute("aria-hidden"), "true");
        const tooltip = document.getElementById(support.getAttribute("aria-describedby"));
        assert.equal(tooltip.getAttribute("role"), "tooltip");
        assert.equal(tooltip.textContent, "Leave a tip");
        assert.equal(support.hasAttribute("title"), false);

      }
      if (scenario.result.kind === "unavailable") {
        assert.equal(popup.querySelector(".pe-record-button, .pe-support-button, .pe-popup-footer"), null);
      }
      if (scenario.name === "published record") {
        assert.equal(popup.querySelector("li a").href, "https://web.example/firms/firm-1");
      }
      popup.querySelector('button[aria-label="Close YT Equity details"]').click();
      assert.equal(document.querySelector("#pe-popup"), null);
      assert.equal(button.classList.contains("button-active"), false);
      env.window.history.pushState({}, "", "/watch?v=two");
      env.window.dispatchEvent(new env.window.Event("yt-navigate-finish"));
      await waitForWork();
      document.querySelector("#pe-check-button").click();
      assert.equal(document.querySelectorAll("#pe-popup").length, 1);
      assert.equal(document.querySelector("#pe-popup img"), null);
    } finally {
      env.dom.window.close();
    }
  });
}

for (const dark of [false, true]) {
  test(`reports YouTube's ${dark ? "dark" : "light"} root theme without changing the page`, () => {
    const env = environment({ url: "https://www.youtube.com/", html: "<body></body>", lookup: () => ({ kind: "independent" }) });
    env.window.document.documentElement.toggleAttribute("dark", dark);
    let response;
    env.message({ type: "yt-equity:get-theme" }, (value) => { response = value; });
    assert.equal(response.theme, dark ? "dark" : "light");
    assert.equal(env.window.document.documentElement.hasAttribute("dark"), dark);
    let replied = false;
    env.message({ type: "unrelated" }, () => { replied = true; });
    assert.equal(replied, false);
    env.dom.window.close();
  });
}

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
  ...["provisional", "disputed", "rejected"].map(status => ({ name: status, claims: [{ id: "hidden", type: "acquisition", status, firm: { name: "Hidden" } }], text: "No published ownership record" }))
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
      assert.equal(card.classList.contains("pe-card-filtered"), false);
    } finally { env.window.close(); }
  });
}

test("loading popup resolves in place to a confirmed finding", async () => {
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
    assert.equal(popup.querySelector(".pe-popup-footer, .pe-record-button"), null);
    resolveLookup({ kind: "found", value: { name: "Alpha", claims: [{ id: "one", type: "funding", status: "confirmed", firm: { name: "Spotter" } }] } });
    await waitForWork();
    assert.equal(document.querySelector("#pe-popup"), popup);
    assert.equal(popup.querySelector(".pe-finding").textContent, "Funded by Spotter");
    assert.ok(popup.querySelector(".pe-record-button"));
    assert.equal(popup.querySelector(".pe-popup-footer"), null);
    assert.equal(document.activeElement, popup.querySelector("#pe-popup-close"), "lookup completion must preserve keyboard focus");
  } finally { env.window.close(); }
});


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
      assert.equal(cards[0].classList.contains("pe-card-filtered"), key !== "filterSubscriptions");
      env.changeSettings({ [key]: true });
      assert.equal(cards[0].classList.contains("pe-card-filtered"), true);
      if (key === "filterSuggested") assert.equal(cards[1].classList.contains("pe-card-filtered"), false);
      env.changeSettings({ [key]: false });
      assert.equal(cards[0].classList.contains("pe-card-filtered"), false);
      assert.ok(cards[0].querySelector(".pe-ownership-badge"));
    } finally { env.window.close(); }
  });
}
for (const path of ["/@alpha/videos", "/channel/UCalpha", "/playlist?list=one", "/shorts/one", "/feed/trending"]) {
  test(`does not filter unsupported location ${path}`, async () => {
    const env = filterEnvironment({ path, settings: { hideConfirmedAcquisitions: true, hideConfirmedFunding: true } });
    try { await waitForWork(); assert.equal(env.window.document.querySelector(".pe-card-filtered"), null); }
    finally { env.window.close(); }
  });
}
for (const [name, claims, settings, reason] of [
  ["defaults", [acquisition, funding], {}, null],
  ["acquisition only", [acquisition], { hideConfirmedAcquisitions: true }, "Confirmed acquisition by Owner"],
  ["funding only", [funding], { hideConfirmedFunding: true }, "Confirmed funding by Funder"],
  ["funding excluded", [funding], { hideConfirmedAcquisitions: true }, null],
  ["acquisition excluded", [acquisition], { hideConfirmedFunding: true }, null],
  ["mixed funding", [acquisition, funding], { hideConfirmedFunding: true }, "Confirmed funding by Funder"],
  ["mixed both", [funding, acquisition], { hideConfirmedAcquisitions: true, hideConfirmedFunding: true }, "Confirmed acquisition by Owner"],
  ["undisclosed funding", [{ type: "funding", status: "confirmed" }], { hideConfirmedFunding: true }, "Confirmed funding"],
  ...["provisional", "disputed", "rejected"].map(status => [status, [{ ...acquisition, status }, { ...funding, status }], { hideConfirmedAcquisitions: true, hideConfirmedFunding: true }, null])
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
    assert.equal(card.classList.contains("pe-card-filtered"), false);
    async function navigate(path) {
      env.window.history.pushState({}, "", path);
      env.window.dispatchEvent(new env.window.Event("yt-navigate-finish"));
      await waitForWork();
    }
    await navigate("/results?search_query=alpha");
    assert.equal(card.classList.contains("pe-card-filtered"), true);
    await navigate("/feed/subscriptions");
    assert.equal(card.classList.contains("pe-card-filtered"), false);
    await navigate("/");
    assert.equal(card.classList.contains("pe-card-filtered"), true);
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
    assert.equal(dialog.querySelector("h2").textContent, "Leave a tip");
    assert.equal(dialog.querySelector("#pe-support-description").textContent, "Leave a tip with YouTube Super Thanks. This will open a YouTube video in a new tab, where you enter the amount to tip.");
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
