import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  getProducts,
  productDetail,
  pricingAvailability,
  searchProducts,
  metalMarketRates,
  advancedProductFilters,
  findProducts,
  discoverCategories,
} from './tools/products.js';
import {
  searchDiamonds,
  searchLabGrownDiamonds,
  searchGemstones,
  findStonesByDimensions,
} from './tools/gems.js';
import { searchVirtualProducts, configureProduct, getConfiguredProduct } from './tools/configurable.js';
import { showProduct } from './tools/media.js';
import { listInvoices, getShipment } from './tools/invoices.js';
import { quoteAdd, quoteRemove, quoteView, quoteClear, quoteToOrder } from './tools/quote.js';
import { orderStatus, submitOrder } from './tools/orders.js';
import { SERVER_INSTRUCTIONS, USAGE_GUIDE } from './help.js';

// Wrap a data function so its JSON result becomes MCP tool content and errors
// surface cleanly instead of crashing the transport.
function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function fail(err) {
  return { isError: true, content: [{ type: 'text', text: `Error: ${err.message}` }] };
}
function tool(fn) {
  return async (args) => {
    try {
      return ok(await fn(args || {}));
    } catch (err) {
      return fail(err);
    }
  };
}

export function buildServer() {
  const server = new McpServer(
    { name: 'stuller-mcp', version: '0.1.0' },
    { instructions: SERVER_INSTRUCTIONS }
  );

  // ---- Help / onboarding ----
  // Returns the full usage walkthrough on demand, so even clients that ignore
  // server `instructions` let a user ask "how do I use this?" in chat.
  server.tool(
    'get_started',
    'Return a markdown guide to this Stuller server: how to find products (no free-text search — use identifiers or faceted filters), check pricing, search loose diamonds/gemstones by the 4Cs, and place orders safely. Call this when the user asks how to use the server or what it can do.',
    {},
    async () => ({ content: [{ type: 'text', text: USAGE_GUIDE }] })
  );

  // ---- Products: lookup ----
  server.tool(
    'get_products',
    'Fetch one or more Stuller products by SKU/item number (e.g. "309:77802:S", "SOLDER:0267:P"). Returns a normalized product per SKU with description, price, metal, availability, and stock, plus a `notFound` list. Lean by default; pass `include` (Stuller ProductInclude values) for extra blocks. Use product_detail for a single item with images/media/specs.',
    {
      skus: z.array(z.string()).describe('One or more Stuller SKUs / item numbers'),
      include: z
        .array(z.string())
        .optional()
        .describe('Optional Stuller ProductInclude values, e.g. ["All"], ["Prices"], ["Media"]'),
    },
    tool((a) => getProducts(a))
  );

  server.tool(
    'product_detail',
    'Full detail for a single Stuller SKU: description, pricing, metal/quality, dimensions, images, media, and all descriptive specifications. Defaults to Include=["All"]; override with `include` if needed.',
    {
      sku: z.string().describe('Stuller SKU / item number'),
      include: z.array(z.string()).optional().describe('Override the default Include (["All"])'),
    },
    tool((a) => productDetail(a))
  );

  server.tool(
    'pricing_availability',
    'Real-time price + stock/availability for a batch of SKUs. Lean projection: price, showcase price, currency, on-hand quantity, orderable flag, status, and lead time. Best for "what does X cost / is it in stock" questions.',
    {
      skus: z.array(z.string()).describe('One or more Stuller SKUs / item numbers'),
    },
    tool((a) => pricingAvailability(a))
  );

  // ---- Products: search ----
  server.tool(
    'find_products',
    'Natural-language product search. Give a plain phrase like "white gold diamond stud earrings" or "sterling silver bracelet in stock" and it resolves the terms against Stuller\'s live facet vocabulary (so you don\'t need to know exact values), then runs the search. Returns `resolvedFilters` (how it interpreted the query), `appliedFilters`, and `unmatchedTerms` (words it could not map — refine or use advanced_product_filters for those). Best starting point for catalog discovery; use search_products directly when you already know exact facet values. Re-check pricing on chosen SKUs before quoting.',
    {
      query: z.string().describe('Plain-language description, e.g. "yellow gold rope chain"'),
      filter: z
        .array(z.string())
        .optional()
        .describe('Extra ProductFilter flags (InStock/Orderable/OnPriceList/Finished/BestSeller); in-stock/best-seller phrasing in the query is auto-detected'),
      pageSize: z.number().int().positive().optional(),
      page: z.number().int().positive().optional(),
      nextPage: z.string().optional().describe('Paging token from a prior call'),
    },
    tool((a) => findProducts(a))
  );

  server.tool(
    'advanced_product_filters',
    'Discover the faceted filters available for search_products: returns facet types (ProductType, MetalQuality, StoneFamily, StoneShape, StoneColor, StoneQuality, StoneUniqueness, StoneCut, StoneSize) and each one\'s valid { displayValue, value } options. Call this FIRST when you don\'t already know exact filter values, then feed a chosen type+value into search_products `advancedProductFilters`. Optionally scope by categoryIds/series/filter to get values for just that slice of the catalog. No arguments returns the full global facet set.',
    {
      categoryIds: z.array(z.number().int()).optional().describe('Scope facets to these Stuller category IDs'),
      series: z.array(z.string()).optional().describe('Scope facets to these series numbers'),
      filter: z.array(z.string()).optional().describe('ProductFilter flags: None, Orderable, InStock, OnPriceList, Finished, BestSeller'),
      advancedProductFilters: z
        .array(z.record(z.any()))
        .optional()
        .describe('Already-chosen facets, to get the remaining valid values given those selections'),
    },
    tool((a) => advancedProductFilters(a))
  );

  server.tool(
    'search_products',
    'Filter the Stuller catalog and page through results. This is a STRUCTURAL filter, not free-text keyword search: narrow by `series` (e.g. ["309"]), `categoryIds`, `productIds`, `filter` flags, or `advancedProductFilters`. If you don\'t already know valid facet values, call advanced_product_filters FIRST to discover them. Search results carry limited pricing — re-check chosen SKUs with pricing_availability/product_detail before quoting. Returns transformed products plus a `nextPage` token — pass it back as `nextPage` to fetch the next page (hasMore tells you when to stop).',
    {
      series: z.array(z.string()).optional().describe('Series numbers, e.g. ["309", "1601"]'),
      categoryIds: z.array(z.number().int()).optional().describe('Stuller category IDs'),
      productIds: z.array(z.number().int()).optional().describe('Stuller product IDs'),
      filter: z
        .array(z.string())
        .optional()
        .describe('ProductFilter flags: None, Orderable, InStock, OnPriceList, Finished, BestSeller'),
      advancedProductFilters: z
        .array(z.record(z.any()))
        .optional()
        .describe('Advanced filter objects: { Type, Values: [{ DisplayValue, Value }] }'),
      include: z.array(z.string()).optional().describe('Optional ProductInclude values'),
      pageSize: z.number().int().positive().optional().describe('Results per page (max 500)'),
      page: z.number().int().positive().optional().describe('Page number (alternative to nextPage)'),
      nextPage: z.string().optional().describe('Paging token returned by a prior call'),
    },
    tool((a) => searchProducts(a))
  );

  server.tool(
    'discover_categories',
    'Find Stuller merchandising categories (and their CategoryIds) for finished-jewelry browse. Stuller has no category-tree endpoint, but products carry WebCategories whose ids are valid CategoryIds. This scans a slice of the catalog (by `productType` e.g. "Earrings"/"Rings", or series/filter/advancedProductFilters) and returns the distinct categories seen — optionally filtered by `contains` (e.g. "stud"). Pick a category `id`, then call search_products with categoryIds:[id]. This is how to reach things faceted search can\'t (e.g. "diamond stud earrings"), since stone facets don\'t combine with finished ProductType.',
    {
      productType: z.string().optional().describe('e.g. "Earrings", "Rings", "Bracelets"'),
      contains: z.string().optional().describe('Keep only categories whose name/path contains this (e.g. "stud", "diamond")'),
      series: z.array(z.string()).optional(),
      categoryIds: z.array(z.number().int()).optional(),
      productIds: z.array(z.number().int()).optional(),
      filter: z.array(z.string()).optional(),
      advancedProductFilters: z.array(z.record(z.any())).optional(),
      scanPages: z.number().int().positive().optional().describe('Pages to scan (default 2, max 10)'),
      pageSize: z.number().int().positive().optional().describe('Products per page (default 50)'),
    },
    tool((a) => discoverCategories(a))
  );

  server.tool(
    'show_product',
    'Fetch a product image and return it as an inline image (renders in image-capable MCP clients, and gives a voice/TV surface a "show this" payload). Pass a `sku` (its primary image is used) or an explicit `imageUrl`. For bulk results prefer the `display.primaryImage` URLs already in tool output — this tool inlines a single image on demand.',
    {
      sku: z.string().optional().describe('Stuller SKU; uses its primary image'),
      imageUrl: z.string().optional().describe('Explicit image URL (e.g. a display.primaryImage or fullySetImages URL)'),
      size: z
        .enum(['tiny', 'thumb', 'list', 'standard', 'xlarge', 'zoom', 'original'])
        .optional()
        .describe('Render size: tiny 40px · thumb 75px · list 165px · standard 300px · xlarge 640px · zoom 1500px · original. Bigger = larger inline image (use xlarge/zoom for a TV).'),
    },
    async (a) => {
      try {
        const r = await showProduct(a || {});
        const caption = [r.title, r.price != null ? `$${r.price} ${r.currency}` : null, r.sourceUrl]
          .filter(Boolean)
          .join(' — ');
        return {
          content: [
            { type: 'image', data: r.base64, mimeType: r.mimeType },
            { type: 'text', text: caption },
          ],
        };
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'metal_market_rates',
    'Current Stuller metal market rates (gold, platinum, silver, etc.). No arguments. Useful for pricing metal-dependent jewelry work.',
    {},
    tool(() => metalMarketRates())
  );

  // ---- Gems (diamonds & colored stones) ----
  const diamondArgs = {
    caratMin: z.number().positive().optional().describe('Minimum carat weight'),
    caratMax: z.number().positive().optional().describe('Maximum carat weight'),
    priceMin: z.number().nonnegative().optional().describe('Minimum total price'),
    priceMax: z.number().positive().optional().describe('Maximum total price'),
    color: z.array(z.string()).optional().describe('Color grades, e.g. ["D","E","F"] or ["G"]'),
    clarity: z.array(z.string()).optional().describe('Clarity grades, e.g. ["VS1","VVS2","IF"]'),
    cut: z.array(z.string()).optional().describe('Cut grades, e.g. ["Ideal","Excellent"]'),
    shape: z.array(z.string()).optional().describe('Shapes, e.g. ["Round","Princess","Oval"]'),
    polish: z.array(z.string()).optional(),
    symmetry: z.array(z.string()).optional(),
    fluorescence: z.array(z.string()).optional(),
    certification: z.array(z.string()).optional().describe('Labs, e.g. ["GIA","IGI"]'),
    fancyColors: z.array(z.string()).optional().describe('Fancy color names for colored diamonds'),
    serialNumbers: z.array(z.number().int()).optional().describe('Look up specific stones by serial number'),
    pageSize: z.number().int().positive().optional(),
    page: z.number().int().positive().optional(),
    nextPage: z.string().optional().describe('Paging token from a prior call'),
  };

  server.tool(
    'search_diamonds',
    'Search Stuller\'s natural diamond inventory by the 4Cs and more: carat range (caratMin/caratMax), color, clarity, cut, shape, plus polish/symmetry/fluorescence, certification lab, and price range. Returns each diamond\'s specs, price, certificate number, and images, with a `nextPage` token + `totalAvailable` count. Filter values are plain codes/words (e.g. color "G", clarity "VS1", shape "Round").',
    diamondArgs,
    tool((a) => searchDiamonds(a))
  );

  server.tool(
    'search_lab_grown_diamonds',
    'Search Stuller\'s lab-grown diamond inventory. Identical filters to search_diamonds (4Cs, shape, certification, price/carat ranges, paging).',
    diamondArgs,
    tool((a) => searchLabGrownDiamonds(a))
  );

  server.tool(
    'search_gemstones',
    'Search Stuller\'s colored gemstone inventory (sapphire, ruby, emerald, etc.). Filter by `stoneTypes` (e.g. ["Sapphire"]), `colors`, `shapes`, and `length`/`width` in mm; `filters` accepts Option/Value pairs (e.g. { Option: "SizeTypeCarat", Value: "..." }). Returns each stone\'s type, color, carat, price, dimensions, certification, and images, with `nextPage` paging + `totalAvailable`.',
    {
      stoneTypes: z.array(z.string()).optional().describe('Gem types, e.g. ["Sapphire","Ruby","Emerald"]'),
      colors: z.array(z.string()).optional(),
      shapes: z.array(z.string()).optional().describe('e.g. ["Round","Oval","Cushion"]'),
      length: z.number().positive().optional().describe('Length in mm'),
      width: z.number().positive().optional().describe('Width in mm'),
      serialNumbers: z.array(z.number().int()).optional(),
      filters: z
        .array(z.object({ Option: z.string(), Value: z.string() }))
        .optional()
        .describe('Generic Option/Value filter pairs'),
      pageSize: z.number().int().positive().optional(),
      page: z.number().int().positive().optional(),
      nextPage: z.string().optional(),
    },
    tool((a) => searchGemstones(a))
  );

  server.tool(
    'find_stones_by_dimensions',
    'Find a loose stone to FIT a setting of a given size — e.g. to replace a lost or broken stone. Give the target `lengthMm` (and `widthMm` for non-round shapes; round defaults width=length) plus `shape`, and it scans the stone family and returns the closest-fitting stones ranked by deviation (each match includes a `fit` block with measured size + deviationMm). `source` is "diamond" (default), "lab_grown_diamond", or "gemstone" (set `stoneType`, e.g. "Sapphire"). Widen `tolerance` (mm, default 0.3) if nothing fits.',
    {
      lengthMm: z.number().positive().describe('Target stone length / diameter in mm'),
      widthMm: z.number().positive().optional().describe('Target width in mm (defaults to length for round)'),
      shape: z.string().optional().describe('Stone shape, e.g. "Round", "Oval", "Princess"'),
      tolerance: z.number().positive().optional().describe('Max mm deviation per dimension (default 0.3)'),
      source: z
        .enum(['diamond', 'lab_grown_diamond', 'gemstone'])
        .optional()
        .describe('Which inventory to search (default "diamond")'),
      stoneType: z.string().optional().describe('For source "gemstone": e.g. "Sapphire", "Ruby"'),
      color: z.array(z.string()).optional().describe('Diamond color grades to constrain the scan'),
      clarity: z.array(z.string()).optional().describe('Diamond clarity grades to constrain the scan'),
      maxResults: z.number().int().positive().optional().describe('Max matches to return (default 10)'),
      maxScan: z.number().int().positive().optional().describe('Max stones to scan before stopping (default 300)'),
    },
    tool((a) => findStonesByDimensions(a))
  );

  // ---- Configurable / virtual products ----
  server.tool(
    'search_virtual_products',
    'Search configurable / semi-set ("virtual") mountings — pieces you set stones into. Each result includes its configuration model (ring sizes, setting locations with shape/size/setting-type) and `canBeSetWith` (compatible stone specs), plus `fullySetImages` and the `baseProductId` you pass to configure_product. Ideal for custom-design sourcing and dropship catalogs. Requires at least one selector (series/sku/productIds/categoryIds/filter); `filter: ["Orderable"]` is a good broad start.',
    {
      series: z.array(z.string()).optional(),
      sku: z.array(z.string()).optional(),
      productIds: z.array(z.number().int()).optional(),
      categoryIds: z.array(z.number().int()).optional(),
      filter: z.array(z.string()).optional().describe('ProductFilter flags, e.g. ["Orderable","InStock"]'),
      advancedProductFilters: z.array(z.record(z.any())).optional(),
      include: z.array(z.string()).optional().describe('ProductInclude values (defaults to ["All"] for full config model)'),
      pageSize: z.number().int().positive().optional(),
      page: z.number().int().positive().optional(),
      nextPage: z.string().optional(),
    },
    tool((a) => searchVirtualProducts(a))
  );

  server.tool(
    'configure_product',
    'Configure a mounting and get its live total price, estimated ship date, and imagery for the chosen options. Pass the BASE product id (a virtual product\'s `baseProductId`, or a configurable product\'s Id) plus selections: `ringSize`, `stones` (set a stone at a location), `engravings`, `chainLength`, earring-back/clasp ids. Read-only price quote — does NOT place an order (use submit_order for that).',
    {
      productId: z.number().int().describe('Base product id of the configurable mounting'),
      quantity: z.number().int().positive().optional(),
      ringSize: z.number().optional(),
      chainLength: z.number().optional(),
      earringBackProductId: z.number().int().optional(),
      claspProductId: z.number().int().optional(),
      pendantChainProductId: z.number().int().optional(),
      stones: z
        .array(
          z.object({
            locationNumber: z.number().int(),
            stoneProductId: z.number().int().optional(),
            serialNumber: z.number().int().optional(),
            customerStoneValue: z.number().optional(),
          })
        )
        .optional()
        .describe('Stone selections per setting location'),
      engravings: z
        .array(
          z.object({
            locationNumber: z.number().int(),
            type: z.string().optional(),
            font: z.string().optional(),
            fillColor: z.string().optional(),
            finish: z.string().optional(),
            text: z.string().optional(),
          })
        )
        .optional(),
      include: z.array(z.string()).optional(),
    },
    tool((a) => configureProduct(a))
  );

  server.tool(
    'get_configured_product',
    'Retrieve a previously configured item by its configuration id (e.g. one returned from configure_product as `configurationId`). Returns SKU, pricing, availability, ship date, and the configured selections.',
    {
      configurationId: z.number().int().describe('The configuration id of an existing configured product'),
      include: z.array(z.string()).optional(),
    },
    tool((a) => getConfiguredProduct(a))
  );

  // ---- Quote builder (session-scoped, in-memory) ----
  const cartIdArg = z.string().optional().describe('Name of the quote to act on (default "default"); use to keep several quotes');

  server.tool(
    'quote_add_item',
    'Add a line to a quote/cart. Give `sku` (+ optional `quantity`) to pull live Stuller price & availability, or `description` + `unitPrice` for a manual line (labor, custom charges). Adding an existing SKU merges quantities. Returns the updated quote with a running subtotal. The quote is session-scoped (in memory) — Stuller has no server-side cart.',
    {
      sku: z.string().optional().describe('Stuller SKU to price live'),
      quantity: z.number().int().positive().optional().describe('Default 1'),
      description: z.string().optional().describe('For a manual (non-SKU) line'),
      unitPrice: z.number().optional().describe('Required for a manual line'),
      cartId: cartIdArg,
    },
    tool((a) => quoteAdd(a))
  );

  server.tool(
    'quote_view',
    'Show a quote: every line, quantities, unit/line prices, and the running subtotal, plus flags (unpriced / manual / out-of-stock lines). Pass `refresh: true` to re-pull live prices for all Stuller lines.',
    { cartId: cartIdArg, refresh: z.boolean().optional().describe('Re-price all Stuller lines live') },
    tool((a) => quoteView(a))
  );

  server.tool(
    'quote_remove_item',
    'Remove a line from a quote by `sku` or by 1-based `index`. Returns the updated quote.',
    { sku: z.string().optional(), index: z.number().int().positive().optional(), cartId: cartIdArg },
    tool((a) => quoteRemove(a))
  );

  server.tool(
    'quote_clear',
    'Empty a quote — removes all line items. Pass `cartId` to clear a specific named quote (defaults to "default"). Returns the now-empty quote.',
    { cartId: cartIdArg },
    tool((a) => quoteClear(a))
  );

  server.tool(
    'quote_to_order',
    'Convert a quote into a submit_order-ready `lines` array (Stuller SKU lines only). Manual lines are returned under `excluded` since they can\'t be ordered via the API. Hand `lines` to submit_order (which still defaults to a dry run).',
    { cartId: cartIdArg },
    tool((a) => quoteToOrder(a))
  );

  // ---- Orders ----
  server.tool(
    'order_status',
    'Read Stuller order history / status. With no arguments returns recent orders; narrow with `orderNumber` or a `since`/`until` date range. Read-only.',
    {
      orderNumber: z.string().optional(),
      since: z.string().optional().describe('ISO date, e.g. 2026-05-01'),
      until: z.string().optional().describe('ISO date'),
    },
    tool((a) => orderStatus(a))
  );

  server.tool(
    'list_invoices',
    'List invoices for a date range — the fulfillment & tracking view. Each invoice includes shipment tracking (number + carrier link + method), order/invoice numbers, totals, ship-to address, and line items with back-ordered quantities. Use this to answer "did my order ship / what\'s the tracking / what\'s backordered". Defaults to the last 90 days. `onlyShipped`/`onlyOpen` narrow the set. NOTE: Stuller filters invoices only by date; orderNumber/invoiceNumber/purchaseOrderNumber narrowing is applied locally, so keep the date window around the order you want.',
    {
      dateFrom: z.string().optional().describe('ISO date (default: 90 days ago)'),
      dateTo: z.string().optional().describe('ISO date (default: today)'),
      orderNumber: z.union([z.string(), z.number()]).optional(),
      invoiceNumber: z.union([z.string(), z.number()]).optional(),
      purchaseOrderNumber: z.string().optional(),
      onlyShipped: z.boolean().optional().describe('Only invoices that have a tracking number'),
      onlyOpen: z.boolean().optional().describe('Exclude closed invoices'),
      limit: z.number().int().positive().optional(),
    },
    tool((a) => listInvoices(a))
  );

  server.tool(
    'get_shipment',
    'Get a single shipment\'s full detail by its shipment header id: tracking number, carrier, destination, and package line items. (Shipment ids are not exposed on invoices; use this when you already have one.)',
    { shipmentHeaderId: z.number().int().describe('The shipment header id') },
    tool((a) => getShipment(a))
  );

  server.tool(
    'submit_order',
    'Submit an order to Stuller. WRITE TOOL — defaults to a DRY RUN: assembles and returns the exact request body WITHOUT transmitting. Review it, then call again with confirm: true to actually place the order. Each line needs a SKU/itemNumber and quantity. Set STULLER_DISABLE_ORDERING=true in the environment to hard-disable this tool. Provide shipping/billing/contact/payment per Stuller\'s submitorder schema; unmodeled fields pass through verbatim.',
    {
      lines: z
        .array(
          z.object({
            sku: z.string().optional(),
            itemNumber: z.string().optional(),
            quantity: z.number().int().positive().optional(),
            comments: z.string().optional(),
          })
        )
        .describe('Order line items — each needs sku/itemNumber and quantity'),
      shipToAddress: z.record(z.any()).optional(),
      billToAddress: z.record(z.any()).optional(),
      contact: z.record(z.any()).optional(),
      payment: z.record(z.any()).optional(),
      customerData: z.record(z.any()).optional(),
      purchaseOrderNumber: z.string().optional(),
      comments: z.string().optional(),
      confirm: z.boolean().optional().describe('Set true to actually submit. Omit/false = dry-run preview.'),
    },
    tool((a) => {
      const { confirm, ...spec } = a;
      return submitOrder(spec, confirm === true);
    })
  );

  return server;
}
