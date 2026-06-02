import { test } from 'node:test';
import assert from 'node:assert/strict';

// Configure env BEFORE importing the client (it reads env at call time anyway).
process.env.STULLER_USERNAME = 'u';
process.env.STULLER_PASSWORD = 'p';
process.env.STULLER_API_URL = 'https://api.stuller.com';
process.env.STULLER_RETRY_DELAY_MS = '0'; // no real waiting in tests

const { stullerRequest, normalizePath, credentialsConfigured } = await import('../src/stuller/client.js');

function fakeRes(status, body, { json = true } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (json ? JSON.stringify(body) : String(body)),
  };
}
let calls = [];
function mockFetch(handler) {
  calls = [];
  globalThis.fetch = async (url, opts) => {
    const i = calls.length;
    calls.push({ url, opts });
    return handler(i, url, opts);
  };
}

test('normalizePath: api/ prefix, leading slash, and bare paths all → /v2/...', () => {
  assert.equal(normalizePath('/v2/products'), '/v2/products');
  assert.equal(normalizePath('api/v2/orders'), '/v2/orders');
  assert.equal(normalizePath('/api/v2/orders'), '/v2/orders');
  assert.equal(normalizePath('v2/products'), '/v2/products');
});

test('credentialsConfigured reflects env', () => {
  assert.equal(credentialsConfigured(), true);
});

test('builds URL (skips null query), auth header, and JSON body', async () => {
  process.env.STULLER_MAX_RETRIES = '0';
  mockFetch(() => fakeRes(200, { ok: true }));
  const r = await stullerRequest('POST', '/v2/products', { body: { SKU: ['X'] }, query: { a: 1, b: null } });
  assert.deepEqual(r, { ok: true });
  const c = calls[0];
  assert.equal(c.url.toString(), 'https://api.stuller.com/v2/products?a=1');
  assert.equal(c.opts.headers.Authorization, 'Basic ' + Buffer.from('u:p').toString('base64'));
  assert.equal(c.opts.body, JSON.stringify({ SKU: ['X'] }));
});

test('non-JSON response falls back to raw text', async () => {
  process.env.STULLER_MAX_RETRIES = '0';
  mockFetch(() => fakeRes(200, 'plain text', { json: false }));
  assert.equal(await stullerRequest('GET', '/v2/x'), 'plain text');
});

test('error status throws with status + body detail', async () => {
  process.env.STULLER_MAX_RETRIES = '0';
  mockFetch(() => fakeRes(400, { Message: 'The request is invalid.' }));
  await assert.rejects(() => stullerRequest('POST', '/v2/invoice', { body: {} }), /\(400\).*invalid/i);
});

test('retries transient 503 then succeeds', async () => {
  process.env.STULLER_MAX_RETRIES = '2';
  mockFetch((i) => (i === 0 ? fakeRes(503, { e: 1 }) : fakeRes(200, { ok: true })));
  const r = await stullerRequest('GET', '/v2/x');
  assert.deepEqual(r, { ok: true });
  assert.equal(calls.length, 2, 'one retry');
});

test('non-retryable 500 fails immediately (no retry)', async () => {
  process.env.STULLER_MAX_RETRIES = '2';
  mockFetch(() => fakeRes(500, { Message: 'boom' }));
  await assert.rejects(() => stullerRequest('GET', '/v2/x'), /\(500\)/);
  assert.equal(calls.length, 1, 'no retries on 500');
});

test('AbortError surfaces as a timeout message', async () => {
  process.env.STULLER_MAX_RETRIES = '0';
  mockFetch(() => {
    const e = new Error('aborted');
    e.name = 'AbortError';
    throw e;
  });
  await assert.rejects(() => stullerRequest('GET', '/v2/x'), /timed out/i);
});

test('network error is retried then surfaced clearly', async () => {
  process.env.STULLER_MAX_RETRIES = '1';
  mockFetch(() => {
    throw new Error('ECONNRESET');
  });
  await assert.rejects(() => stullerRequest('GET', '/v2/x'), /network error: ECONNRESET/);
  assert.equal(calls.length, 2, 'initial + 1 retry');
});

test('missing credentials throws a helpful error', async () => {
  const saved = process.env.STULLER_USERNAME;
  delete process.env.STULLER_USERNAME;
  try {
    await assert.rejects(() => stullerRequest('GET', '/v2/x'), /credentials are not configured/i);
  } finally {
    process.env.STULLER_USERNAME = saved;
  }
});
