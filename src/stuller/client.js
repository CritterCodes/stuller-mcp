// Thin HTTP client for the Stuller v2 API.
//
// Auth is HTTP Basic, built from STULLER_USERNAME / STULLER_PASSWORD in the
// environment (see .env.example). Credentials are NEVER hard-coded — if they are
// missing every request fails fast with a message that points at the README.

// Config is read at call time (not module load) so env loaded after import — and
// tests that set env — are honored.
const baseUrl = () => process.env.STULLER_API_URL || 'https://api.stuller.com';
const userAgent = () => process.env.STULLER_USER_AGENT || 'stuller-mcp/0.1.0';
const timeoutMs = () => Number(process.env.STULLER_TIMEOUT_MS) || 30000;
const maxRetries = () => {
  const n = Number(process.env.STULLER_MAX_RETRIES);
  return Number.isFinite(n) && n >= 0 ? n : 2;
};
const retryDelayMs = () => {
  const n = Number(process.env.STULLER_RETRY_DELAY_MS);
  return Number.isFinite(n) && n >= 0 ? n : 400;
};

// Transient HTTP statuses worth retrying.
const RETRYABLE = new Set([429, 502, 503, 504]);

function getCredentials() {
  return {
    username: process.env.STULLER_USERNAME,
    password: process.env.STULLER_PASSWORD,
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when both credential env vars are present. */
export function credentialsConfigured() {
  const { username, password } = getCredentials();
  return Boolean(username && password);
}

function requireCredentials() {
  if (!credentialsConfigured()) {
    throw new Error(
      'Stuller API credentials are not configured. Set STULLER_USERNAME and ' +
        'STULLER_PASSWORD in this package\'s .env file (copy .env.example). These must be ' +
        'a Stuller "developer login" — not your stuller.com website password. See the README.'
    );
  }
}

function authHeader() {
  const { username, password } = getCredentials();
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

// Normalize a documented `api/v2/...` path (or `/api/v2/...`, `v2/...`) to `/v2/...`.
export function normalizePath(path) {
  return String(path).replace(/^\/?api\//, '/').replace(/^(?!\/)/, '/');
}

async function doFetch(method, normalizedPath, opts) {
  const url = new URL(normalizedPath, baseUrl());
  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }

  // Per-attempt timeout so a hung connection can't wedge the server forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    return await fetch(url, {
      method,
      headers: {
        Authorization: authHeader(),
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': userAgent(),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Make an authenticated request to the Stuller API. Retries transient failures
 * (429/502/503/504 and network/timeout errors) up to STULLER_MAX_RETRIES.
 * @param {('GET'|'POST')} method
 * @param {string} path - e.g. '/v2/products' or 'api/v2/orders'
 * @param {{ query?: Record<string, string|number>, body?: object }} [opts]
 * @returns parsed JSON (or raw text if the response is not JSON)
 */
export async function stullerRequest(method, path, opts = {}) {
  requireCredentials();
  const normalizedPath = normalizePath(path);
  const retries = maxRetries();

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let res;
    try {
      res = await doFetch(method, normalizedPath, opts);
    } catch (err) {
      // Network error or timeout (AbortError). Retry, then give a clear message.
      lastErr =
        err?.name === 'AbortError'
          ? new Error(`Stuller ${method} ${normalizedPath} timed out after ${timeoutMs()}ms`)
          : new Error(`Stuller ${method} ${normalizedPath} network error: ${err.message}`);
      if (attempt < retries) {
        await sleep(retryDelayMs() * (attempt + 1));
        continue;
      }
      throw lastErr;
    }

    if (RETRYABLE.has(res.status) && attempt < retries) {
      await sleep(retryDelayMs() * (attempt + 1));
      continue;
    }

    const text = await res.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    if (!res.ok) {
      const detail = typeof payload === 'string' ? payload : JSON.stringify(payload);
      throw new Error(
        `Stuller ${method} ${normalizedPath} failed (${res.status}): ${String(detail).slice(0, 400)}`
      );
    }

    return payload;
  }

  throw lastErr; // exhausted retries on transient network errors
}

export const stullerConfig = {
  get baseUrl() {
    return baseUrl();
  },
  get userAgent() {
    return userAgent();
  },
};
