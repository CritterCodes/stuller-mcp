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

1. [x] **Diamond & gem search** — ✅ shipped. `search_diamonds`, `search_lab_grown_diamonds`, `search_gemstones` wrap `/v2/gem/*`; 4Cs + shape + certification + price/carat ranges, paging, cert numbers & images. Verified live.
2. [x] **Natural-language search resolver** — ✅ shipped. `find_products` resolves a plain phrase against the live facet vocabulary (word-boundary matching + longest-span-wins consumption so "white gold" beats stone-color "White"), returns `resolvedFilters` + `unmatchedTerms`, then runs the search. Pure resolver unit-tested; verified live.
3. [x] **Stone matching by dimensions** — ✅ shipped as `find_stones_by_dimensions`. NOTE: Stuller's native `bestfitstonesbydimensions` 500s on every input (account-gated/broken) and `searchstones`/`searchstonesbystonegroup` need a ConfigurationModelId, so this is a client-side matcher: scan a stone family by shape, rank by mm deviation. Handles round stones reporting Width=0 (falls back to length). Verified live (diamond 4.1mm, sapphire 5.0/6.9mm).
4. [x] **Configurable & virtual products** — ✅ shipped. `search_virtual_products` (semi-mounts + their config model, setting locations, canBeSetWith, baseProductId), `configure_product` (price a configured mounting → total + ship date + imagery), `get_configured_product`. NOTE: configure_product needs the BaseProduct.Id, not ConfigurationModel.Id (passing the latter 500s); virtual needs a selector + Include=["All"] to populate the config model. Verified live.
5. [x] **Order fulfillment loop** — ✅ shipped. `list_invoices` (date-range invoices with shipment tracking number/link/method, totals, ship-to, and back-ordered line items; defaults to last 90 days) + `get_shipment` (by shipment header id). NOTE: Stuller filters invoices only by date — order/invoice/PO narrowing is client-side; invoices don't expose a ShipmentHeaderId. Verified live (119 invoices, real FedEx tracking).
6. [x] **Cart / quote builder** — ✅ shipped. Session-scoped in-memory quote (`quote_add_item`, `quote_view`, `quote_remove_item`, `quote_clear`, `quote_to_order`): SKU lines priced live (merge on repeat) + manual labor/custom lines, running subtotal, `refresh` re-prices, converts to a submit_order `lines` array (manual lines excluded). Stuller has no server-side cart. Pure totals unit-tested; verified live.

**🎉 Feature roadmap complete — all 6 shipped.**

---

## Visual / display layer

- [x] **`display` block** on every buyable result ({ title, price, currency, primaryImage, thumbnail, video }) — render-ready for any UI/voice/TV surface. Configurable mounts prefer the fully-set image; diamonds/gemstones get a composed title.
- [x] **`show_product` tool** — fetches a product image and returns an MCP image content block (inline render / "show this" payload). URLs stay default; base64 is opt-in, single-item, size-guarded.
- [x] **Sized image variants** — confirmed Stuller CDN size tokens empirically (tiny 40 / thumb 75 / list 165 / standard 300 / xlarge 640 / zoom 1500; unknown tokens + WxH ignored → original). `sizedImageUrl()` helper + `show_product` `size` option. Verified live.
- [ ] Future: push-to-screen integration for the parked voice assistant.

## Parked ideas

- **Voice "bench assistant"** — hands-free wake-word device (Pi/tablet) → STT → Claude agent on this MCP → TTS, for finding/ordering at the bench. The MCP is the backbone; NL search + dry-run order gate fit voice well. Start with a push-to-talk Phase-0 prototype. Parked pending MCP refinement.

## Known limitations / future

- ~~Finished-jewelry discovery by description is weak.~~ **Addressed** by `discover_categories`: products carry `WebCategories` whose ids are valid CategoryIds, so the tool harvests them from a scan (by productType/series/filter, optional `contains`) → pick a CategoryId → `search_products`. `find_products` points here when stone facets get set aside. (Stuller still has no category-tree endpoint; this scans-and-aggregates, so coverage depends on how many products you scan.)

## Refinement pass (in progress)

- [x] **Catalog-browse gap** — `discover_categories` tool (WebCategories→CategoryIds) + `webCategories` on every product result.
- [x] **Code-quality** — shared `src/stuller/util.js` (money/currencyOf/extractImages/extractCategories/isoDate); removed duplicated helpers from gems/configurable/invoices/transform; unified image shape.
- [x] **Response cache** — `src/stuller/cache.js` TTL cache (STULLER_CACHE_TTL_MS, default 10min); caches facet vocabulary + metal market rates only. Pricing/inventory deliberately uncached. Verified 584ms→1ms on repeat.
- [x] **I/O polish & DX** — documented tuning env vars in .env.example (timeout/retries/cache); SKU input trimmed + de-duped; worked end-to-end example added to README.

## Project hardening / distribution

- [ ] **HTTP/SSE transport** alongside stdio, so it can be hosted and used by web clients (big for adoption).
- [ ] **`--read-only` default** — ordering off unless explicitly enabled. Essential trust signal for a tool strangers run with their own account. (`STULLER_DISABLE_ORDERING` exists today; make safe-by-default.)
- [x] **Retry on transient errors** — client retries 429/502/503/504 + network/timeout (STULLER_MAX_RETRIES) with a per-attempt timeout (STULLER_TIMEOUT_MS).
- [ ] **Response cache** — memoize hot reads (pricing, facets) to be a good Stuller API citizen.
- [ ] **Dockerfile** for one-command hosting.
- [ ] **Publish** — npm package + MCP registry / Smithery listing.

---

## Done

- Core read tools: `get_products`, `product_detail`, `pricing_availability`, `search_products`, `advanced_product_filters`, `metal_market_rates`.
- `order_status` (read) + `submit_order` (write, dry-run gated, kill-switch env).
- Diamond & gemstone search (`search_diamonds`, `search_lab_grown_diamonds`, `search_gemstones`).
- Natural-language product search (`find_products`) with facet resolution + unmatched-term reporting.
- Stone fit-by-dimensions matcher (`find_stones_by_dimensions`) over diamonds/lab-grown/gemstones.
- Configurable/semi-mount products (`search_virtual_products`, `configure_product`, `get_configured_product`).
- Order fulfillment: invoices + shipment tracking (`list_invoices`, `get_shipment`).
- Session quote builder (`quote_add_item`, `quote_view`, `quote_remove_item`, `quote_clear`, `quote_to_order`).
- **Extensive test suite** — 68 tests across 8 files (transform, resolver, gems, quote, invoices, configurable, client, server, help). Bugs found & fixed in the process: zero-result envelope wrapped as a phantom product; `search_products` guard made dead by always-set Include (catalog-wide fetch risk); one-directional plural matching (singular "earring" missed "Earrings"). HTTP client hardened with per-attempt timeout + retry on transient errors.
- In-chat docs: server `instructions` (sent at connect) + `get_started` tool (markdown walkthrough), sourced from `src/help.js`.
- Env-based HTTP Basic auth, `.env.example`, `.gitignore`, smoke script (graceful without creds).
- All read paths verified against the live Stuller catalog.
- Public GitHub repo pushed, CI green (Node 18/20/22, checkout/setup-node v5).
- README + CONTRIBUTING + server.json + this roadmap.
