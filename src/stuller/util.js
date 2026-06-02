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
