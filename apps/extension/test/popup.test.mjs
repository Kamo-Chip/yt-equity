import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const html = await readFile(new URL("../popup.html", import.meta.url), "utf8");
const script = await readFile(new URL("../popup.js", import.meta.url), "utf8");
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
function environment({ get = async () => ({}), set = async () => {}, tabs, firefox = false } = {}) {
  const dom = new JSDOM(html, { url: "https://extension.example/popup.html", runScripts: "outside-only" });
  dom.window[firefox ? "browser" : "chrome"] = { storage: { local: { get, set } }, tabs };
  // JSDOM has no modal dialog implementation. Native keyboard/focus behavior
  // is checked separately in a browser; these shims exercise our event wiring.
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
    this.querySelector("[autofocus]")?.focus();
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new dom.window.Event("close"));
  };
  dom.window.eval(script);
  return { dom, document: dom.window.document, toggle: dom.window.document.querySelector("#hide-acquisitions") };
}

for (const enabled of [false, true]) {
  test(`loads ${enabled} and persists both toggle directions`, async () => {
    const writes = [];
    const env = environment({
      get: async (defaults) => { assert.equal(defaults.hideConfirmedAcquisitions, false); return { hideConfirmedAcquisitions: enabled }; },
      set: async (value) => writes.push(value.hideConfirmedAcquisitions),
      firefox: enabled
    });
    assert.equal(env.toggle.disabled, true);
    await settle();
    assert.equal(env.toggle.checked, enabled);
    assert.equal(env.toggle.disabled, false);
    env.toggle.click();
    assert.equal(env.toggle.disabled, true);
    await settle();
    env.toggle.click();
    await settle();
    assert.deepEqual(writes, [!enabled, enabled]);
    env.dom.window.close();
  });
}

test("defaults off and keeps the control disabled while reading", async () => {
  let finish;
  const env = environment({ get: () => new Promise((resolve) => { finish = resolve; }) });
  assert.equal(env.toggle.disabled, true);
  finish({});
  await settle();
  assert.equal(env.toggle.checked, false);
  assert.equal(env.toggle.disabled, false);
  env.dom.window.close();
});

test("read failure leaves the filter disabled with a concise error", async () => {
  const env = environment({ get: async () => { throw Error("unavailable"); } });
  await settle();
  assert.equal(env.toggle.disabled, true);
  assert.equal(env.document.querySelector('[role="status"]').textContent, "Setting unavailable.");
  env.dom.window.close();
});

for (const enabled of [false, true]) {
  test(`save failure restores ${enabled} and permits retry`, async () => {
    let fail = true;
    const env = environment({ get: async () => ({ hideConfirmedAcquisitions: enabled }), set: async () => { if (fail) throw Error("unavailable"); } });
    await settle();
    env.toggle.click();
    await settle();
    assert.equal(env.toggle.checked, enabled);
    assert.equal(env.toggle.disabled, false);
    assert.equal(env.document.querySelector('[role="status"]').textContent, "Couldn’t save. Try again.");
    fail = false;
    env.toggle.click();
    await settle();
    assert.equal(env.toggle.checked, !enabled);
    assert.equal(env.document.querySelector('[role="status"]').textContent, "");
    env.dom.window.close();
  });
}

test("help starts collapsed and toggles with an accessible button", () => {
  const env = environment();
  const info = env.document.querySelector("#filter-info");
  const help = env.document.getElementById(info.getAttribute("aria-controls"));
  assert.equal(info.tagName, "BUTTON");
  assert.equal(help.hidden, true);
  info.click();
  assert.equal(info.getAttribute("aria-expanded"), "true");
  assert.equal(help.hidden, false);
  info.click();
  assert.equal(info.getAttribute("aria-expanded"), "false");
  assert.equal(help.hidden, true);
  assert.equal(env.document.querySelectorAll("a").length, 4);
  const support = env.document.querySelector('.support-link');
  assert.equal(support.tagName, "A");
  assert.equal(support.getAttribute("href"), "https://www.youtube.com/watch?v=WNGNhItoRh8#yt-equity-thanks");
  assert.equal(support.target, "_blank");
  assert.equal(support.getAttribute("aria-label"), "Leave a tip");
  const actionLinks = [...env.document.querySelectorAll(".popup-actions a")];
  assert.deepEqual(actionLinks.map((anchor) => anchor.getAttribute("href")), ["__WEB_URL__/report", "__WEB_URL__/"]);
  assert.deepEqual(actionLinks.map((anchor) => anchor.textContent.trim()), ["Report", "Website"]);
  assert.equal(env.document.querySelector("footer a").textContent, "Privacy policy");
  assert.equal(env.document.querySelector('[role="tooltip"]'), null);
  assert.ok(actionLinks.every((anchor) => anchor.target === "_blank" && anchor.rel.includes("noreferrer")));
  env.dom.window.close();
});

for (const theme of ["light", "dark"]) {
  test(`reads ${theme} from the active tab`, async () => {
    const env = environment({ tabs: {
      query: async (options) => { assert.equal(options.active, true); assert.equal(options.currentWindow, true); return [{ id: 7 }]; },
      sendMessage: async (id, message) => { assert.equal(id, 7); assert.equal(message.type, "yt-equity:get-theme"); return { theme }; }
    } });
    await settle();
    assert.equal(env.document.documentElement.dataset.theme, theme);
    env.dom.window.close();
  });
}

for (const tabs of [undefined, { query: async () => [] }, { query: async () => [{ id: 1 }], sendMessage: async () => { throw Error("No receiver"); } }, { query: async () => [{ id: 1 }], sendMessage: async () => ({ theme: "invalid" }) }]) {
  test("leaves CSS system-theme fallback when the tab cannot provide a theme", async () => {
    const env = environment({ tabs });
    await settle();
    assert.equal(env.document.documentElement.hasAttribute("data-theme"), false);
    assert.equal(env.toggle.disabled, false);
    env.dom.window.close();
  });
}

const defaults = { hideConfirmedAcquisitions: false, hideConfirmedFunding: false, filterHome: true, filterSearch: true, filterSuggested: true, filterSubscriptions: false };
for (const [key, expected] of Object.entries(defaults)) {
  test(`${key} loads defaults and saves only itself in both directions`, async () => {
    const writes = [];
    const env = environment({ get: async value => { assert.deepEqual({ ...value }, { ...defaults }); return {}; }, set: async value => writes.push({ ...value }) });
    try {
      const toggle = env.document.querySelector(`[data-setting="${key}"]`);
      assert.equal(toggle.disabled, true);
      await settle();
      assert.equal(toggle.checked, expected);
      toggle.click();
      assert.equal(toggle.disabled, true);
      assert.ok([...env.document.querySelectorAll("input")].filter(input => input !== toggle).every(input => !input.disabled));
      await settle();
      toggle.click();
      await settle();
      assert.deepEqual(writes, [{ [key]: !expected }, { [key]: expected }]);
    } finally { env.dom.window.close(); }
  });
  test(`${key} restores saved preference after a failed write`, async () => {
    const env = environment({ get: async () => ({ [key]: !expected }), set: async () => { throw Error("unavailable"); } });
    try {
      await settle();
      const toggle = env.document.querySelector(`[data-setting="${key}"]`);
      assert.equal(toggle.checked, !expected);
      toggle.click();
      await settle();
      assert.equal(toggle.checked, !expected);
      assert.equal(toggle.disabled, false);
      assert.equal(env.document.querySelector('[role="status"]').textContent, "Couldn’t save. Try again.");
    } finally { env.dom.window.close(); }
  });
}
test("all six controls wait for storage and remain disabled on read failure", async () => {
  const env = environment({ get: async () => { throw Error("unavailable"); } });
  try {
    await settle();
    const toggles = [...env.document.querySelectorAll('input[role="switch"]')];
    assert.equal(toggles.length, 6);
    assert.ok(toggles.every(toggle => toggle.disabled && env.document.querySelector(`label[for="${toggle.id}"]`)));
    assert.deepEqual([...env.document.querySelectorAll("legend")].map(el => el.textContent), ["Hide channels", "Where to hide"]);
  } finally { env.dom.window.close(); }
});

for (const firefox of [false, true]) {
  test(`support asks before opening a tab (${firefox ? "Firefox" : "Chrome"})`, async () => {
    const opened = [];
    const env = environment({ firefox, tabs: { create: async options => { opened.push({ ...options }); } } });
    const link = env.document.querySelector(".support-link");
    const dialog = env.document.querySelector("#support-dialog");
    assert.equal(dialog.open, false);
    const click = new env.dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    assert.equal(click.defaultPrevented, true);
    assert.equal(dialog.open, true);
    assert.equal(opened.length, 0);
    assert.equal(env.document.activeElement.id, "support-cancel");
    assert.equal(env.document.getElementById(dialog.getAttribute("aria-labelledby")).textContent, "Leave a tip");
    assert.equal(env.document.getElementById(dialog.getAttribute("aria-describedby")).textContent, "Leave a tip with YouTube Super Thanks. This will open a YouTube video in a new tab, where you enter the amount to tip.");
    env.document.querySelector("#support-continue").click();
    await settle();
    assert.deepEqual(opened, [{ url: "https://www.youtube.com/watch?v=WNGNhItoRh8#yt-equity-thanks", active: true }]);
    assert.equal(dialog.open, false);
    env.dom.window.close();
  });
}

test("Cancel closes the dialog, restores coffee focus, and asks again next time", () => {
  let opened = 0;
  const env = environment({ tabs: { create: async () => { opened++; } } });
  const link = env.document.querySelector(".support-link");
  const dialog = env.document.querySelector("#support-dialog");
  for (let i = 0; i < 2; i++) {
    link.click();
    assert.equal(dialog.open, true);
    env.document.querySelector("#support-cancel").click();
    assert.equal(dialog.open, false);
    assert.equal(env.document.activeElement, link);
  }
  env.document.querySelector("#support-continue").click();
  assert.equal(opened, 0);
  env.dom.window.close();
});

test("support prevents duplicate tabs while opening and permits retry inside the dialog", async () => {
  let reject;
  let calls = 0;
  const env = environment({ tabs: { create: () => { calls++; return new Promise((_, fail) => { reject = fail; }); } } });
  await settle();
  const link = env.document.querySelector(".support-link");
  const dialog = env.document.querySelector("#support-dialog");
  const proceed = env.document.querySelector("#support-continue");
  link.click(); link.click();
  assert.equal(calls, 0);
  proceed.click(); proceed.click();
  assert.equal(calls, 1);
  assert.equal(proceed.disabled, true);
  reject(Error("unavailable"));
  await settle();
  assert.equal(proceed.disabled, false);
  assert.equal(dialog.open, true);
  assert.equal(dialog.querySelector('[role="status"]').textContent, "Couldn’t open support tab. Try again.");
  proceed.click();
  assert.equal(calls, 2);
  reject(Error("unavailable"));
  await settle();
  env.document.querySelector("#support-cancel").click();
  link.click();
  assert.equal(env.document.querySelector("#support-error").textContent, "");
  env.dom.window.close();
});

test("popup keeps privacy in the footer without an ownership setup button", async () => {
  const writes = [];
  const env = environment({ set: async value => writes.push(value) });
  try {
    await settle();
    assert.equal(env.document.querySelector("#lookup-consent, .privacy"), null);
    assert.equal(env.document.querySelector("footer a").textContent, "Privacy policy");
    assert.equal(env.document.querySelector("footer a").getAttribute("href"), "__WEB_URL__/privacy");
    assert.equal(writes.length, 0);
  } finally { env.dom.window.close(); }
});
