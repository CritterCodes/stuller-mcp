// Single source of truth for the server's self-documentation. SERVER_INSTRUCTIONS
// is sent at connect (most MCP clients inject it into the model's context).
// USAGE_GUIDE is the on-demand walkthrough returned by the get_started tool, so
// even clients that ignore instructions let a user ask "how do I use this?".

export const SERVER_INSTRUCTIONS = `This server connects to the Stuller jewelry-supply v2 API (catalog, pricing, loose stones, ordering). Authentication uses the user's own Stuller "developer login" via environment variables.

Key things to know:
- Easiest way to find products: find_products — give it a plain-language description (e.g. "white gold diamond stud earrings") and it resolves your words to Stuller's facet vocabulary, runs the search, and reports back what it matched plus any terms it couldn't map. (Stuller's API itself has no raw keyword search, so find_products bridges to structured facets for you.) You can also go manual: get_products by SKU, search_products by series/categoryIds, or advanced_product_filters → search_products. For finished-jewelry categories facets can't express (e.g. "diamond stud earrings" — stone facets don't combine with a finished ProductType), use discover_categories to get a CategoryId, then search_products by it.
- search_products results carry LIMITED pricing — always re-check chosen SKUs with pricing_availability or product_detail before quoting a customer.
- Loose stones use dedicated tools, not the product catalog: search_diamonds / search_lab_grown_diamonds (filter by the 4Cs, shape, certification, carat/price ranges) and search_gemstones (colored stones by type/color/shape). Filter values are plain codes/words (color "G", clarity "VS1", shape "Round").
- submit_order is the only write tool. It defaults to a DRY RUN and returns the order body without sending; it only transmits when called again with confirm: true. Never claim an order was placed unless you called it with confirm: true and got a submitted response.
- Call get_started any time for a fuller walkthrough.`;

export const USAGE_GUIDE = `# Using the Stuller MCP

This server gives you access to Stuller's catalog, pricing, loose-stone inventory, and ordering. Here's how to get the most out of it.

## Setup
You need a Stuller **developer login** (API-only credentials, not your stuller.com website login) set as \`STULLER_USERNAME\` / \`STULLER_PASSWORD\`. If tools return an auth error, the credentials aren't configured.

## Finding products

**Start with \`find_products\`** — describe what you want in plain language ("white gold diamond stud earrings") and it resolves your words to Stuller's facet vocabulary, runs the search, and returns \`resolvedFilters\` (what it matched) + \`unmatchedTerms\` (what it couldn't). It's the natural-language front door. Stuller's API has no raw keyword search of its own, so under the hood everything maps to the structured paths below — which you can also drive directly:

1. **By identifier** — if you know it:
   - \`get_products\` — one or more SKUs (e.g. "309:77802:S")
   - \`search_products\` with \`series\` or \`categoryIds\`
2. **By faceted filters** — to discover/narrow:
   - \`advanced_product_filters\` — lists the facets you can filter on (ProductType, MetalQuality, StoneFamily, StoneShape, …) and their valid values
   - \`search_products\` — pass a chosen facet as \`advancedProductFilters\`, optionally with \`filter\` flags (InStock, Orderable, OnPriceList, Finished, BestSeller)
3. **By merchandising category** — for finished jewelry facets can't express (e.g. "diamond stud earrings" — stone facets don't AND with a finished ProductType):
   - \`discover_categories\` (e.g. \`productType:"Earrings", contains:"stud"\`) → pick a category \`id\` → \`search_products\` with \`categoryIds:[id]\`. Note: category coverage depends on how the account's catalog is tagged — if \`contains\` matches nothing it returns the categories that WERE found (under otherCategories) so you can still pick one.

   Page large result sets with the returned \`nextPage\` token (\`hasMore\` tells you when to stop).

## Pricing & availability
- \`pricing_availability\` — real-time price + stock for a batch of SKUs (lean)
- \`product_detail\` — full detail for one SKU incl. images, media, specs
- \`metal_market_rates\` — current gold/platinum/silver rates

⚠️ **Search results carry limited/placeholder pricing.** Always re-check a SKU with \`pricing_availability\` or \`product_detail\` before quoting.

## Loose stones
- \`search_diamonds\` / \`search_lab_grown_diamonds\` — filter by the 4Cs (\`caratMin\`/\`caratMax\`, \`color\`, \`clarity\`, \`cut\`), plus \`shape\`, \`certification\`, and \`priceMin\`/\`priceMax\`. Returns specs, price, certificate number, and images.
  - Example: \`{ caratMin: 1.0, caratMax: 1.5, color: ["G"], clarity: ["VS1"], shape: ["Round"], certification: ["GIA"] }\`
- \`search_gemstones\` — colored stones by \`stoneTypes\` (["Sapphire"]), \`colors\`, \`shapes\`, mm \`length\`/\`width\`.
- \`find_stones_by_dimensions\` — find a stone to FIT a setting size (e.g. replace a lost 4.1mm round), ranked by closeness of fit.

Filter values are plain codes/words: color "G", clarity "VS1", shape "Round".

## Building a quote
- \`quote_add_item\` — add a SKU (priced live) or a manual line (\`description\` + \`unitPrice\`, e.g. labor) to a session quote
- \`quote_view\` (\`refresh\` to re-price), \`quote_remove_item\`, \`quote_clear\`
- \`quote_to_order\` — turn the quote into a \`submit_order\`-ready \`lines\` array

The quote lives in memory for this session only (Stuller has no server-side cart).

## Ordering (write)
- \`order_status\` — read order history/status (read-only)
- \`list_invoices\` — invoices with shipment **tracking** + back-ordered items (the "did it ship?" view)
- \`submit_order\` — **dry run by default**: it returns the order body it *would* send and transmits nothing. Review it, then call again with \`confirm: true\` to actually place the order. Set \`STULLER_DISABLE_ORDERING=true\` in the environment to hard-disable it.

## A typical flow
1. \`find_products\` ("…") → candidates (or advanced_product_filters / discover_categories → search_products if you prefer to drive facets yourself)
2. \`pricing_availability\` / \`product_detail\` → confirm live price + stock
3. (optional) \`quote_add_item\` → \`quote_view\` → \`quote_to_order\`
4. \`submit_order\` dry run → review → \`confirm: true\`

_Not affiliated with or endorsed by Stuller, Inc._`;
