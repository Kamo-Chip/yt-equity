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
  dialog.setAttribute("aria-describedby", "pe-support-description pe-support-note");
  const title = document.createElement("h2");
  title.id = "pe-support-title";
  title.textContent = "Keep lights on";
  const description = document.createElement("p");
  description.id = "pe-support-description";
  description.textContent = "Your support helps me keep YT Equity going. Thank you!";
  const badge = document.createElement("div");
  badge.className = "pe-support-dialog-icon";
  badge.setAttribute("aria-hidden", "true");
  badge.append(link.querySelector("svg").cloneNode(true));
  const note = document.createElement("p");
  note.id = "pe-support-note";
  note.className = "pe-support-dialog-note";
  note.textContent = "Opens my YouTube video in a new tab, where you can leave a one-time tip with Super Thanks.";
  const error = document.createElement("p");
  error.className = "pe-support-error";
  error.setAttribute("role", "status");
  error.setAttribute("aria-live", "polite");
  const actions = document.createElement("div");
  actions.className = "pe-support-dialog-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Maybe later";
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
      const response = await extensionCall(() => ytEquity.runtime.sendMessage({ type: messages.openSupport }));
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
  dialog.append(badge, title, description, note, error, actions);
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
  link.append(icon, document.createTextNode("Keep lights on"));
  link.addEventListener("click", event => {
    event.preventDefault();
    showSupportDialog(link);
  });
  return link;
}

