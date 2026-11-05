ytEquity.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === messages.getTheme) {
    sendResponse({ theme: document.documentElement.hasAttribute("dark") ? "dark" : "light" });
  }
});
function normalizeResponse(response) {
  return YT_EQUITY_SHARED.normalizeResult(response);
}

function removeStaleControls(validWrapper) {
  for (const wrapper of document.querySelectorAll("#pe-check-button-wrapper")) {
    if (wrapper !== validWrapper) wrapper.remove();
  }
}

async function renderChannelControl() {
  const context = currentChannelContext();
  if (!context) {
    renderToken += 1;
    if (!activePopup?.card) closePopup();
    removeStaleControls(null);
    return;
  }

  const existing = [...document.querySelectorAll("#pe-check-button-wrapper")].find((wrapper) =>
    wrapper.isConnected && wrapper.dataset.channelId === context.identifier && wrapper.parentElement === context.host && isVisible(wrapper) &&
    Number(wrapper.dataset.expiresAt) > Date.now());
  removeStaleControls(existing);
  if (existing) return;

  if (!activePopup?.card) closePopup();
  const token = ++renderToken;
  const wrapper = document.createElement("span");
  wrapper.id = "pe-check-button-wrapper";
  wrapper.dataset.channelId = context.identifier;
  wrapper.dataset.expiresAt = String(Date.now() + LOOKUP_TTL);
  const button = document.createElement("button");
  button.id = "pe-check-button";
  button.type = "button";
  button.title = "View YT Equity ownership information";
  button.setAttribute("aria-label", "View YT Equity ownership information");
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.textContent = "🧐";
  let state = lookupsEnabled ? { kind: "loading", message: randomLoadingMessage() } : { kind: "paused" };
  button.addEventListener("click", () => {
    if (activePopup?.button === button) closePopup({ restoreFocus: true });
    else showPopup(button, state, context.identifier);
  });
  wrapper.append(button);
  context.host.append(wrapper);

  if (!lookupsEnabled) return;

  const response = await extensionCall(() => ytEquity.runtime.sendMessage({ type: messages.lookup, identifier: context.identifier })).catch(() => null);
  const latest = currentChannelContext();
  if (token !== renderToken || !wrapper.isConnected || latest?.identifier !== context.identifier || latest.host !== context.host) return;
  state = normalizeResponse(response);
  wrapper.dataset.expiresAt = String(state.expiresAt ?? Date.now() + (state.kind === "unavailable" ? 30_000 : LOOKUP_TTL));
  const easterEgg = state.kind === "found" ? state.value?.easterEgg : undefined;
  button.textContent = easterEgg?.emoji ?? "🧐";
  button.title = easterEgg ? `${easterEgg.emoji} ${easterEgg.message}` : "View YT Equity ownership information";
  button.setAttribute("aria-label", button.title);
  if (activePopup?.button === button) showPopup(button, state, context.identifier);
  syncIndicator(wrapper, state);
}

function reconcile() {
  reconcileTimer = null;
  if (contextRetired) return;
  if (location.href !== lastLocation) {
    lastLocation = location.href;
    revealedCards = new WeakMap();
    closePopup();
    reapplyCards();
  }
  if (activePopup?.card && (!activePopup.button.isConnected || cardIdentity(activePopup.card)?.key !== activePopup.card.dataset.peCardKey)) closePopup();
  renderChannelControl();
  processCards();
}

function scheduleReconcile(delay = 120) {
  if (contextRetired) return;
  clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(reconcile, delay);
}

async function loadSettings() {
  const generation = lookupGeneration;
  const settings = await extensionCall(() => ytEquity.storage.local.get({ ...FILTER_DEFAULTS, ownershipLookupsEnabled: true }));
  if (generation !== lookupGeneration) return;
  lookupsEnabled = settings.ownershipLookupsEnabled !== false;
  for (const key of Object.keys(FILTER_DEFAULTS)) {
    filterSettings[key] = Boolean(settings[key] ?? FILTER_DEFAULTS[key]);
  }
  reapplyCards();
}

function updateLookupSetting(enabled) {
  if (contextRetired) return;
  if (lookupsEnabled !== enabled) {
    lookupsEnabled = enabled;
    lookupGeneration += 1;
    renderToken += 1;
    browseResults.clear();
    browseRetryAt.clear();
    removeStaleControls(null);
    closePopup();
    reapplyCards();
    scheduleReconcile(0);
  }
}

ytEquity.storage.onChanged.addListener((changes, area) => {
  if (contextRetired) return;
  if (area !== "local") return;
  if (changes.ownershipLookupsEnabled) updateLookupSetting(changes.ownershipLookupsEnabled.newValue !== false);
  let changed = false;
  for (const key of Object.keys(FILTER_DEFAULTS)) {
    if (!changes[key]) continue;
    filterSettings[key] = Boolean(changes[key].newValue ?? FILTER_DEFAULTS[key]);
    changed = true;
  }
  if (changed) reapplyCards();
});

for (const eventName of ["yt-navigate-finish", "yt-page-data-updated", "popstate"]) {
  window.addEventListener(eventName, () => scheduleReconcile(0));
}
window.addEventListener("resize", () => {
  if (activePopup) positionPopup(activePopup.element, activePopup.button);
});
window.addEventListener("scroll", () => {
  if (activePopup) positionPopup(activePopup.element, activePopup.button);
}, true);

document.addEventListener("click", (event) => {
  if (activeSupportDialog?.open) return;
  if (activePopup && !activePopup.element.contains(event.target) && !activePopup.button.contains(event.target)) {
    // Let the clicked YouTube control receive focus normally.
    closePopup();
  }
}, true);
document.addEventListener("keydown", (event) => {
  if (activeSupportDialog?.open) {
    if (event.key === "Escape") event.stopPropagation();
    return; // Native modal handles focus and Escape without dismissing its parent.
  }
  if (!activePopup) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closePopup({ restoreFocus: true });
  } else if (event.key === "Tab" && activePopup.element.contains(document.activeElement)) {
    const controls = [...activePopup.element.querySelectorAll('button:not([disabled]), a[href]:not([aria-disabled="true"])')];
    const index = controls.indexOf(document.activeElement);
    if ((event.shiftKey && index <= 0) || (!event.shiftKey && index === controls.length - 1)) {
      event.preventDefault();
      controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
    }
  }
}, true);

observer = new MutationObserver(() => scheduleReconcile());
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "data-pe-channel-context"] });
document.addEventListener("yt-equity:card-context", () => scheduleReconcile(0));
reconcileInterval = setInterval(() => scheduleReconcile(0), 10_000);
loadSettings().catch(() => {}).finally(() => scheduleReconcile(0));
