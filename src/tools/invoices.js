import { stullerRequest } from '../stuller/client.js';
import { money, isoDate } from '../stuller/util.js';

const INVOICE_PATH = '/v2/invoice';
const SHIPMENT_PATH = '/v2/invoice/shipment';

function transformInvoice(inv = {}) {
  const lineItems = (inv.InvoiceDetails || []).map((l) => ({
    lineNumber: l.LineNumber,
    itemNumber: l.ItemNumber,
    description: l.ItemDescription,
    shipQuantity: l.ShipQuantity,
    backOrderedQuantity: l.BackOrderedQuantity,
    unitPrice: money(l.UnitPrice),
    lineTotal: money(l.LineTotal),
    customerNotes: l.CustomerNotes || null,
    customerLineReference: l.CustomerLineReference || null,
  }));

  return {
    invoiceNumber: inv.InvoiceNumber ?? null,
    orderNumber: inv.OrderNumber ?? null,
    purchaseOrderNumber: inv.PurchaseOrderNumber || null,
    invoiceDate: inv.InvoiceDate ?? null,
    status: inv.Status ?? null,
    tracking: {
      number: inv.TrackingNumber || null,
      link: inv.TrackingLink || null,
      method: inv.ShipMethod || null,
    },
    totals: {
      order: money(inv.OrderTotal),
      invoice: money(inv.InvoiceTotal),
      due: money(inv.TotalDue),
      salesTax: money(inv.SalesTax),
      postageAndHandling: money(inv.PostageAndHandling),
    },
    shipTo: {
      address1: inv.ShipToAddress1 || null,
      address2: inv.ShipToAddress2 || null,
      address3: inv.ShipToAddress3 || null,
      city: inv.ShipToCity || null,
      state: inv.ShipToState || inv.ShipToProvince || null,
      zip: inv.ShipToZip || null,
      country: inv.ShipToCountry || null,
    },
    backorderedItems: lineItems.filter((l) => Number(l.backOrderedQuantity) > 0).length,
    lineItems,
  };
}

/**
 * List Stuller invoices for a date range — the fulfillment/tracking view. Each
 * invoice carries shipment tracking (number + carrier link), totals, ship-to
 * address, and line items with back-ordered quantities.
 *
 * NOTE: Stuller's invoice endpoint only filters by date server-side; narrowing
 * by orderNumber / invoiceNumber / purchaseOrderNumber is applied locally to the
 * returned set, so keep the date window around the order you're looking for.
 *
 * @param {{ dateFrom?:string, dateTo?:string, orderNumber?:string|number,
 *   invoiceNumber?:string|number, purchaseOrderNumber?:string, onlyOpen?:boolean,
 *   onlyShipped?:boolean, limit?:number }} opts
 */
export async function listInvoices(opts = {}) {
  const now = new Date();
  const dateTo = opts.dateTo || isoDate(now);
  const dateFrom = opts.dateFrom || isoDate(new Date(now.getTime() - 90 * 864e5)); // default last 90 days

  const payload = await stullerRequest('POST', INVOICE_PATH, { body: { DateFrom: dateFrom, DateTo: dateTo } });
  let invoices = (payload?.Invoices || payload?.invoices || []).map(transformInvoice);

  // Client-side narrowing (the API ignores these filters).
  const eq = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();
  if (opts.orderNumber != null) invoices = invoices.filter((i) => eq(i.orderNumber, opts.orderNumber));
  if (opts.invoiceNumber != null) invoices = invoices.filter((i) => eq(i.invoiceNumber, opts.invoiceNumber));
  if (opts.purchaseOrderNumber != null) invoices = invoices.filter((i) => eq(i.purchaseOrderNumber, opts.purchaseOrderNumber));
  if (opts.onlyOpen) invoices = invoices.filter((i) => String(i.status).toLowerCase() !== 'closed');
  if (opts.onlyShipped) invoices = invoices.filter((i) => Boolean(i.tracking.number));

  // Summarize the full matched set BEFORE limiting, so the totals stay accurate.
  const summary = {
    shipped: invoices.filter((i) => i.tracking.number).length,
    withBackorders: invoices.filter((i) => i.backorderedItems > 0).length,
  };
  const totalMatched = invoices.length;

  // Default to a small page — the full set (100s of invoices × line items) blows
  // past token limits. Line items are omitted unless asked for (backorderedItems
  // keeps the count); narrow with date range / orderNumber / onlyShipped for more.
  const limit = opts.limit || 25;
  invoices = invoices.slice(0, limit);
  if (!opts.includeLineItems) invoices = invoices.map(({ lineItems, ...rest }) => rest);

  return {
    dateFrom,
    dateTo,
    count: invoices.length,
    totalMatched,
    summary,
    lineItemsIncluded: Boolean(opts.includeLineItems),
    invoices,
  };
}

/**
 * Get a single shipment's full detail by its shipment header id (tracking,
 * carrier, destination, and package line items).
 * @param {{ shipmentHeaderId:number }} opts
 */
export async function getShipment(opts = {}) {
  if (opts.shipmentHeaderId == null) throw new Error('`shipmentHeaderId` is required.');
  const payload = await stullerRequest('POST', SHIPMENT_PATH, {
    body: { ShipmentHeaderId: Number(opts.shipmentHeaderId) },
  });
  return payload;
}

export { transformInvoice };
