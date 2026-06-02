import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeProductsResponse,
  transformProduct,
  summarizePricing,
} from '../src/stuller/transform.js';

// ---- normalizeProductsResponse ----

test('normalizeProductsResponse: { Products, NextPage } envelope', () => {
  const r = normalizeProductsResponse({ Products: [{ SKU: 'X' }], NextPage: 'tok' });
  assert.equal(r.products.length, 1);
  assert.equal(r.nextPage, 'tok');
});

test('normalizeProductsResponse: lowercase products + array input', () => {
  assert.equal(normalizeProductsResponse({ products: [{}, {}] }).products.length, 2);
  assert.equal(normalizeProductsResponse([{}, {}, {}]).products.length, 3);
});

test('normalizeProductsResponse: bare single product object is wrapped', () => {
  const r = normalizeProductsResponse({ SKU: 'ABC', Price: { Value: 1 } });
  assert.equal(r.products.length, 1);
  assert.equal(r.products[0].SKU, 'ABC');
});

test('normalizeProductsResponse: a ZERO-result envelope is NOT a phantom product', () => {
  // The bug: { PageSize, TotalNumberOfProducts } with no Products array was being
  // wrapped as one empty product, yielding count:1 with a blank SKU.
  const r = normalizeProductsResponse({ MetalMarkets: [], PageSize: 25, TotalNumberOfProducts: 0 });
  assert.equal(r.products.length, 0);
});

test('normalizeProductsResponse: null / undefined / garbage → empty', () => {
  assert.deepEqual(normalizeProductsResponse(null), { products: [], nextPage: null });
  assert.deepEqual(normalizeProductsResponse(undefined), { products: [], nextPage: null });
  assert.deepEqual(normalizeProductsResponse('nonsense'), { products: [], nextPage: null });
});

// ---- transformProduct ----

test('transformProduct: maps fields across casings', () => {
  const p = transformProduct({
    SKU: 'SOLDER:0267:P',
    Description: 'Test Solder',
    Price: { Value: 12.5, CurrencyCode: 'USD' },
    OnHand: 3,
    Orderable: true,
    Status: 'In Stock',
    GramWeight: 1.2,
  });
  assert.equal(p.itemNumber, 'SOLDER:0267:P');
  assert.equal(p.description, 'Test Solder');
  assert.equal(p.price, 12.5);
  assert.equal(p.currency, 'USD');
  assert.equal(p.stock.onHand, 3);
  assert.equal(p.stock.orderable, true);
  assert.equal(p.gramWeight, 1.2);
});

test('transformProduct: empty input does not throw and defaults sanely', () => {
  const p = transformProduct({});
  assert.equal(p.price, 0);
  assert.equal(p.currency, 'USD');
  assert.deepEqual(p.images, []);
  assert.equal(p.source, 'stuller-api-v2');
});

test('transformProduct: itemNumber falls back to the passed sku argument', () => {
  assert.equal(transformProduct({}, 'FALLBACK:1').itemNumber, 'FALLBACK:1');
});

test('transformProduct: images normalize from strings and objects', () => {
  const fromObj = transformProduct({ Images: [{ FullUrl: 'a', ThumbnailUrl: 'b' }] });
  assert.equal(fromObj.images[0].full, 'a');
  assert.equal(fromObj.images[0].thumbnail, 'b');
  const fromStr = transformProduct({ images: ['http://x/y.jpg'] });
  assert.equal(fromStr.images[0].full, 'http://x/y.jpg');
  // Non-array images must not throw.
  assert.deepEqual(transformProduct({ Images: 'oops' }).images, []);
});

test('transformProduct: descriptive elements feed metal + specifications', () => {
  const p = transformProduct({
    DescriptiveElementGroup: {
      DescriptiveElements: [{ Name: 'Quality', Value: '14KW', DisplayValue: '14K White Gold' }],
    },
  });
  assert.equal(p.metal.type, '14K White Gold');
  assert.equal(p.specifications.Quality.displayValue, '14K White Gold');
});

// ---- summarizePricing ----

test('summarizePricing: projects exactly the money + stock fields', () => {
  const s = summarizePricing(
    transformProduct({ SKU: 'A', Price: { Value: 9.99, CurrencyCode: 'USD' }, OnHand: 1, Orderable: false })
  );
  assert.deepEqual(Object.keys(s).sort(), [
    'availability',
    'currency',
    'description',
    'itemNumber',
    'leadTime',
    'onHand',
    'orderable',
    'price',
    'showcasePrice',
    'status',
  ]);
  assert.equal(s.price, 9.99);
  assert.equal(s.orderable, false);
});
