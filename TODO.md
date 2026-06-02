# stuller-mcp — TODO / Roadmap

Status of the project and what's planned. Contributions welcome — see `CONTRIBUTING.md` (once added).

---

## ✅ Decided

- **Copyright / author:** CritterCodes
- **Repo home:** `github.com/CritterCodes/stuller-mcp`
- **Distribution scope:** GitHub + npm + official MCP Registry (Smithery optional later; no hosted endpoint — per-user credentials make hosting a poor fit).

---

## Release readiness (before the first public push)

- [x] **`LICENSE` file** — MIT, © 2026 CritterCodes.
- [x] **`package.json` metadata** — `repository`, `author`, `homepage`, `bugs`, `keywords`, `files` whitelist, `test` script.
- [x] **Delete the temp `.env`** from the working tree.
- [x] **`CONTRIBUTING.md`** + npx usage in README.
- [x] **`server.json`** MCP-registry manifest.
- [x] **Test + GitHub Actions CI** — `node:test` unit tests + CI running `npm test` and `npm run smoke` (no creds) on Node 18/20/22.

### Remaining publish steps (need maintainer creds)

- [ ] `npm publish` (npm name `stuller-mcp` confirmed available).
- [ ] Submit to the MCP Registry with the `mcp-publisher` CLI (validate/bump `server.json` `$schema` if needed).

### Already good ✅
README (setup / security / tool docs), env-based auth, `.gitignore`, dry-run-gated `submit_order`, "not affiliated with Stuller" disclaimer, EFD-specific references removed from committed code.

---

## Feature roadmap (ranked by adoption impact)

1. **Diamond & gem search** — wrap `/v2/gem/diamonds`, `/v2/gem/gemstones`, `/v2/gem/labgrowndiamonds`. Search by the 4Cs (carat, cut, color, clarity) + price. The marquee jewelry-trade query; no open MCP does this today.
2. **Natural-language search resolver** — a single `find_products("diamond stud earrings, white gold")` tool that resolves facets internally (discover → map terms → `search_products`). Fixes the "no free-text keyword search" gap so non-expert agents can use it.
3. **Stone matching by dimensions** — `/v2/products/bestfitstonesbydimensions`, `/v2/products/searchstones`, `/searchstonesbystonegroup`. "Find a stone to replace a lost 4.1mm round." High value for repair & custom.
4. **Configurable & virtual products** — `/v2/products/configureproduct`, `/configuredproduct`, `/v2/products/virtual`. Configurable mountings (metal/size/head) + semi-set pieces built for API resale. Unlocks custom design *and* dropship catalogs.
5. **Order fulfillment loop** — `/v2/invoice`, `/v2/invoice/shipment`. Order status + tracking numbers, so `submit_order` isn't a dead end (place *and* track).
6. **Cart / quote builder** — a stateful tool that accumulates line items with live pricing and a running total; turns one-off lookups into a real quoting workflow.

---

## Project hardening / distribution

- [ ] **HTTP/SSE transport** alongside stdio, so it can be hosted and used by web clients (big for adoption).
- [ ] **`--read-only` default** — ordering off unless explicitly enabled. Essential trust signal for a tool strangers run with their own account. (`STULLER_DISABLE_ORDERING` exists today; make safe-by-default.)
- [ ] **Response cache + light rate-limiting** — be a good Stuller API citizen.
- [ ] **Dockerfile** for one-command hosting.
- [ ] **Publish** — npm package + MCP registry / Smithery listing.

---

## Done

- Core read tools: `get_products`, `product_detail`, `pricing_availability`, `search_products`, `advanced_product_filters`, `metal_market_rates`.
- `order_status` (read) + `submit_order` (write, dry-run gated, kill-switch env).
- Env-based HTTP Basic auth, `.env.example`, `.gitignore`, smoke script (graceful without creds).
- All read paths verified against the live Stuller catalog.
- README + this roadmap.
