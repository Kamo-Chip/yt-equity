(() => {
  const filterDefaults = Object.freeze({
    hideConfirmedAcquisitions: false,
    hideConfirmedFunding: false,
    filterHome: true,
    filterSearch: true,
    filterSuggested: true,
    filterSubscriptions: false,
  });
  const messages = Object.freeze({
    lookup: "yt-equity:lookup",
    lookupMany: "yt-equity:lookup-many",
    openSupport: "yt-equity:open-support",
    getTheme: "yt-equity:get-theme",
  });
  function normalizeIdentifier(input) {
    if (typeof input !== "string") return null;
    let value;
    try { value = decodeURIComponent(input).trim().normalize("NFC"); }
    catch { return null; }
    return value.length <= 120 && /^(UC[a-zA-Z0-9_-]+|@?[\p{L}\p{M}\p{N}._-]+)$/u.test(value) ? value : null;
  }
  function validChannel(value) {
    return value && typeof value.channelId === "string" && typeof value.name === "string" && Array.isArray(value.claims);
  }
  function normalizeResult(response) {
    if (response?.kind === "independent") return response;
    if (response?.kind !== "found" || !validChannel(response.value)) return { kind: "unavailable" };
    return { ...response, value: { ...response.value, claims: response.value.claims.filter(claim =>
      claim?.status === "confirmed" && ["funding", "acquisition"].includes(claim.type)) } };
  }
  globalThis.YT_EQUITY_SHARED = Object.freeze({ filterDefaults, messages, normalizeIdentifier, validChannel, normalizeResult });
})();
