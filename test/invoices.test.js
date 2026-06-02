import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transformInvoice } from '../src/tools/invoices.js';

test('transformInvoice: tracking, totals (mixed money shapes), backorder count', () => {
  const i = transformInvoice({
    InvoiceNumber: 48172755,
    OrderNumber: 36668334,
    Status: 'Closed',
    TrackingNumber: '649514744407',
    TrackingLink: 'https://www.fedex.com/fedextrack/?trknbr=649514744407',
    ShipMethod: 'FED_STD_OVERNIGHT',
    OrderTotal: 261.61, // bare number
    InvoiceTotal: { Value: 291.5, CurrencyCode: 'USD' }, // Currency object
    InvoiceDetails: [
      { LineNumber: 1, ItemNumber: 'A', ShipQuantity: 1, BackOrderedQuantity: 0, UnitPrice: 10, LineTotal: 10 },
      { LineNumber: 2, ItemNumber: 'B', ShipQuantity: 0, BackOrderedQuantity: 2, UnitPrice: 5, LineTotal: 0 },
    ],
  });
  assert.equal(i.tracking.number, '649514744407');
  assert.ok(i.tracking.link.includes('fedextrack'));
  assert.equal(i.tracking.method, 'FED_STD_OVERNIGHT');
  assert.equal(i.totals.order, 261.61);
  assert.equal(i.totals.invoice, 291.5);
  assert.equal(i.lineItems.length, 2);
  assert.equal(i.backorderedItems, 1);
});

test('transformInvoice: no tracking, no line items → safe nulls/zeros', () => {
  const i = transformInvoice({ InvoiceNumber: 1, Status: 'Open' });
  assert.equal(i.tracking.number, null);
  assert.equal(i.tracking.link, null);
  assert.deepEqual(i.lineItems, []);
  assert.equal(i.backorderedItems, 0);
  assert.equal(i.totals.order, null);
});

test('transformInvoice: ship-to falls back state←province', () => {
  const i = transformInvoice({ ShipToProvince: 'ON', ShipToCity: 'Toronto' });
  assert.equal(i.shipTo.state, 'ON');
  assert.equal(i.shipTo.city, 'Toronto');
});
