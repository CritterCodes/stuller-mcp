import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withCache, clearCache } from '../src/stuller/cache.js';

test('withCache: caches within TTL, recomputes after expiry', async () => {
  clearCache();
  let calls = 0;
  const fn = async () => { calls += 1; return calls; };

  const a = await withCache('k', fn, 1000);
  const b = await withCache('k', fn, 1000);
  assert.equal(a, 1);
  assert.equal(b, 1, 'second call served from cache');
  assert.equal(calls, 1);

  await withCache('k', fn, -1); // expired/disabled ttl → recompute, do not serve stale
  assert.equal(calls, 2);
});

test('withCache: ttl <= 0 disables caching', async () => {
  clearCache();
  let calls = 0;
  const fn = async () => { calls += 1; return calls; };
  await withCache('k', fn, 0);
  await withCache('k', fn, 0);
  assert.equal(calls, 2, 'no caching when disabled');
});

test('withCache: distinct keys are independent', async () => {
  clearCache();
  let calls = 0;
  const fn = async () => { calls += 1; return calls; };
  const a = await withCache('a', fn, 1000);
  const b = await withCache('b', fn, 1000);
  assert.equal(a, 1);
  assert.equal(b, 2);
});
