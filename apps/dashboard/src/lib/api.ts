// Server components call the API directly (server-to-server, same network)
// Client components go through the Next.js proxy to handle auth cookies
const isServer = typeof window === 'undefined';
const API_BASE = isServer
  ? (process.env.API_URL || 'http://localhost:4000')
  : '/api/proxy';

export interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { params, ...init } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.set(key, String(value));
    });
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiClientError(body.message || res.statusText, res.status, body.code);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export const apiClient = {
  get: <T>(path: string, options?: FetchOptions) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: FetchOptions) =>
    request<T>(path, { ...options, method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown, options?: FetchOptions) =>
    request<T>(path, { ...options, method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown, options?: FetchOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, options?: FetchOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
