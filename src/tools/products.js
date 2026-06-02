import { stullerRequest } from '../stuller/client.js';
import { normalizeProductsResponse, transformProduct, summarizePricing } from '../stuller/transform.js';

const PRODUCTS_PATH = '/v2/products';
const METAL_RATES_PATH = '/v2/products/metalmarketrates';
const ADVANCED_FILTERS_PATH = '/v2/products/advancedproductfilters';

// Include values that pull back the rich detail blocks (images, media, specs).
// "All" is the broadest documented ProductInclude value; callers can override.
const DETAIL_INCLUDE = ['All'];

/**
 * Fetch one or more products by SKU. Lean by default (whatever the base response
 * carries — description, price, availability); pass `include` for extra blocks.
 * @param {{ skus: string[], include?: string[] }} opts
 */
export async function getProducts({ skus, include } = {}) {
  const list = (Array.isArray(skus) ? skus : [skus]).filter(Boolean);
  if (!list.length) throw new Error('Provide at least one SKU in `skus`.');

  const body = { SKU: list };
  if (include?.length) body.Include = include;

  const payload = await stullerRequest('POST', PRODUCTS_PATH, { body });
  const { products } = normalizeProductsResponse(payload);

  const found = products.map((p) => transformProduct(p));
  const foundSkus = new Set(found.map((p) => String(p.itemNumber)));
  const notFound = list.filter((sku) => !foundSkus.has(String(sku)));

  return { count: found.length, notFound, products: found };
}

/**
 * Full detail for a single SKU, including images, media, and descriptive specs.
 * @param {{ sku: string, include?: string[] }} opts
 */
export async function productDetail({ sku, include } = {}) {
  if (!sku) throw new Error('`sku` is required.');
  const { products, notFound } = await getProducts({
    skus: [sku],
    include: include?.length ? include : DETAIL_INCLUDE,
  });
  if (!products.length) {
    throw new Error(`Product not found in Stuller catalog: ${sku}`);
  }
  return { product: products[0], notFound };
}

/**
 * Price + availability only, for a batch of SKUs. Thin projection over getProducts.
 * @param {{ skus: string[] }} opts
 */
export async function pricingAvailability({ skus } = {}) {
  const { products, notFound, count } = await getProducts({ skus });
  return { count, notFound, items: products.map(summarizePricing) };
}

/**
 * Filter the catalog by series / category / advanced filters, with paging.
 * NOTE: the Stuller products endpoint filters structurally (Series, CategoryIds,
 * Filter, AdvancedProductFilters) — it is not a free-text keyword search.
 * @param {{
 *   series?: string[], categoryIds?: number[], productIds?: number[],
 *   filter?: string[], advancedProductFilters?: object[],
 *   include?: string[], pageSize?: number, page?: number, nextPage?: string
 * }} opts
 */
export async function searchProducts(opts = {}) {
  const body = {};
  if (opts.series?.length) body.Series = opts.series;
  if (opts.categoryIds?.length) body.CategoryIds = opts.categoryIds;
  if (opts.productIds?.length) body.ProductId = opts.productIds;
  if (opts.filter?.length) body.Filter = opts.filter;
  if (opts.advancedProductFilters?.length) body.AdvancedProductFilters = opts.advancedProductFilters;

  // Require a real selector. (Checked before adding Include/paging, which are
  // always present and would otherwise mask an empty query that fetches the
  // entire catalog.)
  if (!Object.keys(body).length) {
    throw new Error(
      'Provide at least one filter (series, categoryIds, productIds, filter, or advancedProductFilters).'
    );
  }

  // Default to a full include so results carry SKU/price/images; without it the
  // search endpoint returns sparse records (no price). Callers can override.
  body.Include = opts.include?.length ? opts.include : ['All'];
  if (opts.pageSize) body.PageSize = opts.pageSize;
  if (opts.page) body.Page = opts.page;
  if (opts.nextPage) body.NextPage = opts.nextPage;

  const payload = await stullerRequest('POST', PRODUCTS_PATH, { body });
  const { products, nextPage } = normalizeProductsResponse(payload);

  return {
    count: products.length,
    nextPage, // pass back into `nextPage` on the next call to page through results
    hasMore: Boolean(nextPage),
    products: products.map((p) => transformProduct(p)),
  };
}

/** Current Stuller metal market rates (gold/platinum/silver). No arguments. */
export async function metalMarketRates() {
  const payload = await stullerRequest('GET', METAL_RATES_PATH);
  return payload;
}

/**
 * Discover the available faceted filters (and their valid values) for use with
 * search_products. This is the "what can I filter on" call: it returns facet
 * types such as ProductType, MetalQuality, StoneFamily, StoneShape, etc., each
 * with its list of valid { displayValue, value } options. Pass a facet Type +
 * Value back into search_products as `advancedProductFilters`.
 *
 * Optionally scope the facets by category/series/filter so the returned values
 * reflect that slice of the catalog.
 * @param {{ categoryIds?: number[], series?: string[], filter?: string[],
 *   advancedProductFilters?: object[] }} opts
 */
export async function advancedProductFilters(opts = {}) {
  const body = {};
  if (opts.categoryIds?.length) body.CategoryIds = opts.categoryIds;
  if (opts.series?.length) body.Series = opts.series;
  if (opts.filter?.length) body.Filter = opts.filter;
  if (opts.advancedProductFilters?.length) body.AdvancedProductFilters = opts.advancedProductFilters;

  const payload = await stullerRequest('POST', ADVANCED_FILTERS_PATH, { body });
  // Live responses nest the list under `AdvancedProductFilter` (singular);
  // accept the other casings defensively.
  const raw =
    payload?.AdvancedProductFilter ||
    payload?.AdvancedProductFilters ||
    payload?.advancedProductFilters ||
    [];

  const facets = raw.map((facet) => ({
    type: facet.Type,
    valueCount: (facet.Values || []).length,
    values: (facet.Values || []).map((v) => ({
      displayValue: v.DisplayValue,
      value: v.Value,
    })),
  }));

  return {
    facetCount: facets.length,
    facetTypes: facets.map((f) => f.type),
    facets,
    usage:
      'Pick a facet `type` and one of its `value`s, then pass { Type, Values: [{ DisplayValue, Value }] } to search_products `advancedProductFilters`.',
  };
}

// ---- natural-language facet resolver (pure; unit-tested without network) ----

// Karat/quality tokens that modify a metal rather than identify it — they don't
// count toward a match on their own.
const KARAT_TOKENS = new Set(['10k', '14k', '18k', '22k', '24k', '925', '950', '999']);
// Tokens common to many facet values that must not, alone, validate a match
// (e.g. a StoneColor literally named "Gold"). A multi-word value like
// "White Gold" still matches because "white" is a strong (non-soft) token.
const SOFT_TOKENS = new Set(['gold', 'silver']);
const MIN_TOKEN_LEN = 3;
// Generic words that aren't catalog terms — excluded from the unmatched report.
const FILLER_WORDS = new Set([
  'the', 'and', 'for', 'with', 'find', 'show', 'need', 'want', 'please', 'looking',
  'some', 'any', 'that', 'this', 'them', 'have', 'has', 'are', 'new', 'stock', 'available',
]);

function normalizeText(s = '') {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// All whole-word spans of `token` in the query, with BIDIRECTIONAL singular/plural
// tolerance — so a value token "earrings" matches a query word "earring" and vice
// versa. (A one-directional `s?` missed the singular-query case.)
function tokenSpans(query, token) {
  const t = token.replace(/[^a-z0-9]/g, '');
  if (t.length < MIN_TOKEN_LEN) return [];
  const variants = new Set([t]);
  if (t.endsWith('s') && t.length > MIN_TOKEN_LEN) variants.add(t.slice(0, -1));
  else variants.add(`${t}s`);
  const alt = [...variants].map(escapeRegExp).join('|');
  const spans = [];
  const re = new RegExp(`\\b(?:${alt})\\b`, 'g');
  let m;
  while ((m = re.exec(query))) spans.push([m.index, m.index + m[0].length]);
  return spans;
}

// First whole-phrase span of `phrase` in the query (word-bounded), or null.
function phraseSpan(query, phrase) {
  const m = new RegExp(`\\b${escapeRegExp(phrase)}\\b`).exec(query);
  return m ? [m.index, m.index + phrase.length] : null;
}

// Describe how a single facet value matches the query: as a contiguous phrase,
// or as a set of scattered tokens (all present, at least one strong). Returns
// the covered character spans + a weight used to resolve overlaps (more/longer
// coverage wins, so "white gold" beats a bare "white").
function matchValue(query, displayValue) {
  const vn = normalizeText(displayValue);
  if (!vn) return null;

  const span = phraseSpan(query, vn);
  if (span) return { spans: [span], weight: span[1] - span[0] };

  const tokens = vn.split(' ').filter((t) => !KARAT_TOKENS.has(t));
  if (!tokens.length) return null;
  if (!tokens.every((t) => tokenSpans(query, t).length > 0)) return null; // all must appear
  if (!tokens.some((t) => !SOFT_TOKENS.has(t) && t.length >= MIN_TOKEN_LEN)) return null; // need a strong token

  const all = tokens.flatMap((t) => tokenSpans(query, t));
  // Dedupe identical spans so a value repeating a word (e.g. "White Gold &
  // White Gold") isn't over-weighted by counting the same text twice.
  const seen = new Set();
  const spans = all.filter(([s, e]) => {
    const k = `${s}:${e}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const weight = spans.reduce((sum, [s, e]) => sum + (e - s), 0);
  return { spans, weight };
}

const FILTER_HINTS = [
  { re: /\b(in[-\s]?stock|available|on hand)\b/, flag: 'InStock' },
  { re: /\b(best[-\s]?seller|bestselling|popular)\b/, flag: 'BestSeller' },
  { re: /\b(orderable)\b/, flag: 'Orderable' },
];

/**
 * Map a natural-language query onto the live Stuller facet vocabulary.
 * Pure function — pass in the `facets` array from advancedProductFilters().
 *
 * Strategy: collect every (facet, value) candidate match with its covered text
 * spans, then accept candidates longest-coverage-first, consuming spans so a
 * shorter value can't re-claim text already explained by a more specific one
 * (e.g. "white gold" → MetalQuality consumes "white", blocking StoneColor=White).
 *
 * @returns {{ resolved: {type, values:{displayValue,value}[]}[], detectedFilters: string[] }}
 */
export function resolveProductFacets(query, facets = []) {
  const q = normalizeText(query);

  const candidates = [];
  for (const facet of facets) {
    for (const v of facet.values || []) {
      const match = matchValue(q, v.displayValue);
      if (match) candidates.push({ type: facet.type, value: v, ...match });
    }
  }

  candidates.sort((a, b) => b.weight - a.weight);

  // Consumed spans are tagged with the facet type that claimed them. A new
  // candidate is blocked only by text already claimed by a *different* type
  // (cross-facet exclusivity); values within the same facet freely share spans,
  // so "white gold" can match every white-gold karat at once.
  const consumed = [];
  const overlapsOtherType = (s, e, type) =>
    consumed.some((c) => c.type !== type && s < c.e && e > c.s);
  const byType = new Map();

  for (const c of candidates) {
    if (!c.spans.some(([s, e]) => !overlapsOtherType(s, e, c.type))) continue;
    for (const [s, e] of c.spans) consumed.push({ s, e, type: c.type });
    if (!byType.has(c.type)) byType.set(c.type, []);
    byType.get(c.type).push(c.value);
  }

  const resolved = [...byType.entries()].map(([type, values]) => ({ type, values }));
  const detectedFilters = FILTER_HINTS.filter((h) => h.re.test(q)).map((h) => h.flag);

  // Query words (≥3 chars, not filler) that never mapped to a facet — so the
  // caller can see what was ignored and refine.
  const covered = (s, e) => consumed.some((c) => s < c.e && e > c.s);
  const unmatchedTerms = [];
  const re = /\b[a-z0-9]{3,}\b/g;
  let m;
  while ((m = re.exec(q))) {
    if (FILLER_WORDS.has(m[0])) continue;
    if (!covered(m.index, m.index + m[0].length)) unmatchedTerms.push(m[0]);
  }

  return { resolved, detectedFilters, unmatchedTerms: [...new Set(unmatchedTerms)] };
}

/**
 * Natural-language product search. Resolves a phrase like
 * "white gold diamond stud earrings" against the live facet vocabulary, then
 * runs search_products with the resolved facets. Returns what it interpreted
 * (`resolvedFilters`) alongside the products so the caller can correct it.
 * @param {{ query: string, filter?: string[], pageSize?: number, page?: number, nextPage?: string }} opts
 */
export async function findProducts({ query, filter, pageSize, page, nextPage } = {}) {
  if (!query || !query.trim()) throw new Error('`query` is required.');

  const { facets } = await advancedProductFilters({});
  const { resolved, detectedFilters, unmatchedTerms } = resolveProductFacets(query, facets);
  const appliedFilters = [...new Set([...(filter || []), ...detectedFilters])];

  // Stuller models loose-stone facets (StoneFamily/Color/Shape/...) separately
  // from finished-goods ProductType — ANDing them returns zero. When a
  // ProductType is present, set the stone facets aside and report them.
  const LOOSE_STONE_FACETS = new Set([
    'StoneFamily',
    'StoneColor',
    'StoneShape',
    'StoneQuality',
    'StoneUniqueness',
    'StoneCut',
    'StoneSize',
  ]);
  const hasProductType = resolved.some((r) => r.type === 'ProductType');
  const applied = hasProductType ? resolved.filter((r) => !LOOSE_STONE_FACETS.has(r.type)) : resolved;
  const setAside = hasProductType ? resolved.filter((r) => LOOSE_STONE_FACETS.has(r.type)) : [];

  if (!applied.length && !appliedFilters.length) {
    return {
      query,
      matched: false,
      resolvedFilters: [],
      appliedFilters: [],
      unmatchedTerms,
      availableFacetTypes: facets.map((f) => f.type),
      message:
        "Couldn't map any terms to Stuller facets. Call advanced_product_filters to see valid values, or search by series/categoryIds via search_products.",
      products: [],
    };
  }

  const advancedFilters = applied.map((r) => ({
    Type: r.type,
    Values: r.values.map((v) => ({ DisplayValue: v.displayValue, Value: v.value })),
  }));

  const results = await searchProducts({
    advancedProductFilters: advancedFilters.length ? advancedFilters : undefined,
    filter: appliedFilters.length ? appliedFilters : undefined,
    pageSize,
    page,
    nextPage,
  });

  const fmt = (list) => list.map((r) => ({ type: r.type, values: r.values.map((v) => v.displayValue) }));
  const out = {
    query,
    matched: true,
    resolvedFilters: fmt(applied),
    appliedFilters,
    unmatchedTerms,
    ...results,
  };
  if (setAside.length) {
    out.notApplied = fmt(setAside);
    out.note =
      "Stone facets (e.g. StoneFamily) describe loose stones and can't be combined with a finished-jewelry ProductType in Stuller's catalog, so they were not applied. Results are filtered by product type/metal only; refine with metal or a category/series, or use search_diamonds for loose stones.";
  }
  return out;
}
