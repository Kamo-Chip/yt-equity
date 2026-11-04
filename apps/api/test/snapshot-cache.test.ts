import assert from "node:assert/strict";
import { test } from "node:test";
import { snapshotCache } from "../src/snapshot-cache.js";

const flush = () => new Promise(resolve => setImmediate(resolve));

test("snapshots coalesce initial reads and serve stale data during background refresh", async () => {
  let time = 0, calls = 0;
  const cache = snapshotCache(async () => ++calls, 60_000, () => time);
  assert.equal(cache.isReady(), false);
  const reads = await Promise.all([cache.get(), cache.get(), cache.get()]);
  assert.deepEqual(reads.map(r => r.data), [1, 1, 1]);
  assert.deepEqual(reads.map(r => r.status), ["MISS", "COALESCED", "COALESCED"]);
  assert.equal(cache.isReady(), true);
  time = 59_999;
  assert.equal((await cache.get()).status, "HIT");
  assert.equal(calls, 1);
  time = 60_000;
  const stale = await Promise.all([cache.get(), cache.get()]);
  assert.deepEqual(stale.map(r => [r.data, r.status, r.ageSeconds]), [[1, "STALE", 60], [1, "STALE", 60]]);
  await flush();
  assert.equal((await cache.get()).data, 2);
  assert.equal(calls, 2);
});

test("initial failures back off five seconds; background failures preserve data and back off sixty", async () => {
  let time = 0, calls = 0, fail = true;
  const cache = snapshotCache(async () => {
    calls++;
    if (fail) throw new Error("Database unavailable");
    return calls;
  }, 60_000, () => time);
  await assert.rejects(cache.warm(), /Database unavailable/);
  await assert.rejects(cache.get(), /Database unavailable/);
  assert.equal(calls, 1);
  assert.equal(cache.isReady(), false);
  time = 5_000; fail = false;
  await cache.warm();
  time = 65_000; fail = true;
  assert.equal((await cache.get()).data, 2);
  await flush();
  time = 124_999;
  assert.equal((await cache.get()).data, 2);
  await flush();
  assert.equal(calls, 3);
  time = 125_000; fail = false;
  await cache.get(); await flush();
  assert.equal((await cache.get()).data, 4);
  cache.invalidate(); fail = true;
  await assert.rejects(cache.warm());
  assert.equal(cache.isReady(), false);
  await assert.rejects(cache.get()); // Never return pre-mutation data.
});

test("invalidation during a read cannot serve or repopulate an old snapshot", async () => {
  let finishOld!: (value: string) => void;
  let calls = 0;
  const cache = snapshotCache(() => ++calls === 1
    ? new Promise<string>(resolve => { finishOld = resolve; })
    : Promise.resolve("new"));
  const first = cache.get();
  await Promise.resolve();
  const concurrent = cache.get();
  cache.invalidate();
  assert.equal((await cache.get()).data, "new");
  finishOld("old");
  assert.equal((await first).data, "new");
  assert.equal((await concurrent).data, "new");
  assert.equal((await cache.get()).data, "new");
  assert.equal(calls, 2);
});

test("an older background refresh cannot overwrite a rebuilt generation", async () => {
  let time = 0, calls = 0;
  let finishOld!: (value: string) => void;
  const cache = snapshotCache(() => {
    calls++;
    return calls === 2 ? new Promise<string>(resolve => { finishOld = resolve; }) : Promise.resolve(calls === 1 ? "initial" : "edited");
  }, 60_000, () => time);
  await cache.warm(); time = 60_000;
  assert.equal((await cache.get()).status, "STALE");
  cache.invalidate(); await cache.warm();
  finishOld("obsolete"); await flush();
  assert.equal((await cache.get()).data, "edited");
});
