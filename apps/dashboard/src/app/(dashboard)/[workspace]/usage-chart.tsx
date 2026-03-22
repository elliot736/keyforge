'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { ChartTooltip } from '@/components/analytics/chart-tooltip';

interface UsageChartProps {
  data: Array<{ date: string; requests: number }>;
  height?: number;
  showGrid?: boolean;
  color?: string;
}

const fallbackData = Array.from({ length: 7 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (6 - i));
  return {
    date: date.toISOString().split('T')[0],
    requests: 0,
  };
});

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

export function UsageChart({
  data,
  height = 300,
  showGrid = true,
  color = 'hsl(221.2, 83.2%, 53.3%)',
}: UsageChartProps) {
  const chartData = data.length > 0 ? data : fallbackData;
  const hasData = data.length > 0 && data.some((d) => d.requests > 0);

  return (
    <div style={{ height }} className="w-full">
      {!hasData && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <p className="rounded-md bg-background/80 px-3 py-1.5 text-sm text-muted-foreground backdrop-blur-sm">
            No request data yet
          </p>
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.2} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
          )}
          <XAxis
            dataKey="date"
            tickFormatter={(value: string) => {
              try {
                return format(parseISO(value), 'MMM d');
              } catch {
                return value;
              }
            }}
            tick={{ fill: 'hsl(215.4, 16.3%, 46.9%)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'hsl(215.4, 16.3%, 46.9%)', fontSize: 11 }}
            tickFormatter={formatNumber}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={
              <ChartTooltip
                labelFormatter={(label) => {
                  try {
                    return format(parseISO(label), 'MMM d, yyyy');
                  } catch {
                    return label;
                  }
                }}
                valueFormatter={(v) => v.toLocaleString()}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="requests"
            name="Requests"
            stroke={color}
            fill="url(#colorRequests)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: color }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
