import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productCard } from '../src/tools/products.js';
import { transformProduct } from '../src/stuller/transform.js';

test('productCard: lean projection keeps only render/decision fields', () => {
  const full = transformProduct({
    SKU: 'X:1',
    Description: 'Gold Ring',
    Price: { Value: 100, CurrencyCode: 'USD' },
    OnHand: 2,
    Orderable: true,
    Status: 'In Stock',
    Images: [{ FullUrl: 'http://img/f.jpg', ThumbnailUrl: 'http://img/t.jpg' }],
    WebCategories: [{ Id: 21344, Name: 'Rings', Path: 'p' }],
  });
  const card = productCard(full);
  assert.deepEqual(Object.keys(card).sort(), [
    'available',
    'categoryIds',
    'currency',
    'itemNumber',
    'orderable',
    'price',
    'primaryImage',
    'title',
  ]);
  assert.equal(card.itemNumber, 'X:1');
  assert.equal(card.title, 'Gold Ring');
  assert.equal(card.price, 100);
  assert.equal(card.primaryImage, 'http://img/f.jpg');
  assert.deepEqual(card.categoryIds, [21344]);
  // A card must be dramatically smaller than the full object.
  assert.ok(JSON.stringify(card).length < JSON.stringify(full).length / 3);
});
