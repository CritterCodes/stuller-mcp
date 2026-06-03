import { stullerRequest } from '../stuller/client.js';
import { pricingAvailability } from './products.js';

const ORDERS_PATH = '/v2/orders';
const SUBMIT_ORDER_PATH = '/v2/orders/submitorder';

function orderingDisabled() {
  return String(process.env.STULLER_DISABLE_ORDERING || '').toLowerCase() === 'true';
}

/**
 * Read order history / status. With no arguments returns recent orders; pass a
 * date range or order number to narrow. Read-only.
 * @param {{ orderNumber?: string, since?: string, until?: string }} opts
 */
export async function orderStatus(opts = {}) {
  const query = {};
  if (opts.orderNumber) query.orderNumber = opts.orderNumber;
  if (opts.since) query.dateFrom = opts.since;
  if (opts.until) query.dateTo = opts.until;
  try {
    return await stullerRequest('GET', ORDERS_PATH, { query });
  } catch (err) {
    // Stuller's /v2/orders frequently 500s / is gated by account. Degrade to a
    // clear pointer rather than a raw error — list_invoices is the working path
    // for "did it ship / what's the tracking".
    return {
      available: false,
      error: err.message,
      note:
        "Stuller's order-status endpoint returned an error (it is often account-gated). For shipment status and tracking numbers, use list_invoices (filter with onlyShipped + a date range).",
    };
  }
}

/**
 * Submit an order to Stuller. WRITE PATH — defaults to a DRY RUN: it assembles
 * and returns the exact request body WITHOUT sending it. Pass confirm: true to
 * actually transmit. Honors STULLER_DISABLE_ORDERING as a hard kill switch.
 *
 * @param {object} spec - { lines: [{ sku|itemNumber, quantity }], shipToAddress?,
 *   billToAddress?, contact?, payment?, purchaseOrderNumber?, comments?, ...passthrough }
 * @param {boolean} confirm - when true, transmit; otherwise return a preview
 */
export async function submitOrder(spec = {}, confirm = false) {
  const lines = (spec.lines || spec.Lines || []).map((line) => ({
    ItemNumber: line.itemNumber || line.sku || line.ItemNumber || line.SKU,
    Quantity: line.quantity ?? line.Quantity ?? 1,
    ...(line.comments || line.Comments ? { Comments: line.comments || line.Comments } : {}),
  }));

  if (!lines.length || lines.some((l) => !l.ItemNumber)) {
    throw new Error('Each order line needs an itemNumber/sku and quantity. `lines` is required.');
  }

  // Assemble the Stuller submitorder body. Known sections are mapped explicitly;
  // anything else on `spec` (minus our helper keys) is passed through verbatim so
  // callers can supply fields this wrapper does not model yet.
  const { lines: _l, Lines: _L, confirm: _c, shipToAddress, billToAddress, contact, payment,
    purchaseOrderNumber, customerData, comments, ...passthrough } = spec;

  const body = {
    Lines: lines,
    ...(shipToAddress ? { ShipToAddress: shipToAddress } : {}),
    ...(billToAddress ? { BillToAddress: billToAddress } : {}),
    ...(contact ? { Contact: contact } : {}),
    ...(payment ? { Payment: payment } : {}),
    ...(purchaseOrderNumber ? { PurchaseOrderNumber: purchaseOrderNumber } : {}),
    ...(customerData ? { CustomerData: customerData } : {}),
    ...(comments ? { Comments: comments } : {}),
    ...passthrough,
  };

  if (orderingDisabled()) {
    return {
      action: 'blocked',
      reason: 'ordering_disabled',
      message:
        'Order submission is disabled via STULLER_DISABLE_ORDERING=true. Unset it to allow orders. The assembled body is shown below for review.',
      lineCount: lines.length,
      body,
    };
  }

  // Validate every line SKU against the live catalog so a bogus SKU can't slip
  // through preview into a confirmed order.
  const skus = [...new Set(lines.map((l) => l.ItemNumber))];
  let unknownSkus = [];
  try {
    const { items } = await pricingAvailability({ skus });
    const found = new Set(items.map((i) => String(i.itemNumber)));
    unknownSkus = skus.filter((s) => !found.has(String(s)));
  } catch {
    unknownSkus = []; // if the check itself fails, don't block — Stuller validates on submit
  }

  // Stuller's submitorder typically requires a recipient, contact, and payment.
  // We can't know an account's exact rules (it may use defaults), so we don't
  // hard-block — but we surface what's missing so an order isn't sent half-built.
  const RECOMMENDED = { ShipToAddress: 'shipToAddress', Contact: 'contact', Payment: 'payment' };
  const missingFields = Object.entries(RECOMMENDED)
    .filter(([k]) => body[k] == null)
    .map(([, friendly]) => friendly);

  if (!confirm) {
    const warnings = [];
    if (unknownSkus.length) warnings.push(`${unknownSkus.length} SKU(s) not found in the catalog and will be rejected: ${unknownSkus.join(', ')}.`);
    if (missingFields.length) warnings.push(`Missing fields usually required by Stuller: ${missingFields.join(', ')}. The order may be rejected without them.`);
    return {
      action: 'preview',
      message:
        'Dry run — nothing sent to Stuller. Review the body below; supply any missing fields, then call again with confirm: true to transmit.',
      wouldPostTo: SUBMIT_ORDER_PATH,
      lineCount: lines.length,
      unknownSkus,
      missingFields,
      warnings,
      body,
    };
  }

  // Refuse to transmit an order containing unknown SKUs.
  if (unknownSkus.length) {
    return {
      action: 'rejected',
      reason: 'unknown_skus',
      message: `Not transmitted — these SKUs are not in the Stuller catalog: ${unknownSkus.join(', ')}. Fix the lines and retry.`,
      unknownSkus,
      body,
    };
  }

  const result = await stullerRequest('POST', SUBMIT_ORDER_PATH, { body });
  // Stuller signals submit failures via an Errors collection rather than HTTP status.
  const errors = result?.Errors || result?.errors || [];
  return {
    action: errors.length ? 'failed' : 'submitted',
    request: { lineCount: lines.length },
    ...(missingFields.length ? { missingFields } : {}),
    ...(errors.length ? { errors } : {}),
    response: result,
  };
}
