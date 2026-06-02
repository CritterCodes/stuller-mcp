import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMeasurements,
  stoneDimensions,
  transformDiamond,
  transformGemstone,
  buildDiamondRequest,
} from '../src/tools/gems.js';
import { sizedImageUrl } from '../src/stuller/util.js';

// ---- sizedImageUrl (Stuller CDN size tokens) ----

const DAS = 'https://meteor.stullercloud.com/das/95540927';

test('sizedImageUrl: swaps an existing size token', () => {
  assert.equal(sizedImageUrl(`${DAS}?$standard$`, 'xlarge'), `${DAS}?$xlarge$`);
  assert.equal(sizedImageUrl(`${DAS}?$thumb$`, 'zoom'), `${DAS}?$zoom$`);
});
test('sizedImageUrl: adds a token when none present', () => {
  assert.equal(sizedImageUrl(DAS, 'thumb'), `${DAS}?$thumb$`);
});
test('sizedImageUrl: original strips the token', () => {
  assert.equal(sizedImageUrl(`${DAS}?$standard$`, 'original'), DAS);
});
test('sizedImageUrl: unknown size or non-Stuller URL is left untouched', () => {
  assert.equal(sizedImageUrl(`${DAS}?$standard$`, 'bogus'), `${DAS}?$standard$`);
  assert.equal(sizedImageUrl('https://example.com/pic.jpg', 'thumb'), 'https://example.com/pic.jpg');
  assert.equal(sizedImageUrl('', 'thumb'), '');
});

// ---- buildDiamondRequest (range + facet mapping) ----

test('buildDiamondRequest: carat/price ranges, defaulting the open side', () => {
  assert.deepEqual(buildDiamondRequest({ caratMin: 1, caratMax: 1.5 }).SizeRange, [1, 1.5]);
  assert.deepEqual(buildDiamondRequest({ caratMin: 1 }).SizeRange, [1, 100], 'open max defaults high');
  assert.deepEqual(buildDiamondRequest({ caratMax: 2 }).SizeRange, [0, 2], 'open min defaults to 0');
  assert.deepEqual(buildDiamondRequest({ priceMin: 500, priceMax: 5000 }).PriceRange, [500, 5000]);
});

test('buildDiamondRequest: omits ranges when no bound given; maps facets + paging', () => {
  const b = buildDiamondRequest({ color: ['G'], clarity: ['VS1'], shape: ['Round'], pageSize: 25, nextPage: 't' });
  assert.equal(b.SizeRange, undefined);
  assert.equal(b.PriceRange, undefined);
  assert.deepEqual(b.Color, ['G']);
  assert.deepEqual(b.Shape, ['Round']);
  assert.equal(b.PageSize, 25);
  assert.equal(b.NextPage, 't');
});

test('buildDiamondRequest: empty opts → empty body', () => {
  assert.deepEqual(buildDiamondRequest({}), {});
});

// ---- parseMeasurements ----

test('parseMeasurements: "L x W x H" → length/width', () => {
  assert.deepEqual(parseMeasurements('4.10 x 4.12 x 2.51'), { length: 4.1, width: 4.12 });
});
test('parseMeasurements: two numbers is enough', () => {
  assert.deepEqual(parseMeasurements('6.5x4.5'), { length: 6.5, width: 4.5 });
});
test('parseMeasurements: junk / single number / non-string → null', () => {
  assert.equal(parseMeasurements('n/a'), null);
  assert.equal(parseMeasurements('5.0'), null);
  assert.equal(parseMeasurements(null), null);
  assert.equal(parseMeasurements(undefined), null);
});

// ---- stoneDimensions ----

test('stoneDimensions: round gemstone with Width 0 mirrors length', () => {
  assert.deepEqual(stoneDimensions({ dimensions: { length: 5.0, width: 0 } }, 'gemstone'), {
    length: 5.0,
    width: 5.0,
  });
});
test('stoneDimensions: gemstone with both dims', () => {
  assert.deepEqual(stoneDimensions({ dimensions: { length: 6, width: 4 } }, 'gemstone'), {
    length: 6,
    width: 4,
  });
});
test('stoneDimensions: diamond explicit L×W', () => {
  assert.deepEqual(stoneDimensions({ length: 6.1, width: 4.0 }, 'diamond'), { length: 6.1, width: 4.0 });
});
test('stoneDimensions: diamond width 0 → mirror length', () => {
  assert.deepEqual(stoneDimensions({ length: 4.1, width: 0 }, 'diamond'), { length: 4.1, width: 4.1 });
});
test('stoneDimensions: diamond falls back to parsed Measurements', () => {
  assert.deepEqual(stoneDimensions({ measurements: '4.10 x 4.12 x 2.51' }, 'diamond'), {
    length: 4.1,
    width: 4.12,
  });
});
test('stoneDimensions: diamond round via mmSize/diameter only', () => {
  assert.deepEqual(stoneDimensions({ mmSize: 4.1 }, 'diamond'), { length: 4.1, width: 4.1 });
  assert.deepEqual(stoneDimensions({ maxDiameter: 5.2 }, 'diamond'), { length: 5.2, width: 5.2 });
});
test('stoneDimensions: no usable size → null', () => {
  assert.equal(stoneDimensions({}, 'gemstone'), null);
  assert.equal(stoneDimensions({}, 'diamond'), null);
  assert.equal(stoneDimensions({ dimensions: { length: 0, width: 0 } }, 'gemstone'), null);
});

// ---- transformDiamond ----

test('transformDiamond: maps 4Cs, money, cert, measurements', () => {
  const d = transformDiamond({
    SerialNumber: 123,
    Shape: 'ROUND',
    CaratWeight: 1.0,
    Color: 'G',
    Clarity: 'VS1',
    Cut: 'Ideal',
    Price: { Value: 5100, CurrencyCode: 'USD' },
    PricePerCarat: { Value: 5100 },
    Certification: 'GIA',
    CertificationNumber: '1408618343',
    Length: 6.4,
    Width: 6.42,
    Images: [{ FullUrl: 'http://x/d.jpg' }],
  });
  assert.equal(d.serialNumber, 123);
  assert.equal(d.caratWeight, 1.0);
  assert.equal(d.color, 'G');
  assert.equal(d.price, 5100);
  assert.equal(d.currency, 'USD');
  assert.equal(d.certificationNumber, '1408618343');
  assert.equal(d.length, 6.4);
  assert.equal(d.images[0].full, 'http://x/d.jpg');
});
test('transformDiamond: empty input does not throw', () => {
  const d = transformDiamond({});
  assert.equal(d.price, null);
  assert.equal(d.currency, 'USD');
  assert.deepEqual(d.images, []);
});

// ---- transformGemstone ----

test('transformDiamond: display composes a title from the 4Cs', () => {
  const d = transformDiamond({
    CaratWeight: 1.0,
    Color: 'G',
    Clarity: 'VS1',
    Shape: 'Round',
    Price: { Value: 5100, CurrencyCode: 'USD' },
    Images: [{ FullUrl: 'http://img/d.jpg' }],
  });
  assert.equal(d.display.title, '1ct G VS1 Round Diamond');
  assert.equal(d.display.price, 5100);
  assert.equal(d.display.primaryImage, 'http://img/d.jpg');
});

test('transformGemstone: maps type, color, dims, money', () => {
  const g = transformGemstone({
    SerialNumber: 9,
    StoneType: 'Sapphire',
    Color: 'Bl',
    CaratWeight: 4.09,
    Price: 11247.5,
    Length: 9.1,
    Width: 7.2,
    Height: 5,
  });
  assert.equal(g.stoneType, 'Sapphire');
  assert.equal(g.caratWeight, 4.09);
  assert.equal(g.price, 11247.5, 'bare-number money is accepted');
  assert.equal(g.dimensions.length, 9.1);
  assert.equal(g.dimensions.width, 7.2);
});
