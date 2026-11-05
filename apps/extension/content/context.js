const CARD_SELECTORS = [
  "ytd-rich-item-renderer",
  "ytd-video-renderer",
  "ytd-grid-video-renderer",
  "ytd-compact-video-renderer",
  "ytd-playlist-video-renderer",
  "yt-lockup-view-model"
];

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
    return YT_EQUITY_SHARED.normalizeIdentifier(id ?? (handle ? `@${handle}` : ""));
  } catch { return null; }
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

function cardRoot(element) {
  return element.closest("ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-playlist-video-renderer") ?? element;
}

function findCards() {
  return [...new Set([...document.querySelectorAll(CARD_SELECTORS.join(", "))].map(cardRoot))];
}

function cardIdentity(card) {
  const channelLink = card.querySelector("a[href*='/@'], a[href*='/channel/']");
  const videoLink = card.querySelector("a[href*='/watch'], a[href*='/shorts/']");
  let modelIdentifier = null;
  const lockup = card.matches("yt-lockup-view-model") ? card : card.querySelector("yt-lockup-view-model");
  try {
    const value = lockup?.getAttribute("data-pe-channel-context");
    if (value && value.length < 300 && videoLink) {
      const context = JSON.parse(value);
      const videoId = new URL(videoLink.href, location.origin).searchParams.get("v");
      if (context.videoId === videoId && /^UC[A-Za-z0-9_-]{22}$/.test(context.channelId ?? "")) modelIdentifier = context.channelId;
    }
  } catch { /* Treat page-provided metadata as untrusted data. */ }
  const identifier = channelLink ? identifierFromUrl(channelLink.href) : modelIdentifier ?? identifierFromUrl(location.href);
  if (!identifier) return null;
  return { identifier, key: `${identifier}|${videoLink?.getAttribute("href") ?? "card"}` };
}

