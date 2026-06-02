import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SERVER_INSTRUCTIONS, USAGE_GUIDE } from '../src/help.js';

const has = (text, term) => text.toLowerCase().includes(term.toLowerCase());

test('server instructions cover the key behaviors', () => {
  assert.ok(SERVER_INSTRUCTIONS.length > 200);
  for (const concept of ['advanced_product_filters', 'pricing', 'search_diamonds', 'dry run', 'confirm']) {
    assert.ok(has(SERVER_INSTRUCTIONS, concept), `instructions should mention "${concept}"`);
  }
});

test('usage guide covers discovery, stones, ordering, and quotes', () => {
  for (const concept of [
    'find products',
    'advanced_product_filters',
    'search_diamonds',
    'find_stones_by_dimensions',
    'quote_add_item',
    'submit_order',
    'dry run',
  ]) {
    assert.ok(has(USAGE_GUIDE, concept), `guide should mention "${concept}"`);
  }
});
