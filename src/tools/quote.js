import { pricingAvailability } from './products.js';

// Stuller's v2 API has no server-side cart, so a quote is built in this server's
// memory. State is per-process (i.e. per MCP session) and is lost on restart.
// Multiple named quotes are supported via `cartId` (default "default").
const carts = new Map();

function getCart(cartId = 'default') {
  if (!carts.has(cartId)) carts.set(cartId, []);
  return carts.get(cartId);
}

// Pure summary over a list of line items — exported for unit testing.
export function summarizeCart(items, cartId = 'default') {
  const lines = items.map((it) => ({
    ...it,
    lineTotal: it.unitPrice != null ? Number((it.unitPrice * it.quantity).toFixed(2)) : null,
  }));
  const subtotal = Number(
    lines.reduce((sum, l) => sum + (l.lineTotal || 0), 0).toFixed(2)
  );
  return {
    cartId,
    itemCount: lines.length,
    totalQuantity: lines.reduce((sum, l) => sum + l.quantity, 0),
    subtotal,
    currency: lines.find((l) => l.currency)?.currency || 'USD',
    flags: {
      hasUnpricedLines: lines.some((l) => l.unitPrice == null),
      hasManualLines: lines.some((l) => l.source === 'manual'),
      hasOutOfStock: lines.some((l) => l.source === 'stuller' && l.orderable === false),
    },
    lines,
  };
}

async function priceSku(sku) {
  const res = await pricingAvailability({ skus: [sku] });
  if (!res.items.length) throw new Error(`SKU not found in Stuller catalog: ${sku}`);
  return res.items[0];
}

/**
 * Add a line to a quote. Provide `sku` to pull live Stuller pricing/availability,
 * OR `description` + `unitPrice` for a manual line (e.g. labor, a custom charge).
 * @param {{ cartId?:string, sku?:string, quantity?:number, description?:string, unitPrice?:number }} opts
 */
export async function quoteAdd(opts = {}) {
  const cartId = opts.cartId || 'default';
  const quantity = opts.quantity && opts.quantity > 0 ? opts.quantity : 1;
  const cart = getCart(cartId);

  let line;
  if (opts.sku) {
    const p = await priceSku(opts.sku);
    line = {
      source: 'stuller',
      sku: p.itemNumber,
      description: p.description,
      quantity,
      unitPrice: p.price ?? null,
      currency: p.currency || 'USD',
      orderable: p.orderable,
      onHand: p.onHand,
    };
    // Merge with an existing identical SKU line rather than duplicating.
    const existing = cart.find((l) => l.source === 'stuller' && l.sku === line.sku);
    if (existing) existing.quantity += quantity;
    else cart.push(line);

    // Warn (but still allow) when adding something that can't actually be ordered.
    if (line.orderable === false || line.unitPrice == null || line.unitPrice === 0) {
      const summary = summarizeCart(cart, cartId);
      summary.warning = `Added ${line.sku}, but it is ${line.orderable === false ? 'not orderable' : 'unpriced/$0'} — it likely can't be ordered. Review before quoting.`;
      return summary;
    }
  } else {
    if (!opts.description || opts.unitPrice == null) {
      throw new Error('Provide either `sku`, or both `description` and `unitPrice` for a manual line.');
    }
    line = {
      source: 'manual',
      sku: null,
      description: opts.description,
      quantity,
      unitPrice: Number(opts.unitPrice),
      currency: 'USD',
    };
    cart.push(line);
  }

  return summarizeCart(cart, cartId);
}

/**
 * Remove a line by `sku` (Stuller line) or 1-based `index`.
 * @param {{ cartId?:string, sku?:string, index?:number }} opts
 */
export function quoteRemove(opts = {}) {
  const cartId = opts.cartId || 'default';
  const cart = getCart(cartId);

  if (opts.sku) {
    const i = cart.findIndex((l) => l.sku === opts.sku);
    if (i === -1) throw new Error(`No line with SKU ${opts.sku} in quote "${cartId}".`);
    cart.splice(i, 1);
  } else if (opts.index != null) {
    const i = opts.index - 1;
    if (i < 0 || i >= cart.length) throw new Error(`Index ${opts.index} out of range (1..${cart.length}).`);
    cart.splice(i, 1);
  } else {
    throw new Error('Provide `sku` or `index` to remove a line.');
  }
  return summarizeCart(cart, cartId);
}

/**
 * View a quote. Pass `refresh: true` to re-price all Stuller lines live.
 * @param {{ cartId?:string, refresh?:boolean }} opts
 */
export async function quoteView(opts = {}) {
  const cartId = opts.cartId || 'default';
  const cart = getCart(cartId);

  if (opts.refresh) {
    const skus = cart.filter((l) => l.source === 'stuller').map((l) => l.sku);
    if (skus.length) {
      const { items } = await pricingAvailability({ skus });
      const bySku = new Map(items.map((i) => [String(i.itemNumber), i]));
      for (const l of cart) {
        const fresh = bySku.get(String(l.sku));
        if (fresh) {
          l.unitPrice = fresh.price ?? null;
          l.currency = fresh.currency || l.currency;
          l.orderable = fresh.orderable;
          l.onHand = fresh.onHand;
        }
      }
    }
  }
  return { ...summarizeCart(cart, cartId), refreshed: Boolean(opts.refresh) };
}

/** Empty a quote. @param {{ cartId?:string }} opts */
export function quoteClear(opts = {}) {
  const cartId = opts.cartId || 'default';
  carts.set(cartId, []);
  return summarizeCart([], cartId);
}

/**
 * Convert a quote into a submit_order-ready `lines` array. Manual (non-SKU)
 * lines can't be ordered through the API and are returned under `excluded`.
 * @param {{ cartId?:string }} opts
 */
export function quoteToOrder(opts = {}) {
  const cartId = opts.cartId || 'default';
  const cart = getCart(cartId);
  const lines = cart.filter((l) => l.source === 'stuller').map((l) => ({ sku: l.sku, quantity: l.quantity }));
  const excluded = cart.filter((l) => l.source === 'manual').map((l) => ({ description: l.description, unitPrice: l.unitPrice }));
  return {
    cartId,
    lines,
    excluded,
    note:
      excluded.length
        ? 'Manual lines cannot be ordered via the API and were excluded. Pass `lines` to submit_order (dry run by default).'
        : 'Pass `lines` to submit_order (dry run by default) to place this order.',
  };
}

// Test helper — clears all in-memory carts.
export function _resetCartsForTest() {
  carts.clear();
}
