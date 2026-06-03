# stuller-mcp

An [MCP](https://modelcontextprotocol.io) server that wraps the **Stuller v2 API** so an AI assistant (Claude Code, Claude Desktop, or any MCP client) can search Stuller's catalog, pull real-time pricing & availability, read full product detail/media, and place orders.

It is a small, dependency-light Node server. **Your Stuller credentials are read from environment variables and are never stored in the code** — the repo is safe to commit and share.

---

## ⚠️ Credentials are required

This server does nothing useful until **you** add your own Stuller credentials. There are no keys baked in.

You need a Stuller **developer login** — a set of Stuller.com credentials that *cannot* sign in to the stuller.com website and are only valid for API requests. Create one from your Stuller account (Account → API / developer access) or ask your Stuller representative. Authentication is HTTP Basic over the developer login username/password.

---

## Setup

```bash
cd stuller-mcp
npm install
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
```

Then open `.env` and fill in **your** credentials:

```ini
STULLER_USERNAME=your-developer-login-username
STULLER_PASSWORD=your-developer-login-password
# optional:
STULLER_API_URL=https://api.stuller.com
STULLER_DISABLE_ORDERING=false
```

`.env` is git-ignored — it will not be committed.

Verify it works:

```bash
npm run smoke
```

Without credentials the smoke test confirms the server builds and skips the live call. With credentials it does one read-only price/stock lookup. (Override the test SKU with `SMOKE_SKU=...` if the default isn't on your price list.)

---

## Connecting it to an MCP client

Once published to npm, the simplest setup runs it with `npx` — no clone or install needed:

```jsonc
{
  "mcpServers": {
    "stuller": {
      "command": "npx",
      "args": ["-y", "stuller-mcp"],
      "env": {
        "STULLER_USERNAME": "your-developer-login-username",
        "STULLER_PASSWORD": "your-developer-login-password"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add stuller --env STULLER_USERNAME=... --env STULLER_PASSWORD=... -- npx -y stuller-mcp
```

### Claude Desktop

Add the `mcpServers` block above to `claude_desktop_config.json` (Settings → Developer → Edit Config), then restart the app.

### Running from a local clone instead

Point `command`/`args` at your checkout — useful for development:

```jsonc
{
  "mcpServers": {
    "stuller": {
      "command": "node",
      "args": ["/absolute/path/to/stuller-mcp/index.js"],
      "env": {
        "STULLER_USERNAME": "your-developer-login-username",
        "STULLER_PASSWORD": "your-developer-login-password"
      }
    }
  }
}
```

> When running from a local clone, the server also auto-loads a `.env` from its own directory, so you can leave `env` out of the client config and rely on that file instead. Just don't commit real values.

---

## Tools

> **New to it?** Just ask the assistant *"how do I use the Stuller server?"* — the `get_started` tool returns a full walkthrough in chat, and the server also sends usage instructions to your client automatically on connect.

| Tool | Type | What it does |
|------|------|--------------|
| `get_started` | read | Returns a markdown usage guide (finding products, pricing, stone search, ordering). Ask the assistant how to use the server. |
| `get_products` | read | Fetch one or more products by SKU. Returns normalized product data + a `notFound` list. |
| `product_detail` | read | Full detail for a single SKU including images, media, and all specifications. |
| `show_product` | read | Fetch a product image and return it **inline** (renders in image-capable clients; a "show this" payload for a voice/TV surface). |
| `pricing_availability` | read | Lean real-time price + stock/availability for a batch of SKUs. |
| `find_products` | read | **Natural-language search** — give a plain phrase ("white gold diamond stud earrings") and it resolves the terms to real facets, then searches. Easiest entry point. |
| `advanced_product_filters` | read | Discover the facets you can search on (ProductType, MetalQuality, StoneFamily, …) and their valid values. |
| `discover_categories` | read | Find merchandising categories + their CategoryIds (e.g. "Diamond Stud Earrings") to browse finished jewelry facets can't reach. |
| `search_products` | read | Filter the catalog by series / category / advanced filters, with `nextPage` paging. |
| `metal_market_rates` | read | Current Stuller gold/platinum/silver market rates. |
| `search_diamonds` | read | Search natural diamonds by the 4Cs (carat/color/clarity/cut), shape, certification, and price range. |
| `search_lab_grown_diamonds` | read | Same as `search_diamonds`, against lab-grown inventory. |
| `search_gemstones` | read | Search colored gemstones (sapphire, ruby, emerald, …) by type, color, shape, and size. |
| `find_stones_by_dimensions` | read | Find a stone to **fit a setting of a given size** (e.g. replace a lost 4.1mm round), ranked by closeness of fit. |
| `search_virtual_products` | read | Search configurable / semi-set mountings; returns setting locations, ring sizes, compatible stones, and `baseProductId`. |
| `configure_product` | read | Price a configured mounting (ring size, stones, engraving) — live total + ship date + imagery. Quote only; does not order. |
| `get_configured_product` | read | Retrieve a previously configured item by its configuration id. |
| `order_status` | read | Read order history / status (by order number or date range). |
| `list_invoices` | read | Fulfillment view: invoices for a date range with shipment **tracking**, totals, and back-ordered line items. |
| `get_shipment` | read | Full shipment detail by shipment header id (tracking, carrier, package contents). |
| `quote_add_item` | read | Add a SKU (live-priced) or a manual line (labor/custom) to a session quote; returns a running subtotal. |
| `quote_view` | read | Show the quote with line/subtotal and flags; `refresh` re-prices live. |
| `quote_remove_item` | read | Remove a line by SKU or index. |
| `quote_clear` | read | Empty the quote. |
| `quote_to_order` | read | Convert the quote into a `submit_order`-ready `lines` array. |
| `submit_order` | **write** | Place an order. Dry-run by default; only transmits with `confirm: true`. |

### How searching works

Stuller's product endpoint filters **structurally** — there is no free-text keyword search. The easiest path is **`find_products`**, which takes a plain phrase, resolves it against the live facet vocabulary, and reports back what it understood (`resolvedFilters`) and any words it couldn't map (`unmatchedTerms`). Under the hood it uses the same facets you can drive yourself:

You find products by identifier (`SKU`, `productIds`, `series`, `categoryIds`) or by **faceted filters**. The faceted flow is two steps:

1. **`advanced_product_filters`** — discover the available facets and their valid values. There are 9 facet types: `ProductType`, `MetalQuality`, `StoneShape`, `StoneFamily`, `StoneColor`, `StoneQuality`, `StoneUniqueness`, `StoneCut`, `StoneSize`.
2. **`search_products`** — pass a chosen facet back in as `advancedProductFilters: [{ Type, Values: [{ DisplayValue, Value }] }]`, optionally combined with `filter` flags (`InStock`, `Orderable`, `OnPriceList`, `Finished`, `BestSeller`). So *"diamond stud earrings"* becomes `ProductType=Earrings` + `StoneFamily=Diamond`.

Page through large result sets with the returned `nextPage` token (`hasMore` tells you when to stop). **Search results carry limited pricing** — re-check chosen SKUs with `pricing_availability` or `product_detail` before quoting.

### Diamond & gemstone search

Loose stones use a different, richer search than the product catalog. `search_diamonds` / `search_lab_grown_diamonds` filter by the **4Cs** plus shape, certification, and ranges:

```jsonc
// "1–1.5ct, G color, VS1, round, GIA-certified"
{ "caratMin": 1.0, "caratMax": 1.5, "color": ["G"], "clarity": ["VS1"], "shape": ["Round"], "certification": ["GIA"] }
```

Filter values are plain codes/words (`color: "G"`, `clarity: "VS1"`, `shape: "Round"`). Results include each stone's specs, price, **certificate number**, and images, with `nextPage` paging and a `totalAvailable` count. `search_gemstones` works the same way for colored stones via `stoneTypes` (e.g. `["Sapphire"]`), `colors`, `shapes`, and mm dimensions.

**Replacing a lost stone?** `find_stones_by_dimensions` takes a target size (`lengthMm`, optional `widthMm`, `shape`) and returns the closest-fitting stones ranked by deviation, each with a `fit` block (measured size + mm deviation). Pick `source`: `diamond` (default), `lab_grown_diamond`, or `gemstone` (+`stoneType`). _Note: Stuller has no working server-side fit-by-dimensions endpoint, so this scans by shape and ranks locally — widen `tolerance` if nothing fits._

### Configurable & semi-mount products

`search_virtual_products` finds configurable mountings (semi-sets you set stones into). Each result exposes its `configurationModel` (ring sizes, setting locations with shape/size/setting-type), `canBeSetWith` (compatible stone specs), `fullySetImages`, and a `baseProductId`.

Feed that `baseProductId` into `configure_product` with your choices (`ringSize`, `stones` at locations, `engravings`, chain length, …) to get a **live total price, estimated ship date, and configured imagery**. This is a quote — it doesn't place an order (use `submit_order` for that). A typical custom flow: `search_virtual_products` → pick a mount → `find_stones_by_dimensions`/`search_diamonds` for the stone → `configure_product` to price it → `submit_order`.

### `include` options

Read tools accept an optional `include` array of Stuller **ProductInclude** values (e.g. `["All"]`, `["Prices"]`, `["Media"]`) to control how much data comes back. `product_detail` defaults to `["All"]`. See the [Stuller API help](https://api.stuller.com/Help) for the full enum.

---

## Seeing what you're buying (images)

Every buyable result carries a render-ready **`display`** block so any surface (web UI, kiosk, a voice assistant on a TV) can show the item with zero parsing:

```jsonc
display: { title, price, currency, primaryImage, thumbnail, video }
```

`primaryImage`/`thumbnail` are CDN URLs (configurable mounts prefer the *fully-set* finished look). For lightweight/bulk rendering, surfaces should use these URLs directly. To render a single image **inline in chat** (or push it to a screen), call **`show_product`** — it downloads the image and returns an MCP image content block. URLs stay the default; inlining (base64) is opt-in and single-item.

**Image sizes.** Stuller's image CDN renders a size via a query token, so any surface can resize by swapping it (the `?$…$` at the end of a `meteor.stullercloud.com/das/…` URL):

| token | px | | token | px |
|---|---|---|---|---|
| `$tiny$` | 40 | | `$standard$` | 300 |
| `$thumb$` | 75 | | `$xlarge$` | 640 |
| `$list$` | 165 | | `$zoom$` | 1500 |

No token = the original. (Unrecognized tokens and explicit `WxH` are ignored.) `show_product` takes a `size` option (`tiny`…`zoom`/`original`) — use `xlarge`/`zoom` for a TV, `tiny`/`thumb` for a watch or list.

## Worked example: source a stone + price a mounting

A custom-design flow chaining several tools (real shapes, abbreviated):

```jsonc
// 1. Find a 1–1.5ct round GIA diamond under $6k
search_diamonds({ caratMin:1, caratMax:1.5, shape:["Round"], certification:["GIA"], priceMax:6000 })
// → { count: …, diamonds: [{ serialNumber, caratWeight:1.0, color:"G", clarity:"VS1",
//      price:5100, certificationNumber:"1408618343", … }] }

// 2. Find a semi-mount it can be set into
search_virtual_products({ filter:["Orderable"], pageSize:5 })
// → { products: [{ baseProductId:22145800, settingOptions:[{shape:"Marquise", sizeMM:7,…}],
//      canBeSetWith:[{shape:"MARQUISE", size:"7.00"}], fullySetImages:[…] }] }

// 3. Price the mounting configured to size 7
configure_product({ productId:22145800, ringSize:7 })
// → { totalPrice:715.10, currency:"USD", estimatedShipDate:…, images:[…10] }

// 4. Build a quote (Stuller part + your labor) and convert to an order
quote_add_item({ sku:"SOLDER:0267:P", quantity:2 })   // live-priced
quote_add_item({ description:"Setting labor", unitPrice:120 })
quote_view()              // → running subtotal
quote_to_order()          // → { lines:[{sku,quantity}], excluded:[{labor}] }
submit_order({ lines:[…] })   // DRY RUN — review, then confirm:true to place
```

For finished jewelry that faceted search can't express (e.g. "diamond stud earrings"),
use `discover_categories({ productType:"Earrings", contains:"stud" })` → pick a
`categoryId` → `search_products({ categoryIds:[id] })`.

## Safety model

- **Reads** (everything except `submit_order` — products, stones, configuration, `order_status`, `list_invoices`, `get_shipment`, …) never modify anything.
- **`submit_order` is the only write tool.** It defaults to a **dry run** — it returns the exact request body it *would* send and transmits nothing until you call it again with `confirm: true`. The dry run validates line SKUs against the catalog and flags missing recipient/contact/payment fields; a confirmed order with unknown SKUs is refused.
- Set `STULLER_DISABLE_ORDERING=true` to hard-disable order submission entirely, regardless of the `confirm` flag.

> **Deployment note:** this server is designed to run **per-user over stdio** (one process per client). The quote builder and response cache keep state in process memory, which is *not* isolated between users — **do not host a single shared instance for multiple clients** without adding per-session isolation first. Each user should run their own instance with their own credentials.

---

## API reference

- Endpoint help & request/response models: <https://api.stuller.com/Help>
- Stuller e-commerce / developer docs: <https://www.stuller.com/ecommerce-api-documentation/>
- Postman examples: Stuller API Workspace → *Product API Examples*

## License

MIT. This project is not affiliated with or endorsed by Stuller, Inc.
