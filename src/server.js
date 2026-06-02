import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  getProducts,
  productDetail,
  pricingAvailability,
  searchProducts,
  metalMarketRates,
  advancedProductFilters,
} from './tools/products.js';
import { searchDiamonds, searchLabGrownDiamonds, searchGemstones } from './tools/gems.js';
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
