import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeProductsResponse,
  transformProduct,
  summarizePricing,
} from '../src/stuller/transform.js';

test('normalizeProductsResponse handles the { Products, NextPage } envelope', () => {
  const { products, nextPage } = normalizeProductsResponse({
    Products: [{ SKU: 'X' }],
    NextPage: 'tok',
  });
  assert.equal(products.length, 1);
  assert.equal(nextPage, 'tok');
});

test('normalizeProductsResponse wraps a bare single object', () => {
  const { products, nextPage } = normalizeProductsResponse({ SKU: 'X' });
  assert.equal(products.length, 1);
  assert.equal(nextPage, null);
});

test('normalizeProductsResponse tolerates empty/garbage input', () => {
  assert.deepEqual(normalizeProductsResponse(null), { products: [], nextPage: null });
});

test('transformProduct maps core Stuller fields across casings', () => {
  const p = transformProduct({
    SKU: 'SOLDER:0267:P',
    Description: 'Test Solder',
    Price: { Value: 12.5, CurrencyCode: 'USD' },
    OnHand: 3,
    Orderable: true,
    Status: 'In Stock',
  });
  assert.equal(p.itemNumber, 'SOLDER:0267:P');
  assert.equal(p.description, 'Test Solder');
  assert.equal(p.price, 12.5);
  assert.equal(p.currency, 'USD');
  assert.equal(p.stock.onHand, 3);
  assert.equal(p.stock.orderable, true);
});

test('summarizePricing projects only the money + stock fields', () => {
  const summary = summarizePricing(
    transformProduct({ SKU: 'A', Price: { Value: 9.99 }, OnHand: 1, Orderable: false })
  );
  assert.deepEqual(Object.keys(summary).sort(), [
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
});

test('the MCP server builds and registers tools without credentials', async () => {
  const { buildServer } = await import('../src/server.js');
  const server = buildServer();
  assert.ok(server, 'buildServer() should return a server');
});

test('resolveProductFacets maps NL queries and disambiguates white-gold vs white-stone', async () => {
  const { resolveProductFacets } = await import('../src/tools/products.js');
  const facets = [
    { type: 'ProductType', values: [{ displayValue: 'Earrings', value: 'Earrings' }, { displayValue: 'Rings', value: 'Rings' }, { displayValue: 'Bracelets', value: 'Bracelets' }] },
    { type: 'MetalQuality', values: [{ displayValue: '10K White Gold', value: '10K White Gold' }, { displayValue: '14K White Gold', value: '14K White Gold' }, { displayValue: 'Sterling Silver', value: 'Sterling Silver' }] },
    { type: 'StoneFamily', values: [{ displayValue: 'Diamond', value: 'Diamond' }, { displayValue: 'Sapphire', value: 'Sapphire' }] },
    { type: 'StoneColor', values: [{ displayValue: 'White', value: 'White' }, { displayValue: 'G', value: 'G' }, { displayValue: 'D', value: 'D' }] },
  ];

  const a = resolveProductFacets('white gold diamond stud earrings', facets);
  const types = Object.fromEntries(a.resolved.map((r) => [r.type, r.values.map((v) => v.displayValue)]));
  assert.deepEqual(types.MetalQuality, ['10K White Gold', '14K White Gold'], 'both white-gold karats');
  assert.deepEqual(types.ProductType, ['Earrings'], '"earrings" must not match "Rings"');
  assert.deepEqual(types.StoneFamily, ['Diamond']);
  assert.ok(!types.StoneColor, '"white" is consumed by the metal, not StoneColor');
  assert.ok(!('G' in (types.StoneColor || [])), 'short grade codes never substring-match');

  // Without "gold", "white" is correctly read as a stone color.
  const b = resolveProductFacets('white diamond', facets);
  const bt = Object.fromEntries(b.resolved.map((r) => [r.type, r.values.map((v) => v.displayValue)]));
  assert.deepEqual(bt.StoneColor, ['White']);
  assert.deepEqual(bt.StoneFamily, ['Diamond']);
  assert.ok(!bt.MetalQuality, 'no metal without a metal word');

  // Filter detection + unmatched reporting.
  const c = resolveProductFacets('sterling silver bracelet in stock with engraving', facets);
  assert.deepEqual(c.detectedFilters, ['InStock']);
  assert.ok(c.unmatchedTerms.includes('engraving'), 'unmapped terms are reported');
});

test('stoneDimensions falls back to length when width is 0 (round stones)', async () => {
  const { stoneDimensions } = await import('../src/tools/gems.js');
  // Round gemstone: Width reported as 0 → should mirror length.
  assert.deepEqual(stoneDimensions({ dimensions: { length: 5.0, width: 0 } }, 'gemstone'), {
    length: 5.0,
    width: 5.0,
  });
  // Diamond with explicit L×W.
  assert.deepEqual(stoneDimensions({ length: 6.1, width: 4.0 }, 'diamond'), { length: 6.1, width: 4.0 });
  // Diamond falling back to parsed measurements.
  assert.deepEqual(stoneDimensions({ measurements: '4.10 x 4.12 x 2.51' }, 'diamond'), {
    length: 4.1,
    width: 4.12,
  });
  // Diamond round via mmSize only.
  assert.deepEqual(stoneDimensions({ mmSize: 4.1 }, 'diamond'), { length: 4.1, width: 4.1 });
  // No usable dimensions.
  assert.equal(stoneDimensions({}, 'gemstone'), null);
});

test('the server advertises instructions at connect', async () => {
  const { buildServer } = await import('../src/server.js');
  const server = buildServer();
  // McpServer wraps the low-level Server, which stores instructions for the
  // initialize result. Guard that ours is actually wired through.
  assert.ok(server.server._instructions, 'server instructions should be set');
});

test('the usage guide covers the core concepts', async () => {
  const { SERVER_INSTRUCTIONS, USAGE_GUIDE } = await import('../src/help.js');
  assert.ok(SERVER_INSTRUCTIONS.length > 200, 'instructions should be substantive');
  for (const concept of ['search_diamonds', 'advanced_product_filters', 'dry run', 'pricing']) {
    assert.ok(USAGE_GUIDE.includes(concept), `guide should mention "${concept}"`);
  }
});
