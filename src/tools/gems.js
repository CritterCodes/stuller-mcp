import { stullerRequest } from '../stuller/client.js';
import { money, currencyOf, extractImages, buildDisplay } from '../stuller/util.js';

// Compose a human title from stone attributes (diamonds have no description field).
function stoneTitle(parts) {
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || null;
}

const DIAMONDS_PATH = '/v2/gem/diamonds';
const LAB_GROWN_PATH = '/v2/gem/labgrowndiamonds';
const GEMSTONES_PATH = '/v2/gem/gemstones';

// Build the shared DiamondRequest body from friendly options. Exported for tests.
export function buildDiamondRequest(opts = {}) {
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

export function transformDiamond(d = {}) {
  const images = extractImages(d.Images);
  const title = stoneTitle([
    d.CaratWeight != null ? `${d.CaratWeight}ct` : null,
    d.Color,
    d.Clarity,
    d.Shape,
    'Diamond',
  ]);
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
    length: d.Length ?? null,
    width: d.Width ?? null,
    height: d.Height ?? null,
    mmSize: d.MMSize ?? null,
    minDiameter: d.MinDiameter ?? null,
    maxDiameter: d.MaxDiameter ?? null,
    depthPercent: d.DepthPercent ?? null,
    table: d.Table ?? null,
    lengthToWidthRatio: d.LengthToWidthRatio ?? null,
    certification: d.Certification ?? null,
    certificationNumber: d.CertificationNumber ?? null,
    certificatePath: d.CertificatePath ?? null,
    countryOfOrigin: d.CountryOfOrigin ?? null,
    images,
    videos: d.Videos ?? [],
    display: buildDisplay({
      title,
      price: money(d.Price),
      currency: currencyOf(d.Price, d.PricePerCarat, d.ShowcasePrice),
      images,
      video: (d.Videos || [])[0]?.Url || (d.Videos || [])[0] || null,
    }),
  };
}

export function transformGemstone(g = {}) {
  const images = extractImages(g.Images);
  const title = g.Description || stoneTitle([
    g.CaratWeight != null ? `${g.CaratWeight}ct` : null,
    g.Color,
    g.Shape,
    g.StoneType ?? g.GemType,
  ]);
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
    images,
    videos: g.Videos ?? [],
    display: buildDisplay({
      title,
      price: money(g.Price),
      currency: currencyOf(g.Price, g.PricePerCarat, g.ShowcasePrice),
      images,
      video: (g.Videos || [])[0]?.Url || (g.Videos || [])[0] || null,
    }),
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
          payload.TotalNumberOfLabGrownDiamonds ??
          payload.TotalNumberOfGemstones ??
          payload.Total ??
          payload[key].length,
      };
    }
  }
  return { items: [], nextPage: null, total: 0 };
}

// Lean stone cards keep results under token limits (full stone objects carry
// every image/video URL). `full: true` returns the complete objects.
export function diamondCard(t) {
  return {
    serialNumber: t.serialNumber,
    title: t.display?.title ?? null,
    price: t.price,
    currency: t.currency,
    caratWeight: t.caratWeight,
    color: t.color,
    clarity: t.clarity,
    cut: t.cut,
    shape: t.shape,
    measurements: t.measurements,
    certification: t.certification,
    certificationNumber: t.certificationNumber,
    primaryImage: t.display?.primaryImage ?? null,
  };
}
export function gemstoneCard(t) {
  return {
    serialNumber: t.serialNumber,
    title: t.display?.title ?? null,
    stoneType: t.stoneType,
    price: t.price,
    currency: t.currency,
    caratWeight: t.caratWeight,
    color: t.color,
    shape: t.shape,
    dimensions: t.dimensions,
    certification: t.certification,
    primaryImage: t.display?.primaryImage ?? null,
  };
}

async function diamondSearch(path, opts) {
  // Default to a small page — Stuller returns a large default of full stone
  // objects that overflow token limits; callers page with nextPage.
  const body = buildDiamondRequest({ ...opts, pageSize: opts.pageSize || 10 });
  const payload = await stullerRequest('POST', path, { body });
  // Natural diamonds nest under Diamonds; lab-grown under LabGrownDiamonds.
  const { items, nextPage, total } = unwrap(payload, ['Diamonds', 'diamonds', 'LabGrownDiamonds', 'labGrownDiamonds']);
  const stones = items.map(transformDiamond);
  return {
    count: stones.length,
    totalAvailable: total,
    nextPage,
    hasMore: Boolean(nextPage),
    diamonds: opts.full ? stones : stones.map(diamondCard),
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

// Common gemstone color words → Stuller's record color codes (e.g. "Bl" for blue).
const GEM_COLOR_CODES = {
  blue: 'bl', green: 'gr', red: 'rd', pink: 'pk', yellow: 'yl', purple: 'pu',
  orange: 'or', brown: 'br', black: 'bk', white: 'wh', violet: 'vi', teal: 'tl', gray: 'gy', grey: 'gy',
};
function gemColorMatches(stone, wanted) {
  const code = String(stone.color || '').toLowerCase();
  const desc = String(stone.description || stone.title || '').toLowerCase();
  return wanted.some((w) => {
    const lw = String(w).toLowerCase().trim();
    if (!lw) return false;
    return desc.includes(lw) || code === lw || code === GEM_COLOR_CODES[lw] || (lw.length >= 3 && code.startsWith(lw.slice(0, 2)));
  });
}

/**
 * Search colored gemstones (sapphire, ruby, emerald, etc.).
 *
 * Stuller's server-side `Colors` filter is broken (rejects record codes, ignores
 * words), so when `colors` is given we scan by stoneType/shape and filter the
 * results CLIENT-SIDE against each stone's color code / description.
 * @param {{ stoneTypes?:string[], colors?:string[], shapes?:string[], length?:number,
 *   width?:number, serialNumbers?:number[], filters?:{Option:string,Value:string}[],
 *   pageSize?, page?, nextPage?, full?:boolean }} opts
 */
export async function searchGemstones(opts = {}) {
  if (opts.colors?.length) return gemstonesByColor(opts);

  const body = {};
  if (opts.stoneTypes?.length) body.StoneTypes = opts.stoneTypes;
  if (opts.shapes?.length) body.Shapes = opts.shapes;
  if (opts.length != null) body.Length = Number(opts.length);
  if (opts.width != null) body.Width = Number(opts.width);
  if (opts.serialNumbers?.length) body.SerialNumbers = opts.serialNumbers.map(Number);
  if (opts.filters?.length) body.Filters = opts.filters;
  body.PageSize = opts.pageSize || 10; // small default — full stone objects are heavy
  if (opts.page) body.Page = opts.page;
  if (opts.nextPage) body.NextPage = opts.nextPage;

  const payload = await stullerRequest('POST', GEMSTONES_PATH, { body });
  const { items, nextPage, total } = unwrap(payload, ['Gemstones', 'gemstones', 'GemStones']);
  const stones = items.map(transformGemstone);
  return {
    count: stones.length,
    totalAvailable: total,
    nextPage,
    hasMore: Boolean(nextPage),
    gemstones: opts.full ? stones : stones.map(gemstoneCard),
  };
}

// Client-side color filter: scan pages (the API color filter doesn't work) and
// keep stones whose color/description matches the requested color(s).
async function gemstonesByColor(opts) {
  const want = opts.colors;
  const limit = opts.pageSize || 10;
  const maxScan = 250;
  const matched = [];
  let nextPage;
  let scanned = 0;
  let pages = 0;
  do {
    const res = await searchGemstones({
      ...opts,
      colors: undefined, // don't send the broken server filter
      full: true,
      pageSize: 100,
      nextPage,
    });
    for (const s of res.gemstones) if (gemColorMatches(s, want)) matched.push(s);
    scanned += res.gemstones.length;
    nextPage = res.nextPage;
    pages += 1;
  } while (nextPage && scanned < maxScan && pages < 5 && matched.length < limit);

  const out = matched.slice(0, limit);
  return {
    count: out.length,
    scanned,
    colorFilter: 'client-side (Stuller\'s color filter is non-functional)',
    hasMore: Boolean(nextPage),
    gemstones: opts.full ? out : out.map(gemstoneCard),
  };
}

// ---- fit-by-dimensions matcher (client-side) ----
// Stuller's bestfitstonesbydimensions endpoint is unreliable (500s) and the
// gemstone Length/Width filters match exactly (useless for fitting a setting),
// so we scan a stone family by shape and rank locally by how close each stone's
// measured size is to the target.

// Parse "L x W x H" measurement strings like "4.10 x 4.12 x 2.51".
export function parseMeasurements(str) {
  if (typeof str !== 'string') return null;
  const nums = str.match(/[\d.]+/g);
  if (!nums || nums.length < 2) return null;
  return { length: Number(nums[0]), width: Number(nums[1]) };
}

// Derive a (length, width) in mm for a transformed stone, trying the most
// reliable source first. Round stones report only Length (Width comes back 0),
// so a missing/zero width falls back to length. Returns null if no usable size.
// Exported for unit testing.
export function stoneDimensions(stone, source) {
  let length = 0;
  let width = 0;

  if (source === 'gemstone') {
    const dd = stone.dimensions || {};
    length = Number(dd.length) || 0;
    width = Number(dd.width) || 0;
  } else if (stone.length) {
    length = Number(stone.length) || 0;
    width = Number(stone.width) || 0;
  } else {
    const parsed = parseMeasurements(stone.measurements);
    if (parsed) {
      length = parsed.length;
      width = parsed.width;
    } else {
      const round = Number(stone.mmSize || stone.maxDiameter || stone.minDiameter) || 0;
      length = round;
      width = round;
    }
  }

  if (!length) return null;
  if (!(width > 0)) width = length; // round/symmetric stone, or width not reported
  return { length, width };
}

/**
 * Find loose stones that fit a target setting size, ranked by closeness.
 * Scans the chosen stone family by shape, then filters to a mm tolerance window
 * around the target and sorts by total deviation. Use this to source a
 * replacement for a lost/broken stone.
 *
 * @param {{ shape: string, lengthMm: number, widthMm?: number, tolerance?: number,
 *   source?: 'diamond'|'lab_grown_diamond'|'gemstone', stoneType?: string,
 *   color?: string[], clarity?: string[], maxResults?: number, maxScan?: number }} opts
 */
export async function findStonesByDimensions(opts = {}) {
  const {
    shape,
    lengthMm,
    widthMm,
    tolerance = 0.3,
    source = 'diamond',
    stoneType,
    color,
    clarity,
    maxResults = 10,
    maxScan = 300,
  } = opts;

  if (!lengthMm) throw new Error('`lengthMm` (the target stone length in mm) is required.');
  const targetL = Number(lengthMm);
  const targetW = widthMm != null ? Number(widthMm) : targetL; // round: width == length

  // Scan candidates page by page (capped).
  const candidates = [];
  let nextPage;
  let scanned = 0;
  let pages = 0;
  const pageSize = 100;
  do {
    let res;
    if (source === 'gemstone') {
      res = await searchGemstones({
        shapes: shape ? [shape] : undefined,
        stoneTypes: stoneType ? [stoneType] : undefined,
        pageSize,
        nextPage,
        full: true, // need full dimensions to measure fit
      });
      for (const s of res.gemstones) candidates.push(s);
    } else {
      const path = source === 'lab_grown_diamond' ? LAB_GROWN_PATH : DIAMONDS_PATH;
      res = await diamondSearch(path, { shape: shape ? [shape] : undefined, color, clarity, pageSize, nextPage, full: true });
      for (const s of res.diamonds) candidates.push(s);
    }
    scanned += res[source === 'gemstone' ? 'gemstones' : 'diamonds'].length;
    nextPage = res.nextPage;
    pages += 1;
  } while (nextPage && scanned < maxScan && pages < 10);

  const matches = candidates
    .map((stone) => {
      const dims = stoneDimensions(stone, source);
      if (!dims) return null;
      const dL = Math.abs(dims.length - targetL);
      const dW = Math.abs(dims.width - targetW);
      return { stone, lengthMm: dims.length, widthMm: dims.width, dL, dW, deviationMm: dL + dW };
    })
    .filter((c) => c && c.dL <= tolerance && c.dW <= tolerance)
    .sort((a, b) => a.deviationMm - b.deviationMm)
    .slice(0, maxResults)
    .map((c) => ({
      // Lean card (consistent with the search tools) + the fit measurement.
      ...(source === 'gemstone' ? gemstoneCard(c.stone) : diamondCard(c.stone)),
      fit: {
        lengthMm: c.lengthMm,
        widthMm: c.widthMm,
        deviationMm: Number(c.deviationMm.toFixed(3)),
      },
    }));

  return {
    target: { shape: shape ?? null, lengthMm: targetL, widthMm: targetW, toleranceMm: tolerance },
    source,
    scanned,
    capped: Boolean(nextPage && scanned >= maxScan),
    count: matches.length,
    matches,
    note:
      'Stones scanned by shape and ranked locally by fit (Stuller has no working server-side fit-by-dimensions search). Widen `tolerance` or raise `maxScan` if nothing fits.',
  };
}
