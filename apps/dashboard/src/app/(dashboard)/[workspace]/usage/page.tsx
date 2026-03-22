'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import {
  Activity,
  Coins,
  DollarSign,
  Timer,
  TrendingUp,
  CheckCircle2,
  ShieldAlert,
  ArrowUpRight,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { ChartTooltip } from '@/components/analytics/chart-tooltip';
import Link from 'next/link';

interface UsageData {
  requestsOverTime: Array<{
    date: string;
    requests: number;
    successes?: number;
    rateLimited?: number;
    errors?: number;
  }>;
  tokensByModel: Array<{ model: string; tokens: number; cost?: number }>;
  summary: {
    totalRequests: number;
    totalTokens: number;
    totalCostCents: number;
    avgLatencyMs: number;
    successRate?: number;
    rateLimitedCount?: number;
  };
  topKeys: Array<{
    keyId: string;
    keyName: string;
    prefix: string;
    requests: number;
    tokens: number;
    successRate?: number;
  }>;
}

const CHART_COLORS = {
  primary: 'hsl(221.2, 83.2%, 53.3%)',
  success: 'hsl(142.1, 76.2%, 36.3%)',
  warning: 'hsl(38, 92%, 50%)',
  danger: 'hsl(0, 84.2%, 60.2%)',
  purple: 'hsl(262.1, 83.3%, 57.8%)',
  muted: 'hsl(215.4, 16.3%, 46.9%)',
};

const PIE_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.purple,
  CHART_COLORS.danger,
  'hsl(180, 70%, 45%)',
  'hsl(300, 70%, 45%)',
  'hsl(30, 70%, 45%)',
];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-muted ${className ?? ''}`}>
      <div
        className="h-full rounded-full bg-primary transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function UsagePage() {
  const params = useParams();
  const workspace = params.workspace as string;

  const [period, setPeriod] = React.useState('7d');
  const [envFilter, setEnvFilter] = React.useState('all');
  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<UsageData | null>(null);

  React.useEffect(() => {
    const fetchUsage = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ period });
        if (envFilter !== 'all') params.set('environment', envFilter);

        const res = await fetch(
          `/api/proxy/workspaces/${workspace}/usage?${params}`
        );
        if (res.ok) {
          const json = await res.json();
          setData(json.data);
        }
      } catch {
        // Error silently handled
      } finally {
        setLoading(false);
      }
    };
    fetchUsage();
  }, [workspace, period, envFilter]);

  const summaryCards = [
    {
      title: 'Total Requests',
      value: data?.summary.totalRequests != null ? formatNumber(data.summary.totalRequests) : '--',
      icon: Activity,
      color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    },
    {
      title: 'Total Tokens',
      value: data?.summary.totalTokens != null ? formatNumber(data.summary.totalTokens) : '--',
      icon: Coins,
      color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    },
    {
      title: 'Total Cost',
      value: data?.summary.totalCostCents != null ? formatCurrency(data.summary.totalCostCents) : '--',
      icon: DollarSign,
      color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
    {
      title: 'Avg Latency',
      value: data?.summary.avgLatencyMs != null ? `${data.summary.avgLatencyMs.toFixed(1)}ms` : '--',
      icon: Timer,
      color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    },
  ];

  const maxRequests = data?.topKeys?.length
    ? Math.max(...data.topKeys.map((k) => k.requests))
    : 0;

  return (
    <div>
      <Header
        title="Usage Analytics"
        description="Monitor API usage, costs, and performance"
      />

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border bg-background p-1">
          {['24h', '7d', '30d', '90d'].map((p) => (
            <Button
              key={p}
              variant={period === p ? 'default' : 'ghost'}
              size="sm"
              className="text-xs"
              onClick={() => setPeriod(p)}
            >
              {p === '24h' ? '24h' : p === '7d' ? '7d' : p === '30d' ? '30d' : '90d'}
            </Button>
          ))}
        </div>
        <Select value={envFilter} onValueChange={setEnvFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Environment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Environments</SelectItem>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="test">Test</SelectItem>
          </SelectContent>
        </Select>

        {data?.summary.successRate != null && (
          <div className="ml-auto flex items-center gap-2">
            <Badge
              variant={data.summary.successRate >= 99 ? 'success' : data.summary.successRate >= 95 ? 'warning' : 'destructive'}
              className="gap-1"
            >
              <CheckCircle2 className="h-3 w-3" />
              {data.summary.successRate.toFixed(1)}% success rate
            </Badge>
            {(data.summary.rateLimitedCount ?? 0) > 0 && (
              <Badge variant="warning" className="gap-1">
                <ShieldAlert className="h-3 w-3" />
                {formatNumber(data.summary.rateLimitedCount!)} rate limited
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title} className="relative overflow-hidden">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${card.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{card.title}</p>
                    <p className="mt-0.5 text-2xl font-bold tracking-tight">{card.value}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Main Charts Row */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Requests over time - wider */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Requests Over Time</CardTitle>
            <CardDescription>Successful vs rate-limited requests</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[320px]" />
            ) : (
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data?.requestsOverTime || []}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorRateLimited" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.warning} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={CHART_COLORS.warning} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v: string) => {
                        try { return format(parseISO(v), period === '24h' ? 'HH:mm' : 'MMM d'); } catch { return v; }
                      }}
                      tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
                      tickFormatter={(v: number) => formatNumber(v)}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={
                        <ChartTooltip
                          labelFormatter={(label) => {
                            try { return format(parseISO(label), 'MMM d, yyyy HH:mm'); } catch { return label; }
                          }}
                          valueFormatter={(v) => v.toLocaleString()}
                        />
                      }
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconType="circle"
                      iconSize={8}
                      formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>}
                    />
                    <Area
                      type="monotone"
                      dataKey="requests"
                      name="Requests"
                      stroke={CHART_COLORS.primary}
                      fill="url(#colorSuccess)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="rateLimited"
                      name="Rate Limited"
                      stroke={CHART_COLORS.warning}
                      fill="url(#colorRateLimited)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Token usage by model - pie chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tokens by Model</CardTitle>
            <CardDescription>Token consumption breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[320px]" />
            ) : !data?.tokensByModel?.length ? (
              <div className="flex h-[320px] items-center justify-center">
                <p className="text-sm text-muted-foreground">No token usage data</p>
              </div>
            ) : (
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="60%">
                  <PieChart>
                    <Pie
                      data={data.tokensByModel}
                      cx="50%"
                      cy="50%"
                      innerRadius="55%"
                      outerRadius="85%"
                      paddingAngle={2}
                      dataKey="tokens"
                      nameKey="model"
                      stroke="none"
                    >
                      {data.tokensByModel.map((_, index) => (
                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={
                        <ChartTooltip valueFormatter={(v) => formatNumber(v)} />
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 space-y-1.5">
                  {data.tokensByModel.slice(0, 5).map((item, i) => (
                    <div key={item.model} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="font-medium">{item.model}</span>
                      </div>
                      <span className="text-muted-foreground">{formatNumber(item.tokens)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Keys Table */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Top Keys by Usage</CardTitle>
              <CardDescription>Most active API keys in this period</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : !data?.topKeys?.length ? (
            <div className="flex flex-col items-center justify-center py-10">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Activity className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-medium">No usage data</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Start verifying keys to see analytics here.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead className="w-[200px]">Requests</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Success</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topKeys.map((key) => (
                  <TableRow key={key.keyId} className="group">
                    <TableCell className="font-medium">
                      <Link
                        href={`/${workspace}/keys/${key.keyId}`}
                        className="hover:underline"
                      >
                        {key.keyName || 'Unnamed'}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                        {key.prefix}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="w-16 text-sm tabular-nums">
                          {formatNumber(key.requests)}
                        </span>
                        <ProgressBar
                          value={key.requests}
                          max={maxRequests}
                          className="flex-1"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(key.tokens)}
                    </TableCell>
                    <TableCell className="text-right">
                      {key.successRate != null ? (
                        <Badge
                          variant={key.successRate >= 99 ? 'success' : key.successRate >= 95 ? 'warning' : 'destructive'}
                          className="text-xs"
                        >
                          {key.successRate.toFixed(0)}%
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link href={`/${workspace}/keys/${key.keyId}`}>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
