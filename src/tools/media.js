import { productDetail } from './products.js';
import { sizedImageUrl, IMAGE_SIZES } from '../stuller/util.js';

const FETCH_TIMEOUT_MS = 15000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // guard against pulling something huge

/**
 * Resolve and download a product image, returning it base64-encoded so the
 * server can hand back an MCP image content block (renders inline in MCP clients
 * and gives a voice/TV surface a "show this" payload).
 *
 * Pass a `sku` (its primary image is used) or an explicit `imageUrl`. Optional
 * `size` (tiny|thumb|list|standard|xlarge|zoom|original) re-renders via the CDN.
 * @param {{ sku?: string, imageUrl?: string, size?: string }} opts
 * @returns {{ sku, sourceUrl, mimeType, base64, bytes, title, price, currency, size }}
 */
export async function showProduct({ sku, imageUrl, size } = {}) {
  if (size && !(size in IMAGE_SIZES)) {
    throw new Error(`Unknown size "${size}". Use one of: ${Object.keys(IMAGE_SIZES).join(', ')}.`);
  }

  let url = imageUrl;
  let title = null;
  let price = null;
  let currency = 'USD';

  if (!url) {
    if (!sku) throw new Error('Provide `sku` or `imageUrl`.');
    const { product } = await productDetail({ sku });
    url = product.display?.primaryImage;
    title = product.display?.title;
    price = product.display?.price;
    currency = product.display?.currency || 'USD';
    if (!url) throw new Error(`No image available for ${sku}.`);
  }

  if (size) url = sizedImageUrl(url, size);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    throw new Error(
      err?.name === 'AbortError' ? `Image fetch timed out: ${url}` : `Image fetch failed: ${err.message}`
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Image fetch failed (${res.status}) for ${url}`);

  const mimeType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image is ${(buf.length / 1e6).toFixed(1)}MB — too large to inline. Use the URL instead: ${url}`);
  }

  return { sku: sku ?? null, sourceUrl: url, mimeType, base64: buf.toString('base64'), bytes: buf.length, title, price, currency, size: size ?? null };
}
