const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');

let accessToken = null;
let refreshPromise = null;

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export function setAccessToken(token) {
  accessToken = token || null;
}

async function parseResponse(response) {
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  if (contentType.startsWith('audio/')) return response.blob();
  return response.text();
}

async function rawRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
    body: options.body === undefined || options.body instanceof FormData
      ? options.body
      : JSON.stringify(options.body),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    const message = payload?.detail || payload?.message || `API request failed (${response.status})`;
    throw new ApiError(message, response.status, payload);
  }
  return payload;
}

export async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = rawRequest('/api/auth/refresh', { method: 'POST' })
      .then(result => {
        setAccessToken(result.access_token);
        return result;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function apiRequest(path, options = {}, retry = true) {
  try {
    return await rawRequest(path, options);
  } catch (error) {
    if (retry && error instanceof ApiError && error.status === 401 && path !== '/api/auth/refresh') {
      await refreshSession();
      return rawRequest(path, options);
    }
    throw error;
  }
}

export async function registerAccount(email, password, rememberMe = true) {
  const result = await rawRequest('/api/auth/register', { method: 'POST', body: { email, password, remember_me: rememberMe } });
  setAccessToken(result.access_token);
  return result;
}

export async function loginAccount(email, password, rememberMe = true) {
  const result = await rawRequest('/api/auth/login', { method: 'POST', body: { email, password, remember_me: rememberMe } });
  setAccessToken(result.access_token);
  return result;
}

export async function logoutAccount() {
  try {
    await rawRequest('/api/auth/logout', { method: 'POST' });
  } finally {
    setAccessToken(null);
  }
}

export async function downloadExternalImage(url) {
  try {
    const data = await apiRequest('/api/download-image', {
      method: 'POST',
      body: { url }
    });
    return data.localImageUrl;
  } catch (err) {
    console.error("Failed to download image:", err);
    return null;
  }
}

export { API_BASE_URL };
