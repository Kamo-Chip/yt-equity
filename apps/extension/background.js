// Firefox loads config.js first in its background document; Chrome uses a worker.
if (typeof importScripts === "function") importScripts("config.js", "shared.js");
const messages = YT_EQUITY_SHARED.messages;

const api = globalThis.browser ?? globalThis.chrome;
const cache = new Map();
const pending = new Map();
const TTL = 5 * 60_000;
let consentGeneration = 0;

api.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.ownershipLookupsEnabled) {
    consentGeneration += 1;
    cache.clear();
    pending.clear();
  }
});

const validChannel = YT_EQUITY_SHARED.validChannel;

function cached(identifier) {
  const entry = cache.get(identifier);
  if (!entry || entry.expiresAt <= Date.now()) {
    cache.delete(identifier);
    return undefined;
  }
  return entry;
}

async function fetchBatch(identifiers) {
  const response = await fetch(`${YT_EQUITY_CONFIG.apiUrl}/api/v1/channels/lookup`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ identifiers }),
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error("API request failed");
  const body = await response.json();
  if (!body || !Array.isArray(body.results)) throw new Error("Invalid API response");
  const results = new Map();
  for (const item of body.results) {
    if (!item || typeof item.identifier !== "string") continue;
    if (item.error) { results.set(item.identifier, { kind: "unavailable" }); continue; }
    if (item.channel !== null && !validChannel(item.channel)) continue;
    results.set(item.identifier, item.channel ? { kind: "found", value: item.channel } : { kind: "independent" });
  }
  return results;
}

async function lookupMany(input) {
  const identifiers = [...new Set(input.map(String).filter(Boolean))].slice(0, 100);
  const generation = consentGeneration;
  const settings = await api.storage.local.get({ ownershipLookupsEnabled: true });
  if (settings.ownershipLookupsEnabled === false || generation !== consentGeneration) {
    return identifiers.map(identifier => ({ identifier, result: { kind: "unavailable" } }));
  }
  for (const [identifier, entry] of cache) {
    if (entry.expiresAt <= Date.now()) cache.delete(identifier);
  }
  const missing = identifiers.filter((identifier) => cached(identifier) === undefined && !pending.has(identifier));
  if (missing.length) {
    const task = fetchBatch(missing);
    for (const identifier of missing) {
      const itemTask = task.then(
        (results) => {
          const result = results.get(identifier);
          return generation === consentGeneration && result
            ? { ...result, expiresAt: Date.now() + TTL }
            : { kind: "unavailable" };
        },
        () => ({ kind: "unavailable" })
      );
      pending.set(identifier, itemTask);
      itemTask.then((value) => {
        if (value.kind !== "unavailable" && generation === consentGeneration) cache.set(identifier, value);
      }).finally(() => {
        if (pending.get(identifier) === itemTask) pending.delete(identifier);
      });
    }
  }
  return Promise.all(identifiers.map(async (identifier) => ({
    identifier,
    result: cached(identifier) ?? await pending.get(identifier)
  })));
}

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === messages.openSupport) {
    api.tabs.create({
      url: "https://www.youtube.com/watch?v=WNGNhItoRh8#yt-equity-thanks",
      active: true
    }).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === messages.lookup) {
    lookupMany([message.identifier]).then((items) => sendResponse(items[0]?.result ?? { kind: "unavailable" })).catch(() => sendResponse({ kind: "unavailable" }));
    return true;
  }
  if (message?.type === messages.lookupMany) {
    const identifiers = Array.isArray(message.identifiers) ? message.identifiers : [];
    lookupMany(identifiers).then(sendResponse).catch(() => {
      sendResponse(identifiers.map((identifier) => ({ identifier, result: { kind: "unavailable" } })));
    });
    return true;
  }
  return undefined;
});
