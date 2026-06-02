import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveProductFacets } from '../src/tools/products.js';

// A representative slice of Stuller's live facet vocabulary.
const FACETS = [
  {
    type: 'ProductType',
    values: [
      { displayValue: 'Earrings', value: 'Earrings' },
      { displayValue: 'Rings', value: 'Rings' },
      { displayValue: 'Bracelets', value: 'Bracelets' },
      { displayValue: 'Bulk Chain', value: 'Bulk Chain' },
    ],
  },
  {
    type: 'MetalQuality',
    values: [
      { displayValue: '10K White Gold', value: '10K White Gold' },
      { displayValue: '14K White Gold', value: '14K White Gold' },
      { displayValue: '18K White Gold', value: '18K White Gold' },
      { displayValue: '14K Yellow Gold', value: '14K Yellow Gold' },
      { displayValue: 'Sterling Silver', value: 'Sterling Silver' },
      { displayValue: 'Platinum', value: 'Platinum' },
    ],
  },
  {
    type: 'StoneFamily',
    values: [
      { displayValue: 'Diamond', value: 'Diamond' },
      { displayValue: 'Sapphire', value: 'Sapphire' },
    ],
  },
  {
    type: 'StoneShape',
    values: [
      { displayValue: 'Round', value: 'Round' },
      { displayValue: 'Oval', value: 'Oval' },
    ],
  },
  {
    type: 'StoneColor',
    values: [
      { displayValue: 'White', value: 'White' },
      { displayValue: 'Gold', value: 'Gold' }, // soft-token-only; must not match "gold"
      { displayValue: 'G', value: 'G' }, // grade code; must never substring-match
      { displayValue: 'D', value: 'D' },
    ],
  },
];

function asMap(resolved) {
  return Object.fromEntries(resolved.map((r) => [r.type, r.values.map((v) => v.displayValue)]));
}

test('"white gold" resolves to all white-gold karats, not stone-color White', () => {
  const { resolved } = resolveProductFacets('white gold diamond stud earrings', FACETS);
  const m = asMap(resolved);
  assert.deepEqual(m.MetalQuality, ['10K White Gold', '14K White Gold', '18K White Gold']);
  assert.deepEqual(m.ProductType, ['Earrings'], '"earrings" must not match "Rings"');
  assert.deepEqual(m.StoneFamily, ['Diamond']);
  assert.ok(!m.StoneColor, '"white" is consumed by the metal');
});

test('without "gold", "white" is read as a stone color', () => {
  const m = asMap(resolveProductFacets('white diamond', FACETS).resolved);
  assert.deepEqual(m.StoneColor, ['White']);
  assert.deepEqual(m.StoneFamily, ['Diamond']);
  assert.ok(!m.MetalQuality);
});

test('grade codes and soft-only values never spuriously match', () => {
  const m = asMap(resolveProductFacets('yellow gold ring', FACETS).resolved);
  // "gold" alone must not pull StoneColor "Gold" or grade "G"/"D".
  assert.ok(!m.StoneColor);
  assert.deepEqual(m.MetalQuality, ['14K Yellow Gold']);
  assert.deepEqual(m.ProductType, ['Rings']);
});

test('singular/plural tolerance: "earring" matches "Earrings", "ring" matches "Rings"', () => {
  assert.deepEqual(asMap(resolveProductFacets('diamond earring', FACETS).resolved).ProductType, ['Earrings']);
  assert.deepEqual(asMap(resolveProductFacets('gold ring', FACETS).resolved).ProductType, ['Rings']);
});

test('filter hints are detected from natural phrasing', () => {
  assert.deepEqual(resolveProductFacets('sterling silver bracelet in stock', FACETS).detectedFilters, ['InStock']);
  assert.deepEqual(resolveProductFacets('best seller rings', FACETS).detectedFilters, ['BestSeller']);
  assert.deepEqual(resolveProductFacets('platinum ring', FACETS).detectedFilters, []);
});

test('unmatched terms are reported, filler words excluded', () => {
  const r = resolveProductFacets('sterling silver bracelet with hand engraving please', FACETS);
  assert.ok(r.unmatchedTerms.includes('engraving'));
  assert.ok(r.unmatchedTerms.includes('hand'));
  assert.ok(!r.unmatchedTerms.includes('with'), 'filler excluded');
  assert.ok(!r.unmatchedTerms.includes('please'), 'filler excluded');
});

test('empty / filler-only / whitespace queries resolve to nothing (no throw)', () => {
  for (const q of ['', '   ', 'the and with for', null, undefined]) {
    const r = resolveProductFacets(q, FACETS);
    assert.equal(r.resolved.length, 0);
    assert.deepEqual(r.detectedFilters, []);
  }
});

test('regex-special characters in the query are handled safely', () => {
  // Normalization strips punctuation, so this must not throw or mis-bind a regex.
  const r = resolveProductFacets('1/2 ct (round) diamond [white gold]', FACETS);
  const m = asMap(r.resolved);
  assert.deepEqual(m.StoneShape, ['Round']);
  assert.deepEqual(m.StoneFamily, ['Diamond']);
  assert.deepEqual(m.MetalQuality, ['10K White Gold', '14K White Gold', '18K White Gold']);
});

test('no facets array → no matches, still returns shape', () => {
  const r = resolveProductFacets('diamond ring', []);
  assert.deepEqual(r.resolved, []);
  assert.ok(Array.isArray(r.unmatchedTerms));
});

test('multi-word phrase wins over its substrings (Sterling Silver vs Sterling stone facets)', () => {
  const facets = [
    ...FACETS,
    { type: 'StoneCut', values: [{ displayValue: 'Sterling', value: 'Sterling' }] },
  ];
  const m = asMap(resolveProductFacets('sterling silver ring', facets).resolved);
  assert.deepEqual(m.MetalQuality, ['Sterling Silver']);
  assert.ok(!m.StoneCut, '"sterling" consumed by the metal phrase, not a stone cut');
});
