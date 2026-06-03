import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server.js';

const EXPECTED_TOOLS = [
  'get_started',
  'get_products',
  'product_detail',
  'pricing_availability',
  'find_products',
  'advanced_product_filters',
  'search_products',
  'discover_categories',
  'show_product',
  'metal_market_rates',
  'search_diamonds',
  'search_lab_grown_diamonds',
  'search_gemstones',
  'find_stones_by_dimensions',
  'search_virtual_products',
  'configure_product',
  'get_configured_product',
  'list_invoices',
  'get_shipment',
  'quote_add_item',
  'quote_view',
  'quote_remove_item',
  'quote_clear',
  'quote_to_order',
  'favorite_add',
  'favorite_list',
  'favorite_remove',
  'favorites_to_quote',
  'order_status',
  'submit_order',
];

test('server builds without credentials', () => {
  assert.ok(buildServer());
});

test('server advertises instructions at connect', () => {
  const server = buildServer();
  assert.ok(server.server._instructions, 'instructions should be set');
  assert.ok(server.server._instructions.length > 200);
});

test('every expected tool is registered (and nothing is missing)', () => {
  const server = buildServer();
  const registered = Object.keys(server._registeredTools || {});
  for (const name of EXPECTED_TOOLS) {
    assert.ok(registered.includes(name), `missing tool: ${name}`);
  }
  assert.equal(registered.length, EXPECTED_TOOLS.length, `tool count drifted: ${registered.join(', ')}`);
});

test('every registered tool has a non-trivial description', () => {
  const server = buildServer();
  for (const [name, def] of Object.entries(server._registeredTools || {})) {
    assert.ok(def.description && def.description.length > 20, `${name} needs a real description`);
  }
});
