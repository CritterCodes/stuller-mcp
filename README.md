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

| Tool | Type | What it does |
|------|------|--------------|
| `get_products` | read | Fetch one or more products by SKU. Returns normalized product data + a `notFound` list. |
| `product_detail` | read | Full detail for a single SKU including images, media, and all specifications. |
| `pricing_availability` | read | Lean real-time price + stock/availability for a batch of SKUs. |
| `advanced_product_filters` | read | Discover the facets you can search on (ProductType, MetalQuality, StoneFamily, …) and their valid values. |
| `search_products` | read | Filter the catalog by series / category / advanced filters, with `nextPage` paging. |
| `metal_market_rates` | read | Current Stuller gold/platinum/silver market rates. |
| `search_diamonds` | read | Search natural diamonds by the 4Cs (carat/color/clarity/cut), shape, certification, and price range. |
| `search_lab_grown_diamonds` | read | Same as `search_diamonds`, against lab-grown inventory. |
| `search_gemstones` | read | Search colored gemstones (sapphire, ruby, emerald, …) by type, color, shape, and size. |
| `order_status` | read | Read order history / status (by order number or date range). |
| `submit_order` | **write** | Place an order. Dry-run by default; only transmits with `confirm: true`. |

### How searching works

Stuller's product endpoint filters **structurally** — there is no free-text keyword search. You find products by identifier (`SKU`, `productIds`, `series`, `categoryIds`) or by **faceted filters**. The faceted flow is two steps:

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

### `include` options

Read tools accept an optional `include` array of Stuller **ProductInclude** values (e.g. `["All"]`, `["Prices"]`, `["Media"]`) to control how much data comes back. `product_detail` defaults to `["All"]`. See the [Stuller API help](https://api.stuller.com/Help) for the full enum.

---

## Safety model

- **Reads** (`get_products`, `product_detail`, `pricing_availability`, `search_products`, `metal_market_rates`, `order_status`) never modify anything.
- **`submit_order` is the only write tool.** It defaults to a **dry run** — it returns the exact request body it *would* send and transmits nothing until you call it again with `confirm: true`.
- Set `STULLER_DISABLE_ORDERING=true` to hard-disable order submission entirely, regardless of the `confirm` flag.

---

## API reference

- Endpoint help & request/response models: <https://api.stuller.com/Help>
- Stuller e-commerce / developer docs: <https://www.stuller.com/ecommerce-api-documentation/>
- Postman examples: Stuller API Workspace → *Product API Examples*

## License

MIT. This project is not affiliated with or endorsed by Stuller, Inc.
