// Only links explicitly opened from our support control trigger this helper.
(() => {
  const videoId = "WNGNhItoRh8";
  const marker = "#yt-equity-thanks";
  let stop = () => {};
  let stopPausing = () => {};

  function onSupportVideo() {
    return location.pathname === "/watch" && new URL(location.href).searchParams.get("v") === videoId;
  }

  function visible(element) {
    return element.isConnected && !element.closest("[hidden], [aria-hidden='true']") &&
      getComputedStyle(element).visibility !== "hidden" && element.getClientRects().length > 0;
  }

  function fallback() {
    const notice = document.createElement("aside");
    notice.id = "yt-equity-support-notice";
    notice.setAttribute("role", "status");
    const text = document.createElement("span");
    text.textContent = "To support YT Equity, choose Thanks below the video (it may be under More actions). If Thanks is missing, YouTube hasn’t made it available for this video or account.";
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", () => notice.remove());
    notice.append(text, dismiss);
    document.body.append(notice);
  }

  function pauseVideos() {
    for (const video of document.querySelectorAll("#movie_player video")) {
      if (!video.paused) video.pause();
    }
  }

  function keepVideoPaused() {
    // YouTube can replace the player or start playback after metadata loads.
    const pausePlayback = event => {
      if (onSupportVideo() && event.target.matches?.("#movie_player video")) event.target.pause();
    };
    const events = ["play", "playing", "loadedmetadata"];
    for (const name of events) document.addEventListener(name, pausePlayback, true);
    const cleanup = () => {
      for (const name of events) document.removeEventListener(name, pausePlayback, true);
      for (const name of ["yt-navigate-start", "popstate", "pagehide"]) window.removeEventListener(name, cleanup);
    };
    for (const name of ["yt-navigate-start", "popstate", "pagehide"]) window.addEventListener(name, cleanup);
    pauseVideos();
    return cleanup;
  }

  function start() {
    if (location.hash !== marker || !onSupportVideo()) return;
    stop();
    stopPausing();
    stopPausing = keepVideoPaused();
    document.getElementById("yt-equity-support-notice")?.remove();
    history.replaceState(history.state, "", location.pathname + location.search);
    const deadline = Date.now() + 15_000;
    let openedMenu = false;
    let timer;
    const cancel = () => {
      clearInterval(timer);
      window.removeEventListener("yt-navigate-start", cancel);
      window.removeEventListener("popstate", cancel);
    };
    stop = cancel;
    window.addEventListener("yt-navigate-start", cancel);
    window.addEventListener("popstate", cancel);
    function attempt() {
      if (!onSupportVideo()) { cancel(); return; }
      pauseVideos();
      // English labels are a fallback; never inspect or click payment controls.
      const direct = [...document.querySelectorAll("ytd-watch-metadata #actions button")].find(button =>
        visible(button) && !button.disabled && button.getAttribute("aria-disabled") !== "true" &&
        /^(?:Thanks|Super Thanks)$/i.test((button.getAttribute("aria-label") || button.textContent).trim()));
      const menuItem = openedMenu && [...document.querySelectorAll("ytd-menu-popup-renderer ytd-menu-service-item-renderer")].find(item =>
        visible(item) && item.querySelector("[aria-disabled='true']") === null &&
        /^(?:Thanks|Super Thanks)$/i.test(item.querySelector(".title")?.textContent.trim() ?? ""));
      const thanks = direct || menuItem;
      if (thanks) {
        cancel(); // One click opens the chooser. Amount and payment remain with the user.
        thanks.click();
        return;
      }
      if (!openedMenu) {
        const more = [...document.querySelectorAll("ytd-watch-metadata #actions button[aria-label='More actions']")].find(visible);
        if (more) { openedMenu = true; more.click(); }
      }
      if (Date.now() >= deadline) { cancel(); fallback(); }
    }
    timer = setInterval(attempt, 300);
    attempt();
  }

  window.addEventListener("hashchange", start);
  window.addEventListener("yt-navigate-finish", start);
  window.addEventListener("yt-navigate-start", () => document.getElementById("yt-equity-support-notice")?.remove());
  start();
})();
