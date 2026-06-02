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
  if (opts.include?.length) body.Include = opts.include;
  if (opts.pageSize) body.PageSize = opts.pageSize;
  if (opts.page) body.Page = opts.page;
  if (opts.nextPage) body.NextPage = opts.nextPage;

  if (!Object.keys(body).length) {
    throw new Error(
      'Provide at least one filter (series, categoryIds, productIds, filter, or advancedProductFilters).'
    );
  }

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
