import { useMemo, useState, useCallback } from 'react';
import { useApi } from './useApi';
import { useKeyForgeContext } from '../context/KeyForgeContext';

export type TimeRange = '24h' | '7d' | '30d';
export type Granularity = 'hour' | 'day' | 'month';

export interface UsageDataPoint {
  timestamp: string;
  requests: number;
  tokens?: number;
  cost?: number;
}

export interface UseUsageResult {
  usage: UsageDataPoint[];
  loading: boolean;
  error: Error | null;
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  refetch: () => void;
}

function getTimeRangeParams(range: TimeRange): { from: string; to: string; granularity: Granularity } {
  const to = new Date();
  const from = new Date();

  switch (range) {
    case '24h':
      from.setHours(from.getHours() - 24);
      return { from: from.toISOString(), to: to.toISOString(), granularity: 'hour' };
    case '7d':
      from.setDate(from.getDate() - 7);
      return { from: from.toISOString(), to: to.toISOString(), granularity: 'day' };
    case '30d':
      from.setDate(from.getDate() - 30);
      return { from: from.toISOString(), to: to.toISOString(), granularity: 'day' };
  }
}

export function useUsage(keyId?: string): UseUsageResult {
  const { workspaceId } = useKeyForgeContext();
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');

  const params = useMemo(() => getTimeRangeParams(timeRange), [timeRange]);

  const queryParts = [
    `workspaceId=${encodeURIComponent(workspaceId)}`,
    `from=${encodeURIComponent(params.from)}`,
    `to=${encodeURIComponent(params.to)}`,
    `granularity=${params.granularity}`,
  ];
  if (keyId) {
    queryParts.push(`keyId=${encodeURIComponent(keyId)}`);
  }

  const { data, error, loading, refetch } = useApi<UsageDataPoint[] | { usage?: UsageDataPoint[] }>(
    `/v1/usage?${queryParts.join('&')}`,
  );

  const usage = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    return (data as { usage?: UsageDataPoint[] }).usage ?? [];
  }, [data]);

  const handleSetTimeRange = useCallback((range: TimeRange) => {
    setTimeRange(range);
  }, []);

  return { usage, loading, error, timeRange, setTimeRange: handleSetTimeRange, refetch };
}
