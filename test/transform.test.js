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
