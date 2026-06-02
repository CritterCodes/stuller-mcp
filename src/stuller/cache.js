// Tiny in-memory TTL cache for idempotent, slow-changing reads (facet vocabulary,
// metal market rates). Per-process (per MCP session). Pricing/inventory are
// deliberately NOT cached elsewhere — stale prices are worse than a refetch.
//
// TTL is controlled by STULLER_CACHE_TTL_MS (default 600000 = 10 min). Set it to
// 0 to disable caching entirely.

const store = new Map(); // key -> { value, expires }

function defaultTtl() {
  const n = Number(process.env.STULLER_CACHE_TTL_MS);
  return Number.isFinite(n) ? n : 600_000;
}

/**
 * Return a cached value for `key`, or compute it via `fn()` and cache it.
 * @param {string} key
 * @param {() => Promise<any>} fn
 * @param {number} [ttlMs] override the default TTL
 */
export async function withCache(key, fn, ttlMs) {
  const ttl = ttlMs ?? defaultTtl();
  if (!ttl || ttl <= 0) return fn(); // caching disabled

  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value;

  const value = await fn();
  store.set(key, { value, expires: now + ttl });
  return value;
}

/** Clear the cache (used by tests; also handy if a caller wants fresh data). */
export function clearCache() {
  store.clear();
}
