const extensionApi = globalThis.browser ?? globalThis.chrome;
const FILTER_DEFAULTS = {
  hideConfirmedAcquisitions: false,
  hideConfirmedFunding: false,
  filterHome: true,
  filterSearch: true,
  filterSuggested: true,
  filterSubscriptions: false
};
const toggles = [...document.querySelectorAll("input[data-setting]")];
const error = document.querySelector("#setting-error");
const info = document.querySelector("#filter-info");
const help = document.querySelector("#filter-help");
const savedSettings = { ...FILTER_DEFAULTS };
const support = document.querySelector(".support-link");
const supportDialog = document.querySelector("#support-dialog");
const supportContinue = document.querySelector("#support-continue");
const supportError = document.querySelector("#support-error");
let openingSupport = false;
support.addEventListener("click", event => {
  event.preventDefault();
  if (supportDialog.open) return;
  supportError.textContent = "";
  supportDialog.showModal();
});
document.querySelector("#support-cancel").addEventListener("click", () => supportDialog.close());
supportDialog.addEventListener("close", () => support.focus());
supportContinue.addEventListener("click", async () => {
  if (openingSupport || !supportDialog.open) return;
  openingSupport = true;
  supportContinue.disabled = true;
  supportError.textContent = "";
  try {
    await extensionApi.tabs.create({
      url: support.href,
      active: true
    });
    supportDialog.close();
  } catch {
    supportError.textContent = "Couldn’t open support tab. Try again.";
  } finally {
    openingSupport = false;
    supportContinue.disabled = false;
  }
});

info.addEventListener("click", () => {
  const expanded = info.getAttribute("aria-expanded") !== "true";
  info.setAttribute("aria-expanded", String(expanded));
  help.hidden = !expanded;
});

async function readSetting() {
  try {
    const value = await extensionApi.storage.local.get(FILTER_DEFAULTS);
    for (const toggle of toggles) {
      const key = toggle.dataset.setting;
      savedSettings[key] = Boolean(value[key] ?? FILTER_DEFAULTS[key]);
      toggle.checked = savedSettings[key];
      toggle.disabled = false;
    }
  } catch {
    error.textContent = "Setting unavailable.";
  }
}

for (const toggle of toggles) toggle.addEventListener("change", async () => {
  const key = toggle.dataset.setting;
  const nextSetting = toggle.checked;
  toggle.disabled = true;
  error.textContent = "";
  try {
    await extensionApi.storage.local.set({ [key]: nextSetting });
    savedSettings[key] = nextSetting;
  } catch {
    toggle.checked = savedSettings[key];
    error.textContent = "Couldn’t save. Try again.";
  } finally {
    toggle.disabled = false;
  }
});

async function readTheme() {
  try {
    const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) return;
    const response = await extensionApi.tabs.sendMessage(tab.id, { type: "yt-equity:get-theme" });
    if (response?.theme === "light" || response?.theme === "dark") {
      document.documentElement.dataset.theme = response.theme;
    }
  } catch {
    // CSS follows the system theme when the active tab has no content script.
  }
}

readSetting();
readTheme();
