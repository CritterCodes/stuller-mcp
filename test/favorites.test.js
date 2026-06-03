import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';

// Isolated favorites file + creds, configured before import.
const FAV_PATH = join(tmpdir(), 'stuller-mcp-favorites-test.json');
process.env.STULLER_FAVORITES_PATH = FAV_PATH;
process.env.STULLER_USERNAME = 'u';
process.env.STULLER_PASSWORD = 'p';
process.env.STULLER_CACHE_TTL_MS = '0';

const { favoriteAdd, favoriteList, favoriteRemove } = await import('../src/tools/favorites.js');

// Mock the catalog so favoriteAdd's validation resolves without the network.
function mockCatalog(known) {
  globalThis.fetch = async (url) => {
    const path = new URL(url).pathname;
    const Products = path.includes('/products') && known
      ? [{ SKU: 'SOLDER:0267:P', Description: '14K Yellow Plumb Solder Sheet', Price: { Value: 144.86, CurrencyCode: 'USD' }, Orderable: true, Status: 'In Stock' }]
      : [];
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ Products }) };
  };
}

test('favorites: add (validated) → persists → list → remove', async () => {
  await rm(FAV_PATH, { force: true });
  mockCatalog(true);

  const added = await favoriteAdd({ sku: 'SOLDER:0267:P', label: 'bench solder' });
  assert.equal(added.action, 'added');
  assert.equal(added.count, 1);

  // A fresh list reads it back from disk (persistence).
  const listed = await favoriteList({});
  assert.equal(listed.count, 1);
  assert.equal(listed.favorites[0].sku, 'SOLDER:0267:P');
  assert.equal(listed.favorites[0].label, 'bench solder');

  // Adding the same SKU dedupes.
  const again = await favoriteAdd({ sku: 'SOLDER:0267:P' });
  assert.equal(again.action, 'already_favorited');
  assert.equal(again.count, 1);

  const removed = await favoriteRemove({ sku: 'SOLDER:0267:P' });
  assert.equal(removed.count, 0);
  await rm(FAV_PATH, { force: true });
});

test('favorites: refuses to save an unknown SKU', async () => {
  await rm(FAV_PATH, { force: true });
  mockCatalog(false); // catalog returns nothing
  await assert.rejects(() => favoriteAdd({ sku: 'NOTAREAL:SKU:X' }), /not found.*Not favorited/i);
  await rm(FAV_PATH, { force: true });
});

test('favorites: missing file lists as empty (no crash)', async () => {
  await rm(FAV_PATH, { force: true });
  const r = await favoriteList({});
  assert.equal(r.count, 0);
  assert.deepEqual(r.favorites, []);
});
