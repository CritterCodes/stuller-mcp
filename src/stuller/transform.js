// Normalization of Stuller v2 product responses into a stable, predictable shape.
// The transformProduct() mapping is battle-tested against the live Stuller catalog
// and handles the many casings/aliases Stuller returns across endpoints; it is
// extended here to surface images/media and to handle the list+paging envelope.

// ---- response envelope ----
// POST /v2/products returns { Products: [...], NextPage: "token"|null }.
// GET /v2/products?SKU= returns a single object or { Products: [...] }.
export function normalizeProductsResponse(payload = {}) {
  if (Array.isArray(payload)) return { products: payload, nextPage: null };
  if (Array.isArray(payload?.Products))
    return { products: payload.Products, nextPage: payload.NextPage ?? null };
  if (Array.isArray(payload?.products))
    return { products: payload.products, nextPage: payload.nextPage ?? null };
  // A bare single-product object (e.g. GET ?SKU=) — but ONLY if it actually looks
  // like a product. A zero-result search comes back as a bare envelope
  // ({ PageSize, TotalNumberOfProducts, MetalMarkets }) with no Products array;
  // wrapping that as a product produced a phantom empty result.
  if (
    payload &&
    typeof payload === 'object' &&
    (payload.SKU || payload.ItemNumber || payload.sku || payload.itemNumber || payload.Id)
  ) {
    return { products: [payload], nextPage: payload.NextPage ?? null };
  }
  return { products: [], nextPage: payload?.NextPage ?? null };
}

function getDescriptiveElement(elements = [], name) {
  const element = elements.find((entry) => entry.Name === name);
  return element ? { value: element.Value, displayValue: element.DisplayValue } : null;
}

function buildDimensions(descriptiveElements) {
  const width = getDescriptiveElement(descriptiveElements, 'Width')?.displayValue;
  const thickness = getDescriptiveElement(descriptiveElements, 'Thickness')?.displayValue;
  const length = getDescriptiveElement(descriptiveElements, 'Length')?.displayValue;
  const segments = [];
  if (width) segments.push(`W: ${width}`);
  if (thickness) segments.push(`T: ${thickness}`);
  if (length) segments.push(`L: ${length}`);
  return { width, thickness, length, formatted: segments.length ? segments.join(', ') : null };
}

function buildSpecifications(productData = {}, descriptiveElements = []) {
  const specs = {};
  descriptiveElements.forEach((element) => {
    specs[element.Name] = { value: element.Value, displayValue: element.DisplayValue };
  });
  if (productData.UnitOfSale) specs['Unit of Sale'] = { value: productData.UnitOfSale, displayValue: productData.UnitOfSale };
  if (productData.LeadTime) specs['Lead Time'] = { value: productData.LeadTime, displayValue: `${productData.LeadTime} days` };
  if (productData.ProductType) specs['Product Type'] = { value: productData.ProductType, displayValue: productData.ProductType };
  if (productData.CountryOfOrigin) specs['Country of Origin'] = { value: productData.CountryOfOrigin, displayValue: productData.CountryOfOrigin };
  if (productData.OnHand !== undefined) specs['Stock Quantity'] = { value: productData.OnHand, displayValue: `${productData.OnHand} in stock` };
  if (productData.HarmonizedCode) specs['Harmonized Code'] = { value: productData.HarmonizedCode, displayValue: productData.HarmonizedCode };
  return specs;
}

// Stuller image entries vary in shape; pull out the most useful URLs.
function normalizeImages(productData = {}) {
  const raw = productData.Images || productData.images || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((img) => {
      if (typeof img === 'string') return { full: img };
      return {
        full: img.FullUrl || img.Url || img.fullUrl || img.url || null,
        thumbnail: img.ThumbnailUrl || img.thumbnailUrl || null,
        zoom: img.ZoomUrl || img.zoomUrl || null,
        caption: img.Caption || img.caption || null,
      };
    })
    .filter((i) => i.full || i.thumbnail || i.zoom);
}

function normalizeMedia(productData = {}) {
  const raw = productData.Media || productData.media || productData.Videos || [];
  if (!Array.isArray(raw)) return [];
  return raw.map((m) =>
    typeof m === 'string'
      ? { url: m }
      : { url: m.Url || m.url || null, type: m.Type || m.type || null, caption: m.Caption || m.caption || null }
  );
}

export function transformProduct(productData = {}, itemNumber = '') {
  const descriptiveElements = productData.DescriptiveElementGroup?.DescriptiveElements || [];

  return {
    itemNumber:
      productData.itemNumber || productData.ItemNumber || productData.sku || productData.SKU || itemNumber,
    productId: productData.Id ?? null,
    description:
      productData.description || productData.Description || productData.shortDescription || productData.ShortDescription || '',
    longDescription:
      productData.longDescription || productData.LongDescription || productData.DetailedDescription || productData.GroupDescription || '',
    category: {
      primary: productData.MerchandisingCategory3 || productData.GroupDescription || '',
      secondary: productData.MerchandisingCategory4 || '',
      group: productData.GroupDescription || '',
      area: productData.MerchandisingArea || '',
      hierarchy: [
        productData.MerchandisingCategory1,
        productData.MerchandisingCategory2,
        productData.MerchandisingCategory3,
        productData.MerchandisingCategory4,
      ]
        .filter(Boolean)
        .join(' -> '),
    },
    price: productData.Price?.Value || productData.pricing?.retail || productData.price || productData.RetailPrice || productData.ListPrice || 0,
    showcasePrice: productData.ShowcasePrice?.Value || null,
    currency: productData.Price?.CurrencyCode || 'USD',
    weight: productData.weight || productData.Weight || productData.GramWeight || null,
    weightUnit: productData.WeightUnitOfMeasure || 'grams',
    gramWeight: productData.GramWeight || null,
    metal: {
      type: getDescriptiveElement(descriptiveElements, 'Quality')?.displayValue || productData.QualityCatalogValue || '',
      quality: getDescriptiveElement(descriptiveElements, 'Quality')?.value || productData.QualityCatalogValue || '',
      alloyNumber: getDescriptiveElement(descriptiveElements, 'Alloy Number')?.displayValue || '',
      shape: getDescriptiveElement(descriptiveElements, 'Metal Shape')?.displayValue || '',
      series: getDescriptiveElement(descriptiveElements, 'Series')?.displayValue || '',
    },
    dimensions: buildDimensions(descriptiveElements),
    images: normalizeImages(productData),
    media: normalizeMedia(productData),
    specifications: buildSpecifications(productData, descriptiveElements),
    stock: {
      available:
        productData.availability || productData.Availability || productData.InStock || productData.Status || (productData.Orderable ? 'In Stock' : 'unknown'),
      onHand: productData.OnHand,
      orderable: productData.Orderable,
      status: productData.Status,
      leadTime: productData.LeadTime,
    },
    business: {
      id: productData.Id,
      productType: productData.ProductType,
      unitOfSale: productData.UnitOfSale,
      qualityCatalogValue: productData.QualityCatalogValue,
      isOnPriceList: productData.IsOnPriceList,
      ringSizable: productData.RingSizable,
      readyToWear: productData.ReadyToWear,
      hazardous: productData.Hazardous,
      heavy: productData.Heavy,
      countryOfOrigin: productData.CountryOfOrigin,
      harmonizedCode: productData.HarmonizedCode,
      creationDate: productData.CreationDate,
    },
    merchandising: {
      area: productData.MerchandisingArea,
      categories: {
        level1: productData.MerchandisingCategory1,
        level2: productData.MerchandisingCategory2,
        level3: productData.MerchandisingCategory3,
        level4: productData.MerchandisingCategory4,
      },
      fullPath: [
        productData.MerchandisingArea,
        productData.MerchandisingCategory1,
        productData.MerchandisingCategory2,
        productData.MerchandisingCategory3,
        productData.MerchandisingCategory4,
      ]
        .filter(Boolean)
        .join(' -> '),
    },
    source: 'stuller-api-v2',
  };
}

// Lean projection for the pricing/availability tool — just the money + stock fields.
export function summarizePricing(product) {
  return {
    itemNumber: product.itemNumber,
    description: product.description,
    price: product.price,
    showcasePrice: product.showcasePrice,
    currency: product.currency,
    onHand: product.stock?.onHand,
    orderable: product.stock?.orderable,
    status: product.stock?.status,
    leadTime: product.stock?.leadTime,
    availability: product.stock?.available,
  };
}
