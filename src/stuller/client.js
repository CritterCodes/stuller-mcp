// Thin HTTP client for the Stuller v2 API.
//
// Auth is HTTP Basic, built from STULLER_USERNAME / STULLER_PASSWORD in the
// environment (see .env.example). Credentials are NEVER hard-coded — if they are
// missing every request fails fast with a message that points at the README.

const BASE_URL = process.env.STULLER_API_URL || 'https://api.stuller.com';
const USER_AGENT = process.env.STULLER_USER_AGENT || 'stuller-mcp/0.1.0';

function getCredentials() {
  return {
    username: process.env.STULLER_USERNAME,
    password: process.env.STULLER_PASSWORD,
  };
}

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

/**
 * Make an authenticated request to the Stuller API.
 * @param {('GET'|'POST')} method
 * @param {string} path - e.g. '/v2/products' or 'api/v2/orders'
 * @param {{ query?: Record<string, string|number>, body?: object }} [opts]
 * @returns parsed JSON (or raw text if the response is not JSON)
 */
export async function stullerRequest(method, path, opts = {}) {
  requireCredentials();

  // Stuller's docs reference endpoints as `api/v2/...`; the live host serves them
  // at `/v2/...`. Accept either form and normalize to `/v2/...`.
  const normalizedPath = path.replace(/^\/?api\//, '/').replace(/^(?!\/)/, '/');
  const url = new URL(normalizedPath, BASE_URL);

  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!res.ok) {
    const detail =
      typeof payload === 'string' ? payload : JSON.stringify(payload);
    throw new Error(
      `Stuller ${method} ${normalizedPath} failed (${res.status}): ${String(detail).slice(0, 400)}`
    );
  }

  return payload;
}

export const stullerConfig = {
  baseUrl: BASE_URL,
  userAgent: USER_AGENT,
};
