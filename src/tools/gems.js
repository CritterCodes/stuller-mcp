import { stullerRequest } from '../stuller/client.js';

const DIAMONDS_PATH = '/v2/gem/diamonds';
const LAB_GROWN_PATH = '/v2/gem/labgrowndiamonds';
const GEMSTONES_PATH = '/v2/gem/gemstones';

// Stuller money fields come back as { Value, CurrencyCode } (sometimes a bare number).
function money(m) {
  if (m == null) return null;
  if (typeof m === 'number') return m;
  return m.Value ?? null;
}
function currencyOf(...candidates) {
  for (const c of candidates) {
    if (c && typeof c === 'object' && c.CurrencyCode) return c.CurrencyCode;
  }
  return 'USD';
}

// Build the shared DiamondRequest body from friendly options.
function buildDiamondRequest(opts = {}) {
  const body = {};

  // Ranges are sent as [min, max] decimal collections.
  if (opts.caratMin != null || opts.caratMax != null) {
    body.SizeRange = [Number(opts.caratMin ?? 0), Number(opts.caratMax ?? 100)];
  }
  if (opts.priceMin != null || opts.priceMax != null) {
    body.PriceRange = [Number(opts.priceMin ?? 0), Number(opts.priceMax ?? 1_000_000)];
  }

  if (opts.color?.length) body.Color = opts.color;
  if (opts.clarity?.length) body.Clarity = opts.clarity;
  if (opts.cut?.length) body.Cut = opts.cut;
  if (opts.shape?.length) body.Shape = opts.shape;
  if (opts.polish?.length) body.Polish = opts.polish;
  if (opts.symmetry?.length) body.Symmetry = opts.symmetry;
  if (opts.fluorescence?.length) body.Fluorescence = opts.fluorescence;
  if (opts.certification?.length) body.Certification = opts.certification;
  if (opts.fancyColors?.length) body.FancyColors = opts.fancyColors;
  if (opts.serialNumbers?.length) body.SerialNumbers = opts.serialNumbers.map(Number);

  if (opts.pageSize) body.PageSize = opts.pageSize;
  if (opts.page) body.Page = opts.page;
  if (opts.nextPage) body.NextPage = opts.nextPage;

  return body;
}

function normalizeImages(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((img) =>
      typeof img === 'string'
        ? { full: img }
        : { full: img.FullUrl || img.Url || null, thumbnail: img.ThumbnailUrl || null }
    )
    .filter((i) => i.full || i.thumbnail);
}

function transformDiamond(d = {}) {
  return {
    serialNumber: d.SerialNumber ?? null,
    shape: d.Shape ?? null,
    caratWeight: d.CaratWeight ?? null,
    color: d.Color ?? null,
    clarity: d.Clarity ?? null,
    cut: d.Cut ?? null,
    polish: d.Polish ?? null,
    symmetry: d.Symmetry ?? null,
    fluorescence: d.Fluorescence ?? null,
    price: money(d.Price),
    pricePerCarat: money(d.PricePerCarat),
    showcasePrice: money(d.ShowcasePrice),
    currency: currencyOf(d.Price, d.PricePerCarat, d.ShowcasePrice),
    measurements: d.Measurements ?? null,
    depthPercent: d.DepthPercent ?? null,
    table: d.Table ?? null,
    lengthToWidthRatio: d.LengthToWidthRatio ?? null,
    certification: d.Certification ?? null,
    certificationNumber: d.CertificationNumber ?? null,
    certificatePath: d.CertificatePath ?? null,
    countryOfOrigin: d.CountryOfOrigin ?? null,
    images: normalizeImages(d.Images),
    videos: d.Videos ?? [],
  };
}

function transformGemstone(g = {}) {
  return {
    serialNumber: g.SerialNumber ?? null,
    stoneType: g.StoneType ?? g.GemType ?? null,
    shape: g.Shape ?? null,
    color: g.Color ?? null,
    clarity: g.Clarity ?? null,
    caratWeight: g.CaratWeight ?? null,
    cut: g.Cut ?? null,
    polish: g.Polish ?? null,
    symmetry: g.Symmetry ?? null,
    price: money(g.Price),
    pricePerCarat: money(g.PricePerCarat),
    showcasePrice: money(g.ShowcasePrice),
    currency: currencyOf(g.Price, g.PricePerCarat, g.ShowcasePrice),
    dimensions: {
      length: g.Length ?? null,
      width: g.Width ?? null,
      height: g.Height ?? null,
      depth: g.Depth ?? null,
    },
    certification: g.Certification ?? null,
    certificationNumber: g.CertificationNumber ?? null,
    description: g.Description ?? null,
    images: normalizeImages(g.Images),
    videos: g.Videos ?? [],
  };
}

// Diamond responses nest the list + paging under varying casings; accept them all.
function unwrap(payload, listKeys) {
  if (Array.isArray(payload)) return { items: payload, nextPage: null, total: payload.length };
  for (const key of listKeys) {
    if (Array.isArray(payload?.[key])) {
      return {
        items: payload[key],
        nextPage: payload.NextPage ?? payload.nextPage ?? null,
        total:
          payload.TotalNumberOfDiamonds ??
          payload.TotalNumberOfGemstones ??
          payload.Total ??
          payload[key].length,
      };
    }
  }
  return { items: [], nextPage: null, total: 0 };
}

async function diamondSearch(path, opts) {
  const body = buildDiamondRequest(opts);
  const payload = await stullerRequest('POST', path, { body });
  const { items, nextPage, total } = unwrap(payload, ['Diamonds', 'diamonds']);
  return {
    count: items.length,
    totalAvailable: total,
    nextPage,
    hasMore: Boolean(nextPage),
    diamonds: items.map(transformDiamond),
  };
}

/**
 * Search natural diamonds by the 4Cs and more.
 * @param {{ caratMin?, caratMax?, priceMin?, priceMax?, color?:string[], clarity?:string[],
 *   cut?:string[], shape?:string[], polish?:string[], symmetry?:string[], fluorescence?:string[],
 *   certification?:string[], fancyColors?:string[], serialNumbers?:number[],
 *   pageSize?, page?, nextPage? }} opts
 */
export async function searchDiamonds(opts = {}) {
  return diamondSearch(DIAMONDS_PATH, opts);
}

/** Search lab-grown diamonds. Same request shape as searchDiamonds. */
export async function searchLabGrownDiamonds(opts = {}) {
  return diamondSearch(LAB_GROWN_PATH, opts);
}

/**
 * Search colored gemstones (sapphire, ruby, emerald, etc.).
 * @param {{ stoneTypes?:string[], colors?:string[], shapes?:string[], length?:number,
 *   width?:number, serialNumbers?:number[], filters?:{Option:string,Value:string}[],
 *   pageSize?, page?, nextPage? }} opts
 */
export async function searchGemstones(opts = {}) {
  const body = {};
  if (opts.stoneTypes?.length) body.StoneTypes = opts.stoneTypes;
  if (opts.colors?.length) body.Colors = opts.colors;
  if (opts.shapes?.length) body.Shapes = opts.shapes;
  if (opts.length != null) body.Length = Number(opts.length);
  if (opts.width != null) body.Width = Number(opts.width);
  if (opts.serialNumbers?.length) body.SerialNumbers = opts.serialNumbers.map(Number);
  if (opts.filters?.length) body.Filters = opts.filters;
  if (opts.pageSize) body.PageSize = opts.pageSize;
  if (opts.page) body.Page = opts.page;
  if (opts.nextPage) body.NextPage = opts.nextPage;

  const payload = await stullerRequest('POST', GEMSTONES_PATH, { body });
  const { items, nextPage, total } = unwrap(payload, ['Gemstones', 'gemstones', 'GemStones']);
  return {
    count: items.length,
    totalAvailable: total,
    nextPage,
    hasMore: Boolean(nextPage),
    gemstones: items.map(transformGemstone),
  };
}
