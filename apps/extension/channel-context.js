// Runs in YouTube's MAIN world, with no extension APIs or network access.
// Modern lockups render a channel button instead of an anchor. Copy only the
// canonical video/channel pair from that card's rendering model into the DOM.
(() => {
  const attribute = "data-pe-channel-context";
  let timer;
  function reconcile() {
    timer = null;
    let changed = false;
    for (const card of document.querySelectorAll("yt-lockup-view-model")) {
      let context = null;
      try {
        const value = card.rawProps?.data ?? card.componentProps?.data;
        const model = typeof value === "function" ? value() : value;
        const command = model?.metadata?.lockupMetadataViewModel?.image?.decoratedAvatarViewModel?.rendererContext?.commandContext?.onTap?.innertubeCommand;
        const channelId = command?.browseEndpoint?.browseId;
        const link = card.querySelector("a[href*='/watch']");
        const videoId = link && new URL(link.getAttribute("href"), location.origin).searchParams.get("v");
        if (model?.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" && model.contentId === videoId &&
          /^[A-Za-z0-9_-]{6,32}$/.test(videoId ?? "") && /^UC[A-Za-z0-9_-]{22}$/.test(channelId ?? "")) {
          context = JSON.stringify({ videoId, channelId });
        }
      } catch { /* A partial or recycled renderer must never retain stale data. */ }
      if (context !== card.getAttribute(attribute)) {
        if (context) card.setAttribute(attribute, context);
        else card.removeAttribute(attribute);
        changed = true;
      }
    }
    if (changed) document.dispatchEvent(new Event("yt-equity:card-context"));
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(reconcile, 100); }
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["href"]
  });
  for (const name of ["yt-navigate-finish", "yt-page-data-updated"]) window.addEventListener(name, schedule);
  schedule();
})();
