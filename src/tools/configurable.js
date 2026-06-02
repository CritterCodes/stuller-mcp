import { stullerRequest } from '../stuller/client.js';

const VIRTUAL_PATH = '/v2/products/virtual';
const CONFIGURE_PATH = '/v2/products/configureproduct';
const CONFIGURED_PATH = '/v2/products/configuredproduct';

// Virtual products are configurable semi-mounts; their full configuration model
// (ring sizes, setting locations, compatible stones) only populates with includes.
const DEFAULT_INCLUDE = ['All'];

function money(m) {
  if (m == null) return null;
  return typeof m === 'number' ? m : m.Value ?? null;
}
function currencyOf(...candidates) {
  for (const c of candidates) if (c && typeof c === 'object' && c.CurrencyCode) return c.CurrencyCode;
  return 'USD';
}
function images(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((i) => (typeof i === 'string' ? { full: i } : { full: i.FullUrl || i.Url || null, thumbnail: i.ThumbnailUrl || null }))
    .filter((i) => i.full || i.thumbnail);
}

function transformVirtual(p = {}) {
  const cm = p.ConfigurationModel || {};
  const base = p.BaseProduct || {};
  return {
    sku: p.SKU ?? null,
    shortDescription: p.ShortDescription ?? null,
    price: money(p.Price),
    currency: currencyOf(p.Price),
    isOnPriceList: p.IsOnPriceList ?? null,
    onHand: p.OnHand ?? null,
    orderable: p.Orderable ?? null,
    // BaseProduct.Id is the ProductId you pass to configure_product.
    baseProductId: base.Id ?? null,
    baseSku: base.SKU ?? null,
    configurationModelId: cm.Id ?? null,
    isPegHeadable: cm.IsPegHeadable ?? null,
    ringSizeOptions: (cm.RingSizeOptions || []).map((r) => ({
      size: r.Size,
      isStockedSize: r.IsStockedSize,
      price: money(r.Price),
    })),
    settingOptions: (cm.SettingOptions || []).map((s) => ({
      locationNumber: s.LocationNumber,
      stoneCount: s.StoneCount,
      settingType: s.SettingType,
      description: s.Description,
      groupName: s.GroupName,
      shape: s.Shape,
      sizeMM: s.SizeMM,
      dimensions: { d1: s.Dimension1, d2: s.Dimension2, d3: s.Dimension3 },
    })),
    canBeSetWith: (p.CanBeSetWith || []).map((c) => ({
      quantity: c.Quantity,
      shape: c.Shape,
      size: c.Size,
      settingType: c.SettingType,
    })),
    setWith: p.SetWith || [],
    images: images(p.Images),
    fullySetImages: images(p.FullySetImages),
  };
}

/**
 * Search configurable / semi-set ("virtual") products. These are mountings you
 * set stones into; the response includes each one's configuration model
 * (ring sizes, setting locations) and the stones it can be set with — ideal for
 * custom-design sourcing and dropship catalogs. Requires at least one selector
 * (series/sku/productIds/categoryIds/filter).
 * @param {{ series?, sku?, productIds?, categoryIds?, filter?, advancedProductFilters?,
 *   include?, pageSize?, page?, nextPage? }} opts
 */
export async function searchVirtualProducts(opts = {}) {
  const body = {};
  if (opts.series?.length) body.Series = opts.series;
  if (opts.sku?.length) body.SKU = opts.sku;
  if (opts.productIds?.length) body.ProductId = opts.productIds;
  if (opts.categoryIds?.length) body.CategoryIds = opts.categoryIds;
  if (opts.filter?.length) body.Filter = opts.filter;
  if (opts.advancedProductFilters?.length) body.AdvancedProductFilters = opts.advancedProductFilters;
  body.Include = opts.include?.length ? opts.include : DEFAULT_INCLUDE;
  if (opts.pageSize) body.PageSize = opts.pageSize;
  if (opts.page) body.Page = opts.page;
  if (opts.nextPage) body.NextPage = opts.nextPage;

  if (!body.Series && !body.SKU && !body.ProductId && !body.CategoryIds && !body.Filter) {
    throw new Error('Provide at least one selector: series, sku, productIds, categoryIds, or filter.');
  }

  const payload = await stullerRequest('POST', VIRTUAL_PATH, { body });
  const list = payload?.Products || payload?.products || (Array.isArray(payload) ? payload : []);
  return {
    count: list.length,
    nextPage: payload?.NextPage ?? null,
    hasMore: Boolean(payload?.NextPage),
    products: list.map(transformVirtual),
  };
}

/**
 * Configure a mounting and get its live price, estimated ship date, and imagery
 * for the chosen options. Pass the BASE product id (from a virtual product's
 * `baseProductId`, or a configurable product's Id), plus selections.
 * @param {{ productId:number, quantity?:number, ringSize?:number, chainLength?:number,
 *   earringBackProductId?:number, claspProductId?:number, pendantChainProductId?:number,
 *   stones?:{locationNumber,stoneProductId?,serialNumber?,customerStoneValue?}[],
 *   engravings?:{locationNumber,type?,font?,fillColor?,finish?,text?}[],
 *   include?:string[] }} opts
 */
export async function configureProduct(opts = {}) {
  if (!opts.productId) throw new Error('`productId` (the base product id) is required.');

  const body = {
    ProductId: Number(opts.productId),
    Quantity: opts.quantity ?? 1,
    ConfiguredProductIncludes: opts.include?.length ? opts.include : ['EstimatedShipDate'],
  };
  if (opts.ringSize != null) body.RingSize = Number(opts.ringSize);
  if (opts.chainLength != null) body.ChainLength = Number(opts.chainLength);
  if (opts.earringBackProductId != null) body.EarringBackProductId = Number(opts.earringBackProductId);
  if (opts.claspProductId != null) body.ClaspProductId = Number(opts.claspProductId);
  if (opts.pendantChainProductId != null) body.PendantChainProductId = Number(opts.pendantChainProductId);
  if (opts.stones?.length) {
    body.Stones = opts.stones.map((s) => ({
      LocationNumber: s.locationNumber,
      StoneProductId: s.stoneProductId,
      SerialNumber: s.serialNumber,
      CustomerStoneValue: s.customerStoneValue,
    }));
  }
  if (opts.engravings?.length) {
    body.Engravings = opts.engravings.map((e) => ({
      LocationNumber: e.locationNumber,
      Type: e.type,
      Font: e.font,
      FillColor: e.fillColor,
      Finish: e.finish,
      Text: e.text,
    }));
  }

  const c = await stullerRequest('POST', CONFIGURE_PATH, { body });
  return {
    productId: body.ProductId,
    quantity: body.Quantity,
    ringSize: opts.ringSize ?? null,
    totalPrice: money(c.TotalPrice),
    totalShowcasePrice: money(c.TotalShowcasePrice),
    currency: currencyOf(c.TotalPrice, c.TotalShowcasePrice),
    estimatedShipDate: c.EstimatedShipDate ?? null,
    ringSizingPrice: money(c.RingSizingPrice),
    polishingPrice: money(c.PolishingPrice),
    pegHeadAssemblyPrice: money(c.PegHeadAssemblyPrice),
    configuredRingSize: c.ConfiguredRingSize ?? null,
    configurationId: c.ConfigurationId ?? null,
    stones: c.Stones ?? [],
    engravings: c.Engravings ?? [],
    images: images(c.Images),
  };
}

/**
 * Retrieve a previously configured item by its configuration id.
 * @param {{ configurationId:number, include?:string[] }} opts
 */
export async function getConfiguredProduct(opts = {}) {
  if (!opts.configurationId) throw new Error('`configurationId` is required.');
  const body = { ConfigurationId: Number(opts.configurationId) };
  if (opts.include?.length) body.Include = opts.include;
  const c = await stullerRequest('POST', CONFIGURED_PATH, { body });
  return {
    configurationId: body.ConfigurationId,
    sku: c.SKU ?? null,
    description: c.Description ?? c.ShortDescription ?? null,
    totalPrice: money(c.TotalPrice),
    totalShowcasePrice: money(c.TotalShowcasePrice),
    currency: currencyOf(c.TotalPrice, c.TotalShowcasePrice),
    orderable: c.Orderable ?? null,
    onHand: c.OnHand ?? null,
    estimatedShipDate: c.EstimatedShipDate ?? null,
    configuredRingSize: c.ConfiguredRingSize ?? null,
    stones: c.Stones ?? [],
    engravings: c.Engravings ?? [],
    images: images(c.Images),
  };
}

export { transformVirtual };
