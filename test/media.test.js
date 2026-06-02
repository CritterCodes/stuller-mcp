import { test } from 'node:test';
import assert from 'node:assert/strict';
import { showProduct } from '../src/tools/media.js';

function mockImageResponse(bytes, { status = 200, contentType = 'image/png' } = {}) {
  globalThis.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? contentType : null) },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
}

test('showProduct: explicit imageUrl → base64 + mimeType (no Stuller call)', async () => {
  const bytes = Buffer.from([1, 2, 3, 4]);
  mockImageResponse(bytes);
  const r = await showProduct({ imageUrl: 'http://img/x.png' });
  assert.equal(r.sourceUrl, 'http://img/x.png');
  assert.equal(r.mimeType, 'image/png');
  assert.equal(r.base64, bytes.toString('base64'));
  assert.equal(r.bytes, 4);
});

test('showProduct: strips charset from content-type', async () => {
  mockImageResponse(Buffer.from([0]), { contentType: 'image/jpeg; charset=binary' });
  const r = await showProduct({ imageUrl: 'http://img/y.jpg' });
  assert.equal(r.mimeType, 'image/jpeg');
});

test('showProduct: needs sku or imageUrl', async () => {
  await assert.rejects(() => showProduct({}), /sku.*imageUrl|imageUrl/i);
});

test('showProduct: surfaces a failed image fetch', async () => {
  mockImageResponse(Buffer.from([0]), { status: 404 });
  await assert.rejects(() => showProduct({ imageUrl: 'http://img/missing.jpg' }), /\(404\)/);
});
