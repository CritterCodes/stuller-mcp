#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';
// Load .env from this package dir, not process.cwd() — the server may be launched
// from a different working directory by the MCP host, so cwd-relative loading misses it.
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') });

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './src/server.js';

async function main() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio MCP servers must not write to stdout (it is the protocol channel) — log to stderr.
  console.error('[stuller-mcp] ready on stdio');
}

main().catch((err) => {
  console.error('[stuller-mcp] fatal:', err);
  process.exit(1);
});
