import { useState, useEffect, useCallback, useRef } from 'react';
import { useKeyForgeContext } from '../context/KeyForgeContext';

export interface UseApiState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

export interface UseApiResult<T> extends UseApiState<T> {
  refetch: () => void;
}

export function useApi<T>(path: string, options?: { skip?: boolean }): UseApiResult<T> {
  const { apiUrl, sessionToken } = useKeyForgeContext();
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    error: null,
    loading: !options?.skip,
  });
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const fetchCountRef = useRef(0);

  const fetchData = useCallback(() => {
    if (options?.skip) return;

    // Cancel previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const currentFetch = ++fetchCountRef.current;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    const url = `${apiUrl.replace(/\/$/, '')}${path}`;

    fetch(url, {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error(body.message ?? body.error ?? `Request failed (${res.status})`);
        }
        return res.json();
      })
      .then((json) => {
        if (mountedRef.current && currentFetch === fetchCountRef.current) {
          setState({ data: json.data ?? json, error: null, loading: false });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (mountedRef.current && currentFetch === fetchCountRef.current) {
          setState({ data: null, error: err instanceof Error ? err : new Error(String(err)), loading: false });
        }
      });
  }, [apiUrl, sessionToken, path, options?.skip]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [fetchData]);

  return { ...state, refetch: fetchData };
}

export interface ApiMutateOptions {
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

export function useApiMutate() {
  const { apiUrl, sessionToken } = useKeyForgeContext();

  return useCallback(
    async <T>(path: string, options?: ApiMutateOptions): Promise<T> => {
      const url = `${apiUrl.replace(/\/$/, '')}${path}`;
      const res = await fetch(url, {
        method: options?.method ?? 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(body.message ?? body.error ?? `Request failed (${res.status})`);
      }

      const json = await res.json();
      return (json.data ?? json) as T;
    },
    [apiUrl, sessionToken],
  );
}
