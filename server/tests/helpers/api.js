import assert from 'node:assert/strict';

export const API = (process.env.API_URL || 'http://localhost:5000').replace(/\/$/, '');
export const uid = () => Math.random().toString(36).slice(2, 8);

export async function call(method, path, { token, body } = {}) {
  const init = {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  // Node reuses idle connections and the server may have just closed one (ECONNRESET).
  // The request never reached the server in that case, so one retry is safe.
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${API}/api${path}`, init);
      break;
    } catch (e) {
      const code = e.cause?.code;
      if (attempt >= 2 || !['ECONNRESET', 'UND_ERR_SOCKET'].includes(code)) throw e;
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, body: data, headers: res.headers };
}

// token comes second so calls read like: http.get('/boards/123', user.token)
export const http = {
  get: (path, token) => call('GET', path, { token }),
  post: (path, token, body) => call('POST', path, { token, body }),
  put: (path, token, body) => call('PUT', path, { token, body }),
  patch: (path, token, body) => call('PATCH', path, { token, body }),
  del: (path, token) => call('DELETE', path, { token }),
};

// asserts the status and hands back the body, with the server's answer in the failure message
export function ok(res, status = 200) {
  assert.equal(res.status, status, `expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
}

export const world = () => JSON.parse(process.env.TEST_WORLD);