import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transformVirtual } from '../src/tools/configurable.js';

test('transformVirtual: baseProductId comes from BaseProduct.Id, not ConfigurationModel.Id', () => {
  const v = transformVirtual({
    SKU: 'CONFIG.123',
    Price: { Value: 985.8, CurrencyCode: 'USD' },
    BaseProduct: { Id: 22145800, SKU: 'BASE:1' },
    ConfigurationModel: {
      Id: 966053,
      IsPegHeadable: true,
      RingSizeOptions: [{ Size: 7, IsStockedSize: true, Price: { Value: 0 } }],
      SettingOptions: [
        { LocationNumber: 1, Shape: 'Marquise', SizeMM: 7, Dimension1: 7, Dimension2: 3.5, SettingType: 'Prong' },
      ],
    },
    CanBeSetWith: [{ Quantity: 1, Shape: 'MARQUISE', Size: '7.00', SettingType: 'PR' }],
  });
  // The bug that 500'd configure_product: confusing these two ids.
  assert.equal(v.baseProductId, 22145800);
  assert.equal(v.configurationModelId, 966053);
  assert.notEqual(v.baseProductId, v.configurationModelId);

  assert.equal(v.price, 985.8);
  assert.equal(v.ringSizeOptions[0].size, 7);
  assert.equal(v.settingOptions[0].shape, 'Marquise');
  assert.equal(v.settingOptions[0].dimensions.d2, 3.5);
  assert.equal(v.canBeSetWith[0].size, '7.00');
});

test('transformVirtual: display prefers the fully-set (finished) image', () => {
  const v = transformVirtual({
    ShortDescription: 'Marquise Solitaire Mounting',
    Price: { Value: 985.8, CurrencyCode: 'USD' },
    Images: [{ FullUrl: 'http://img/empty-mount.jpg' }],
    FullySetImages: [{ FullUrl: 'http://img/with-stone.jpg' }],
  });
  assert.equal(v.display.title, 'Marquise Solitaire Mounting');
  assert.equal(v.display.primaryImage, 'http://img/with-stone.jpg', 'finished look wins');
});

test('configureProduct: validates required id + ring size before any network call', async () => {
  const { configureProduct } = await import('../src/tools/configurable.js');
  await assert.rejects(() => configureProduct({}), /productId.*required/i);
  await assert.rejects(() => configureProduct({ productId: 1, ringSize: 0 }), /must be between 1 and 20/i);
  await assert.rejects(() => configureProduct({ productId: 1, ringSize: 99 }), /must be between 1 and 20/i);
});

test('transformVirtual: setWith is de-duplicated (was repeating ~25×)', () => {
  const v = transformVirtual({
    SKU: 'X',
    SetWith: [
      { SKU: 'DIAMOND-GEN', Quantity: 1 },
      { SKU: 'DIAMOND-GEN', Quantity: 1 },
      { SKU: 'DIAMOND-GEN', Quantity: 1 },
      { SKU: 'OTHER', Quantity: 1 },
    ],
  });
  assert.equal(v.setWith.length, 2, 'duplicate SKUs collapsed');
  assert.deepEqual(v.setWith.map((s) => s.SKU), ['DIAMOND-GEN', 'OTHER']);
});

test('transformVirtual: missing config model / base product → safe defaults', () => {
  const v = transformVirtual({ SKU: 'X' });
  assert.equal(v.baseProductId, null);
  assert.equal(v.configurationModelId, null);
  assert.deepEqual(v.ringSizeOptions, []);
  assert.deepEqual(v.settingOptions, []);
  assert.deepEqual(v.canBeSetWith, []);
});
