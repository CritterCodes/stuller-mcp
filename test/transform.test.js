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

test('transformProduct: WebCategories → webCategories { id, name, path }', () => {
  const p = transformProduct({
    WebCategories: [
      { Id: 21344, Name: 'Solitaire Engagement Rings', Path: 'jewelry/rings/engagement' },
      { Name: 'no id, dropped' },
    ],
  });
  assert.equal(p.webCategories.length, 1);
  assert.deepEqual(p.webCategories[0], { id: 21344, name: 'Solitaire Engagement Rings', path: 'jewelry/rings/engagement' });
});

test('transformProduct: image objects now carry zoom + caption (shared extractImages)', () => {
  const p = transformProduct({ Images: [{ FullUrl: 'a', ZoomUrl: 'z', Caption: 'c' }] });
  assert.equal(p.images[0].full, 'a');
  assert.equal(p.images[0].zoom, 'z');
  assert.equal(p.images[0].caption, 'c');
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

test('transformProduct: display block is render-ready', () => {
  const p = transformProduct({
    SKU: 'X',
    Description: 'Gold Ring',
    Price: { Value: 100, CurrencyCode: 'USD' },
    Images: [{ FullUrl: 'http://img/full.jpg', ThumbnailUrl: 'http://img/thumb.jpg' }],
  });
  assert.deepEqual(p.display, {
    title: 'Gold Ring',
    price: 100,
    currency: 'USD',
    primaryImage: 'http://img/full.jpg',
    thumbnail: 'http://img/thumb.jpg',
    video: null,
  });
});

test('transformProduct: display has null image when none present', () => {
  const p = transformProduct({ SKU: 'X', Description: 'No pics' });
  assert.equal(p.display.primaryImage, null);
  assert.equal(p.display.title, 'No pics');
});

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
