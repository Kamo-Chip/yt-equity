function primaryClaim(claims) {
  const typeRank = { acquisition: 0, funding: 1 };
  return claims.filter((claim) => claim?.status === "confirmed").sort((a, b) =>
    (typeRank[a.type] ?? 9) - (typeRank[b.type] ?? 9))[0];
}

function badgeLabel(claim) {
  return claim.type === "acquisition" ? "Acquired" : "Funded";
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
  if (activePopup?.card === card) closePopup();
  card.classList.remove("pe-card-filtered");
  card.querySelectorAll(":scope > .pe-filter-placeholder, .pe-ownership-badge").forEach((element) => element.remove());
}

function createBadge(card, identity, claim, result) {
  const host = badgeHost(card);
  if (!host) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `pe-ownership-badge pe-status-${claim.status}`;
  const emoji = document.createElement("span");
  emoji.className = "pe-ownership-emoji";
  emoji.setAttribute("aria-hidden", "true");
  emoji.textContent = "🤑";
  const label = document.createElement("span");
  label.className = "pe-ownership-label";
  label.textContent = badgeLabel(claim);
  button.append(emoji, label);
  button.title = `View ${claim.type === "acquisition" ? "acquisition" : "funding"} details`;
  button.setAttribute("aria-label", button.title);
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    if (activePopup?.button === button) closePopup({ restoreFocus: true });
    else showPopup(button, result, identity.identifier, card);
  });
  host.append(button);
}

function createPlaceholder(card, identity, channel, claim) {
  const placeholder = document.createElement("div");
  placeholder.className = "pe-filter-placeholder";
  const mark = document.createElement("img");
  mark.src = iconUrl("icon32.png");
  if (contextRetired) return;
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
  if (contextRetired) return;
  const current = cardIdentity(card);
  if (!current || current.key !== identity.key) return;
  clearCardPresentation(card);
  if (result?.kind !== "found" || !result.value?.claims?.length) return;
  const claim = primaryClaim(result.value.claims);
  if (!claim) return;
  createBadge(card, identity, claim, result);
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
    const responses = (await Promise.all(batches.map((batch) => extensionCall(() => ytEquity.runtime.sendMessage({ type: messages.lookupMany, identifiers: batch })).catch(() => [])))).flat();
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

