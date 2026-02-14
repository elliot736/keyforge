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

interface UsageChartProps {
  data: Array<{ date: string; requests: number }>;
}

const fallbackData = Array.from({ length: 7 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (6 - i));
  return {
    date: date.toISOString().split('T')[0],
    requests: 0,
  };
});

export function UsageChart({ data }: UsageChartProps) {
  const chartData = data.length > 0 ? data : fallbackData;

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(221.2, 83.2%, 53.3%)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(221.2, 83.2%, 53.3%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            tickFormatter={(value: string) => {
              try {
                return format(parseISO(value), 'MMM d');
              } catch {
                return value;
              }
            }}
            className="text-xs"
            tick={{ fill: 'hsl(215.4, 16.3%, 46.9%)' }}
          />
          <YAxis
            className="text-xs"
            tick={{ fill: 'hsl(215.4, 16.3%, 46.9%)' }}
            tickFormatter={(value: number) =>
              value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value)
            }
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(0, 0%, 100%)',
              border: '1px solid hsl(214.3, 31.8%, 91.4%)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelFormatter={(label: string) => {
              try {
                return format(parseISO(label), 'MMM d, yyyy');
              } catch {
                return label;
              }
            }}
          />
          <Area
            type="monotone"
            dataKey="requests"
            stroke="hsl(221.2, 83.2%, 53.3%)"
            fill="url(#colorRequests)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
