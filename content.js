let activePopup = null;
let channelData = null;
let channelDataError = "";
const brw = 'browser' in this ? browser : chrome;

fetch(brw.runtime.getURL("/data/channels.json"))
  .then((res) => res.json())
  .then((json) => {
    channelData = json.channels;
    channelDataError = "";
  })
  .catch((e) => {
    console.log("Error loading channels.json:", e);
    channelDataError = "Unable to load data";
  });

function getChannelIdentifier() {
  let id = "";

  if (location.href.includes("/watch?v=")) {
    const linkEl = document.querySelector(
      "a.yt-simple-endpoint.style-scope.ytd-video-owner-renderer"
    );
    if (linkEl && linkEl.href.includes("/@")) {
      id = "@" + linkEl.href.split("/@")[1].split("/")[0];
    } else {
      console.log("Couldn't find channel handle in video owner link");
    }
  } else if (location.href.includes("/channel/")) {
    id = location.href.split("/channel/")[1].split(/[/?#]/)[0];
  } else if (location.href.includes("/@")) {
    id = "@" + location.href.split("/@")[1].split(/[/?#]/)[0];
  }

  return id;
}

function findBadgeContainer() {
  let container = null;

  if (location.href.includes("/watch?v=")) {
    container = document.querySelector("#owner");
  } else if (
    location.href.includes("/@") ||
    location.href.includes("/channel/")
  ) {
    container = document.querySelector("yt-flexible-actions-view-model");
    if (!container) {
      container = document.querySelector("h1.dynamic-text-view-model-wiz__h1");
    }
  }

  return container;
}

function handleOutsideClick(ev) {
  if (activePopup && !activePopup.contains(ev.target)) {
    activePopup.remove();
    document.removeEventListener("click", handleOutsideClick);
    const btn = document.querySelector("#pe-check-button");
    if (btn) btn.classList.remove("button-active");

    const ping = document.querySelector("#pe-ping");
    if (ping) ping.remove();

    activePopup = null;
  }
}

window.addEventListener("yt-page-data-updated", (e) => {
  if (activePopup) {
    activePopup.remove();
    document.removeEventListener("click", handleOutsideClick);
    activePopup = null;
  }

  const id = getChannelIdentifier();
  if (!id) {
    console.log("Could not find id");
    return;
  }
  console.log("ID: ", id);
  console.log(
    "Test ID: ",
    id.includes("@")
      ? `www.youtube.com/@${id}`
      : `www.youtube.com/channel/${id}`
  );

  let found = null;

  if (channelData) {
    if (id.includes("@")) {
      found = channelData.find(
        (ch) => ch.channelHandle.toLowerCase() === id.toLowerCase()
      );
    } else {
      found = channelData.find(
        (ch) => ch.channelId.toLowerCase() === id.toLowerCase()
      );
    }
  }

  setTimeout(() => {
    const container = findBadgeContainer();

    if (!container) {
      console.log("No container");
    }

    if (container && (found || error)) {
      injectButton(container, { found, error: channelDataError });
    }
  }, 500)
});

function injectButton(container, { found, error }) {
  const existing = document.querySelector("#pe-check-button-wrapper");
  if (existing) existing.remove();

  const wrapper = document.createElement("span");
  wrapper.id = "pe-check-button-wrapper";

  const button = document.createElement("button");
  button.id = "pe-check-button";
  button.innerHTML = `🧐`;
  button.disabled = !error && !channelData;
  if (error) button.title = error;
  else if (!channelData) button.title = "Loading…";
  else button.title = "Check PE ownership";
  wrapper.appendChild(button);

  let ping = null;
  if (found) {
    ping = document.createElement("span");
    ping.id = "pe-ping";
    wrapper.appendChild(ping);
  }

  container.appendChild(wrapper);

  button.addEventListener("click", () => {
    if (activePopup) {
      activePopup.remove();
      document.removeEventListener("click", handleOutsideClick);
      activePopup = null;
    }

    const popup = document.createElement("div");
    popup.id = "pe-popup";
    const rect = button.getBoundingClientRect();
    popup.style.top = `${rect.bottom + window.scrollY + 5}px`;
    popup.style.left = `${rect.left + window.scrollX}px`;

    const list = document.createElement("ul");

    if (error) {
      const li = document.createElement("li");
      li.innerHTML = `
            <img src="${brw.runtime.getURL(
              "icons/error.svg"
            )}" width="16" height="16" />
            ${error}
        `;
      list.appendChild(li);
    } else if (found) {
      const li1 = document.createElement("li");
      li1.innerHTML = `
        <img src="${brw.runtime.getURL(
          "icons/money.svg"
        )}" width="16" height="16" />
        <strong>Investment Status:</strong>
        ${found.level.charAt(0).toUpperCase() + found.level.slice(1)}
        ${found.type === "funding" ? "Funding" : "Acquisition"}
      `;
      list.appendChild(li1);

      if (found.firmName && found.firmWebsite) {
        const li2 = document.createElement("li");
        li2.innerHTML = `
          <img src="${brw.runtime.getURL(
            "icons/institution.svg"
          )}" width="16" height="16" />
          ${
            found.type === "funding"
              ? "<strong>Funded By:</strong>"
              : "<strong>Acquired By:</strong>"
          }
          <a href="${found.firmWebsite}" target="_blank">${found.firmName}</a>
        `;
        list.appendChild(li2);
      }

      const li3 = document.createElement("li");
      li3.innerHTML = `
        <img src="${brw.runtime.getURL(
          "icons/link.svg"
        )}" width="16" height="16" />
        <strong>Source:</strong>
        <a href="${found.source}" target="_blank">Official Website</a>
      `;
      list.appendChild(li3);
    } else {
      const li = document.createElement("li");
      li.innerHTML = `
        <img src="${brw.runtime.getURL(
          "icons/money.svg"
        )}" width="16" height="16" />
        <strong>Investment Status:</strong> Independent
      `;
      list.appendChild(li);
    }

    const closeBtn = document.createElement("span");
    closeBtn.id = "pe-popup-close";
    closeBtn.innerHTML = `<img src="${brw.runtime.getURL(
      "icons/close.svg"
    )}" width="16" height="16" style="cursor:pointer"/>`;

    closeBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      popup.remove();
      activePopup = null;
      button.classList.remove("button-active");
      if (ping) ping.remove();
      document.removeEventListener("click", handleOutsideClick);
    });

    popup.appendChild(closeBtn);
    popup.appendChild(list);
    document.body.appendChild(popup);
    activePopup = popup;
    button.classList.add("button-active");

    setTimeout(() => document.addEventListener("click", handleOutsideClick), 0); // Prevent immediate close
  });
}
