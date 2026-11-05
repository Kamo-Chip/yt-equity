const ytEquity = globalThis.browser ?? globalThis.chrome;
const messages = YT_EQUITY_SHARED.messages;
let activePopup = null;
let renderToken = 0;
let reconcileTimer = null;
let observer = null;
let reconcileInterval = null;
let contextRetired = false;
const FILTER_DEFAULTS = YT_EQUITY_SHARED.filterDefaults;
const filterSettings = { ...FILTER_DEFAULTS };
let revealedCards = new WeakMap();
let lastLocation = location.href;
const browseResults = new Map();
const browseRetryAt = new Map();
const LOOKUP_TTL = 5 * 60_000;
let lookupsEnabled = false;
let lookupGeneration = 0;

function retireContext(error) {
  if (!/extension context invalidated/i.test(error?.message ?? "")) return;
  if (contextRetired) return;
  contextRetired = true;
  lookupsEnabled = false;
  lookupGeneration += 1;
  renderToken += 1;
  clearTimeout(reconcileTimer);
  clearInterval(reconcileInterval);
  observer?.disconnect();
  browseResults.clear();
  browseRetryAt.clear();
  closePopup();
  removeStaleControls(null);
  for (const card of findCards()) clearCardPresentation(card);
}

// Chrome may throw before returning a promise after an extension reload.
async function extensionCall(operation) {
  if (contextRetired) return undefined;
  try {
    return await operation();
  } catch (error) {
    retireContext(error);
    throw error;
  }
}

function browseResult(identifier) {
  const result = browseResults.get(identifier);
  if (result && result.expiresAt > Date.now()) return result;
  browseResults.delete(identifier);
  return undefined;
}

