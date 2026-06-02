// Shared normalization helpers used across the tool modules. Stuller returns
// money as either a bare number or a { Value, CurrencyCode } object, images in a
// few shapes, etc. Centralizing these keeps every tool's output consistent.

/** Unwrap a Stuller money field ({ Value, CurrencyCode } or a bare number) → number|null. */
export function money(m) {
  if (m == null) return null;
  return typeof m === 'number' ? m : m.Value ?? null;
}

/** First CurrencyCode among the given money-ish candidates, defaulting to USD. */
export function currencyOf(...candidates) {
  for (const c of candidates) {
    if (c && typeof c === 'object' && c.CurrencyCode) return c.CurrencyCode;
  }
  return 'USD';
}

/** Normalize a Stuller image array (strings or objects) to { full, thumbnail, zoom, caption }. */
export function extractImages(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((img) =>
      typeof img === 'string'
        ? { full: img, thumbnail: null, zoom: null, caption: null }
        : {
            full: img.FullUrl || img.Url || img.fullUrl || img.url || null,
            thumbnail: img.ThumbnailUrl || img.thumbnailUrl || null,
            zoom: img.ZoomUrl || img.zoomUrl || null,
            caption: img.Caption || img.caption || null,
          }
    )
    .filter((i) => i.full || i.thumbnail || i.zoom);
}

/** Normalize Stuller WebCategories → { id, name, path } (these ids are valid CategoryIds). */
export function extractCategories(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => ({ id: c.Id ?? c.id ?? null, name: c.Name ?? c.name ?? null, path: c.Path ?? c.path ?? null }))
    .filter((c) => c.id != null);
}

/** YYYY-MM-DD for a Date. */
export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Stuller image CDN (meteor.stullercloud.com/das/...) renders a size via a query
// token. These are the empirically-confirmed tokens (unrecognized tokens and
// explicit WxH are ignored and serve the original). `original` = no token.
export const IMAGE_SIZES = {
  tiny: '$tiny$', // 40px
  thumb: '$thumb$', // 75px
  list: '$list$', // 165px
  standard: '$standard$', // 300px
  xlarge: '$xlarge$', // 640px
  zoom: '$zoom$', // 1500px
  original: null,
};

/**
 * Return a Stuller image URL re-sized to a named tier (see IMAGE_SIZES). Leaves
 * non-Stuller URLs and unknown size names untouched.
 * @param {string} url
 * @param {keyof typeof IMAGE_SIZES} size
 */
export function sizedImageUrl(url, size) {
  if (!url || !size) return url;
  if (!/stullercloud\.com\/das\//.test(url)) return url; // only the DAS CDN uses tokens
  if (!(size in IMAGE_SIZES)) return url;
  const base = url.replace(/\?\$[^$]*\$$/, ''); // drop any existing size token
  const token = IMAGE_SIZES[size];
  return token ? `${base}?${token}` : base;
}

/**
 * Render-ready summary for any buyable result, so a UI/voice/TV surface can
 * display "what you're buying" with zero parsing.
 * @param {{ title?:string, price?:number, currency?:string,
 *   images?:{full?,thumbnail?,zoom?}[], video?:string }} o
 * @returns {{ title, price, currency, primaryImage, thumbnail, video }}
 */
export function buildDisplay({ title, price, currency = 'USD', images = [], video = null } = {}) {
  const first = (Array.isArray(images) && images[0]) || {};
  const primaryImage = first.full || first.zoom || first.thumbnail || null;
  return {
    title: title || null,
    price: price ?? null,
    currency,
    primaryImage,
    thumbnail: first.thumbnail || primaryImage,
    video: video || null,
  };
}
