#!/usr/bin/env node
// Smoke test: verifies the server builds and (if credentials are present) that a
// live product lookup works. Safe to run without credentials — it just reports
// that the live check was skipped. Never performs any write/order operation.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

import { buildServer } from '../src/server.js';
import { credentialsConfigured } from '../src/stuller/client.js';
import { pricingAvailability } from '../src/tools/products.js';

async function main() {
  // 1. Server builds and registers tools.
  const server = buildServer();
  console.log('✓ server built:', server?.server?.name || 'stuller-mcp');

  // 2. Credentials present?
  if (!credentialsConfigured()) {
    console.log('• STULLER_USERNAME / STULLER_PASSWORD not set — skipping live API check.');
    console.log('  Copy .env.example to .env and add your developer login to test live calls.');
    return;
  }

  // 3. Live read-only call. Override the SKU via SMOKE_SKU if the default is unavailable.
  const sku = process.env.SMOKE_SKU || 'SOLDER:0267:P';
  console.log(`• live pricing/availability lookup for ${sku} ...`);
  const result = await pricingAvailability({ skus: [sku] });
  console.log('✓ live API responded:', JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('✗ smoke failed:', err.message);
  process.exit(1);
});
