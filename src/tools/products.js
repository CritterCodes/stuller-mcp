import { stullerRequest } from '../stuller/client.js';
import { withCache } from '../stuller/cache.js';
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
  const list = [...new Set((Array.isArray(skus) ? skus : [skus]).filter(Boolean).map((s) => String(s).trim()).filter(Boolean))];
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
  // Keyword path: Stuller has no free-text search, but for consumables/findings
  // (solder, wire, sizing stock) the product Series name often equals the item
  // word, and the description carries the spec. Scan a structural slice and
  // filter descriptions by the keyword terms client-side. This is what makes
  // "find me orderable 14k yellow hard plumb sheet solder" actually resolve.
  if (opts.keyword) return searchProductsByKeyword(opts);

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
  // Default to a SMALL page and CAP it. Stuller defaults to 500 full products
  // (~MBs) and honors any pageSize, so an unbounded request overflows token
  // limits — callers page with nextPage instead.
  body.PageSize = Math.min(opts.pageSize || 10, 100);
  if (opts.page) body.Page = opts.page;
  if (opts.nextPage) body.NextPage = opts.nextPage;

  const payload = await stullerRequest('POST', PRODUCTS_PATH, { body });
  const { products, nextPage } = normalizeProductsResponse(payload);
  const transformed = products.map((p) => transformProduct(p));

  return {
    count: transformed.length,
    nextPage, // pass back into `nextPage` on the next call to page through results
    hasMore: Boolean(nextPage),
    // Lean cards by default to stay under token limits; `full: true` returns the
    // complete product objects (heavy). For one item, prefer product_detail.
    products: opts.full ? transformed : transformed.map(productCard),
  };
}

// Keyword search within a structural slice: page the selector (series/category/
// filter) and keep products whose description contains ALL the keyword terms.
async function searchProductsByKeyword(opts) {
  const terms = String(opts.keyword)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
  const want = Math.min(opts.pageSize || 10, 50);
  const maxScan = Math.min(opts.maxScan || 400, 1000);
  const matched = [];
  let nextPage;
  let scanned = 0;
  let pages = 0;
  do {
    const res = await searchProducts({ ...opts, keyword: undefined, pageSize: 100, nextPage });
    for (const c of res.products) {
      const hay = `${c.title || ''} ${c.itemNumber || ''}`.toLowerCase();
      if (terms.every((t) => hay.includes(t))) matched.push(c);
    }
    scanned += res.products.length;
    nextPage = res.nextPage;
    pages += 1;
  } while (nextPage && scanned < maxScan && pages < 10 && matched.length < want);

  return {
    keyword: opts.keyword,
    matchedTerms: terms,
    scanned,
    count: Math.min(matched.length, want),
    hasMore: Boolean(nextPage),
    note:
      'Keyword-filtered client-side over a category/series scan (Stuller has no free-text search). Narrow with series/categoryIds + filter:["Orderable"] for best results; raise maxScan if you expect more.',
    products: matched.slice(0, want),
  };
}

// Compact, render-ready card derived from a transformed product. Keeps results
// small; use product_detail / get_products for full specs, media, and categories.
export function productCard(t) {
  return {
    itemNumber: t.itemNumber,
    title: t.display?.title ?? t.description ?? null,
    price: t.display?.price ?? t.price ?? null,
    currency: t.display?.currency ?? t.currency ?? 'USD',
    available: t.stock?.available ?? null,
    orderable: t.stock?.orderable ?? null,
    primaryImage: t.display?.primaryImage ?? null,
    categoryIds: (t.webCategories || []).map((c) => c.id),
  };
}

/** Current Stuller metal market rates (gold/platinum/silver). No arguments. Cached (slow-changing). */
export async function metalMarketRates() {
  return withCache('metal-market-rates', () => stullerRequest('GET', METAL_RATES_PATH));
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

  // Facet vocabulary is slow-changing and called repeatedly (find_products,
  // discover_categories) — cache by the scoping body.
  const payload = await withCache(`apf:${JSON.stringify(body)}`, () =>
    stullerRequest('POST', ADVANCED_FILTERS_PATH, { body })
  );
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

/**
 * Tool-facing, token-friendly view of the facet vocabulary. The full value lists
 * are huge (MetalQuality/StoneFamily have hundreds of entries), so by default
 * this returns facet types + counts + a small sample. Pass `facetType` to get one
 * facet's complete value list.
 * @param {{ facetType?:string, categoryIds?:number[], series?:string[], filter?:string[] }} opts
 */
export async function advancedProductFiltersSummary(opts = {}) {
  const { facets } = await advancedProductFilters({
    categoryIds: opts.categoryIds,
    series: opts.series,
    filter: opts.filter,
  });

  if (opts.facetType) {
    const f = facets.find((x) => String(x.type).toLowerCase() === String(opts.facetType).toLowerCase());
    if (!f) {
      throw new Error(`Unknown facetType "${opts.facetType}". Available: ${facets.map((x) => x.type).join(', ')}.`);
    }
    // Some facets (e.g. StoneSize ~1082 values) are huge — truncate to stay under
    // token limits and tell the caller how many were omitted.
    const CAP = 200;
    const values = f.values.slice(0, CAP);
    const out = { facetType: f.type, valueCount: f.valueCount, values };
    if (f.valueCount > CAP) {
      out.truncated = true;
      out.note = `Showing the first ${CAP} of ${f.valueCount} values. Scope with categoryIds/series to narrow, or just use find_products with a plain-language query.`;
    }
    return out;
  }

  return {
    facetCount: facets.length,
    facetTypes: facets.map((f) => f.type),
    facets: facets.map((f) => ({
      type: f.type,
      valueCount: f.valueCount,
      sampleValues: f.values.slice(0, 10).map((v) => v.displayValue),
    })),
    usage: 'Call again with facetType:"MetalQuality" (etc.) for that facet\'s full value list, then pass a value into search_products advancedProductFilters. Or just use find_products with a plain-language query.',
  };
}

/**
 * Discover merchandising categories (and their CategoryIds) by scanning products.
 * Stuller exposes no category-tree endpoint, but products carry `WebCategories`
 * ({ id, name, path }) whose ids ARE valid CategoryIds. This scans a slice of the
 * catalog and aggregates the distinct categories it sees, so you can find a
 * CategoryId (e.g. "Diamond Stud Earrings") and then search_products by it —
 * which is how finished-jewelry browse actually works.
 *
 * @param {{ productType?:string, series?:string[], categoryIds?:number[], productIds?:number[],
 *   filter?:string[], advancedProductFilters?:object[], contains?:string,
 *   scanPages?:number, pageSize?:number }} opts
 */
export async function discoverCategories(opts = {}) {
  const contains = opts.contains ? String(opts.contains).toLowerCase() : null;
  const scanPages = Math.max(1, Math.min(opts.scanPages || 2, 10));
  const pageSize = opts.pageSize || 50;

  const apf = Array.isArray(opts.advancedProductFilters) ? [...opts.advancedProductFilters] : [];
  if (opts.productType) {
    const { facets } = await advancedProductFilters({});
    const ptFacet = facets.find((f) => f.type === 'ProductType');
    const val = ptFacet?.values.find(
      (v) => String(v.displayValue).toLowerCase() === String(opts.productType).toLowerCase()
    );
    if (!val) {
      throw new Error(
        `Unknown productType "${opts.productType}". Call advanced_product_filters for valid ProductType values.`
      );
    }
    apf.push({ Type: 'ProductType', Values: [{ DisplayValue: val.displayValue, Value: val.value }] });
  }

  const hasSelector =
    opts.series?.length || opts.categoryIds?.length || opts.productIds?.length || opts.filter?.length || apf.length;
  if (!hasSelector) {
    throw new Error('Provide productType, series, categoryIds, productIds, filter, or advancedProductFilters to scan.');
  }

  const counts = new Map();
  let nextPage;
  let scanned = 0;
  let pages = 0;
  do {
    const res = await searchProducts({
      series: opts.series,
      categoryIds: opts.categoryIds,
      productIds: opts.productIds,
      filter: opts.filter,
      advancedProductFilters: apf.length ? apf : undefined,
      pageSize,
      nextPage,
      full: true, // need each product's full webCategories (id+name+path)
    });
    for (const p of res.products) {
      for (const c of p.webCategories || []) {
        // Collect ALL categories; apply `contains` after, so a no-match doesn't
        // dead-end the caller (we still show what the slice actually contains).
        const cur = counts.get(c.id) || { ...c, productHits: 0 };
        cur.productHits += 1;
        counts.set(c.id, cur);
      }
    }
    scanned += res.products.length;
    nextPage = res.nextPage;
    pages += 1;
  } while (nextPage && pages < scanPages);

  const all = [...counts.values()].sort((a, b) => b.productHits - a.productHits);
  const matched = contains ? all.filter((c) => `${c.name} ${c.path}`.toLowerCase().includes(contains)) : all;

  const result = {
    scannedProducts: scanned,
    categoryCount: matched.length,
    categories: matched,
    usage: 'Pass a category `id` to search_products as categoryIds:[id] to browse that merchandising category.',
  };
  // Don't dead-end on a no-match contains filter — surface what was found so the
  // caller can still pick (this account tags some product types sparsely).
  if (contains && !matched.length && all.length) {
    result.note = `No category matched "${opts.contains}" in the ${scanned} products scanned — this catalog/account may not tag that sub-category. Categories that WERE found are listed under otherCategories; broaden the scan (scanPages) or pick one of these.`;
    result.otherCategories = all.slice(0, 25);
  }
  return result;
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
export async function findProducts({ query, filter, pageSize, page, nextPage, full } = {}) {
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
    full,
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

  // Low-confidence guard: if no ProductType was resolved AND query words went
  // unmatched (e.g. "rope chains" — no chain-style vocabulary), the results are
  // filtered by metal/other facets only and likely DON'T match what was asked.
  // Warn loudly rather than returning unrelated products silently.
  // (hasProductType was computed earlier from `resolved`.)
  if (!hasProductType && unmatchedTerms.length) {
    out.lowConfidence = true;
    out.note =
      `No product type matched the query — unmatched term(s): ${unmatchedTerms.join(', ')}. ` +
      'Results are filtered only by what DID match (e.g. metal) and may not be the item type you want. ' +
      'Use advanced_product_filters (facetType:"ProductType") to find the right type, or discover_categories to browse a merchandising category.';
  } else if (setAside.length) {
    out.notApplied = fmt(setAside);
    out.note =
      "Stone facets (e.g. StoneFamily) describe loose stones and can't be combined with a finished-jewelry ProductType in Stuller's catalog, so they were not applied. Results are filtered by product type/metal only. To reach a finished-jewelry category like 'diamond stud earrings', call discover_categories (e.g. productType:'Earrings', contains:'stud') and search_products by the returned categoryIds; for loose stones use search_diamonds/search_gemstones.";
  }
  return out;
}
