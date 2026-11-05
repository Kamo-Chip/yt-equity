const LOADING_MESSAGES = [
  "Checking the ownership trail…",
  "Looking for the receipts…",
  "Scanning the public record…",
  "Consulting the research desk…",
  "Following the paper trail…",
];

function randomLoadingMessage() {
  return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
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
  if (contextRetired) return "";
  try {
    return ytEquity.runtime.getURL(`icons/${name}`);
  } catch (error) {
    retireContext(error);
    if (!contextRetired) throw error;
    return "";
  }
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
        await extensionCall(() => ytEquity.storage.local.set({ ownershipLookupsEnabled: true }));
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

function showPopup(button, state, currentId, card = null) {
  if (activePopup?.button !== button) closePopup();
  const opening = !activePopup;
  if (!activePopup) {
    const element = document.createElement("div");
    element.id = "pe-popup";
    element.setAttribute("role", "dialog");
    element.setAttribute("aria-label", "YT Equity channel information");
    document.body.append(element);
    activePopup = { element, button, currentId, card };
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

