# Contributing to stuller-mcp

Thanks for your interest! This is a community MCP server for the Stuller v2 API. It is **not affiliated with or endorsed by Stuller, Inc.**

## Development setup

```bash
git clone https://github.com/CritterCodes/stuller-mcp.git
cd stuller-mcp
npm install
cp .env.example .env   # add your own Stuller developer login (PowerShell: Copy-Item .env.example .env)
```

You need a Stuller **developer login** (API-only credentials) to exercise the live tools — see the README. Never commit your `.env`; it is git-ignored.

## Checks

```bash
npm test         # unit tests (no credentials required)
npm run smoke    # builds the server; runs one live read if credentials are present, otherwise skips
```

CI runs both on every push/PR across Node 18/20/22. `npm test` and the credential-less path of `npm run smoke` must pass without secrets.

## Project layout

```
index.js              # stdio entrypoint; loads .env from the package dir
src/server.js         # MCP tool registration (one server.tool() per tool)
src/stuller/client.js # authenticated fetch wrapper (Basic auth from env)
src/stuller/transform.js  # normalizes Stuller responses into a stable shape
src/tools/*.js        # tool logic, grouped by area (products, orders, ...)
scripts/smoke.js      # build + optional live check
test/*.test.js        # unit tests (node:test)
server.json           # MCP registry manifest
```

## Adding a tool

1. Implement the logic in the relevant `src/tools/*.js` module (return plain data; throw on error).
2. Register it in `src/server.js` with a clear description and a `zod` schema for its args.
3. Keep **read** tools side-effect free. Any **write** tool must default to a dry run and only act when called again with `confirm: true` (see `submit_order`).
4. Add a unit test where practical, and verify live against the API if you have credentials.

## Release process (maintainers)

- **npm:** bump `version` in `package.json` (and `server.json`), then `npm publish`.
- **MCP Registry:** keep `server.json` in sync and publish with the [`mcp-publisher`](https://github.com/modelcontextprotocol/registry) CLI. The `$schema` date may need bumping to the current registry schema; the publisher validates on submit.

## Conduct

Be kind and constructive. Open an issue before large changes so we can align on direction (see `TODO.md` for the roadmap).
