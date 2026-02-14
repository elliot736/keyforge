import { useCallback, useMemo } from 'react';
import type { ApiKeyObject, Environment, RateLimitAlgorithm } from '@keyforge/shared';
import { useApi, useApiMutate } from './useApi';
import { useKeyForgeContext } from '../context/KeyForgeContext';

export interface CreateKeyParams {
  name: string;
  prefix?: string;
  environment?: Environment;
  scopes?: string[];
  expiresAt?: string;
  rateLimitConfig?: {
    algorithm: RateLimitAlgorithm;
    limit: number;
    window: number;
    burstLimit?: number;
    refillRate?: number;
  };
}

export interface CreateKeyResult {
  id: string;
  key: string;
  prefix: string;
}

export interface UseKeysResult {
  keys: ApiKeyObject[];
  total: number;
  loading: boolean;
  error: Error | null;
  createKey: (params: CreateKeyParams) => Promise<CreateKeyResult>;
  revokeKey: (keyId: string) => Promise<void>;
  rotateKey: (keyId: string) => Promise<CreateKeyResult>;
  refetch: () => void;
}

export function useKeys(): UseKeysResult {
  const { workspaceId } = useKeyForgeContext();
  const mutate = useApiMutate();

  const { data, error, loading, refetch } = useApi<{
    keys?: ApiKeyObject[];
    data?: ApiKeyObject[];
    meta?: { total?: number };
    total?: number;
  }>(`/v1/keys?workspaceId=${encodeURIComponent(workspaceId)}&limit=100`);

  const keys = useMemo(() => {
    if (!data) return [];
    // Handle both { keys: [...] } and { data: [...] } response shapes
    if (Array.isArray(data)) return data as unknown as ApiKeyObject[];
    return data.keys ?? data.data ?? [];
  }, [data]);

  const total = useMemo(() => {
    if (!data) return 0;
    if (Array.isArray(data)) return (data as unknown[]).length;
    return data.meta?.total ?? data.total ?? keys.length;
  }, [data, keys.length]);

  const createKey = useCallback(
    async (params: CreateKeyParams): Promise<CreateKeyResult> => {
      const result = await mutate<CreateKeyResult>('/v1/keys', {
        method: 'POST',
        body: { ...params, workspaceId },
      });
      refetch();
      return result;
    },
    [mutate, workspaceId, refetch],
  );

  const revokeKey = useCallback(
    async (keyId: string): Promise<void> => {
      await mutate<void>(`/v1/keys/${encodeURIComponent(keyId)}/revoke`, {
        method: 'POST',
        body: { keyId },
      });
      refetch();
    },
    [mutate, refetch],
  );

  const rotateKey = useCallback(
    async (keyId: string): Promise<CreateKeyResult> => {
      const result = await mutate<CreateKeyResult>(`/v1/keys/${encodeURIComponent(keyId)}/rotate`, {
        method: 'POST',
        body: { keyId },
      });
      refetch();
      return result;
    },
    [mutate, refetch],
  );

  return { keys, total, loading, error, createKey, revokeKey, rotateKey, refetch };
}
