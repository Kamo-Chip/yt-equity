const ytEquity = globalThis.browser ?? globalThis.chrome;

ytEquity.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "yt-equity:get-theme") {
    sendResponse({ theme: document.documentElement.hasAttribute("dark") ? "dark" : "light" });
  }
});
let activePopup = null;
let renderToken = 0;
let reconcileTimer = null;
const FILTER_DEFAULTS = {
  hideConfirmedAcquisitions: false,
  hideConfirmedFunding: false,
  filterHome: true,
  filterSearch: true,
  filterSuggested: true,
  filterSubscriptions: false
};
const filterSettings = { ...FILTER_DEFAULTS };
let revealedCards = new WeakMap();
let lastLocation = location.href;
const browseResults = new Map();
const browseRetryAt = new Map();
const LOOKUP_TTL = 5 * 60_000;
let lookupsEnabled = false;
let lookupGeneration = 0;

function browseResult(identifier) {
  const result = browseResults.get(identifier);
  if (result && result.expiresAt > Date.now()) return result;
  browseResults.delete(identifier);
  return undefined;
}

const LOADING_MESSAGES = [
  "Checking the ownership trail…",
  "Looking for the receipts…",
  "Scanning the public record…",
  "Consulting the research desk…",
  "Following the paper trail…",
];

const CARD_SELECTORS = [
  "ytd-rich-item-renderer",
  "ytd-video-renderer",
  "ytd-grid-video-renderer",
  "ytd-compact-video-renderer",
  "ytd-playlist-video-renderer",
  "yt-lockup-view-model"
];

function randomLoadingMessage() {
  return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
}

function isVisible(element) {
  if (!element?.isConnected) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
}

function visibleMatch(selector, root = document) {
  return [...root.querySelectorAll(selector)].find(isVisible) ?? null;
}

function identifierFromUrl(value) {
  try {
    const url = new URL(value, location.origin);
    const handle = url.pathname.match(/^\/@([^/?#]+)/)?.[1];
    const id = url.pathname.match(/^\/channel\/([^/?#]+)/)?.[1];
    return id ?? (handle ? `@${handle}` : null);
  } catch {
    return null;
  }
}

function currentChannelContext() {
  if (location.pathname === "/watch") {
    const owner = visibleMatch("ytd-watch-metadata #owner, #above-the-fold #owner");
    const link = owner && visibleMatch("a[href*='/@'], a[href*='/channel/']", owner);
    const identifier = link ? identifierFromUrl(link.href) : null;
    return identifier && owner ? { identifier, host: owner } : null;
  }

  const identifier = identifierFromUrl(location.href);
  if (!identifier) return null;
  const host = visibleMatch([
    "yt-page-header-renderer yt-flexible-actions-view-model",
    "#page-header yt-flexible-actions-view-model",
    "ytd-c4-tabbed-header-renderer #buttons",
    "yt-page-header-renderer h1.dynamic-text-view-model-wiz__h1"
  ].join(", "));
  return host ? { identifier, host } : null;
}

// Inline the packaged artwork so popup icons do not request extension URLs from YouTube.
const POPUP_ICON_PATHS = {
  "money.svg": "M441-120v-86q-53-12-91.5-46T293-348l74-30q15 48 44.5 73t77.5 25q41 0 69.5-18.5T587-356q0-35-22-55.5T463-458q-86-27-118-64.5T313-614q0-65 42-101t86-41v-84h80v84q50 8 82.5 36.5T651-650l-74 32q-12-32-34-48t-60-16q-44 0-67 19.5T393-614q0 33 30 52t104 40q69 20 104.5 63.5T667-358q0 71-42 108t-104 46v84h-80Z",
  "institution.svg": "M200-280v-280h80v280h-80Zm240 0v-280h80v280h-80ZM80-120v-80h800v80H80Zm600-160v-280h80v280h-80ZM80-640v-80l400-200 400 200v80H80Zm178-80h444-444Zm0 0h444L480-830 258-720Z",
  "error.svg": "M480-280q17 0 28.5-11.5T520-320q0-17-11.5-28.5T480-360q-17 0-28.5 11.5T440-320q0 17 11.5 28.5T480-280Zm-40-160h80v-240h-80v240Zm40 360q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z",
  "link.svg": "M440-280H280q-83 0-141.5-58.5T80-480q0-83 58.5-141.5T280-680h160v80H280q-50 0-85 35t-35 85q0 50 35 85t85 35h160v80ZM320-440v-80h320v80H320Zm200 160v-80h160q50 0 85-35t35-85q0-50-35-85t-85-35H520v-80h160q83 0 141.5 58.5T880-480q0 83-58.5 141.5T680-280H520Z",
  "close.svg": "m336-280-56-56 144-144-144-143 56-56 144 144 143-144 56 56-144 143 144 144-56 56-143-144-144 144Z"
};

function popupIcon(name, size = 16) {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.classList.add("pe-popup-icon");
  icon.setAttribute("viewBox", "0 -960 960 960");
  icon.setAttribute("width", String(size));
  icon.setAttribute("height", String(size));
  icon.setAttribute("fill", "currentColor");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", POPUP_ICON_PATHS[name]);
  icon.append(path);
  return icon;
}

function iconUrl(name) {
  return ytEquity.runtime.getURL(`icons/${name}`);
}

let activeSupportDialog = null;

function closeSupportDialog() {
  if (!activeSupportDialog) return;
  const dialog = activeSupportDialog;
  activeSupportDialog = null;
  dialog.close();
  dialog.remove();
}

function showSupportDialog(link) {
  if (activeSupportDialog?.open) return;
  const dialog = document.createElement("dialog");
  dialog.id = "pe-support-dialog";
  dialog.setAttribute("aria-labelledby", "pe-support-title");
  dialog.setAttribute("aria-describedby", "pe-support-description");
  const title = document.createElement("h2");
  title.id = "pe-support-title";
  title.textContent = "Leave a tip";
  const description = document.createElement("p");
  description.id = "pe-support-description";
  description.textContent = "Leave a tip with YouTube Super Thanks. This will open a YouTube video in a new tab, where you enter the amount to tip.";
  const error = document.createElement("p");
  error.className = "pe-support-error";
  error.setAttribute("role", "status");
  error.setAttribute("aria-live", "polite");
  const actions = document.createElement("div");
  actions.className = "pe-support-dialog-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.autofocus = true;
  cancel.addEventListener("click", () => dialog.close());
  const proceed = document.createElement("button");
  proceed.type = "button";
  proceed.className = "pe-support-continue";
  proceed.textContent = "Continue";
  let opening = false;
  proceed.addEventListener("click", async () => {
    if (opening || !dialog.open) return;
    opening = true;
    proceed.disabled = true;
    error.textContent = "";
    try {
      const response = await ytEquity.runtime.sendMessage({ type: "yt-equity:open-support" });
      if (!response?.ok) throw new Error("Support tab unavailable");
      dialog.close();
    } catch {
      error.textContent = "Couldn’t open support tab. Try again.";
    } finally {
      opening = false;
      proceed.disabled = false;
    }
  });
  dialog.addEventListener("close", () => {
    if (activeSupportDialog === dialog) activeSupportDialog = null;
    dialog.remove();
    if (link.isConnected) link.focus({ preventScroll: true });
  });
  actions.append(cancel, proceed);
  dialog.append(title, description, error, actions);
  document.body.append(dialog);
  activeSupportDialog = dialog;
  dialog.showModal();
}

function supportButton() {
  const link = document.createElement("a");
  link.className = "pe-support-button";
  link.href = "https://www.youtube.com/watch?v=WNGNhItoRh8#yt-equity-thanks";
  link.target = "_blank";
  link.rel = "noreferrer";
  link.setAttribute("aria-describedby", "pe-support-tooltip");
  link.setAttribute("aria-haspopup", "dialog");
  link.setAttribute("aria-controls", "pe-support-dialog");
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "16");
  icon.setAttribute("height", "16");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "1.8");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M18 8h1a3 3 0 1 1 0 6h-1M3 8h15v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3ZM6 2v2M10 2v2M14 2v2");
  icon.append(path);
  const tooltip = document.createElement("span");
  tooltip.id = "pe-support-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.textContent = "Leave a tip";
  link.append(icon, document.createTextNode("Buy me a coffee"), tooltip);
  link.addEventListener("click", event => {
    event.preventDefault();
    showSupportDialog(link);
  });
  return link;
}

function findingRow(parent, text, firm) {
  const row = document.createElement("li");
  row.className = "pe-finding-row";
  const finding = document.createElement("span");
  finding.className = "pe-finding";
  if (firm) {
    finding.classList.add("pe-relationship");
    const label = document.createElement("span");
    label.className = "pe-relationship-label";
    label.textContent = text;
    finding.append(label);
  } else {
    finding.append(document.createTextNode(text));
  }
  if (firm?.id) {
    const anchor = document.createElement("a");
    anchor.className = "pe-firm-name";
    anchor.href = `${YT_EQUITY_CONFIG.webUrl}/firms/${encodeURIComponent(firm.id)}`;
    anchor.textContent = firm.name;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    finding.append(anchor);
  } else if (firm) {
    const name = document.createElement("span");
    name.className = "pe-firm-name";
    name.textContent = firm.name;
    finding.append(name);
  }
  row.append(finding);
  parent.append(row);
}

function closePopup({ restoreFocus = false } = {}) {
  const popup = activePopup;
  if (!popup) return;
  activePopup = null;
  closeSupportDialog();
  popup.element.remove();
  popup.button.classList.remove("button-active");
  popup.button.setAttribute("aria-expanded", "false");
  popup.button.removeAttribute("aria-controls");
  if (restoreFocus && popup.button.isConnected) popup.button.focus({ preventScroll: true });
}

function syncIndicator(wrapper, state) {
  const hasPublishedClaim = state.kind === "found" && Boolean(primaryClaim(state.value?.claims ?? []));
  const indicator = wrapper.querySelector("#pe-ping");
  if (hasPublishedClaim && !indicator) {
    const ping = document.createElement("span");
    ping.id = "pe-ping";
    ping.setAttribute("aria-label", "Confirmed YT Equity record");
    wrapper.append(ping);
  } else if (!hasPublishedClaim) {
    indicator?.remove();
  }
  wrapper.dataset.hasRecord = String(hasPublishedClaim);
}

function positionPopup(popup, button) {
  const rect = button.getBoundingClientRect();
  // Dismiss when the anchor scrolls away rather than leaving an orphaned dialog.
  if (!button.isConnected || rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) {
    closePopup();
    return;
  }
  const popupRect = popup.getBoundingClientRect();
  const gap = 8;
  const preferredTop = rect.bottom + gap;
  const top = preferredTop + popupRect.height <= window.innerHeight - 12
    ? preferredTop
    : Math.max(12, rect.top - popupRect.height - gap);
  const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - popupRect.width - 12));
  popup.style.top = `${Math.max(12, Math.min(top, window.innerHeight - popupRect.height - 12))}px`;
  popup.style.left = `${left}px`;
}

function fillPopup(popup, state, currentId) {
  closeSupportDialog();
  const list = document.createElement("ul");
  if (state.kind === "paused") {
    findingRow(list, "Ownership lookups are paused");
  } else if (state.kind === "loading") {
    const row = document.createElement("li");
    row.className = "pe-loading-row pe-finding-row";
    const spinner = document.createElement("span");
    spinner.className = "pe-loading-spinner";
    spinner.setAttribute("aria-hidden", "true");
    const message = document.createElement("span");
    message.className = "pe-loading-message";
    message.textContent = state.message || LOADING_MESSAGES[0];
    row.append(spinner, message);
    list.append(row);
  } else if (state.kind === "unavailable") {
    findingRow(list, "Unable to reach YT Equity right now");
    list.firstElementChild.prepend(popupIcon("error.svg"));
  } else {
    const easterEgg = state.kind === "found" ? state.value?.easterEgg : undefined;
    if (easterEgg) findingRow(list, `${easterEgg.emoji} ${easterEgg.message}`);
    const claim = state.kind === "found" ? primaryClaim(state.value?.claims ?? []) : undefined;
    if (!claim) {
      findingRow(list, "No published ownership record");
    } else {
      const relationship = claim.type === "funding" ? "Funded by" : "Acquired by";
      findingRow(list, `${relationship} `, claim.firm ?? { name: "an undisclosed firm" });
    }
  }

  const sections = [list];
  if (state.kind === "paused") {
    const description = document.createElement("p");
    description.className = "pe-consent-description";
    description.textContent = "Sends channel IDs to YT Equity to check ownership. ";
    const privacy = document.createElement("a");
    privacy.href = `${YT_EQUITY_CONFIG.webUrl}/privacy`;
    privacy.target = "_blank";
    privacy.rel = "noreferrer";
    privacy.textContent = "Privacy policy";
    description.append(privacy);
    const enable = document.createElement("button");
    enable.type = "button";
    enable.className = "pe-record-button";
    enable.textContent = "Enable ownership lookups";
    const error = document.createElement("p");
    error.setAttribute("role", "status");
    enable.addEventListener("click", async () => {
      enable.disabled = true;
      error.textContent = "";
      try {
        await ytEquity.storage.local.set({ ownershipLookupsEnabled: true });
        updateLookupSetting(true);
      } catch {
        error.textContent = "Couldn’t enable lookups. Try again.";
        enable.disabled = false;
      }
    });
    sections.push(description, enable, error);
  }
  if (state.kind === "independent" || (state.kind === "found" && state.value)) {
    const profileUrl = `${YT_EQUITY_CONFIG.webUrl}/channels/${encodeURIComponent(currentId)}`;
    const recordButton = document.createElement("a");
    recordButton.className = "pe-record-button";
    recordButton.href = profileUrl;
    recordButton.target = "_blank";
    recordButton.rel = "noreferrer";
    const claim = state.kind === "found" ? primaryClaim(state.value?.claims ?? []) : undefined;
    recordButton.append(document.createTextNode(claim ? "View full record" : "View channel on YT Equity"), popupIcon("link.svg"));
    sections.push(recordButton, supportButton());
  }

  const closeButton = document.createElement("button");
  closeButton.id = "pe-popup-close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close YT Equity details");
  closeButton.append(popupIcon("close.svg"));
  closeButton.addEventListener("click", () => closePopup({ restoreFocus: true }));
  popup.replaceChildren(closeButton, ...sections);
}

function showPopup(button, state, currentId) {
  if (activePopup?.button !== button) closePopup();
  const opening = !activePopup;
  if (!activePopup) {
    const element = document.createElement("div");
    element.id = "pe-popup";
    element.setAttribute("role", "dialog");
    element.setAttribute("aria-label", "YT Equity channel information");
    document.body.append(element);
    activePopup = { element, button, currentId };
    button.classList.add("button-active");
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-controls", element.id);
  }
  // A lookup may resolve while the loading dialog has keyboard focus.
  const hadFocus = activePopup.element.contains(document.activeElement);
  const focusedIndex = [...activePopup.element.querySelectorAll("button, a[href]")].indexOf(document.activeElement);
  fillPopup(activePopup.element, state, currentId);
  positionPopup(activePopup.element, button);
  if (activePopup && (opening || hadFocus)) {
    const controls = activePopup.element.querySelectorAll("button, a[href]");
    (controls[Math.max(0, focusedIndex)] ?? controls[0])?.focus({ preventScroll: true });
  }
}

function normalizeResponse(response) {
  if (!response || typeof response.kind !== "string") return { kind: "unavailable" };
  if (response.kind === "found" && response.value && typeof response.value.name === "string" && Array.isArray(response.value.claims)) {
    return { ...response, value: { ...response.value, claims: response.value.claims.filter((claim) => claim?.status === "confirmed") } };
  }
  if (response.kind === "independent") return response;
  return { kind: "unavailable" };
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
    closePopup();
    removeStaleControls(null);
    return;
  }

  const existing = [...document.querySelectorAll("#pe-check-button-wrapper")].find((wrapper) =>
    wrapper.isConnected && wrapper.dataset.channelId === context.identifier && wrapper.parentElement === context.host && isVisible(wrapper) &&
    Number(wrapper.dataset.expiresAt) > Date.now());
  removeStaleControls(existing);
  if (existing) return;

  closePopup();
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

  const response = await ytEquity.runtime.sendMessage({ type: "yt-equity:lookup", identifier: context.identifier }).catch(() => null);
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

function cardRoot(element) {
  return element.closest("ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-playlist-video-renderer") ?? element;
}

function findCards() {
  return [...new Set([...document.querySelectorAll(CARD_SELECTORS.join(", "))].map(cardRoot))];
}

function cardIdentity(card) {
  const channelLink = card.querySelector("a[href*='/@'], a[href*='/channel/']");
  const identifier = channelLink ? identifierFromUrl(channelLink.href) : identifierFromUrl(location.href);
  if (!identifier) return null;
  const videoLink = card.querySelector("a[href*='/watch'], a[href*='/shorts/']");
  return { identifier, key: `${identifier}|${videoLink?.getAttribute("href") ?? "card"}` };
}

function primaryClaim(claims) {
  const typeRank = { acquisition: 0, funding: 1 };
  return claims.filter((claim) => claim?.status === "confirmed").sort((a, b) =>
    (typeRank[a.type] ?? 9) - (typeRank[b.type] ?? 9))[0];
}

function badgeLabel(claim) {
  const leading = claim.type === "acquisition" ? "Acquired by" : "Funded by";
  return `${leading} ${claim.firm?.name || "an undisclosed firm"}`;
}

function badgeHost(card) {
  return card.querySelector([
    ".ytLockupMetadataViewModelMetadata",
    ".ytContentMetadataViewModelHost",
    ".yt-lockup-metadata-view-model-wiz__metadata",
    ".yt-lockup-metadata-view-model__metadata",
    "#metadata-line",
    "#channel-name",
    "ytd-channel-name",
    "#meta"
  ].join(", "));
}

function clearCardPresentation(card) {
  card.classList.remove("pe-card-filtered");
  card.querySelectorAll(":scope > .pe-filter-placeholder, .pe-ownership-badge").forEach((element) => element.remove());
}

function createBadge(card, identity, claim) {
  const host = badgeHost(card);
  if (!host) return;
  const anchor = document.createElement("a");
  anchor.className = `pe-ownership-badge pe-status-${claim.status}`;
  anchor.href = `${YT_EQUITY_CONFIG.webUrl}/channels/${encodeURIComponent(identity.identifier)}`;
  anchor.target = "_blank";
  anchor.rel = "noreferrer";
  const emoji = document.createElement("span");
  emoji.className = "pe-ownership-emoji";
  emoji.setAttribute("aria-hidden", "true");
  emoji.textContent = "🧐";
  const label = document.createElement("span");
  label.className = "pe-ownership-label";
  label.textContent = badgeLabel(claim);
  anchor.append(emoji, label);
  anchor.title = `Open ${badgeLabel(claim)} details in YT Equity`;
  anchor.setAttribute("aria-label", anchor.title);
  anchor.addEventListener("click", (event) => event.stopPropagation());
  host.append(anchor);
}

function createPlaceholder(card, identity, channel, claim) {
  const placeholder = document.createElement("div");
  placeholder.className = "pe-filter-placeholder";
  const mark = document.createElement("img");
  mark.src = iconUrl("icon32.png");
  mark.width = 28;
  mark.height = 28;
  mark.alt = "";
  const copy = document.createElement("div");
  copy.className = "pe-filter-copy";
  const title = document.createElement("strong");
  title.textContent = `${channel.name} hidden by YT Equity`;
  const detail = document.createElement("span");
  const reason = claim.type === "funding" ? "Confirmed funding" : "Confirmed acquisition";
  detail.textContent = claim.firm?.name ? `${reason} by ${claim.firm.name}` : reason;
  copy.append(title, detail);
  const reveal = document.createElement("button");
  reveal.type = "button";
  reveal.textContent = "Reveal";
  reveal.setAttribute("aria-label", `Reveal video from ${channel.name}`);
  reveal.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    revealedCards.set(card, identity.key);
    applyCardState(card, identity, { kind: "found", value: channel });
  });
  placeholder.append(mark, copy, reveal);
  card.append(placeholder);
  card.classList.add("pe-card-filtered");
}

function filteringEnabledForCard(card) {
  switch (location.pathname) {
    case "/": return filterSettings.filterHome;
    case "/results": return filterSettings.filterSearch;
    case "/feed/subscriptions": return filterSettings.filterSubscriptions;
    case "/watch":
      return filterSettings.filterSuggested && Boolean(card.closest("ytd-watch-next-secondary-results-renderer, #related"));
    default: return false;
  }
}

function applyCardState(card, identity, result) {
  const current = cardIdentity(card);
  if (!current || current.key !== identity.key) return;
  clearCardPresentation(card);
  if (result?.kind !== "found" || !result.value?.claims?.length) return;
  const claim = primaryClaim(result.value.claims);
  if (!claim) return;
  createBadge(card, identity, claim);
  const matchingClaim = primaryClaim(result.value.claims.filter((item) =>
    (item.type === "acquisition" && filterSettings.hideConfirmedAcquisitions) ||
    (item.type === "funding" && filterSettings.hideConfirmedFunding)));
  if (filteringEnabledForCard(card) && matchingClaim && revealedCards.get(card) !== identity.key) {
    createPlaceholder(card, identity, result.value, matchingClaim);
  }
}

async function processCards() {
  if (!lookupsEnabled) return;
  const generation = lookupGeneration;
  const pendingCards = [];
  for (const card of findCards()) {
    const identity = cardIdentity(card);
    if (!identity) { clearCardPresentation(card); continue; }
    const result = browseResult(identity.identifier);
    if (!result) clearCardPresentation(card);
    if (card.dataset.peCardKey !== identity.key) {
      clearCardPresentation(card);
      card.dataset.peCardKey = identity.key;
      card.dataset.peIdentifier = identity.identifier;
      pendingCards.push({ card, identity });
    } else if (!result && (browseRetryAt.get(identity.identifier) ?? 0) <= Date.now()) {
      pendingCards.push({ card, identity });
    } else if (result && !card.querySelector(".pe-ownership-badge, :scope > .pe-filter-placeholder")) {
      applyCardState(card, identity, result);
    }
  }
  const identifiers = [...new Set(pendingCards.map(({ identity }) => identity.identifier).filter((identifier) => !browseResult(identifier)))];
  if (identifiers.length) {
    const batches = [];
    for (let index = 0; index < identifiers.length; index += 100) batches.push(identifiers.slice(index, index + 100));
    const responses = (await Promise.all(batches.map((batch) => ytEquity.runtime.sendMessage({ type: "yt-equity:lookup-many", identifiers: batch }).catch(() => [])))).flat();
    if (!lookupsEnabled || generation !== lookupGeneration) return;
    const returned = new Set();
    for (const item of responses) {
      returned.add(item.identifier);
      const result = normalizeResponse(item.result);
      if (result.kind === "unavailable") browseRetryAt.set(item.identifier, Date.now() + 30_000);
      else {
        browseResults.set(item.identifier, { ...result, expiresAt: result.expiresAt ?? Date.now() + LOOKUP_TTL });
        browseRetryAt.delete(item.identifier);
      }
    }
    for (const identifier of identifiers) {
      if (!returned.has(identifier)) browseRetryAt.set(identifier, Date.now() + 30_000);
    }
  }
  for (const { card, identity } of pendingCards) {
    const result = browseResult(identity.identifier);
    if (result) applyCardState(card, identity, result);
  }
}

function reapplyCards() {
  for (const card of findCards()) {
    const identity = cardIdentity(card);
    const result = lookupsEnabled && identity && browseResult(identity.identifier);
    if (identity && result) applyCardState(card, identity, result);
    else clearCardPresentation(card);
  }
}

function reconcile() {
  reconcileTimer = null;
  if (location.href !== lastLocation) {
    lastLocation = location.href;
    revealedCards = new WeakMap();
    closePopup();
    reapplyCards();
  }
  renderChannelControl();
  processCards();
}

function scheduleReconcile(delay = 120) {
  clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(reconcile, delay);
}

async function loadSettings() {
  const generation = lookupGeneration;
  const settings = await ytEquity.storage.local.get({ ...FILTER_DEFAULTS, ownershipLookupsEnabled: true });
  if (generation !== lookupGeneration) return;
  lookupsEnabled = settings.ownershipLookupsEnabled !== false;
  for (const key of Object.keys(FILTER_DEFAULTS)) {
    filterSettings[key] = Boolean(settings[key] ?? FILTER_DEFAULTS[key]);
  }
  reapplyCards();
}

function updateLookupSetting(enabled) {
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

const observer = new MutationObserver(() => scheduleReconcile());
observer.observe(document.documentElement, { childList: true, subtree: true });
setInterval(() => scheduleReconcile(0), 10_000);
loadSettings().catch(() => {}).finally(() => scheduleReconcile(0));
