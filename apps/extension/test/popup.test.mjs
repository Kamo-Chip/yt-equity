import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const html = await readFile(new URL("../popup.html", import.meta.url), "utf8");
const shared = await readFile(new URL("../shared.js", import.meta.url), "utf8");
const script = shared + await readFile(new URL("../popup.js", import.meta.url), "utf8");
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

const defaults = { hideConfirmedAcquisitions: false, hideConfirmedFunding: false, filterHome: true, filterSearch: true, filterSuggested: true, filterSubscriptions: false };
test("settings load defaults and persist each control independently", async () => {
  const writes = [];
  const env = environment({ set: async value => writes.push({ ...value }) });
  try {
    assert.ok([...env.document.querySelectorAll('input[role="switch"]')].every(input => input.disabled));
    await settle();
    assert.equal(writes.length, 0);
    for (const [key, expected] of Object.entries(defaults)) {
      const toggle = env.document.querySelector(`[data-setting="${key}"]`);
      assert.equal(toggle.checked, expected);
      toggle.click();
      assert.equal(toggle.disabled, true);
      await settle();
      toggle.click();
      await settle();
      assert.deepEqual(writes.splice(0), [{ [key]: !expected }, { [key]: expected }]);
    }
  } finally { env.dom.window.close(); }
});

test("a failed settings write restores the saved value and permits retry", async () => {
  let fail = true;
  const env = environment({
    get: async () => ({ hideConfirmedFunding: true }),
    set: async () => { if (fail) throw Error("unavailable"); },
  });
  try {
    await settle();
    const toggle = env.document.querySelector('[data-setting="hideConfirmedFunding"]');
    toggle.click();
    await settle();
    assert.equal(toggle.checked, true);
    assert.equal(toggle.disabled, false);
    assert.equal(env.document.querySelector('[role="status"]').textContent, "Couldn’t save. Try again.");
    fail = false;
    toggle.click();
    await settle();
    assert.equal(toggle.checked, false);
    assert.equal(env.document.querySelector('[role="status"]').textContent, "");
  } finally { env.dom.window.close(); }
});
test("all six controls wait for storage and remain disabled on read failure", async () => {
  const env = environment({ get: async () => { throw Error("unavailable"); } });
  try {
    await settle();
    const toggles = [...env.document.querySelectorAll('input[role="switch"]')];
    assert.equal(toggles.length, 6);
    assert.ok(toggles.every(toggle => toggle.disabled && env.document.querySelector(`label[for="${toggle.id}"]`)));
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
    assert.equal(env.document.getElementById(dialog.getAttribute("aria-labelledby")).textContent, "Keep lights on");
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
