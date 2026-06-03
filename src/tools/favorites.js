import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pricingAvailability } from './products.js';
import { quoteAdd } from './quote.js';

// Favorites persist to a local JSON file (no DB needed — this server runs
// per-user over stdio). Default lives under the user's home so it survives `npx`
// and restarts; override with STULLER_FAVORITES_PATH.
function favoritesPath() {
  return process.env.STULLER_FAVORITES_PATH || join(homedir(), '.stuller-mcp', 'favorites.json');
}

async function load() {
  try {
    const data = JSON.parse(await readFile(favoritesPath(), 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (err.code === 'ENOENT' || err instanceof SyntaxError) return []; // missing/corrupt → empty
    throw err;
  }
}

async function save(items) {
  const p = favoritesPath();
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(items, null, 2), 'utf8');
}

/**
 * Add a SKU to favorites (validated against the catalog so a typo can't be saved).
 * @param {{ sku: string, label?: string }} opts
 */
export async function favoriteAdd(opts = {}) {
  if (!opts.sku) throw new Error('`sku` is required.');
  const items = await load();

  const existing = items.find((f) => String(f.sku).toLowerCase() === String(opts.sku).toLowerCase());
  if (existing) {
    if (opts.label) existing.label = opts.label; // allow relabeling
    await save(items);
    return { action: 'already_favorited', sku: existing.sku, count: items.length, favorites: items };
  }

  const { items: priced } = await pricingAvailability({ skus: [opts.sku] });
  const p = priced[0];
  if (!p) throw new Error(`SKU not found in Stuller catalog: ${opts.sku}. Not favorited.`);

  const fav = { sku: p.itemNumber, label: opts.label || null, description: p.description, addedAt: new Date().toISOString() };
  items.push(fav);
  await save(items);
  return { action: 'added', sku: fav.sku, count: items.length, favorites: items };
}

/**
 * List favorites. `refresh: true` re-pulls live price + availability for each.
 * @param {{ refresh?: boolean }} opts
 */
export async function favoriteList(opts = {}) {
  const items = await load();
  if (!opts.refresh || !items.length) {
    return { count: items.length, storedAt: favoritesPath(), favorites: items };
  }
  const { items: priced } = await pricingAvailability({ skus: items.map((f) => f.sku) });
  const bySku = new Map(priced.map((i) => [String(i.itemNumber), i]));
  const favorites = items.map((f) => {
    const live = bySku.get(String(f.sku));
    return {
      ...f,
      price: live?.price ?? null,
      currency: live?.currency ?? null,
      available: live?.availability ?? live?.status ?? null,
      orderable: live?.orderable ?? null,
    };
  });
  return { count: favorites.length, refreshed: true, storedAt: favoritesPath(), favorites };
}

/** Remove a favorite by SKU. @param {{ sku: string }} opts */
export async function favoriteRemove(opts = {}) {
  if (!opts.sku) throw new Error('`sku` is required.');
  const items = await load();
  const next = items.filter((f) => String(f.sku).toLowerCase() !== String(opts.sku).toLowerCase());
  if (next.length === items.length) throw new Error(`${opts.sku} is not in favorites.`);
  await save(next);
  return { action: 'removed', sku: opts.sku, count: next.length, favorites: next };
}

/**
 * Load all favorites into a quote ("reorder my usuals"). Each is priced live.
 * @param {{ cartId?: string }} opts
 */
export async function favoritesToQuote(opts = {}) {
  const items = await load();
  if (!items.length) return { added: 0, message: 'No favorites saved yet — add some with favorite_add.' };
  let quote;
  for (const f of items) {
    try {
      quote = await quoteAdd({ sku: f.sku, cartId: opts.cartId });
    } catch {
      /* skip a now-invalid favorite */
    }
  }
  return { added: items.length, quote };
}
