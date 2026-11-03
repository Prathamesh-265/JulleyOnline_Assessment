export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');

let token = localStorage.getItem('token');
let onUnauthorized = () => {};

export const getToken = () => token;
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

export function setToken(next) {
  token = next;
  if (next) localStorage.setItem('token', next);
  else localStorage.removeItem('token');
}

async function request(method, path, body) {
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: { ...(body && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized(); // token expired mid-session
    // keep the server's extra fields (code, current) on the error so callers can react to 409s
    throw Object.assign(new Error(data.error || 'Something went wrong'), data, { status: res.status });
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
};
