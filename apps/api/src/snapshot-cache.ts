/** Process-local public snapshot. Hard invalidation fences off all older reads. */
export function snapshotCache<T>(load: () => Promise<T>, ttlMs = 60_000, now = Date.now) {
  let generation = 0;
  let cached: { data: T; loadedAt: number } | undefined;
  let pending: Promise<T> | undefined;
  let retryAt = 0;
  let lastError: unknown;

  function refresh(): Promise<T> {
    if (pending) return pending;
    if (now() < retryAt) return Promise.reject(lastError);
    const version = generation;
    const request = Promise.resolve().then(load).then(data => {
      if (version === generation) {
        cached = { data, loadedAt: now() };
        retryAt = 0;
        lastError = undefined;
      }
      return data;
    }, error => {
      if (version === generation) {
        lastError = error;
        retryAt = now() + (cached ? ttlMs : 5_000);
      }
      throw error;
    });
    pending = request;
    const clear = () => { if (pending === request) pending = undefined; };
    void request.then(clear, clear);
    return request;
  }

  async function get(): Promise<{ data: T; status: "HIT" | "MISS" | "COALESCED" | "STALE"; ageSeconds: number }> {
    if (cached) {
      const age = Math.max(0, now() - cached.loadedAt);
      const stale = age >= ttlMs;
      if (stale) void refresh().catch(() => {});
      return { data: cached.data, status: stale ? "STALE" : "HIT", ageSeconds: Math.floor(age / 1_000) };
    }
    const version = generation;
    const status = pending ? "COALESCED" : "MISS";
    try {
      const data = await refresh();
      return version === generation ? { data, status, ageSeconds: 0 } : get();
    } catch (error) {
      if (version !== generation) return get();
      throw error;
    }
  }

  return {
    get,
    isReady: () => cached !== undefined,
    // Startup/readiness can trigger a load without holding the health request open.
    warm: async () => { await get(); },
    invalidate() {
      generation += 1;
      cached = undefined;
      pending = undefined;
      retryAt = 0;
      lastError = undefined;
    },
  };
}
