import { test } from 'node:test';
import assert from 'node:assert/strict';

// Request-shape coverage: mock fetch and assert the exact bodies each tool builds.
// (Transforms and the HTTP client are tested elsewhere; this guards the tool layer
// so a refactor can't silently change what we send to Stuller.)
process.env.STULLER_USERNAME = 'u';
process.env.STULLER_PASSWORD = 'p';
process.env.STULLER_API_URL = 'https://api.stuller.com';
process.env.STULLER_CACHE_TTL_MS = '0'; // don't let caching skip a request

const products = await import('../src/tools/products.js');
const gems = await import('../src/tools/gems.js');
const invoices = await import('../src/tools/invoices.js');
const orders = await import('../src/tools/orders.js');
const configurable = await import('../src/tools/configurable.js');

let calls = [];
function mockFetch() {
  calls = [];
  globalThis.fetch = async (url, opts) => {
    const path = new URL(url).pathname;
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ path, method: opts.method, body });
    const shape =
      path.includes('/gem/diamonds') ? { Diamonds: [], TotalNumberOfDiamonds: 0 }
      : path.includes('/gem/labgrowndiamonds') ? { LabGrownDiamonds: [], TotalNumberOfLabGrownDiamonds: 0 }
      : path.includes('/gem/gemstones') ? { Gemstones: [] }
      : path.includes('/products/configureproduct') ? { TotalPrice: { Value: 1, CurrencyCode: 'USD' } }
      : path.includes('/products') ? { Products: [] }
      : path.includes('/invoice') ? { Invoices: [] }
      : {};
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(shape) };
  };
}
const lastBodyTo = (substr) => [...calls].reverse().find((c) => c.path.includes(substr))?.body;

test('getProducts sends SKU array (trimmed, deduped)', async () => {
  mockFetch();
  await products.getProducts({ skus: [' A ', 'A', 'B'] });
  assert.deepEqual(lastBodyTo('/v2/products').SKU, ['A', 'B']);
});

test('searchProducts sends selector + capped page + Include All', async () => {
  mockFetch();
  await products.searchProducts({ series: ['309'], pageSize: 100000 });
  const b = lastBodyTo('/v2/products');
  assert.deepEqual(b.Series, ['309']);
  assert.equal(b.PageSize, 100, 'pageSize hard-capped at 100');
  assert.deepEqual(b.Include, ['All']);
});

test('searchDiamonds builds SizeRange/PriceRange + facets', async () => {
  mockFetch();
  await gems.searchDiamonds({ caratMin: 1, caratMax: 1.5, color: ['G'], clarity: ['VS1'], shape: ['Round'], priceMax: 5000 });
  const b = lastBodyTo('/v2/gem/diamonds');
  assert.deepEqual(b.SizeRange, [1, 1.5]);
  assert.deepEqual(b.PriceRange, [0, 5000]);
  assert.deepEqual(b.Color, ['G']);
  assert.deepEqual(b.Shape, ['Round']);
  assert.equal(b.PageSize, 10);
});

test('searchLabGrownDiamonds hits the lab-grown endpoint', async () => {
  mockFetch();
  await gems.searchLabGrownDiamonds({ caratMin: 1 });
  assert.ok(lastBodyTo('/v2/gem/labgrowndiamonds'), 'posts to labgrowndiamonds');
});

test('searchGemstones sends StoneTypes + capped page (no Colors — client-side)', async () => {
  mockFetch();
  await gems.searchGemstones({ stoneTypes: ['Sapphire'], pageSize: 5 });
  const b = lastBodyTo('/v2/gem/gemstones');
  assert.deepEqual(b.StoneTypes, ['Sapphire']);
  assert.equal(b.PageSize, 5);
  assert.equal('Colors' in b, false);
});

test('listInvoices posts a date window', async () => {
  mockFetch();
  await invoices.listInvoices({ dateFrom: '2026-05-01', dateTo: '2026-06-01' });
  const b = lastBodyTo('/v2/invoice');
  assert.equal(b.DateFrom, '2026-05-01');
  assert.equal(b.DateTo, '2026-06-01');
});

test('configureProduct sends ProductId + RingSize', async () => {
  mockFetch();
  await configurable.configureProduct({ productId: 22145800, ringSize: 7 });
  const b = lastBodyTo('/v2/products/configureproduct');
  assert.equal(b.ProductId, 22145800);
  assert.equal(b.RingSize, 7);
});

test('submitOrder preview assembles Lines + reports missing fields, sends nothing to submitorder', async () => {
  mockFetch();
  const out = await orders.submitOrder({ lines: [{ sku: 'X', quantity: 2 }] }, false);
  assert.equal(out.action, 'preview');
  assert.deepEqual(out.body.Lines, [{ ItemNumber: 'X', Quantity: 2 }]);
  assert.deepEqual(out.missingFields.sort(), ['contact', 'payment', 'shipToAddress']);
  assert.equal(calls.some((c) => c.path.includes('submitorder')), false, 'preview must not POST submitorder');
});
