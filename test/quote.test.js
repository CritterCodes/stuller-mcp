import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  quoteAdd,
  quoteRemove,
  quoteView,
  quoteClear,
  quoteToOrder,
  summarizeCart,
  _resetCartsForTest,
} from '../src/tools/quote.js';

// ---- summarizeCart (pure) ----

test('summarizeCart: totals, quantities, currency, flags', () => {
  const s = summarizeCart([
    { source: 'stuller', sku: 'A', quantity: 3, unitPrice: 10, currency: 'USD', orderable: true },
    { source: 'manual', sku: null, description: 'Labor', quantity: 1, unitPrice: 75, currency: 'USD' },
  ]);
  assert.equal(s.subtotal, 105);
  assert.equal(s.totalQuantity, 4);
  assert.equal(s.itemCount, 2);
  assert.equal(s.currency, 'USD');
  assert.equal(s.flags.hasManualLines, true);
  assert.equal(s.flags.hasOutOfStock, false);
});

test('summarizeCart: floating-point subtotal is rounded to cents', () => {
  const s = summarizeCart([
    { source: 'stuller', sku: 'A', quantity: 3, unitPrice: 0.1 },
    { source: 'stuller', sku: 'B', quantity: 1, unitPrice: 0.2 },
  ]);
  assert.equal(s.subtotal, 0.5); // not 0.5000000000001
});

test('summarizeCart: unpriced + out-of-stock flags', () => {
  const s = summarizeCart([
    { source: 'stuller', sku: 'A', quantity: 1, unitPrice: null },
    { source: 'stuller', sku: 'B', quantity: 1, unitPrice: 5, orderable: false },
  ]);
  assert.equal(s.flags.hasUnpricedLines, true);
  assert.equal(s.flags.hasOutOfStock, true);
  assert.equal(s.subtotal, 5, 'unpriced line contributes 0');
});

test('summarizeCart: empty cart', () => {
  const s = summarizeCart([]);
  assert.equal(s.subtotal, 0);
  assert.equal(s.itemCount, 0);
  assert.equal(s.currency, 'USD');
});

// ---- manual-line flows (no network) ----

test('quote: manual add → view → to_order excludes manual → remove → clear', async () => {
  _resetCartsForTest();
  const cartId = 'q1';

  await quoteAdd({ cartId, description: 'Bench labor', unitPrice: 75, quantity: 2 });
  let v = await quoteView({ cartId });
  assert.equal(v.subtotal, 150);
  assert.equal(v.itemCount, 1);

  const o = quoteToOrder({ cartId });
  assert.equal(o.lines.length, 0, 'manual lines are not orderable');
  assert.equal(o.excluded.length, 1);

  v = quoteRemove({ cartId, index: 1 });
  assert.equal(v.itemCount, 0);

  await quoteAdd({ cartId, description: 'X', unitPrice: 1 });
  assert.equal(quoteClear({ cartId }).itemCount, 0);
});

test('quote: manual line requires description AND unitPrice', async () => {
  _resetCartsForTest();
  await assert.rejects(() => quoteAdd({ cartId: 'q2', description: 'No price' }), /description.*unitPrice|unitPrice/i);
  await assert.rejects(() => quoteAdd({ cartId: 'q2' }), /sku|description/i);
});

test('quote: unitPrice 0 is a valid manual line (free item)', async () => {
  _resetCartsForTest();
  const c = await quoteAdd({ cartId: 'q3', description: 'Free gift', unitPrice: 0 });
  assert.equal(c.itemCount, 1);
  assert.equal(c.subtotal, 0);
});

test('quote: non-positive quantity defaults to 1', async () => {
  _resetCartsForTest();
  const c = await quoteAdd({ cartId: 'q4', description: 'L', unitPrice: 10, quantity: 0 });
  assert.equal(c.lines[0].quantity, 1);
});

// ---- remove errors ----

test('quote: remove by bad index / missing sku throws', () => {
  _resetCartsForTest();
  assert.throws(() => quoteRemove({ cartId: 'q5', index: 1 }), /out of range/i);
  assert.throws(() => quoteRemove({ cartId: 'q5', sku: 'NOPE' }), /No line/i);
  assert.throws(() => quoteRemove({ cartId: 'q5' }), /sku.*index|index/i);
});

// ---- carts are independent ----

test('quote: named carts are isolated', async () => {
  _resetCartsForTest();
  await quoteAdd({ cartId: 'a', description: 'A', unitPrice: 1 });
  await quoteAdd({ cartId: 'b', description: 'B', unitPrice: 2, quantity: 3 });
  assert.equal((await quoteView({ cartId: 'a' })).subtotal, 1);
  assert.equal((await quoteView({ cartId: 'b' })).subtotal, 6);
});
